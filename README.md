# 服务器监控仪表板

一个基于Flask的实时服务器监控系统，提供Web界面显示系统资源使用情况。

## 功能特性

- 🔒 **安全认证**: 密码保护，防暴力破解
- 📊 **实时监控**: CPU、内存、磁盘、网络实时数据
- 📈 **图表展示**: 历史数据趋势图
- 🔧 **服务状态**: 系统服务运行状态监控
- 📱 **响应式设计**: 支持移动端访问
- 🌐 **外部访问**: 支持HTTPS和反向代理

## 监控指标

### 系统信息
- 主机名、操作系统版本
- 系统运行时间
- CPU核心数和频率

### 资源使用
- **CPU**: 使用率、负载平均值、每核心使用率
- **内存**: 总量、已用、可用、缓存
- **磁盘**: 各分区使用情况、I/O统计
- **网络**: 接口流量统计、实时速率

### 进程和服务
- TOP 10 CPU/内存占用进程
- 常见系统服务状态 (nginx, mysql, redis等)

## 快速开始

### 1. 自动安装
```bash
cd /home/alexzheng/server_dashboard
./install.sh
```

### 2. 手动安装

#### 安装依赖
```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装Python包
pip install -r requirements.txt
```

#### 启动应用
```bash
python app.py
```

访问: http://localhost:5000

### 3. 生产部署

#### 配置systemd服务
```bash
sudo cp config/dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dashboard
sudo systemctl start dashboard
```

#### 配置Nginx反向代理
```bash
# 编辑nginx配置，替换域名和SSL证书路径
sudo nano config/nginx.conf

# 部署配置
sudo cp config/nginx.conf /etc/nginx/sites-available/dashboard
sudo ln -s /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 配置SSL证书 (推荐)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 配置说明

### 修改登录密码
编辑 `config/config.py`:
```python
DEFAULT_PASSWORD = 'your-new-password'
```

### 安全配置
- 修改默认密码
- 配置防火墙规则
- 启用HTTPS
- 考虑IP白名单限制

### 防火墙配置
```bash
# UFW防火墙
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw allow 5000  # 开发端口(临时)
```

## 文件结构
```
server_dashboard/
├── app.py                 # Flask主应用
├── requirements.txt       # Python依赖
├── install.sh            # 自动安装脚本
├── README.md             # 说明文档
├── app/
│   ├── auth.py           # 认证模块
│   └── monitor.py        # 系统监控模块
├── config/
│   ├── config.py         # 应用配置
│   ├── nginx.conf        # Nginx配置模板
│   └── dashboard.service # Systemd服务配置
├── templates/
│   ├── login.html        # 登录页面
│   └── dashboard.html    # 仪表板主页
└── static/
    ├── css/
    │   └── style.css     # 样式文件
    └── js/
        └── dashboard.js  # 前端交互脚本
```

## API接口

- `GET /api/stats` - 获取系统统计数据 (需要认证)
- WebSocket连接 - 实时数据推送

## 安全特性

- Session超时机制
- 登录失败限制
- IP临时封禁
- HTTPS支持
- 安全HTTP头设置
- CSRF保护

## 系统要求

- Python 3.6+
- Ubuntu/Debian Linux
- 1GB+ RAM
- psutil, Flask等Python包

## 故障排除

### 查看服务状态
```bash
sudo systemctl status dashboard
```

### 查看日志
```bash
# 应用日志
sudo journalctl -u dashboard -f

# Nginx日志
sudo tail -f /var/log/nginx/dashboard_error.log
```

### 常见问题
1. **权限错误**: 确保运行用户有访问系统信息的权限
2. **端口占用**: 检查5000端口是否被其他进程占用
3. **WebSocket连接失败**: 检查Nginx配置的WebSocket支持

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。