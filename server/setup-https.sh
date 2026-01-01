#!/bin/bash

# 为Paradex后端配置HTTPS的脚本

echo "🔒 配置HTTPS支持..."

# 检查是否安装了nginx
if ! command -v nginx &> /dev/null; then
    echo "📦 安装Nginx..."
    sudo apt update
    sudo apt install nginx -y
fi

# 检查是否安装了certbot
if ! command -v certbot &> /dev/null; then
    echo "📦 安装Certbot..."
    sudo apt install certbot python3-certbot-nginx -y
fi

echo "⚙️ 配置Nginx反向代理..."

# 创建Nginx配置
sudo tee /etc/nginx/sites-available/paradex-api > /dev/null <<EOF
server {
    listen 80;
    server_name 141.11.139.93;

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

# 启用配置
sudo ln -sf /etc/nginx/sites-available/paradex-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx配置测试通过"
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    echo "✅ Nginx已启动并设置为开机自启"
else
    echo "❌ Nginx配置有误，请检查"
    exit 1
fi

echo ""
echo "🌐 现在你可以通过以下地址访问API:"
echo "   HTTP:  http://141.11.139.93/api/status"
echo "   端口:  http://141.11.139.93:3002/api/status (原始端口)"
echo ""
echo "📝 在Vercel中设置环境变量:"
echo "   NEXT_PUBLIC_DATA_SERVER_URL=http://141.11.139.93"
echo ""
echo "🔒 要启用HTTPS，你有两个选择:"
echo ""
echo "选择1: 使用域名 + Let's Encrypt SSL证书 (推荐)"
echo "   1. 将域名A记录指向 141.11.139.93"
echo "   2. 运行: sudo certbot --nginx -d your-domain.com"
echo "   3. 在Vercel设置: NEXT_PUBLIC_DATA_SERVER_URL=https://your-domain.com"
echo ""
echo "选择2: 使用自签名证书 (仅测试用)"
echo "   运行: ./setup-self-signed-ssl.sh"
echo "   在Vercel设置: NEXT_PUBLIC_DATA_SERVER_URL=https://141.11.139.93"
echo ""
echo "✅ HTTP反向代理配置完成！"
echo "📝 当前可通过 http://141.11.139.93 访问API"