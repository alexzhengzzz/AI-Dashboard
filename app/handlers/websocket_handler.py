"""
WebSocket事件处理器
"""
from flask import session, request
from flask_socketio import emit
from app.services.monitor_service import monitor_service
from app.terminal import terminal_manager
from app.dns_server import dns_server
from app.dns_manager import dns_manager
from app.adblock import adblock_engine


class WebSocketHandler:
    """WebSocket事件处理器"""
    
    def __init__(self, socketio):
        self.socketio = socketio
        self.terminal_client_map = {}  # 终端会话映射：session_id -> client_sid
        self.register_events()
    
    def register_events(self):
        """注册WebSocket事件"""
        
        @self.socketio.on('connect')
        def handle_connect():
            if 'logged_in' not in session:
                return False
            emit('connected', {'data': 'Connected to server dashboard'})

        @self.socketio.on('request_stats')
        def handle_stats_request():
            if 'logged_in' not in session:
                return False
            # 首次请求发送完整数据，后续发送增量数据
            force_full = request.sid not in getattr(handle_stats_request, 'connected_clients', set())
            if not hasattr(handle_stats_request, 'connected_clients'):
                handle_stats_request.connected_clients = set()
            handle_stats_request.connected_clients.add(request.sid)
            
            stats = monitor_service.get_all_stats(force_full=force_full)
            emit('stats_update', stats)

        @self.socketio.on('disconnect')
        def handle_disconnect():
            """处理客户端断开连接"""
            client_sid = request.sid
            # 清理该客户端的所有终端会话
            sessions_to_close = [sid for sid, cid in self.terminal_client_map.items() if cid == client_sid]
            for session_id in sessions_to_close:
                terminal_manager.close_session(session_id)
                del self.terminal_client_map[session_id]
            
            # 清理统计数据连接跟踪
            if hasattr(handle_stats_request, 'connected_clients'):
                handle_stats_request.connected_clients.discard(client_sid)
            
            print(f"Client {client_sid} disconnected, closed {len(sessions_to_close)} terminal sessions")
        
        # DNS相关事件
        self._register_dns_events()
        
        # 终端相关事件
        self._register_terminal_events()
    
    def _register_dns_events(self):
        """注册DNS相关WebSocket事件"""
        
        @self.socketio.on('dns_request_status')
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

        @self.socketio.on('dns_start')
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

        @self.socketio.on('dns_stop')
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

        @self.socketio.on('dns_restart')
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

        @self.socketio.on('dns_update_blocklist')
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

        @self.socketio.on('dns_clear_cache')
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
    
    def _register_terminal_events(self):
        """注册终端相关WebSocket事件"""
        
        @self.socketio.on('terminal_create')
        def handle_terminal_create():
            """创建新的终端会话"""
            if 'logged_in' not in session:
                return False
            
            client_sid = request.sid
            
            def send_output(data):
                self.socketio.emit('terminal_output', {'data': data}, room=client_sid)
            
            session_id = terminal_manager.create_session(send_output)
            if session_id:
                self.terminal_client_map[session_id] = client_sid
                emit('terminal_created', {'session_id': session_id})
                print(f"Terminal session created: {session_id} for client: {client_sid}")
            else:
                emit('terminal_error', {'message': '创建终端会话失败'})

        @self.socketio.on('terminal_input')
        def handle_terminal_input(data):
            """处理终端输入"""
            if 'logged_in' not in session:
                return False
            
            session_id = data.get('session_id')
            input_data = data.get('data', '')
            
            print(f"Terminal input received: session={session_id}, data={repr(input_data)}")
            
            if session_id:
                terminal_manager.write_to_session(session_id, input_data)

        @self.socketio.on('terminal_resize')
        def handle_terminal_resize(data):
            """调整终端大小"""
            if 'logged_in' not in session:
                return False
            
            session_id = data.get('session_id')
            rows = data.get('rows', 24)
            cols = data.get('cols', 80)
            
            if session_id:
                terminal_manager.resize_session(session_id, rows, cols)

        @self.socketio.on('terminal_close')
        def handle_terminal_close(data):
            """关闭终端会话"""
            if 'logged_in' not in session:
                return False
            
            session_id = data.get('session_id')
            if session_id:
                terminal_manager.close_session(session_id)
                if session_id in self.terminal_client_map:
                    del self.terminal_client_map[session_id]
                emit('terminal_closed', {'session_id': session_id})