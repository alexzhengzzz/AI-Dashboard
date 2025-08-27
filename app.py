from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_socketio import SocketIO, emit
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from app.auth import auth_manager
from app.monitor import monitor
from app.terminal import terminal_manager

app = Flask(__name__)
app.config.from_object(Config)

socketio = SocketIO(app, cors_allowed_origins="*")
auth_manager.init_app(app)

@app.route('/')
@auth_manager.login_required
def dashboard():
    return render_template('dashboard.html')

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
    return jsonify(monitor.get_all_stats())

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

@socketio.on('connect')
def handle_connect():
    if 'logged_in' not in session:
        return False
    emit('connected', {'data': 'Connected to server dashboard'})

@socketio.on('request_stats')
def handle_stats_request():
    if 'logged_in' not in session:
        return False
    stats = monitor.get_all_stats()
    emit('stats_update', stats)

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
    print(f"Client {client_sid} disconnected, closed {len(sessions_to_close)} terminal sessions")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)