from flask import Blueprint, render_template, request, redirect, url_for, flash, session, make_response, send_from_directory
from .auth import auth_manager
import os
import hashlib

main = Blueprint('main', __name__)

@main.route('/')
@auth_manager.login_required
def dashboard():
    response = make_response(render_template('dashboard.html'))
    # 设置HTML页面缓存（较短时间）
    response.headers['Cache-Control'] = 'public, max-age=300'  # 5分钟
    return response

@main.route('/static/<path:filename>')
def static_files(filename):
    """优化的静态文件处理，包含缓存头和ETags"""
    try:
        file_path = os.path.join(main.root_path, '../static', filename)
        if not os.path.exists(file_path):
            return "File not found", 404
        
        # 计算文件ETag
        with open(file_path, 'rb') as f:
            content = f.read()
            etag = hashlib.md5(content).hexdigest()
        
        # 检查If-None-Match头
        if request.headers.get('If-None-Match') == etag:
            return '', 304
        
        response = send_from_directory(os.path.join(main.root_path, '../static'), filename)
        
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

@main.route('/login', methods=['GET', 'POST'])
def login():
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
            return redirect(url_for('main.dashboard'))
        else:
            # Record failed attempt
            is_blocked = auth_manager.record_failed_attempt(client_ip)
            if is_blocked:
                flash('Too many failed attempts. IP blocked temporarily.', 'error')
            else:
                flash('Invalid password', 'error')
    
    return render_template('login.html')

@main.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('main.login'))
