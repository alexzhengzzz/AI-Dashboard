import psutil
import platform
import subprocess
from datetime import datetime
import json
import os
import socket
import signal
import netifaces

class SystemMonitor:
    def __init__(self):
        self.boot_time = datetime.fromtimestamp(psutil.boot_time())
        
    def get_cpu_info(self):
        cpu_percent = psutil.cpu_percent(interval=1, percpu=True)
        load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
        
        return {
            'usage_percent': round(psutil.cpu_percent(interval=1), 2),
            'usage_per_cpu': [round(cpu, 2) for cpu in cpu_percent],
            'load_avg': {
                '1min': round(load_avg[0], 2),
                '5min': round(load_avg[1], 2),
                '15min': round(load_avg[2], 2)
            },
            'cpu_count': psutil.cpu_count(),
            'cpu_freq': psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
        }
    
    def get_memory_info(self):
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
    
    def get_disk_info(self):
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
                    'percent': round(partition_usage.used / partition_usage.total * 100, 2)
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
    
    def get_network_info(self):
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
    
    def get_ip_addresses(self):
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
        
        # 尝试获取公网IP (简单方法，连接外部服务)
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

    def get_system_info(self):
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
    
    def get_process_info(self):
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
            try:
                process_info = proc.info.copy()
                # Add memory usage in MB
                try:
                    proc_obj = psutil.Process(proc.info['pid'])
                    memory_info = proc_obj.memory_info()
                    process_info['memory_rss_mb'] = round(memory_info.rss / 1024 / 1024, 1)
                    process_info['memory_vms_mb'] = round(memory_info.vms / 1024 / 1024, 1)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_info['memory_rss_mb'] = 0
                    process_info['memory_vms_mb'] = 0
                processes.append(process_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort by CPU usage
        processes.sort(key=lambda x: x['cpu_percent'] or 0, reverse=True)
        return processes[:10]  # Top 10 processes

    def get_memory_top_processes(self):
        """获取内存占用最多的进程"""
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
            try:
                process_info = proc.info.copy()
                # Add memory usage in MB
                try:
                    proc_obj = psutil.Process(proc.info['pid'])
                    memory_info = proc_obj.memory_info()
                    process_info['memory_rss_mb'] = round(memory_info.rss / 1024 / 1024, 1)
                    process_info['memory_vms_mb'] = round(memory_info.vms / 1024 / 1024, 1)
                    process_info['username'] = proc_obj.username()
                    process_info['cmdline'] = ' '.join(proc_obj.cmdline()[:3])  # First 3 args
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_info['memory_rss_mb'] = 0
                    process_info['memory_vms_mb'] = 0
                    process_info['username'] = 'unknown'
                    process_info['cmdline'] = 'unknown'
                processes.append(process_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort by memory usage (RSS)
        processes.sort(key=lambda x: x['memory_rss_mb'] or 0, reverse=True)
        return processes[:15]  # Top 15 processes by memory
    
    def get_services_status(self):
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
        
        return services
    
    def get_port_info(self):
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
    
    def kill_process_by_port(self, port):
        """根据端口号关闭对应的进程"""
        try:
            # 获取所有监听的连接
            connections = psutil.net_connections(kind='inet')
            target_processes = []
            
            # 找到监听指定端口的进程
            for conn in connections:
                if (conn.status == 'LISTEN' and 
                    conn.laddr and 
                    conn.laddr.port == port and 
                    conn.pid):
                    try:
                        proc = psutil.Process(conn.pid)
                        target_processes.append({
                            'pid': conn.pid,
                            'name': proc.name(),
                            'process': proc
                        })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            
            if not target_processes:
                return {
                    'success': False,
                    'message': f'端口 {port} 上没有找到运行的进程'
                }
            
            # 安全检查：不允许关闭系统关键进程
            protected_processes = ['systemd', 'init', 'kernel', 'kthreadd', 'ssh', 'sshd']
            killed_processes = []
            
            for proc_info in target_processes:
                proc_name = proc_info['name'].lower()
                
                # 检查是否为受保护的进程
                if any(protected in proc_name for protected in protected_processes):
                    continue
                
                # 检查进程是否以 root 权限运行（额外安全检查）
                try:
                    proc = proc_info['process']
                    if proc.username() == 'root' and proc_info['pid'] < 1000:
                        # 跳过系统进程
                        continue
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    pass
                
                try:
                    # 尝试优雅地终止进程 (SIGTERM)
                    proc_info['process'].terminate()
                    killed_processes.append({
                        'pid': proc_info['pid'],
                        'name': proc_info['name'],
                        'signal': 'SIGTERM'
                    })
                    
                    # 等待进程结束，如果 3 秒内没有结束则强制杀死
                    try:
                        proc_info['process'].wait(timeout=3)
                    except psutil.TimeoutExpired:
                        proc_info['process'].kill()
                        killed_processes[-1]['signal'] = 'SIGKILL'
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
                    return {
                        'success': False,
                        'message': f'无法终止进程 {proc_info["name"]} (PID: {proc_info["pid"]}): {str(e)}'
                    }
            
            if not killed_processes:
                return {
                    'success': False,
                    'message': f'端口 {port} 上的进程受到保护，无法终止'
                }
            
            return {
                'success': True,
                'message': f'成功终止端口 {port} 上的进程',
                'killed_processes': killed_processes
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'操作失败: {str(e)}'
            }
    
    def kill_process_by_pid(self, pid):
        """根据PID终止进程"""
        try:
            # 获取进程信息
            try:
                proc = psutil.Process(pid)
                proc_name = proc.name()
                proc_username = proc.username()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                return {
                    'success': False,
                    'message': f'进程 PID {pid} 不存在或无法访问'
                }
            
            # 安全检查：不允许关闭系统关键进程
            protected_processes = ['systemd', 'init', 'kernel', 'kthreadd', 'ssh', 'sshd']
            if any(protected in proc_name.lower() for protected in protected_processes):
                return {
                    'success': False,
                    'message': f'进程 {proc_name} 受保护，无法终止'
                }
            
            # 检查进程是否以 root 权限运行（额外安全检查）
            if proc_username == 'root' and pid < 1000:
                return {
                    'success': False,
                    'message': f'系统进程 {proc_name} (PID: {pid}) 受保护，无法终止'
                }
            
            try:
                # 尝试优雅地终止进程 (SIGTERM)
                proc.terminate()
                
                # 等待进程结束，如果 3 秒内没有结束则强制杀死
                try:
                    proc.wait(timeout=3)
                    signal_used = 'SIGTERM'
                except psutil.TimeoutExpired:
                    proc.kill()
                    signal_used = 'SIGKILL'
                
                return {
                    'success': True,
                    'message': f'成功终止进程 {proc_name} (PID: {pid})，使用信号: {signal_used}',
                    'killed_process': {
                        'pid': pid,
                        'name': proc_name,
                        'signal': signal_used
                    }
                }
                
            except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
                return {
                    'success': False,
                    'message': f'无法终止进程 {proc_name} (PID: {pid}): {str(e)}'
                }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'操作失败: {str(e)}'
            }
    
    def get_all_stats(self):
        return {
            'timestamp': datetime.now().isoformat(),
            'cpu': self.get_cpu_info(),
            'memory': self.get_memory_info(),
            'disk': self.get_disk_info(),
            'network': self.get_network_info(),
            'system': self.get_system_info(),
            'processes': self.get_process_info(),
            'memory_processes': self.get_memory_top_processes(),
            'services': self.get_services_status(),
            'ports': self.get_port_info()
        }

monitor = SystemMonitor()