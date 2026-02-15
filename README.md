# BTW - 比狼好 Minecraft 模组推荐网站

一个现代化的 Minecraft 模组推荐和管理平台，提供模组展示、用户评论、登录注册等完整功能。

## 功能特性

- 📋 **模组展示** - 精心挑选的 Minecraft 模组推荐列表
- ⭐ **评论系统** - 用户可以对模组进行评论和评分
- 🔐 **用户认证** - 完整的登录注册功能
- 👨‍💼 **管理后台** - 管理员可管理用户、模组和评论
- 📊 **日志系统** - 记录系统操作日志
- 🎨 **响应式设计** - 适配各种设备尺寸

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite3
- **前端**: 原生 HTML/CSS/JavaScript
- **安全**: Helmet, bcryptjs, CORS

## 快速开始

### 环境要求

- Node.js 14.0 或更高版本
- npm 或 yarn

### 安装步骤

1. 克隆项目
```bash
git clone https://github.com/yourusername/btw-mods-website.git
cd btw-mods-website
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
```

编辑 `.env` 文件，设置以下配置：
- `PORT`: 服务器端口（默认 3000）
- `ALLOWED_ORIGINS`: 允许的 CORS 来源
- `SESSION_SECRET`: 会话密钥（生产环境请修改）
- `ADMIN_USERNAME`: 管理员用户名（默认 admin）

4. 启动服务
```bash
npm start
```

开发模式（自动重启）：
```bash
npm run dev
```

5. 访问网站
打开浏览器访问 `http://localhost:3000`

### 首次运行

首次运行时，系统会：
- 自动创建 SQLite 数据库
- 生成管理员密码（会在控制台输出）
- 创建必要的数据表

## 项目结构

```
.
├── data/                 # 数据库文件目录
│   └── btw.db            # SQLite 数据库
├── admin.html            # 管理后台页面
├── admin.js              # 管理后台逻辑
├── admin.css             # 管理后台样式
├── index.html            # 首页
├── mod-detail.html       # 模组详情页
├── mod-detail.js         # 模组详情逻辑
├── mod-detail.css        # 模组详情样式
├── login.html            # 登录页
├── register.html         # 注册页
├── server.js             # Express 服务器
├── script.js             # 前端通用逻辑
├── utils.js              # 工具函数库
├── logs.js               # 日志管理逻辑
├── styles.css            # 通用样式
└── auth.css              # 认证页面样式
```

## API 接口

### 认证相关
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/check-auth` - 检查登录状态

### 模组相关
- `GET /api/mods` - 获取模组列表
- `GET /api/mods/:id` - 获取模组详情
- `POST /api/mods` - 创建模组（管理员）
- `PUT /api/mods/:id` - 更新模组（管理员）
- `DELETE /api/mods/:id` - 删除模组（管理员）

### 评论相关
- `GET /api/mods/:id/comments` - 获取模组评论
- `POST /api/mods/:id/comments` - 添加评论
- `DELETE /api/comments/:id` - 删除评论（管理员）

### 用户管理
- `GET /api/users` - 获取用户列表（管理员）
- `DELETE /api/users/:id` - 删除用户（管理员）
- `PUT /api/users/:id/admin` - 设置管理员权限

### 日志管理
- `GET /api/logs` - 获取系统日志（管理员）

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | 服务器端口 | 3000 |
| NODE_ENV | 运行环境 | production |
| ALLOWED_ORIGINS | 允许的来源 | * |
| DB_PATH | 数据库路径 | ./data/btw.db |
| SESSION_SECRET | 会话密钥 | 需要设置 |
| ADMIN_USERNAME | 管理员用户名 | admin |

## 安全建议

1. **生产环境必须修改**:
   - `SESSION_SECRET`: 使用强随机密钥
   - `ALLOWED_ORIGINS`: 限制为你的域名
   
2. **定期备份数据库**:
   ```bash
   cp data/btw.db backup/btw-$(date +%Y%m%d).db
   ```

3. **使用 HTTPS**: 生产环境请配置 SSL 证书

4. **防火墙配置**: 限制数据库文件访问权限

## 开发指南

### 添加新模组

通过管理后台添加，或直接在数据库中插入数据。

### 修改样式

主要样式文件：
- `styles.css` - 全局样式
- `admin.css` - 管理后台样式
- `mod-detail.css` - 模组详情页样式
- `auth.css` - 登录注册页样式

### 扩展功能

1. 在 `server.js` 中添加新的 API 路由
2. 在 `utils.js` 中添加通用工具函数
3. 在对应的前端文件中实现界面逻辑

## 常见问题

### 端口被占用
修改 `.env` 文件中的 `PORT` 配置。

### 数据库错误
删除 `data/btw.db` 文件，重启服务让系统重新创建。

### 登录失败
检查浏览器控制台错误信息，确认服务器正常运行。

## 许可证

ISC License

## 联系方式

如有问题或建议，欢迎提交 Issue 或 Pull Request。
