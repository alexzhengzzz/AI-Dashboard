import os
import pty
import subprocess
import threading
import time
import uuid
import select
import fcntl
import termios
import struct
from typing import Dict, Optional, Callable


class TerminalSession:
    """单个终端会话管理类"""
    
    def __init__(self, session_id: str, on_output: Callable[[str], None]):
        self.session_id = session_id
        self.on_output = on_output
        self.master_fd = None
        self.process = None
        self.last_activity = time.time()
        self.is_alive = False
        self._output_thread = None
        
    def start(self) -> bool:
        """启动终端会话"""
        try:
            # 创建伪终端
            self.master_fd, slave_fd = pty.openpty()
            
            # 设置环境变量
            env = os.environ.copy()
            env['TERM'] = 'xterm-256color'
            env['PS1'] = r'\[\e[32m\]\u@\h:\w\$ \[\e[0m\]'
            
            # 启动bash进程
            self.process = subprocess.Popen(
                ['/bin/bash'],
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                env=env,
                preexec_fn=os.setsid,
                cwd=os.path.expanduser('~')
            )
            
            # 关闭从进程的slave端
            os.close(slave_fd)
            
            # 设置非阻塞读取
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            
            self.is_alive = True
            self._start_output_thread()
            
            return True
            
        except Exception as e:
            print(f"Failed to start terminal session {self.session_id}: {e}")
            return False
    
    def _start_output_thread(self):
        """启动输出监听线程"""
        self._output_thread = threading.Thread(
            target=self._read_output,
            daemon=True
        )
        self._output_thread.start()
    
    def _read_output(self):
        """读取终端输出"""
        while self.is_alive and self.master_fd:
            try:
                ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                if ready:
                    data = os.read(self.master_fd, 8192)
                    if data:
                        output = data.decode('utf-8', errors='ignore')
                        self.on_output(output)
                        self.last_activity = time.time()
                    else:
                        # 进程结束
                        break
            except (OSError, ValueError):
                break
        
        self.is_alive = False
    
    def write_input(self, data: str):
        """写入用户输入"""
        if self.is_alive and self.master_fd:
            try:
                os.write(self.master_fd, data.encode('utf-8'))
                self.last_activity = time.time()
            except (OSError, ValueError):
                self.is_alive = False
    
    def resize(self, rows: int, cols: int):
        """调整终端大小"""
        if self.is_alive and self.master_fd:
            try:
                s = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, s)
            except Exception as e:
                print(f"Failed to resize terminal: {e}")
                pass
    
    def close(self):
        """关闭终端会话"""
        self.is_alive = False
        
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except:
                try:
                    self.process.kill()
                except:
                    pass
            self.process = None
        
        if self.master_fd:
            try:
                os.close(self.master_fd)
            except:
                pass
            self.master_fd = None


class TerminalManager:
    """终端会话管理器"""
    
    def __init__(self):
        self.sessions: Dict[str, TerminalSession] = {}
        self.session_timeouts = {}
        self._cleanup_thread = None
        self._start_cleanup_thread()
    
    def _start_cleanup_thread(self):
        """启动会话清理线程"""
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_sessions,
            daemon=True
        )
        self._cleanup_thread.start()
    
    def _cleanup_sessions(self):
        """定期清理超时会话"""
        while True:
            try:
                current_time = time.time()
                timeout_sessions = []
                
                for session_id, session in self.sessions.items():
                    # 30分钟无活动则超时
                    if current_time - session.last_activity > 1800:
                        timeout_sessions.append(session_id)
                    # 检查进程是否还存活
                    elif not session.is_alive or (session.process and session.process.poll() is not None):
                        timeout_sessions.append(session_id)
                
                for session_id in timeout_sessions:
                    self.close_session(session_id)
                
                time.sleep(60)  # 每分钟检查一次
            except:
                time.sleep(60)
    
    def create_session(self, on_output: Callable[[str], None]) -> str:
        """创建新的终端会话"""
        session_id = str(uuid.uuid4())
        session = TerminalSession(session_id, on_output)
        
        if session.start():
            self.sessions[session_id] = session
            return session_id
        else:
            return None
    
    def get_session(self, session_id: str) -> Optional[TerminalSession]:
        """获取终端会话"""
        return self.sessions.get(session_id)
    
    def write_to_session(self, session_id: str, data: str):
        """向指定会话写入数据"""
        session = self.get_session(session_id)
        if session:
            session.write_input(data)
    
    def resize_session(self, session_id: str, rows: int, cols: int):
        """调整会话终端大小"""
        session = self.get_session(session_id)
        if session:
            session.resize(rows, cols)
    
    def close_session(self, session_id: str):
        """关闭指定会话"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session.close()
            del self.sessions[session_id]
    
    def close_all_sessions(self):
        """关闭所有会话"""
        session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            self.close_session(session_id)


# 全局终端管理器实例
terminal_manager = TerminalManager()