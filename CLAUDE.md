# CLAUDE.md

此文件为 Claude Code 在此代码仓库中工作时提供指导。

## 项目概述

基于 Flask 的实时服务器监控仪表板，使用 WebSocket 提供系统资源监控、端口状态检查和进程管理功能，包含身份验证和防暴力破解保护。新增内存使用排行TOP 15功能，可实时查看和管理高内存占用进程。

## 核心组件

- `app.py` - Flask 主应用，处理路由和 WebSocket
- `app/auth.py` - 身份验证和安全管理
- `app/monitor.py` - 使用 psutil 收集系统数据
- `config/config.py` - 配置管理（包含密码设置）

## 开发命令

### 快速启动（推荐）

```bash
# 一键启动脚本 - 自动处理环境和依赖
./start.sh
```

启动脚本功能：
- 自动创建和激活虚拟环境
- 自动安装依赖包
- 检测端口冲突并提供解决方案
- 显示访问地址和登录信息
- 彩色输出和友好提示

仪表板主要功能：
- 实时系统资源监控（CPU、内存、磁盘、网络）
- 内存使用排行TOP 15（可终止进程）
- 端口状态监控和进程管理
- 系统服务状态监控
- 安全的进程终止功能（保护系统关键进程）

### 手动启动

```bash
# 环境设置
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 运行开发服务器
python app.py
# 访问: http://localhost:5000 或 http://服务器IP:5000
# 默认密码: admin123
```

### 生产部署

```bash
# 使用完整安装脚本
./install.sh

# 或手动部署
sudo cp config/dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable dashboard && sudo systemctl start dashboard
```

## 配置说明

- 修改 `config/config.py` 中的 `DEFAULT_PASSWORD` 和 `SECRET_KEY`
- HTTPS 环境需设置 `SESSION_COOKIE_SECURE = True`
- 监控功能：CPU/内存/磁盘/网络资源、系统服务状态、常用端口监控、进程内存排行、进程管理
- 系统要求：Python 3.6+、psutil 权限、端口 5000

## 文件结构

- `app.py` - Flask 主入口
- `start.sh` - 快速启动脚本
- `install.sh` - 完整安装脚本
- `app/` - 认证和监控模块
- `config/` - 配置文件和服务配置
- `templates/` - HTML 模板
- `static/` - 前端资源

## API 接口

- `GET /` - 仪表板（需认证）
- `POST /login` - 登录
- `GET /api/stats` - 系统数据 JSON
- `POST /api/kill_port_process/<port>` - 关闭指定端口的进程（需认证）
- `POST /api/kill_process/<pid>` - 根据PID关闭进程（需认证）
- WebSocket: `request_stats`, `stats_update`

## 进程管理功能

### 内存使用排行 TOP 15
仪表板新增内存使用排行功能，实时显示占用内存最多的进程：

- **显示信息**：PID、进程名、用户、内存占用（MB）、内存百分比、命令行参数
- **排序规则**：按实际内存使用量（RSS）降序排列
- **实时更新**：通过WebSocket每5秒自动刷新数据
- **详细命令**：鼠标悬停可查看完整命令行参数
- **进程管理**：可直接从界面终止高内存占用进程

### 端口进程管理
仪表板支持直接从界面关闭占用特定端口的进程：

- 在端口监控面板中，开放状态的端口会显示"关闭进程"按钮
- 点击按钮会弹出确认对话框，显示进程详细信息
- 确认后会发送 POST 请求到 `/api/kill_port_process/<port>` 接口

### 通用进程管理
在内存使用排行中可以直接终止进程：

- 每个进程行都有"终止"按钮（受保护进程显示"受保护"）
- 点击"终止"按钮会显示确认对话框，包含进程详细信息
- 确认后发送 POST 请求到 `/api/kill_process/<pid>` 接口
- 系统会优先使用 SIGTERM 信号，3秒后无响应则使用 SIGKILL
- 操作结果通过 Toast 提示显示给用户

### 安全限制
- 只能关闭用户级进程，系统关键服务受保护
- PID < 1000 的 root 进程被跳过
- 保护列表：systemd、init、kernel、kthreadd、ssh、sshd
- root用户的系统进程（PID < 1000）自动受保护

## 常见问题

- 确保 `app/` 和 `config/` 目录有 `__init__.py` 文件
- 检查端口 5000 可用性和防火墙设置
- HTTP 环境设置 `SESSION_COOKIE_SECURE = False`
- 查看日志：`sudo journalctl -u dashboard -f`