#!/bin/bash

# 服务器监控仪表板安装脚本

set -e

echo "========================================="
echo "  服务器监控仪表板安装脚本"
echo "========================================="

# 检查是否为root用户
if [[ $EUID -eq 0 ]]; then
   echo "请不要使用root用户运行此脚本"
   exit 1
fi

# 获取当前用户和工作目录
CURRENT_USER=$(whoami)
WORK_DIR=$(pwd)

echo "当前用户: $CURRENT_USER"
echo "工作目录: $WORK_DIR"

# 1. 创建Python虚拟环境
echo "步骤 1: 创建Python虚拟环境..."
python3 -m venv venv
source venv/bin/activate

# 2. 安装Python依赖
echo "步骤 2: 安装Python依赖..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Python依赖安装完成!"

# 3. 测试应用启动
echo "步骤 3: 测试应用..."
echo "正在测试Flask应用启动..."
timeout 10s python app.py &
sleep 5
if pgrep -f "python app.py" > /dev/null; then
    echo "✓ 应用测试成功"
    pkill -f "python app.py"
else
    echo "✗ 应用测试失败，请检查代码"
    exit 1
fi

# 4. 配置systemd服务
echo "步骤 4: 配置systemd服务..."
sudo cp config/dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dashboard.service

echo "✓ Systemd服务配置完成"

# 5. 配置防火墙（如果存在）
echo "步骤 5: 配置防火墙..."
if command -v ufw &> /dev/null; then
    echo "检测到UFW防火墙"
    echo "请根据需要手动配置以下端口："
    echo "  - HTTP: sudo ufw allow 80"
    echo "  - HTTPS: sudo ufw allow 443"
    echo "  - 开发端口 (临时): sudo ufw allow 5000"
else
    echo "未检测到UFW防火墙"
fi

# 6. Nginx配置提示
echo "步骤 6: Nginx配置..."
if command -v nginx &> /dev/null; then
    echo "检测到Nginx"
    echo "Nginx配置文件已生成: config/nginx.conf"
    echo "请手动完成以下步骤："
    echo "  1. 编辑 config/nginx.conf，替换域名和SSL证书路径"
    echo "  2. 复制到Nginx配置目录: sudo cp config/nginx.conf /etc/nginx/sites-available/dashboard"
    echo "  3. 创建软链接: sudo ln -s /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/"
    echo "  4. 测试配置: sudo nginx -t"
    echo "  5. 重载Nginx: sudo systemctl reload nginx"
else
    echo "未检测到Nginx，请手动安装: sudo apt install nginx"
fi

# 7. SSL证书提示
echo "步骤 7: SSL证书配置..."
echo "建议使用Let's Encrypt获取免费SSL证书:"
echo "  sudo apt install certbot python3-certbot-nginx"
echo "  sudo certbot --nginx -d your-domain.com"

# 8. 完成安装
echo ""
echo "========================================="
echo "  安装完成！"
echo "========================================="
echo ""
echo "下一步操作:"
echo "  1. 启动服务: sudo systemctl start dashboard"
echo "  2. 查看状态: sudo systemctl status dashboard"
echo "  3. 查看日志: sudo journalctl -u dashboard -f"
echo ""
echo "访问方式:"
echo "  - 开发模式: http://localhost:5000"
echo "  - 生产模式: https://your-domain.com (配置Nginx后)"
echo ""
echo "默认登录密码: admin123 (请尽快修改config/config.py中的密码)"
echo ""
echo "安全提示:"
echo "  - 修改默认密码"
echo "  - 配置防火墙规则"
echo "  - 设置SSL证书"
echo "  - 考虑添加IP白名单限制"