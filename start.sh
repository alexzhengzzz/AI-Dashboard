#!/bin/bash

# 服务器监控仪表板快速启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  服务器监控仪表板快速启动${NC}"
echo -e "${BLUE}=========================================${NC}"

# 1. 检查虚拟环境
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}警告: 未找到虚拟环境，正在创建...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ 虚拟环境创建完成${NC}"
fi

# 2. 激活虚拟环境
echo -e "${BLUE}激活虚拟环境...${NC}"
source venv/bin/activate

# 3. 检查依赖
if [ ! -f "venv/pyvenv.cfg" ] || ! pip list | grep -q "Flask"; then
    echo -e "${YELLOW}正在安装Python依赖...${NC}"
    pip install --upgrade pip > /dev/null 2>&1
    pip install -r requirements.txt > /dev/null 2>&1
    echo -e "${GREEN}✓ 依赖安装完成${NC}"
else
    echo -e "${GREEN}✓ 依赖检查通过${NC}"
fi

# 4. 检查端口占用
PORT=5000
if ss -tlnp 2>/dev/null | grep -q ":$PORT " || netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo -e "${RED}警告: 端口 $PORT 已被占用${NC}"
    echo -e "${YELLOW}正在检查占用进程...${NC}"
    
    # 尝试获取占用进程信息
    PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
    if [ -z "$PID" ]; then
        PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $7}' | cut -d/ -f1 | head -1)
    fi
    
    if [ ! -z "$PID" ] && [ "$PID" != "-" ]; then
        PROCESS_NAME=$(ps -p $PID -o comm= 2>/dev/null || echo "未知进程")
        echo -e "${YELLOW}占用进程: $PROCESS_NAME (PID: $PID)${NC}"
        echo -e "${YELLOW}您可以选择:${NC}"
        echo -e "  1. 终止占用进程: ${GREEN}kill $PID${NC}"
        echo -e "  2. 或者等待进程自行结束"
        echo ""
        read -p "是否要终止占用进程? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill $PID 2>/dev/null && echo -e "${GREEN}✓ 进程已终止${NC}" || echo -e "${RED}✗ 终止进程失败${NC}"
            sleep 2
        fi
    fi
fi

# 5. 检查必要文件
if [ ! -f "app.py" ]; then
    echo -e "${RED}错误: 未找到 app.py 文件${NC}"
    exit 1
fi

if [ ! -f "config/config.py" ]; then
    echo -e "${RED}错误: 未找到配置文件 config/config.py${NC}"
    exit 1
fi

# 6. 启动应用
echo -e "${BLUE}正在启动服务器监控仪表板...${NC}"
echo ""

# 显示启动信息
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  仪表板启动成功！${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${BLUE}访问地址:${NC}"
echo -e "  • 本地访问: ${GREEN}http://localhost:$PORT${NC}"
echo -e "  • 网络访问: ${GREEN}http://$(hostname -I | awk '{print $1}'):$PORT${NC}"
echo ""
echo -e "${BLUE}登录信息:${NC}"
echo -e "  • 默认密码: ${YELLOW}admin123${NC}"
echo -e "  • ${RED}请及时修改默认密码${NC}"
echo ""
echo -e "${BLUE}功能特性:${NC}"
echo -e "  • 实时系统监控"
echo -e "  • 端口状态检查"
echo -e "  • 进程管理（可关闭端口进程）"
echo -e "  • 服务状态监控"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止服务器${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# 启动Flask应用
python3 app.py