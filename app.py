from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_socketio import SocketIO, emit
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from app.auth import auth_manager
from app.monitor import monitor

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

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)