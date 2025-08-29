"""
重构后的Flask主应用 - 模块化、清晰的架构
"""
from flask import Flask, render_template, request, redirect, url_for, flash, session, make_response, send_from_directory
from flask_socketio import SocketIO
from flask_compress import Compress
import sys
import os
import hashlib
from datetime import datetime, timedelta

# 添加项目路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 导入配置和核心模块
from config.config import Config
from app.auth import auth_manager
from app.handlers.websocket_handler import WebSocketHandler

# 导入路由蓝图
from routes.api.system_routes import system_bp
from routes.api.process_routes import process_bp
from routes.dns.dns_routes import dns_bp


class DashboardApp:
    """仪表板应用类 - 封装应用创建和配置"""
    
    def __init__(self):
        self.app = None
        self.socketio = None
        self.websocket_handler = None
    
    def create_app(self):
        """创建Flask应用"""
        self.app = Flask(__name__)
        self.app.config.from_object(Config)
        
        # 启用gzip压缩
        compress = Compress()
        compress.init_app(self.app)
        
        # 初始化SocketIO
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        
        # 初始化认证管理器
        auth_manager.init_app(self.app)
        
        # 初始化WebSocket处理器
        self.websocket_handler = WebSocketHandler(self.socketio)
        
        # 注册路由
        self._register_routes()
        
        # 注册蓝图
        self._register_blueprints()
        
        return self.app, self.socketio
    
    def _register_routes(self):
        """注册基础路由"""
        
        @self.app.route('/')
        @auth_manager.login_required  
        def dashboard():
            """仪表板主页"""
            response = make_response(render_template('dashboard.html'))
            # 设置HTML页面缓存（较短时间）
            response.headers['Cache-Control'] = 'public, max-age=300'  # 5分钟
            return response

        @self.app.route('/static/<path:filename>')
        def static_files(filename):
            """优化的静态文件处理，包含缓存头和ETags"""
            try:
                file_path = os.path.join(self.app.static_folder, filename)
                if not os.path.exists(file_path):
                    return "File not found", 404
                
                # 计算文件ETag
                with open(file_path, 'rb') as f:
                    content = f.read()
                    etag = hashlib.md5(content).hexdigest()
                
                # 检查If-None-Match头
                if request.headers.get('If-None-Match') == etag:
                    return '', 304
                
                response = send_from_directory(self.app.static_folder, filename)
                
                # 设置缓存头
                if filename.endswith(('.css', '.js')):
                    # CSS和JS文件缓存1小时
                    response.headers['Cache-Control'] = 'public, max-age=3600'
                elif filename.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico')):
                    # 图片文件缓存1天
                    response.headers['Cache-Control'] = 'public, max-age=86400'
                else:
                    # 其他静态文件缓存30分钟
                    response.headers['Cache-Control'] = 'public, max-age=1800'
                
                response.headers['ETag'] = etag
                return response
                
            except Exception as e:
                return f"Error serving static file: {str(e)}", 500

        @self.app.route('/login', methods=['GET', 'POST'])
        def login():
            """用户登录"""
            if request.method == 'POST':
                password = request.form.get('password')
                client_ip = request.remote_addr
                
                # Check if IP is blocked
                if auth_manager.is_ip_blocked(client_ip):
                    flash('Too many failed attempts. Please try again later.', 'error')
                    return render_template('login.html')
                
                if auth_manager.authenticate(password):
                    session['logged_in'] = True
                    session.permanent = True
                    return redirect(url_for('dashboard'))
                else:
                    # Record failed attempt
                    is_blocked = auth_manager.record_failed_attempt(client_ip)
                    if is_blocked:
                        flash('Too many failed attempts. IP blocked temporarily.', 'error')
                    else:
                        flash('Invalid password', 'error')
            
            return render_template('login.html')

        @self.app.route('/logout')
        def logout():
            """用户登出"""
            session.pop('logged_in', None)
            return redirect(url_for('login'))
    
    def _register_blueprints(self):
        """注册蓝图路由"""
        # 注册API蓝图
        self.app.register_blueprint(system_bp)
        self.app.register_blueprint(process_bp)
        
        # 注册DNS蓝图（如果存在）
        try:
            self.app.register_blueprint(dns_bp)
        except ImportError:
            print("DNS routes not available")
    
    def run(self, host='0.0.0.0', port=5000, debug=False):
        """运行应用"""
        if self.socketio:
            self.socketio.run(self.app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
        else:
            self.app.run(host=host, port=port, debug=debug)


# 创建应用实例
dashboard_app = DashboardApp()

# 用于直接运行
if __name__ == '__main__':
    app, socketio = dashboard_app.create_app()
    dashboard_app.run()

# 用于其他模块导入
app, socketio = dashboard_app.create_app()