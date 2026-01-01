#!/bin/bash

# 从自签名证书升级到Let's Encrypt证书的脚本

echo "🔄 升级到Let's Encrypt SSL证书..."

# 获取域名参数
if [ -z "$1" ]; then
    echo "❌ 请提供域名参数"
    echo "用法: ./upgrade-to-letsencrypt.sh your-domain.com"
    exit 1
fi

DOMAIN=$1

echo "🌐 域名: $DOMAIN"
echo "📍 服务器IP: $(curl -s ifconfig.me)"

# 验证域名解析
echo "🔍 验证域名解析..."
RESOLVED_IP=$(dig +short $DOMAIN)
SERVER_IP=$(curl -s ifconfig.me)

if [ "$RESOLVED_IP" != "$SERVER_IP" ]; then
    echo "⚠️  警告: 域名解析IP ($RESOLVED_IP) 与服务器IP ($SERVER_IP) 不匹配"
    echo "请确保域名A记录正确指向服务器IP"
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 检查Nginx是否运行
if ! systemctl is-active --quiet nginx; then
    echo "❌ Nginx未运行，请先运行setup-self-signed-ssl.sh"
    exit 1
fi

# 更新Nginx配置以使用域名
echo "⚙️ 更新Nginx配置以使用域名..."

sudo tee /etc/nginx/sites-available/paradex-api > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;
        
        if (\$request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}
EOF

# 测试Nginx配置
sudo nginx -t

if [ $? -ne 0 ]; then
    echo "❌ Nginx配置有误"
    exit 1
fi

# 重启Nginx
sudo systemctl reload nginx

# 测试HTTP访问
echo "🧪 测试HTTP访问..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/api/status)

if [ "$HTTP_STATUS" != "200" ]; then
    echo "❌ HTTP访问测试失败 (状态码: $HTTP_STATUS)"
    echo "请检查域名解析和防火墙设置"
    exit 1
fi

echo "✅ HTTP访问测试通过"

# 安装Let's Encrypt证书
echo "🔒 安装Let's Encrypt SSL证书..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

if [ $? -eq 0 ]; then
    echo "✅ Let's Encrypt证书安装成功！"
    
    # 测试HTTPS访问
    echo "🧪 测试HTTPS访问..."
    sleep 5
    HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/api/status)
    
    if [ "$HTTPS_STATUS" = "200" ]; then
        echo "✅ HTTPS访问测试通过"
        
        # 清理自签名证书文件
        echo "🧹 清理自签名证书文件..."
        sudo rm -f /etc/nginx/ssl/paradex.key
        sudo rm -f /etc/nginx/ssl/paradex.crt
        sudo rmdir /etc/nginx/ssl 2>/dev/null
        
        echo ""
        echo "🎉 升级完成！"
        echo ""
        echo "🌐 现在你可以通过以下地址访问API:"
        echo "   HTTPS: https://$DOMAIN/api/status"
        echo "   HTTP:  http://$DOMAIN/api/status (自动重定向到HTTPS)"
        echo ""
        echo "📝 在Vercel中设置环境变量:"
        echo "   NEXT_PUBLIC_DATA_SERVER_URL=https://$DOMAIN"
        echo ""
        echo "🔄 证书将自动续期，无需手动维护"
        echo ""
        echo "✅ 升级到Let's Encrypt完成！"
        
    else
        echo "❌ HTTPS访问测试失败 (状态码: $HTTPS_STATUS)"
        echo "请检查证书安装"
    fi
else
    echo "❌ Let's Encrypt证书安装失败"
    echo "可能的原因:"
    echo "1. 域名解析未生效"
    echo "2. 防火墙阻止了80/443端口"
    echo "3. 域名已有证书冲突"
    exit 1
fi