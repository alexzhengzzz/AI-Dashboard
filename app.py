from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify, make_response, send_from_directory
from flask_socketio import SocketIO, emit
from flask_compress import Compress
import sys
import os
import hashlib
from datetime import datetime, timedelta
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from app.auth import auth_manager
from app.services.monitor_service import monitor
from app.terminal import terminal_manager
from app.dns_server import dns_server
from app.dns_manager import dns_manager
from app.adblock import adblock_engine

app = Flask(__name__)
app.config.from_object(Config)

# 启用gzip压缩
compress = Compress()
compress.init_app(app)

socketio = SocketIO(app, cors_allowed_origins="*")
auth_manager.init_app(app)

@app.route('/')
@auth_manager.login_required  
def dashboard():
    response = make_response(render_template('dashboard.html'))
    # 设置HTML页面缓存（较短时间）
    response.headers['Cache-Control'] = 'public, max-age=300'  # 5分钟
    return response

@app.route('/static/<path:filename>')
def static_files(filename):
    """优化的静态文件处理，包含缓存头和ETags"""
    try:
        file_path = os.path.join(app.static_folder, filename)
        if not os.path.exists(file_path):
            return "File not found", 404
        
        # 计算文件ETag
        with open(file_path, 'rb') as f:
            content = f.read()
            etag = hashlib.md5(content).hexdigest()
        
        # 检查If-None-Match头
        if request.headers.get('If-None-Match') == etag:
            return '', 304
        
        response = send_from_directory(app.static_folder, filename)
        
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

@app.route('/login', methods=['GET', 'POST'])
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
            return redirect(url_for('dashboard'))
        else:
            # Record failed attempt
            is_blocked = auth_manager.record_failed_attempt(client_ip)
            if is_blocked:
                flash('Too many failed attempts. IP blocked temporarily.', 'error')
            else:
                flash('Invalid password', 'error')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/api/stats')
@auth_manager.login_required
def api_stats():
    stats = monitor.get_all_stats(force_full=True)
    response = make_response(jsonify(stats))
    # API数据不缓存或短期缓存
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/kill_port_process/<int:port>', methods=['POST'])
@auth_manager.login_required
def kill_port_process(port):
    try:
        result = monitor.kill_process_by_port(port)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'操作失败: {str(e)}'
        })

@app.route('/api/kill_process/<int:pid>', methods=['POST'])
@auth_manager.login_required
def kill_process_by_pid(pid):
    try:
        result = monitor.kill_process_by_pid(pid)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'操作失败: {str(e)}'
        }), 500

# DNS相关API路由
@app.route('/api/dns/status')
@auth_manager.login_required
def dns_status():
    """获取DNS服务器状态"""
    try:
        status = dns_server.get_status()
        stats = dns_manager.get_query_stats()
        adblock_stats = adblock_engine.get_stats()
        
        return jsonify({
            'success': True,
            'dns_server': status,
            'query_stats': stats,
            'adblock_stats': adblock_stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取DNS状态失败: {str(e)}'
        }), 500

@app.route('/api/dns/start', methods=['POST'])
@auth_manager.login_required
def dns_start():
    """启动DNS服务器"""
    try:
        success, message = dns_server.start()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'启动DNS服务器失败: {str(e)}'
        }), 500

@app.route('/api/dns/stop', methods=['POST'])
@auth_manager.login_required
def dns_stop():
    """停止DNS服务器"""
    try:
        success, message = dns_server.stop()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'停止DNS服务器失败: {str(e)}'
        }), 500

@app.route('/api/dns/restart', methods=['POST'])
@auth_manager.login_required
def dns_restart():
    """重启DNS服务器"""
    try:
        success, message = dns_server.restart()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'重启DNS服务器失败: {str(e)}'
        }), 500

@app.route('/api/dns/queries/recent')
@auth_manager.login_required
def dns_recent_queries():
    """获取最近的DNS查询"""
    try:
        limit = request.args.get('limit', 50, type=int)
        queries = dns_manager.get_recent_queries(limit)
        blocked_queries = dns_manager.get_recent_blocked_queries(limit)
        
        return jsonify({
            'success': True,
            'queries': queries,
            'blocked_queries': blocked_queries
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取查询记录失败: {str(e)}'
        }), 500

