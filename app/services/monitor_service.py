"""
监控服务聚合器 - 统一的监控数据接口
将所有监控模块整合到一个服务接口中，替代原来的巨大monitor.py文件
"""
from datetime import datetime
from typing import Dict, Any, Optional
import threading

from ..monitors.system_monitor import SystemInfoMonitor
from ..monitors.process_monitor import ProcessMonitor, ProcessManager
from ..monitors.network_monitor import NetworkMonitor
from ..monitors.health_monitor import HealthMonitor


class MonitorService:
    """监控服务聚合器 - 提供统一的监控数据接口"""
    
    def __init__(self):
        # 初始化各个监控器
        self.system_monitor = SystemInfoMonitor()
        self.process_monitor = ProcessMonitor()
        self.network_monitor = NetworkMonitor()
        self.health_monitor = HealthMonitor()
        self.process_manager = ProcessManager()
        
        # 数据缓存和增量更新支持
        self.last_stats = {}
        self.update_lock = threading.Lock()
        
    def get_all_stats(self, force_full: bool = False) -> Dict[str, Any]:
        """获取所有统计数据，支持增量更新"""
        with self.update_lock:
            current_time = datetime.now()
            timestamp = current_time.isoformat()
            
            # 构建当前数据
            current_stats = {
                'timestamp': timestamp,
                'cpu': self.system_monitor.get_cpu_info(),
                'memory': self.system_monitor.get_memory_info(),
                'disk': self.system_monitor.get_disk_info(),
                'network': self.system_monitor.get_network_info(),
                'system': self._get_cached_system_info(),
                'health': self.health_monitor.get_system_health_info(),
                'system_stats': self.health_monitor.get_system_statistics(),
                'stats_summary': self.process_monitor.get_system_stats_summary(),
                'memory_processes': self.process_monitor.get_memory_top_processes(),
                'services': self._get_cached_services_status(),
                'ports': self.network_monitor.get_port_info()
            }
            
            if force_full or not self.last_stats:
                self.last_stats = current_stats.copy()
                return current_stats
            
            # 返回增量数据
            return self._get_incremental_stats(current_stats)
    
    def _get_cached_system_info(self) -> Dict[str, Any]:
        """获取缓存的系统信息"""
        cache_key = 'system_info'
        cached_data = self.system_monitor.get_cached_data(cache_key, cache_duration=300)  # 5分钟缓存
        
        if cached_data is None:
            system_info = self.system_monitor.get_enhanced_system_info()
            self.system_monitor.set_cached_data(cache_key, system_info)
            return system_info
        
        return cached_data
    
    def _get_cached_services_status(self) -> Dict[str, Any]:
        """获取缓存的服务状态"""
        cache_key = 'services_status'
        cached_data = self.network_monitor.get_cached_data(cache_key, cache_duration=30)  # 30秒缓存
        
        if cached_data is None:
            services_status = self.network_monitor.get_services_status()
            self.network_monitor.set_cached_data(cache_key, services_status)
            return services_status
        
        return cached_data
    
    def _get_incremental_stats(self, current_stats: Dict[str, Any]) -> Dict[str, Any]:
        """计算增量统计数据"""
        incremental = {
            'timestamp': current_stats['timestamp'],
            'incremental': True
        }
        
        # 比较并添加有变化的数据
        for key, current_value in current_stats.items():
            if key == 'timestamp':
                continue
                
            if key not in self.last_stats:
                incremental[key] = current_value
            elif self._has_significant_change(key, self.last_stats[key], current_value):
                incremental[key] = current_value
        
        # 更新最后的数据
        self.last_stats = current_stats.copy()
        
        return incremental if len(incremental) > 2 else {'timestamp': current_stats['timestamp']}
    
    def _has_significant_change(self, key: str, old_value: Any, new_value: Any) -> bool:
        """判断数据是否有显著变化"""
        if key in ['cpu', 'memory', 'health']:
            # CPU、内存、健康状态：变化阈值1%
            if isinstance(old_value, dict) and isinstance(new_value, dict):
                for sub_key in ['usage_percent', 'percent', 'score']:
                    if sub_key in old_value and sub_key in new_value:
                        if abs(old_value[sub_key] - new_value[sub_key]) > 1:
                            return True
            return False
        elif key == 'network':
            # 网络数据：总是更新（变化较频繁）
            return True
        elif key == 'disk':
            # 磁盘数据：变化阈值0.1%
            if isinstance(old_value, list) and isinstance(new_value, list):
                for old_disk, new_disk in zip(old_value, new_value):
                    if abs(old_disk.get('percent', 0) - new_disk.get('percent', 0)) > 0.1:
                        return True
            return False
        elif key in ['memory_processes', 'stats_summary', 'ports']:
            # 进程、统计摘要、端口：总是更新
            return True
        elif key in ['system', 'services']:
            # 系统信息和服务：很少变化，使用深度比较
            return old_value != new_value
        
        return old_value != new_value
    
    # 进程管理相关方法
    def kill_process_by_port(self, port: int) -> Dict[str, Any]:
        """根据端口号关闭对应的进程"""
        return self.process_manager.kill_process_by_port(port)
    
    def kill_process_by_pid(self, pid: int) -> Dict[str, Any]:
        """根据PID终止进程"""
        return self.process_manager.kill_process_by_pid(pid)
    
    # 系统信息相关方法
    def get_cpu_info(self) -> Dict[str, Any]:
        """获取CPU信息"""
        return self.system_monitor.get_cpu_info()
    
    def get_memory_info(self) -> Dict[str, Any]:
        """获取内存信息"""
        return self.system_monitor.get_memory_info()
    
    def get_disk_info(self) -> Dict[str, Any]:
        """获取磁盘信息"""
        return self.system_monitor.get_disk_info()
    
    def get_network_info(self) -> Dict[str, Any]:
        """获取网络信息"""
        return self.system_monitor.get_network_info()
    
    def get_system_info(self) -> Dict[str, Any]:
        """获取系统信息"""
        return self.system_monitor.get_system_info()
    
    # 进程监控相关方法
    def get_memory_top_processes(self, min_memory_mb: int = 10, limit: int = 20) -> Dict[str, Any]:
        """获取内存占用最多的进程"""
        return self.process_monitor.get_memory_top_processes(min_memory_mb, limit)
    
    def get_system_stats_summary(self) -> Dict[str, Any]:
        """获取系统统计摘要"""
        return self.process_monitor.get_system_stats_summary()
    
    # 网络监控相关方法
    def get_port_info(self) -> Dict[str, Any]:
        """获取端口信息"""
        return self.network_monitor.get_port_info()
    
    def get_services_status(self) -> Dict[str, Any]:
        """获取服务状态"""
        return self.network_monitor.get_services_status()
    
    def get_network_connections_summary(self) -> Dict[str, Any]:
        """获取网络连接摘要"""
        return self.network_monitor.get_network_connections_summary()
    
    # 健康监控相关方法
    def get_system_health_info(self) -> Dict[str, Any]:
        """获取系统健康状态"""
        return self.health_monitor.get_system_health_info()
    
    def get_system_statistics(self) -> Dict[str, Any]:
        """获取系统统计信息"""
        return self.health_monitor.get_system_statistics()
    
    def get_performance_recommendations(self) -> Dict[str, Any]:
        """获取性能优化建议"""
        return self.health_monitor.get_performance_recommendations()
    
    def get_system_alerts(self) -> Dict[str, Any]:
        """获取系统警报"""
        return self.health_monitor.get_system_alerts()
    
    # 扩展功能方法
    def get_detailed_system_report(self) -> Dict[str, Any]:
        """获取详细的系统报告"""
        return {
            'system': self.system_monitor.get_enhanced_system_info(),
            'health': self.health_monitor.get_system_health_info(),
            'recommendations': self.health_monitor.get_performance_recommendations(),
            'alerts': self.health_monitor.get_system_alerts(),
            'network_summary': self.network_monitor.get_network_connections_summary(),
            'interface_stats': self.network_monitor.get_interface_statistics()
        }
    
    def check_system_status(self) -> Dict[str, Any]:
        """快速检查系统状态"""
        health = self.health_monitor.get_system_health_info()
        cpu = self.system_monitor.get_cpu_info()
        memory = self.system_monitor.get_memory_info()
        
        return {
            'overall_status': health['status'],
            'health_score': health['score'],
            'cpu_usage': cpu['usage_percent'],
            'memory_usage': memory['percent'],
            'critical_issues': health.get('critical_issues', []),
            'warnings': health.get('warnings', [])
        }


