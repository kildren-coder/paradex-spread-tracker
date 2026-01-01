# 🚀 部署检查清单

## 📋 部署前准备

### 后端准备
- [ ] 云服务器已准备就绪（Ubuntu/CentOS）
- [ ] Node.js 18+ 已安装
- [ ] PM2 已安装
- [ ] 代理列表已准备（proxies.txt）
- [ ] 防火墙端口3002已开放
- [ ] 域名已配置（可选）

### 前端准备
- [ ] GitHub仓库已创建
- [ ] 代码已推送到GitHub
- [ ] Vercel账号已准备
- [ ] 后端服务器地址已确认

## 🖥️ 后端部署步骤

1. **上传代码到服务器**
```bash
# 方法1: Git克隆
git clone https://github.com/your-username/paradex-spread-tracker.git
cd paradex-spread-tracker/server

# 方法2: SCP上传
scp -r ./server user@your-server-ip:/home/user/paradex-server
```

2. **配置代理文件**
```bash
# 将代理列表保存到proxies.txt
nano proxies.txt
# 粘贴你的代理列表
```

3. **执行部署**
```bash
chmod +x deploy.sh
./deploy.sh
```

4. **验证部署**
```bash
# 检查服务状态
pm2 status

# 测试API
curl http://localhost:3002/api/status
```

## 🌐 前端部署步骤

1. **推送代码到GitHub**
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

2. **在Vercel部署**
   - 访问 vercel.com
   - 导入GitHub仓库
   - 设置环境变量: `NEXT_PUBLIC_DATA_SERVER_URL`
   - 点击Deploy

3. **配置环境变量**
   - Development: `http://localhost:3002`
   - Production: `http://your-server-ip:3002` 或 `https://your-domain.com`

## ✅ 部署后验证

### 后端验证
- [ ] PM2状态显示运行中
- [ ] API端点响应正常
- [ ] 代理连接正常
- [ ] 数据收集正常运行
- [ ] 日志无错误

```bash
# 验证命令
pm2 status
curl http://your-server-ip:3002/api/status
curl http://your-server-ip:3002/api/analysis
pm2 logs paradex-collector --lines 50
```

### 前端验证
- [ ] Vercel部署成功
- [ ] 网站可以正常访问
- [ ] 能连接到后端API
- [ ] 数据正常显示
- [ ] 所有功能正常工作

## 🔧 常见问题解决

### 后端问题
1. **端口被占用**
```bash
sudo lsof -i :3002
sudo kill -9 <PID>
```

2. **代理连接失败**
```bash
# 检查代理格式
head -5 proxies.txt
# 检查网络连接
curl -x proxy_host:proxy_port --proxy-user username:password https://api.prod.paradex.trade/v1/markets
```

3. **内存不足**
```bash
# 检查内存使用
free -h
# 重启服务
pm2 restart paradex-collector
```

### 前端问题
1. **API连接失败**
   - 检查环境变量设置
   - 确认后端服务器可访问
   - 检查CORS配置

2. **构建失败**
   - 检查依赖版本
   - 查看Vercel构建日志

## 📊 监控设置

### 后端监控
```bash
# 设置日志轮转
pm2 install pm2-logrotate

# 监控面板
pm2 monit

# 设置告警（可选）
pm2 install pm2-server-monit
```

### 前端监控
- 启用Vercel Analytics
- 配置错误监控（Sentry等）

## 🔄 更新部署

### 后端更新
```bash
cd /path/to/server
git pull
pm2 restart paradex-collector
```

### 前端更新
```bash
git push origin main
# Vercel会自动重新部署
```

## 📞 支持联系

如果遇到问题：
1. 检查日志文件
2. 查看GitHub Issues
3. 参考文档

---

**部署完成后，你将拥有：**
- 🖥️ 云服务器上运行的高性能数据收集器
- 🌐 Vercel上的快速响应前端
- 📊 实时的Paradex点差分析系统
- 🔄 自动化的部署和监控