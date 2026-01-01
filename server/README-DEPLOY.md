# 后端部署指南

## 🖥️ 云服务器要求

- **系统**: Ubuntu 20.04+ / CentOS 7+
- **内存**: 最少1GB，推荐2GB+
- **CPU**: 1核心以上
- **存储**: 10GB以上
- **网络**: 稳定的外网连接

## 📋 部署步骤

### 1. 准备服务器环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PM2进程管理器
sudo npm install -g pm2

# 安装Git
sudo apt install git -y
```

### 2. 上传代码

```bash
# 方法1: 使用Git
git clone <your-repo-url>
cd <your-repo>/server

# 方法2: 使用SCP上传
# 在本地执行:
# scp -r ./server user@your-server-ip:/home/user/paradex-server
```

### 3. 配置代理文件

```bash
# 将代理列表保存到proxies.txt
nano proxies.txt

# 格式: host:port:username:password
# 例如:
# 50.114.92.141:5605:qazxsnbhg:rfvgfdertf
# 31.57.90.186:5755:qazxsnbhg:rfvgfdertf
```

### 4. 执行部署

```bash
# 给脚本执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

### 5. 配置防火墙

```bash
# Ubuntu/Debian
sudo ufw allow 3002
sudo ufw reload

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3002/tcp
sudo firewall-cmd --reload
```

### 6. 配置Nginx反向代理（可选）

```bash
# 安装Nginx
sudo apt install nginx -y

# 创建配置文件
sudo nano /etc/nginx/sites-available/paradex-api
```

Nginx配置内容:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/paradex-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔧 管理命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs paradex-collector

# 重启服务
pm2 restart paradex-collector

# 停止服务
pm2 stop paradex-collector

# 查看详细信息
pm2 show paradex-collector

# 监控面板
pm2 monit
```

## 🔍 故障排除

### 检查服务是否正常运行
```bash
curl http://localhost:3002/api/status
```

### 检查代理连接
```bash
# 查看日志中的代理状态
pm2 logs paradex-collector | grep proxy
```

### 重新部署
```bash
pm2 stop paradex-collector
git pull  # 如果使用Git
./deploy.sh
```

## 📊 监控建议

1. **设置日志轮转**:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

2. **设置监控告警**:
```bash
# 安装PM2监控
pm2 install pm2-server-monit
```

3. **定期备份数据**:
```bash
# 创建备份脚本
echo "tar -czf /backup/paradex-data-$(date +%Y%m%d).tar.gz spread-data.json" > backup.sh
chmod +x backup.sh
# 添加到crontab: 0 2 * * * /path/to/backup.sh
```