# 创建全局监控服务实例
monitor_service = MonitorService()

# 为了向后兼容，保持原有的接口
class SystemMonitor:
    """向后兼容的监控器接口"""
    
    def __init__(self):
        self.service = monitor_service
    
    def get_all_stats(self, force_full: bool = False):
        return self.service.get_all_stats(force_full)
    
    def kill_process_by_port(self, port: int):
        return self.service.kill_process_by_port(port)
    
    def kill_process_by_pid(self, pid: int):
        return self.service.kill_process_by_pid(pid)
    
    # 添加所有原有方法的代理
    def get_cpu_info(self):
        return self.service.get_cpu_info()
    
    def get_memory_info(self):
        return self.service.get_memory_info()
    
    def get_disk_info(self):
        return self.service.get_disk_info()
    
    def get_network_info(self):
        return self.service.get_network_info()
    
    def get_system_info(self):
        return self.service.get_system_info()
    
    def get_memory_top_processes(self, min_memory_mb=10, limit=20):
        return self.service.get_memory_top_processes(min_memory_mb, limit)
    
    def get_system_stats_summary(self):
        return self.service.get_system_stats_summary()
    
    def get_port_info(self):
        return self.service.get_port_info()
    
    def get_services_status(self):
        return self.service.get_services_status()
    
    def get_system_health_info(self):
        return self.service.get_system_health_info()


# 创建向后兼容的monitor实例
monitor = SystemMonitor()