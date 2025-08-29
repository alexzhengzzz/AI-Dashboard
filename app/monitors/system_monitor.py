"""
系统信息监控模块 - 负责CPU、内存、磁盘、网络等基础系统信息收集
"""
import psutil
import platform
import socket
import netifaces
from datetime import datetime
from typing import Dict, List, Any, Optional

from ..core.base_monitor import BaseMonitor, DataProcessor


class SystemInfoMonitor(BaseMonitor):
    """系统信息监控器"""
    
    def __init__(self):
        super().__init__()
        self.boot_time = datetime.fromtimestamp(psutil.boot_time())
    
    def collect_data(self) -> Dict[str, Any]:
        """收集所有系统信息"""
        return {
            'cpu': self.get_cpu_info(),
            'memory': self.get_memory_info(),
            'disk': self.get_disk_info(),
            'network': self.get_network_info(),
            'system': self.get_system_info()
        }
    
    def get_cpu_info(self) -> Dict[str, Any]:
        """获取CPU信息"""
        cpu_percent_total = psutil.cpu_percent(interval=1)
        cpu_percent_per_cpu = psutil.cpu_percent(interval=0.1, percpu=True)
        load_avg = getattr(psutil, 'getloadavg', lambda: [0, 0, 0])()
        
        return {
            'usage_percent': round(cpu_percent_total, 2),
            'usage_per_cpu': [round(cpu, 2) for cpu in cpu_percent_per_cpu],
            'load_avg': {
                '1min': round(load_avg[0], 2),
                '5min': round(load_avg[1], 2),
                '15min': round(load_avg[2], 2)
            },
            'cpu_count': psutil.cpu_count(),
            'cpu_freq': psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
        }
    
    def get_memory_info(self) -> Dict[str, Any]:
        """获取内存信息"""
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        return {
            'total': memory.total,
            'available': memory.available,
            'used': memory.used,
            'free': memory.free,
            'percent': memory.percent,
            'cached': getattr(memory, 'cached', 0),
            'buffers': getattr(memory, 'buffers', 0),
            'swap_total': swap.total,
            'swap_used': swap.used,
            'swap_percent': swap.percent
        }
    
    def get_disk_info(self) -> List[Dict[str, Any]]:
        """获取磁盘信息"""
        disk_usage = []
        disk_io = psutil.disk_io_counters(perdisk=True) if psutil.disk_io_counters() else {}
        
        for partition in psutil.disk_partitions():
            try:
                partition_usage = psutil.disk_usage(partition.mountpoint)
                disk_info = {
                    'device': partition.device,
                    'mountpoint': partition.mountpoint,
                    'fstype': partition.fstype,
                    'total': partition_usage.total,
                    'used': partition_usage.used,
                    'free': partition_usage.free,
                    'percent': DataProcessor.calculate_percentage(
                        partition_usage.used, partition_usage.total)
                }
                
                # Add I/O stats if available
                device_name = partition.device.split('/')[-1]
                if device_name in disk_io:
                    io_stats = disk_io[device_name]
                    disk_info['io'] = {
                        'read_bytes': io_stats.read_bytes,
                        'write_bytes': io_stats.write_bytes,
                        'read_count': io_stats.read_count,
                        'write_count': io_stats.write_count
                    }
                
                disk_usage.append(disk_info)
            except PermissionError:
                continue
                
        return disk_usage
    
    def get_network_info(self) -> List[Dict[str, Any]]:
        """获取网络信息"""
        network_io = psutil.net_io_counters(pernic=True)
        network_stats = []
        
        for interface, stats in network_io.items():
            if interface != 'lo':  # Skip loopback
                network_stats.append({
                    'interface': interface,
                    'bytes_sent': stats.bytes_sent,
                    'bytes_recv': stats.bytes_recv,
                    'packets_sent': stats.packets_sent,
                    'packets_recv': stats.packets_recv,
                    'errin': stats.errin,
                    'errout': stats.errout,
                    'dropin': stats.dropin,
                    'dropout': stats.dropout
                })
        
        return network_stats
    
    def get_ip_addresses(self) -> Dict[str, Any]:
        """获取系统IP地址信息"""
        ip_info = {
            'local_ips': [],
            'public_ip': None
        }
        
        try:
            # 获取所有网络接口的IP地址
            interfaces = netifaces.interfaces()
            for interface in interfaces:
                if interface == 'lo':  # 跳过loopback
                    continue
                    
                addrs = netifaces.ifaddresses(interface)
                
                # 获取IPv4地址
                if netifaces.AF_INET in addrs:
                    for addr in addrs[netifaces.AF_INET]:
                        ip = addr.get('addr')
                        if ip and not ip.startswith('127.'):
                            ip_info['local_ips'].append({
                                'interface': interface,
                                'ip': ip,
                                'netmask': addr.get('netmask', '')
                            })
        except ImportError:
            # 如果netifaces不可用，使用socket方法
            try:
                hostname = socket.gethostname()
                local_ip = socket.gethostbyname(hostname)
                if not local_ip.startswith('127.'):
                    ip_info['local_ips'].append({
                        'interface': 'unknown',
                        'ip': local_ip,
                        'netmask': ''
                    })
            except:
                pass
        
        # 尝试获取公网IP
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.connect(("8.8.8.8", 80))
            public_ip = sock.getsockname()[0]
            sock.close()
            
            # 检查是否为内网IP
            if not (public_ip.startswith('192.168.') or 
                    public_ip.startswith('10.') or 
                    public_ip.startswith('172.')):
                ip_info['public_ip'] = public_ip
        except:
            pass
            
        return ip_info

    def get_system_info(self) -> Dict[str, Any]:
        """获取系统基本信息"""
        uptime = datetime.now() - self.boot_time
        ip_info = self.get_ip_addresses()
        
        # 获取主要IP地址（第一个非loopback IP）
        main_ip = None
        if ip_info['local_ips']:
            main_ip = ip_info['local_ips'][0]['ip']
        
        return {
            'hostname': platform.node(),
            'os': platform.system(),
            'os_release': platform.release(),
            'architecture': platform.machine(),
            'processor': platform.processor(),
            'uptime_seconds': int(uptime.total_seconds()),
            'uptime_string': str(uptime).split('.')[0],
            'boot_time': self.boot_time.strftime('%Y-%m-%d %H:%M:%S'),
            'ip_address': main_ip,
            'ip_info': ip_info
        }
    
    def get_enhanced_system_info(self) -> Dict[str, Any]:
        """获取增强的系统信息"""
        base_info = self.get_system_info()
        
        # 添加更多详细信息
        try:
            import distro
            os_name = distro.name()
            os_version = distro.version()
            os_codename = distro.codename()
        except ImportError:
            try:
                with open('/etc/os-release', 'r') as f:
                    os_info = {}
                    for line in f:
                        if '=' in line:
                            key, value = line.strip().split('=', 1)
                            os_info[key] = value.strip('"')
                    os_name = os_info.get('NAME', platform.system())
                    os_version = os_info.get('VERSION', platform.release())
                    os_codename = os_info.get('VERSION_CODENAME', '')
            except:
                os_name = platform.system()
                os_version = platform.release()
                os_codename = ''
        
        # 获取CPU详细信息
        try:
            cpu_freq = psutil.cpu_freq()
            if cpu_freq:
                cpu_freq_info = {
                    'current': round(cpu_freq.current, 2),
                    'min': round(cpu_freq.min, 2) if cpu_freq.min else 0,
                    'max': round(cpu_freq.max, 2) if cpu_freq.max else 0
                }
            else:
                cpu_freq_info = None
        except:
            cpu_freq_info = None
        
        # 获取内存详细信息
        memory = psutil.virtual_memory()
        
        base_info.update({
            'os_detailed': {
                'name': os_name,
                'version': os_version,
                'codename': os_codename,
                'kernel': platform.release(),
                'arch': platform.machine()
            },
            'cpu_detailed': {
                'count': psutil.cpu_count(),
                'logical_count': psutil.cpu_count(logical=False) or psutil.cpu_count(),
                'frequency': cpu_freq_info,
                'model': platform.processor() or 'Unknown'
            },
            'memory_detailed': {
                'total_gb': round(memory.total / (1024**3), 2),
                'available_gb': round(memory.available / (1024**3), 2),
                'used_gb': round(memory.used / (1024**3), 2)
            }
        })
        
        return base_info