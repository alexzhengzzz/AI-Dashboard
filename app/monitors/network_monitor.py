"""
网络和端口监控模块 - 负责端口状态检查和网络连接监控
"""
import psutil
import socket
import subprocess
from typing import Dict, List, Any
from ..core.base_monitor import BaseMonitor


class NetworkMonitor(BaseMonitor):
    """网络监控器"""
    
    def collect_data(self) -> Dict[str, Any]:
        """收集网络相关数据"""
        return {
            'ports': self.get_port_info(),
            'services': self.get_services_status()
        }
    
    def get_port_info(self) -> List[Dict[str, Any]]:
        """监控常用端口的状态"""
        # 定义要监控的常用端口
        monitored_ports = {
            22: 'SSH',
            80: 'HTTP', 
            443: 'HTTPS',
            3306: 'MySQL',
            5432: 'PostgreSQL',
            6379: 'Redis',
            27017: 'MongoDB',
            8080: 'HTTP-Alt',
            9000: 'PHP-FPM',
            5000: 'Flask-Dev'
        }
        
        port_status = []
        
        # 获取所有监听的连接
        try:
            connections = psutil.net_connections(kind='inet')
            listening_ports = {}
            
            for conn in connections:
                if conn.status == 'LISTEN' and conn.laddr:
                    port = conn.laddr.port
                    if port not in listening_ports:
                        listening_ports[port] = {
                            'connections': 0,
                            'pid': conn.pid,
                            'process_name': None
                        }
                    listening_ports[port]['connections'] += 1
                    
                    # 获取进程信息
                    if conn.pid and not listening_ports[port]['process_name']:
                        try:
                            proc = psutil.Process(conn.pid)
                            listening_ports[port]['process_name'] = proc.name()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            listening_ports[port]['process_name'] = 'Unknown'
                            
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            listening_ports = {}
        
        # 检查监控的端口状态
        for port, service_name in monitored_ports.items():
            port_info = {
                'port': port,
                'service': service_name,
                'status': 'closed',
                'process_name': None,
                'pid': None,
                'connections': 0
            }
            
            if port in listening_ports:
                port_info.update({
                    'status': 'open',
                    'process_name': listening_ports[port]['process_name'],
                    'pid': listening_ports[port]['pid'],
                    'connections': listening_ports[port]['connections']
                })
            else:
                # 尝试连接测试端口是否可达
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(1)
                    result = sock.connect_ex(('127.0.0.1', port))
                    sock.close()
                    if result == 0:
                        port_info['status'] = 'filtered'  # 端口开放但未在监听列表中
                except:
                    pass
            
            port_status.append(port_info)
        
        # 按端口号排序
        port_status.sort(key=lambda x: x['port'])
        return port_status
    
    def get_services_status(self) -> List[Dict[str, Any]]:
        """获取常用服务状态"""
        # 缓存服务状态，减少系统调用
        cache_key = 'services_status'
        cached_data = self.get_cached_data(cache_key, cache_duration=30)  # 30秒缓存
        if cached_data is not None:
            return cached_data
        
        services = []
        common_services = [
            'nginx', 'apache2', 'mysql', 'postgresql', 'redis-server', 
            'ssh', 'ufw', 'fail2ban', 'docker'
        ]
        
        for service in common_services:
            try:
                result = subprocess.run(
                    ['systemctl', 'is-active', service],
                    capture_output=True, text=True, timeout=5
                )
                status = result.stdout.strip()
                services.append({
                    'name': service,
                    'status': status,
                    'active': status == 'active'
                })
            except (subprocess.TimeoutExpired, FileNotFoundError):
                services.append({
                    'name': service,
                    'status': 'unknown',
                    'active': False
                })
        
        # 缓存结果
        self.set_cached_data(cache_key, services)
        return services
    
    def get_network_connections_summary(self) -> Dict[str, Any]:
        """获取网络连接摘要"""
        try:
            connections = psutil.net_connections()
            
            # 按状态分类连接
            connection_stats = {
                'ESTABLISHED': 0,
                'LISTEN': 0,
                'TIME_WAIT': 0,
                'CLOSE_WAIT': 0,
                'SYN_SENT': 0,
                'SYN_RECV': 0,
                'OTHER': 0
            }
            
            for conn in connections:
                status = conn.status
                if status in connection_stats:
                    connection_stats[status] += 1
                else:
                    connection_stats['OTHER'] += 1
            
            # 获取监听端口统计
            listening_ports = set()
            for conn in connections:
                if conn.status == 'LISTEN' and conn.laddr:
                    listening_ports.add(conn.laddr.port)
            
            return {
                'connection_counts': connection_stats,
                'total_connections': len(connections),
                'listening_ports_count': len(listening_ports),
                'listening_ports': sorted(list(listening_ports))[:10]  # 只返回前10个
            }
            
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            return {
                'connection_counts': {},
                'total_connections': 0,
                'listening_ports_count': 0,
                'listening_ports': []
            }
    
    def check_port_accessibility(self, host: str, port: int, timeout: float = 3.0) -> Dict[str, Any]:
        """检查端口可访问性"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            start_time = psutil.time.time()
            result = sock.connect_ex((host, port))
            end_time = psutil.time.time()
            sock.close()
            
            response_time = round((end_time - start_time) * 1000, 2)  # 毫秒
            
            if result == 0:
                return {
                    'accessible': True,
                    'response_time_ms': response_time,
                    'status': 'open'
                }
            else:
                return {
                    'accessible': False,
                    'response_time_ms': None,
                    'status': 'closed',
                    'error_code': result
                }
                
        except socket.timeout:
            return {
                'accessible': False,
                'response_time_ms': None,
                'status': 'timeout'
            }
        except Exception as e:
            return {
                'accessible': False,
                'response_time_ms': None,
                'status': 'error',
                'error': str(e)
            }
    
    def get_interface_statistics(self) -> List[Dict[str, Any]]:
        """获取网络接口统计信息"""
        interfaces = []
        net_io = psutil.net_io_counters(pernic=True)
        
        for interface, stats in net_io.items():
            if interface == 'lo':  # 跳过回环接口
                continue
                
            interface_info = {
                'name': interface,
                'bytes_sent': stats.bytes_sent,
                'bytes_recv': stats.bytes_recv,
                'packets_sent': stats.packets_sent,
                'packets_recv': stats.packets_recv,
                'errors_in': stats.errin,
                'errors_out': stats.errout,
                'drops_in': stats.dropin,
                'drops_out': stats.dropout,
                'total_bytes': stats.bytes_sent + stats.bytes_recv,
                'total_packets': stats.packets_sent + stats.packets_recv,
                'total_errors': stats.errin + stats.errout,
                'total_drops': stats.dropin + stats.dropout
            }
            
            interfaces.append(interface_info)
        
        # 按总流量排序
        interfaces.sort(key=lambda x: x['total_bytes'], reverse=True)
        return interfaces