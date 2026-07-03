#!/bin/bash

# FB股份 Node.js 版本部署脚本

set -e  # 遇到错误立即退出

echo "📦 FB股份 Node.js 版本部署脚本"
echo "=================================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
  echo "❌ Node.js 未安装，请先安装 Node.js 20+"
  exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
  echo "❌ npm 未安装"
  exit 1
fi

echo "✅ npm 版本: $(npm -v)"

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
  echo "⚠️  PM2 未安装，正在安装..."
  npm install -g pm2
fi

echo "✅ PM2 版本: $(pm2 -v)"

# 安装项目依赖
echo ""
echo "📦 安装项目依赖..."
npm install --production

# 创建日志目录
mkdir -p logs

# 停止旧进程（如果存在）
echo ""
echo "🛑 停止旧进程..."
pm2 delete fbstock-server 2>/dev/null || true

# 启动服务
echo ""
echo "🚀 启动服务..."
pm2 start ecosystem.config.js --env production

# 保存 PM2 进程列表
pm2 save

# 设置开机自启
echo ""
echo "🔧 设置开机自启..."
pm2 startup | grep sudo | bash || true

echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 查看服务状态: pm2 status"
echo "📋 查看日志: pm2 logs fbstock-server"
echo "🛑 停止服务: pm2 stop fbstock-server"
echo "🔄 重启服务: pm2 restart fbstock-server"
echo ""
echo "=================================="
echo "⚠️  记得配置 nginx 反向代理！"
echo "   配置文件模板: deploy/nginx.conf"
echo "=================================="
