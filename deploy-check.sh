#!/bin/bash
# 部署前安全检查脚本

echo "========================================="
echo "  部署前安全检查"
echo "========================================="
echo ""

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "❌ 错误: .env 文件不存在"
    echo "   请复制 .env.example 为 .env 并配置"
    exit 1
fi
echo "✅ .env 文件存在"

# 检查 ALLOWED_ORIGINS 是否为默认值
if grep -q "localhost:3000" .env && ! grep -q "^#" .env; then
    echo "⚠️  警告: ALLOWED_ORIGINS 包含 localhost"
    echo "   生产环境请修改为实际域名"
fi

# 检查 node_modules 是否存在
if [ ! -d node_modules ]; then
    echo "❌ 错误: node_modules 不存在"
    echo "   请运行 npm install"
    exit 1
fi
echo "✅ node_modules 存在"

# 检查 data 目录
if [ ! -d data ]; then
    echo "📁 创建 data 目录"
    mkdir -p data
fi

# 检查数据库权限
if [ -f data/btw.db ]; then
    if [ ! -w data/btw.db ]; then
        echo "❌ 错误: 数据库文件不可写"
        exit 1
    fi
    echo "✅ 数据库文件可写"
fi

echo ""
echo "========================================="
echo "  检查完成! 可以开始部署"
echo "========================================="
echo ""
echo "下一步:"
echo "1. 如果首次运行,请保存启动后输出的管理员密码"
echo "2. 使用 PM2 或 systemd 启动应用"
echo "3. 配置 Nginx 反向代理"
echo "4. 启用 HTTPS"
