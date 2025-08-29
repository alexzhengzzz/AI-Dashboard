"""
基础监控类 - 提供监控功能的通用接口和基础实现
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, Any, Optional
import threading


class BaseMonitor(ABC):
    """监控器基类"""
    
    def __init__(self):
        self.last_stats = {}
        self.cache_timestamp = {}
        self.cache_lock = threading.Lock()
    
    @abstractmethod
    def collect_data(self) -> Dict[str, Any]:
        """收集监控数据"""
        pass
    
    def get_cached_data(self, cache_key: str, cache_duration: int = 300) -> Optional[Dict[str, Any]]:
        """获取缓存数据"""
        with self.cache_lock:
            current_time = datetime.now()
            
            if (cache_key in self.last_stats and 
                cache_key in self.cache_timestamp and
                (current_time - self.cache_timestamp[cache_key]).seconds < cache_duration):
                return self.last_stats[cache_key]
        
        return None
    
    def set_cached_data(self, cache_key: str, data: Dict[str, Any]) -> None:
        """设置缓存数据"""
        with self.cache_lock:
            self.last_stats[cache_key] = data
            self.cache_timestamp[cache_key] = datetime.now()


class DataProcessor:
    """数据处理器 - 处理数据格式化和转换"""
    
    @staticmethod
    def format_bytes(bytes_value: int) -> str:
        """格式化字节大小"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if bytes_value < 1024.0:
                return f"{bytes_value:.1f}{unit}"
            bytes_value /= 1024.0
        return f"{bytes_value:.1f}PB"
    
    @staticmethod
    def format_running_time(start_time: float) -> str:
        """格式化进程运行时间"""
        import time
        running_time = time.time() - start_time
        if running_time < 60:
            return f'{int(running_time)}秒'
        elif running_time < 3600:
            return f'{int(running_time/60)}分钟'
        elif running_time < 86400:
            return f'{int(running_time/3600)}小时'
        else:
            return f'{int(running_time/86400)}天'
    
    @staticmethod
    def calculate_percentage(used: float, total: float) -> float:
        """计算使用率百分比"""
        if total == 0:
            return 0.0
        return round((used / total) * 100, 2)


class SecurityChecker:
    """安全检查器 - 检查进程保护和权限"""
    
    PROTECTED_PROCESSES = [
        'systemd', 'init', 'kernel', 'kthreadd', 'ssh', 'sshd',
        'NetworkManager', 'dbus', 'cron', 'rsyslog', 'udev',
        'irq/', 'rcu_', 'migration/', 'ksoftirqd', 'watchdog',
        'systemd-', 'kworker', 'migration', 'rcu_gp',
        'rcu_par_gp', 'netns', 'kcompactd', 'khugepaged'
    ]
    
    @classmethod
    def is_protected_process(cls, proc_name: str, pid: int, username: str) -> bool:
        """判断进程是否受保护"""
        proc_name_lower = proc_name.lower()
        
        # 基于进程名判断
        if any(protected in proc_name_lower for protected in cls.PROTECTED_PROCESSES):
            return True
            
        # 基于PID和用户判断（系统进程保护）
        if username == 'root' and pid < 1000:
            return True
            
        return False
    
    @staticmethod
    def get_process_category(proc_name: str, username: str, cmdline: str = '') -> str:
        """获取进程分类"""
        proc_name_lower = proc_name.lower()
        cmdline_lower = (cmdline or '').lower()
        
        # 系统内核进程
        if any(kernel_proc in proc_name_lower for kernel_proc in 
               ['kernel', 'kthreadd', 'kworker', 'ksoftirqd', 'migration', 'rcu_', 'irq/']):
            return 'kernel'
            
        # 系统服务
        if any(service in proc_name_lower for service in 
               ['systemd', 'dbus', 'NetworkManager', 'cron', 'rsyslog', 'udev', 'ssh', 'sshd']):
            return 'system_service'
            
        # Web服务器
        if any(web in proc_name_lower for web in 
               ['nginx', 'apache', 'httpd', 'lighttpd', 'caddy']):
            return 'web_server'
            
        # 数据库
        if any(db in proc_name_lower for db in 
               ['mysql', 'postgres', 'redis', 'mongodb', 'sqlite']):
            return 'database'
            
        # 开发工具
        if any(dev in proc_name_lower for dev in 
               ['python', 'node', 'java', 'php', 'ruby', 'go', 'rust', 'gcc', 'clang']):
            return 'development'
            
        # 桌面环境
        if any(desktop in proc_name_lower for desktop in 
               ['gnome', 'kde', 'xfce', 'unity', 'cinnamon', 'mate']):
            return 'desktop'
            
        # 浏览器
        if any(browser in proc_name_lower for browser in 
               ['firefox', 'chrome', 'chromium', 'opera', 'edge', 'safari']):
            return 'browser'
            
        # 用户应用
        if username != 'root':
            return 'user_app'
            
        return 'other'