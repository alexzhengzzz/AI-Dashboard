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
        self.last_stats = {}
        self.static_data_cache = {}
        self.cache_timestamp = {}
        
    def is_protected_process(self, proc_name, pid, username):
        """判断进程是否受保护"""
        protected_processes = [
            'systemd', 'init', 'kernel', 'kthreadd', 'ssh', 'sshd',
            'NetworkManager', 'dbus', 'cron', 'rsyslog', 'udev',
            'irq/', 'rcu_', 'migration/', 'ksoftirqd', 'watchdog',
            'systemd-', 'kworker', 'ksoftirqd', 'migration', 'rcu_gp',
            'rcu_par_gp', 'netns', 'kcompactd', 'khugepaged'
        ]
        
        # 基于进程名判断
        proc_name_lower = proc_name.lower()
        if any(protected in proc_name_lower for protected in protected_processes):
            return True
            
        # 基于PID和用户判断（系统进程保护）
        if username == 'root' and pid < 1000:
            return True
            
        return False
    
    def get_process_category(self, proc_name, username, cmdline):
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
        
    def get_cpu_info(self):
        # 只调用一次 psutil.cpu_percent 来获取总体和每个CPU的使用率
        cpu_percent_total = psutil.cpu_percent(interval=1)
        cpu_percent_per_cpu = psutil.cpu_percent(interval=0.1, percpu=True)
        load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
        
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
    

    def get_memory_top_processes(self, min_memory_mb=10, limit=20):
        """获取内存占用最多的进程（资源使用排行）
        
        Args:
            min_memory_mb: 最小内存使用量阈值(MB)
            limit: 返回进程数量限制（默认20）
        """
        processes = []
        import time
        
        # 首次调用cpu_percent来初始化CPU统计
        cpu_procs = {}
        for proc in psutil.process_iter(['pid', 'name', 'memory_percent']):
            try:
                proc_obj = psutil.Process(proc.info['pid'])
                proc_obj.cpu_percent(interval=None)  # 初始化CPU统计
                cpu_procs[proc.info['pid']] = proc_obj
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # 等待一小段时间让CPU统计数据稳定
        time.sleep(0.5)
        
        for proc in psutil.process_iter(['pid', 'name', 'memory_percent']):
            try:
                process_info = {}
                proc_obj = psutil.Process(proc.info['pid'])
                
                # 基础信息
                process_info['pid'] = proc.info['pid']
                process_info['name'] = proc.info['name']
                process_info['memory_percent'] = proc.info.get('memory_percent', 0)
                
                # 获取CPU使用率 (使用预先初始化的进程对象)
                try:
                    if proc.info['pid'] in cpu_procs:
                        cpu_percent = cpu_procs[proc.info['pid']].cpu_percent(interval=None)
                        process_info['cpu_percent'] = round(cpu_percent, 1)
                    else:
                        # 如果进程不在预初始化列表中，尝试获取但设为较低优先级
                        process_info['cpu_percent'] = round(proc_obj.cpu_percent(interval=None), 1)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_info['cpu_percent'] = 0.0
                
                # 获取详细进程状态
                try:
                    status = proc_obj.status()
                    # 将状态转换为更友好的显示
                    status_map = {
                        'running': '运行中',
                        'sleeping': '睡眠',
                        'disk-sleep': '磁盘等待',
                        'stopped': '已停止',
                        'tracing-stop': '跟踪停止',
                        'zombie': '僵尸进程',
                        'dead': '已终止',
                        'wake-kill': '唤醒终止',
                        'waking': '唤醒中',
                        'idle': '空闲',
                        'locked': '锁定',
                        'waiting': '等待'
                    }
                    process_info['status'] = status
                    process_info['status_display'] = status_map.get(status, status)
                    
                    # 对于睡眠状态的进程，获取更详细信息
                    if status == 'sleeping':
                        try:
                            # 检查是否有网络连接
                            connections = proc_obj.connections()
                            if connections:
                                process_info['status_display'] = '网络等待'
                                process_info['connection_info'] = f'{len(connections)}个连接'
                            else:
                                # 检查是否有文件操作
                                open_files = proc_obj.open_files()
                                if open_files:
                                    process_info['status_display'] = 'I/O等待'
                                else:
                                    # 检查进程是否最近有CPU活动
                                    if process_info['cpu_percent'] > 0:
                                        process_info['status_display'] = '活跃睡眠'
                                    else:
                                        process_info['status_display'] = '空闲睡眠'
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                            
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_info['status'] = 'unknown'
                    process_info['status_display'] = '未知'
                
                # 添加内存使用量
                try:
                    memory_info = proc_obj.memory_info()
                    process_info['memory_rss_mb'] = round(memory_info.rss / 1024 / 1024, 1)
                    process_info['memory_vms_mb'] = round(memory_info.vms / 1024 / 1024, 1)
                    
                    # 应用内存过滤阈值
                    if process_info['memory_rss_mb'] < min_memory_mb:
                        continue
                    
                    # 获取用户名
                    process_info['username'] = proc_obj.username()
                    
                    # 添加保护状态
                    process_info['is_protected'] = self.is_protected_process(
                        process_info['name'], 
                        process_info['pid'], 
                        process_info['username']
                    )
                    
                    # 获取进程分类
                    process_info['category'] = self.get_process_category(
                        process_info['name'],
                        process_info['username'],
                        process_info.get('cmdline', '')
                    )
                    
                    # 获取命令行参数（截取前3个参数）
                    try:
                        cmdline = proc_obj.cmdline()
                        if cmdline:
                            # 只显示前3个参数，并限制总长度
                            cmd_parts = cmdline[:3]
                            cmd_str = ' '.join(cmd_parts)
                            if len(cmd_str) > 50:
                                cmd_str = cmd_str[:47] + '...'
                            process_info['cmdline'] = cmd_str
                        else:
                            process_info['cmdline'] = f'[{process_info["name"]}]'
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        process_info['cmdline'] = 'unknown'
                        
                    # 获取创建时间
                    create_time = proc_obj.create_time()
                    process_info['create_time'] = create_time
                    
                    # 计算进程运行时间
                    running_time = time.time() - create_time
                    if running_time < 60:
                        process_info['running_time'] = f'{int(running_time)}秒'
                    elif running_time < 3600:
                        process_info['running_time'] = f'{int(running_time/60)}分钟'
                    elif running_time < 86400:
                        process_info['running_time'] = f'{int(running_time/3600)}小时'
                    else:
                        process_info['running_time'] = f'{int(running_time/86400)}天'
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_info['memory_rss_mb'] = 0
                    process_info['memory_vms_mb'] = 0
                    process_info['username'] = 'unknown'
                    process_info['cmdline'] = 'unknown'
                    process_info['running_time'] = '未知'
                
                processes.append(process_info)
                
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort by memory usage (RSS)
        processes.sort(key=lambda x: x['memory_rss_mb'] or 0, reverse=True)
        return processes[:limit]  # Top processes by memory
    
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
            protected_processes = [
                'systemd', 'init', 'kernel', 'kthreadd', 'ssh', 'sshd',
                'NetworkManager', 'dbus', 'cron', 'rsyslog', 'udev',
                'irq/', 'rcu_', 'migration/', 'ksoftirqd', 'watchdog',
                'systemd-', 'kworker', 'ksoftirqd', 'migration', 'rcu_gp',
                'rcu_par_gp', 'netns', 'kcompactd', 'khugepaged'
            ]
            killed_processes = []
            
            for proc_info in target_processes:
                proc_name = proc_info['name'].lower()
                
                # 使用统一的保护检查函数
                try:
                    proc = proc_info['process']
                    username = proc.username()
                    if self.is_protected_process(proc_name, proc_info['pid'], username):
                        continue
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    # 如果无法获取用户信息，默认保护
                    continue
                
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
            
            # 使用统一的保护检查函数
            if self.is_protected_process(proc_name, pid, proc_username):
                return {
                    'success': False,
                    'message': f'进程 {proc_name} (PID: {pid}) 受保护，无法终止'
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
    
    def get_system_health_info(self):
        """获取系统健康状态信息"""
        cpu_info = self.get_cpu_info()
        memory_info = self.get_memory_info()
        disk_info = self.get_disk_info()
        
        # 计算系统健康评分（0-100）
        health_score = 100
        warnings = []
        
        # CPU评分
        if cpu_info['usage_percent'] > 90:
            health_score -= 30
            warnings.append('CPU使用率过高')
        elif cpu_info['usage_percent'] > 70:
            health_score -= 15
            warnings.append('CPU使用率较高')
        
        # 内存评分
        if memory_info['percent'] > 90:
            health_score -= 30
            warnings.append('内存使用率过高')
        elif memory_info['percent'] > 80:
            health_score -= 15
            warnings.append('内存使用率较高')
        
        # 磁盘评分
        for disk in disk_info:
            if disk.get('percent', 0) > 95:
                health_score -= 25
                warnings.append(f'磁盘 {disk["mountpoint"]} 空间不足')
            elif disk.get('percent', 0) > 85:
                health_score -= 10
                warnings.append(f'磁盘 {disk["mountpoint"]} 空间较满')
        
        # 负载评分
        load_1min = cpu_info.get('load_avg', {}).get('1min', 0)
        cpu_count = cpu_info.get('cpu_count', 1)
        if load_1min > cpu_count * 2:
            health_score -= 20
            warnings.append('系统负载过高')
        elif load_1min > cpu_count * 1.5:
            health_score -= 10
        
        health_score = max(0, health_score)
        
        # 确定健康状态
        if health_score >= 80:
            status = 'excellent'
            status_text = '优秀'
        elif health_score >= 60:
            status = 'good'
            status_text = '良好'
        elif health_score >= 40:
            status = 'warning'
            status_text = '警告'
        else:
            status = 'critical'
            status_text = '严重'
        
        return {
            'score': health_score,
            'status': status,
            'status_text': status_text,
            'warnings': warnings
        }
    
    def get_system_stats_summary(self):
        """获取系统统计摘要"""
        try:
            # 进程统计
            total_processes = len(psutil.pids())
            running_processes = 0
            sleeping_processes = 0
            active_processes = 0  # 有CPU活动的进程
            zombie_processes = 0
            other_processes = 0
            
            # 使用更高效的方式统计进程状态
            for proc in psutil.process_iter(['pid', 'status']):
                try:
                    status = proc.info['status']
                    
                    if status == 'running':
                        running_processes += 1
                    elif status == 'sleeping':
                        sleeping_processes += 1
                        # 检查睡眠进程是否有CPU活动
                        try:
                            proc_obj = psutil.Process(proc.info['pid'])
                            cpu_percent = proc_obj.cpu_percent(interval=None)
                            if cpu_percent > 0.1:  # CPU使用率超过0.1%认为是活跃进程
                                active_processes += 1
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    elif status == 'zombie':
                        zombie_processes += 1
                    else:
                        other_processes += 1
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            # 网络连接统计
            try:
                connections = psutil.net_connections()
                established_connections = len([c for c in connections if c.status == 'ESTABLISHED'])
                listening_connections = len([c for c in connections if c.status == 'LISTEN'])
                time_wait_connections = len([c for c in connections if c.status == 'TIME_WAIT'])
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                established_connections = 0
                listening_connections = 0
                time_wait_connections = 0
            
            # 用户统计
            try:
                users = psutil.users()
                active_users = len(set(user.name for user in users))
            except:
                active_users = 0
            
            return {
                'processes': {
                    'total': total_processes,
                    'running': running_processes,
                    'sleeping': sleeping_processes,
                    'active_sleeping': active_processes,  # 活跃的睡眠进程
                    'zombie': zombie_processes,
                    'other': other_processes
                },
                'connections': {
                    'established': established_connections,
                    'listening': listening_connections,
                    'time_wait': time_wait_connections
                },
                'users': {
                    'active': active_users
                }
            }
        except Exception as e:
            return {
                'processes': {'total': 0, 'running': 0, 'sleeping': 0, 'active_sleeping': 0, 'zombie': 0, 'other': 0},
                'connections': {'established': 0, 'listening': 0, 'time_wait': 0},
                'users': {'active': 0}
            }
    
    def get_enhanced_system_info(self):
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

    def get_all_stats(self, force_full=False):
        """获取所有统计数据，支持增量更新"""
        current_time = datetime.now()
        timestamp = current_time.isoformat()
        
        # 构建当前数据
        current_stats = {
            'timestamp': timestamp,
            'cpu': self.get_cpu_info(),
            'memory': self.get_memory_info(),
            'disk': self.get_disk_info(),
            'network': self.get_network_info(),
            'system': self.get_cached_system_info(),
            'health': self.get_system_health_info(),
            'stats_summary': self.get_system_stats_summary(),
            'memory_processes': self.get_memory_top_processes(),
            'services': self.get_cached_services_status(),
            'ports': self.get_port_info()
        }
        
        if force_full or not self.last_stats:
            self.last_stats = current_stats.copy()
            return current_stats
        
        # 返回增量数据
        return self.get_incremental_stats(current_stats)
    
    def get_cached_system_info(self):
        """缓存系统信息，降低获取频率"""
        cache_key = 'system_info'
        current_time = datetime.now()
        
        # 系统信息缓存5分钟
        if (cache_key in self.static_data_cache and 
            cache_key in self.cache_timestamp and
            (current_time - self.cache_timestamp[cache_key]).seconds < 300):
            return self.static_data_cache[cache_key]
        
        system_info = self.get_enhanced_system_info()
        self.static_data_cache[cache_key] = system_info
        self.cache_timestamp[cache_key] = current_time
        return system_info
    
    def get_cached_services_status(self):
        """缓存服务状态，降低检查频率"""
        cache_key = 'services_status'
        current_time = datetime.now()
        
        # 服务状态缓存30秒
        if (cache_key in self.static_data_cache and 
            cache_key in self.cache_timestamp and
            (current_time - self.cache_timestamp[cache_key]).seconds < 30):
            return self.static_data_cache[cache_key]
        
        services_status = self.get_services_status()
        self.static_data_cache[cache_key] = services_status
        self.cache_timestamp[cache_key] = current_time
        return services_status
    
    def get_incremental_stats(self, current_stats):
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
    
    def _has_significant_change(self, key, old_value, new_value):
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

monitor = SystemMonitor()