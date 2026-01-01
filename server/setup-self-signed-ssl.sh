#!/bin/bash

# 为Paradex后端配置自签名SSL证书的脚本
# 注意：自签名证书仅用于测试，生产环境请使用正式证书

echo "🔒 配置自签名SSL证书..."

# 创建SSL目录
sudo mkdir -p /etc/nginx/ssl

# 生成自签名证书
echo "📜 生成自签名SSL证书..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/paradex.key \
    -out /etc/nginx/ssl/paradex.crt \
    -subj "/C=JP/ST=Tokyo/L=Tokyo/O=Paradex/OU=API/CN=141.11.139.93"

# 更新Nginx配置以支持HTTPS
echo "⚙️ 更新Nginx配置以支持HTTPS..."

sudo tee /etc/nginx/sites-available/paradex-api > /dev/null <<EOF
server {
    listen 80;
    server_name 141.11.139.93;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 141.11.139.93;

    ssl_certificate /etc/nginx/ssl/paradex.crt;
    ssl_certificate_key /etc/nginx/ssl/paradex.key;
    
    # SSL配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

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

# 测试配置
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx配置测试通过"
    sudo systemctl restart nginx
    echo "✅ Nginx已重启"
else
    echo "❌ Nginx配置有误，请检查"
    exit 1
fi

echo ""
echo "🌐 HTTPS配置完成！现在你可以通过以下地址访问API:"
echo "   HTTPS: https://141.11.139.93/api/status"
echo "   HTTP:  http://141.11.139.93/api/status (自动重定向到HTTPS)"
echo ""
echo "📝 在Vercel中设置环境变量:"
echo "   NEXT_PUBLIC_DATA_SERVER_URL=https://141.11.139.93"
echo ""
echo "⚠️  注意：自签名证书会显示安全警告"
echo "   - 浏览器会提示证书不受信任"
echo "   - 但Vercel可以正常连接"
echo "   - 生产环境建议使用正式域名和Let's Encrypt证书"
echo ""
echo "✅ SSL配置完成！"