@app.route('/api/dns/stats/hourly')
@auth_manager.login_required
def dns_hourly_stats():
    """获取按小时分组的DNS统计"""
    try:
        hours = request.args.get('hours', 24, type=int)
        stats = dns_manager.get_hourly_stats(hours)
        return jsonify({
            'success': True,
            'data': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取小时统计失败: {str(e)}'
        }), 500

@app.route('/api/dns/clients')
@auth_manager.login_required
def dns_client_stats():
    """获取DNS客户端统计"""
    try:
        hours = request.args.get('hours', 24, type=int)
        clients = dns_manager.get_client_stats(hours)
        return jsonify({
            'success': True,
            'clients': clients
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取客户端统计失败: {str(e)}'
        }), 500

@app.route('/api/dns/blocklist/update', methods=['POST'])
@auth_manager.login_required
def update_blocklist():
    """更新广告屏蔽列表"""
    try:
        results = adblock_engine.update_blocklists()
        return jsonify({
            'success': True,
            'results': results,
            'message': '屏蔽列表更新完成'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'更新屏蔽列表失败: {str(e)}'
        }), 500

@app.route('/api/dns/whitelist', methods=['GET', 'POST', 'DELETE'])
@auth_manager.login_required
def manage_whitelist():
    """管理DNS白名单"""
    try:
        if request.method == 'GET':
            # 获取白名单
            whitelist = list(adblock_engine.whitelist_domains)
            return jsonify({
                'success': True,
                'whitelist': whitelist
            })
        
        elif request.method == 'POST':
            # 添加到白名单
            domain = request.json.get('domain', '').strip()
            if domain:
                adblock_engine.add_to_whitelist(domain)
                return jsonify({
                    'success': True,
                    'message': f'域名 {domain} 已添加到白名单'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '域名不能为空'
                }), 400
        
        elif request.method == 'DELETE':
            # 从白名单移除
            domain = request.json.get('domain', '').strip()
            if domain:
                adblock_engine.remove_from_whitelist(domain)
                return jsonify({
                    'success': True,
                    'message': f'域名 {domain} 已从白名单移除'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '域名不能为空'
                }), 400
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'白名单操作失败: {str(e)}'
        }), 500

@app.route('/api/dns/cache/clear', methods=['POST'])
@auth_manager.login_required
def clear_dns_cache():
    """清空DNS缓存"""
    try:
        dns_server.resolver.clear_cache()
        return jsonify({
            'success': True,
            'message': 'DNS缓存已清空'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'清空DNS缓存失败: {str(e)}'
        }), 500

@socketio.on('connect')
def handle_connect():
    if 'logged_in' not in session:
        return False
    emit('connected', {'data': 'Connected to server dashboard'})

@socketio.on('request_stats')
def handle_stats_request():
    if 'logged_in' not in session:
        return False
    # 首次请求发送完整数据，后续发送增量数据
    force_full = request.sid not in getattr(handle_stats_request, 'connected_clients', set())
    if not hasattr(handle_stats_request, 'connected_clients'):
        handle_stats_request.connected_clients = set()
    handle_stats_request.connected_clients.add(request.sid)
    
    stats = monitor.get_all_stats(force_full=force_full)
    emit('stats_update', stats)

# DNS相关WebSocket事件处理
@socketio.on('dns_request_status')
def handle_dns_status_request():
    """处理DNS状态请求"""
    if 'logged_in' not in session:
        return False
    
    try:
        status = dns_server.get_status()
        stats = dns_manager.get_query_stats()
        adblock_stats = adblock_engine.get_stats()
        
        emit('dns_status_update', {
            'dns_server': status,
            'query_stats': stats,
            'adblock_stats': adblock_stats
        })
    except Exception as e:
        emit('dns_error', {'message': f'获取DNS状态失败: {str(e)}'})

@socketio.on('dns_start')
def handle_dns_start():
    """处理DNS服务器启动请求"""
    if 'logged_in' not in session:
        return False
    
    try:
        success, message = dns_server.start()
        emit('dns_action_result', {
            'action': 'start',
            'success': success,
            'message': message
        })
        
        # 广播状态更新
        if success:
            handle_dns_status_request()
            
    except Exception as e:
        emit('dns_error', {'message': f'启动DNS服务器失败: {str(e)}'})

