# 前端Vercel部署指南

## 🚀 快速部署步骤

### 1. 准备代码仓库

```bash
# 初始化Git仓库（如果还没有）
git init
git add .
git commit -m "Initial commit: Paradex spread tracker"

# 推送到GitHub
git remote add origin https://github.com/your-username/paradex-spread-tracker.git
git branch -M main
git push -u origin main
```

### 2. 部署到Vercel

#### 方法1: 通过Vercel网站部署

1. 访问 [vercel.com](https://vercel.com)
2. 使用GitHub账号登录
3. 点击 "New Project"
4. 选择你的GitHub仓库
5. 配置环境变量:
   - `NEXT_PUBLIC_DATA_SERVER_URL`: `http://your-server-ip:3002`
6. 点击 "Deploy"

#### 方法2: 使用Vercel CLI部署

```bash
# 安装Vercel CLI
npm i -g vercel

# 登录Vercel
vercel login

# 部署项目
vercel

# 设置环境变量
vercel env add NEXT_PUBLIC_DATA_SERVER_URL production
# 输入值: http://your-server-ip:3002

# 重新部署以应用环境变量
vercel --prod
```

### 3. 配置自定义域名（可选）

1. 在Vercel项目设置中点击 "Domains"
2. 添加你的域名
3. 按照提示配置DNS记录

### 4. 环境变量配置

在Vercel项目设置中配置以下环境变量:

| 变量名 | 值 | 环境 |
|--------|----|----|
| `NEXT_PUBLIC_DATA_SERVER_URL` | `http://your-server-ip:3002` | Production |
| `NEXT_PUBLIC_DATA_SERVER_URL` | `http://localhost:3002` | Development |

## 🔧 部署后配置

### 1. 测试连接

部署完成后，访问你的Vercel域名，检查是否能正常连接到后端API。

### 2. CORS配置

如果遇到跨域问题，需要在后端服务器添加CORS配置。后端已经配置了CORS，但如果有问题，可以检查：

```javascript
// server/server.js 中已包含
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-vercel-domain.vercel.app',
    'https://your-custom-domain.com'
  ]
}));
```

### 3. HTTPS配置

如果你的后端使用HTTPS，确保环境变量使用 `https://` 前缀:
```
NEXT_PUBLIC_DATA_SERVER_URL=https://your-server-domain.com
```

## 📊 监控和维护

### 1. Vercel Analytics

在Vercel项目设置中启用Analytics来监控网站性能。

### 2. 错误监控

可以集成Sentry等错误监控服务:

```bash
npm install @sentry/nextjs
```

### 3. 性能优化

- 启用Vercel的Edge Functions
- 配置适当的缓存策略
- 使用Vercel Image Optimization

## 🔍 故障排除

### 常见问题

1. **多区域部署错误**
   ```
   Deploying Serverless Functions to multiple regions is restricted to the Pro and Enterprise plans.
   ```
   **解决方案**: 已修复，vercel.json中移除了regions配置

2. **API连接失败**
   - 检查环境变量是否正确设置
   - 确认后端服务器正在运行
   - 检查防火墙设置

3. **CORS错误**
   - 在后端添加Vercel域名到CORS白名单
   - 检查请求头设置

4. **构建失败**
   - 检查依赖版本兼容性
   - 查看Vercel构建日志

### 调试命令

```bash
# 本地测试生产构建
npm run build
npm start

# 查看Vercel部署日志
vercel logs

# 检查环境变量
vercel env ls
```

## 🚀 自动部署

配置GitHub Actions实现自动部署:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```