@socketio.on('dns_stop')
def handle_dns_stop():
    """处理DNS服务器停止请求"""
    if 'logged_in' not in session:
        return False
    
    try:
        success, message = dns_server.stop()
        emit('dns_action_result', {
            'action': 'stop',
            'success': success,
            'message': message
        })
        
        # 广播状态更新
        handle_dns_status_request()
        
    except Exception as e:
        emit('dns_error', {'message': f'停止DNS服务器失败: {str(e)}'})

@socketio.on('dns_restart')
def handle_dns_restart():
    """处理DNS服务器重启请求"""
    if 'logged_in' not in session:
        return False
    
    try:
        success, message = dns_server.restart()
        emit('dns_action_result', {
            'action': 'restart',
            'success': success,
            'message': message
        })
        
        # 广播状态更新
        if success:
            handle_dns_status_request()
            
    except Exception as e:
        emit('dns_error', {'message': f'重启DNS服务器失败: {str(e)}'})

@socketio.on('dns_update_blocklist')
def handle_update_blocklist():
    """处理屏蔽列表更新请求"""
    if 'logged_in' not in session:
        return False
    
    try:
        emit('dns_update_status', {'status': 'updating', 'message': '正在更新屏蔽列表...'})
        results = adblock_engine.update_blocklists()
        
        emit('dns_update_status', {
            'status': 'completed',
            'message': '屏蔽列表更新完成',
            'results': results
        })
        
        # 更新统计信息
        handle_dns_status_request()
        
    except Exception as e:
        emit('dns_error', {'message': f'更新屏蔽列表失败: {str(e)}'})

@socketio.on('dns_clear_cache')
def handle_clear_dns_cache():
    """处理清空DNS缓存请求"""
    if 'logged_in' not in session:
        return False
    
    try:
        dns_server.resolver.clear_cache()
        emit('dns_action_result', {
            'action': 'clear_cache',
            'success': True,
            'message': 'DNS缓存已清空'
        })
        
        # 更新统计信息
        handle_dns_status_request()
        
    except Exception as e:
        emit('dns_error', {'message': f'清空DNS缓存失败: {str(e)}'})

# 终端会话映射：session_id -> client_sid
terminal_client_map = {}

# 终端相关的WebSocket事件处理
@socketio.on('terminal_create')
def handle_terminal_create():
    """创建新的终端会话"""
    if 'logged_in' not in session:
        return False
    
    client_sid = request.sid
    
    def send_output(data):
        socketio.emit('terminal_output', {'data': data}, room=client_sid)
    
    session_id = terminal_manager.create_session(send_output)
    if session_id:
        terminal_client_map[session_id] = client_sid
        emit('terminal_created', {'session_id': session_id})
        print(f"Terminal session created: {session_id} for client: {client_sid}")
    else:
        emit('terminal_error', {'message': '创建终端会话失败'})

@socketio.on('terminal_input')
def handle_terminal_input(data):
    """处理终端输入"""
    if 'logged_in' not in session:
        return False
    
    session_id = data.get('session_id')
    input_data = data.get('data', '')
    
    print(f"Terminal input received: session={session_id}, data={repr(input_data)}")
    
    if session_id:
        terminal_manager.write_to_session(session_id, input_data)

@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    """调整终端大小"""
    if 'logged_in' not in session:
        return False
    
    session_id = data.get('session_id')
    rows = data.get('rows', 24)
    cols = data.get('cols', 80)
    
    if session_id:
        terminal_manager.resize_session(session_id, rows, cols)

@socketio.on('terminal_close')
def handle_terminal_close(data):
    """关闭终端会话"""
    if 'logged_in' not in session:
        return False
    
    session_id = data.get('session_id')
    if session_id:
        terminal_manager.close_session(session_id)
        if session_id in terminal_client_map:
            del terminal_client_map[session_id]
        emit('terminal_closed', {'session_id': session_id})

@socketio.on('disconnect')
def handle_disconnect():
    """处理客户端断开连接"""
    client_sid = request.sid
    # 清理该客户端的所有终端会话
    sessions_to_close = [sid for sid, cid in terminal_client_map.items() if cid == client_sid]
    for session_id in sessions_to_close:
        terminal_manager.close_session(session_id)
        del terminal_client_map[session_id]
    
    # 清理统计数据连接跟踪
    if hasattr(handle_stats_request, 'connected_clients'):
        handle_stats_request.connected_clients.discard(client_sid)
    
    print(f"Client {client_sid} disconnected, closed {len(sessions_to_close)} terminal sessions")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)