"""
进程监控和管理模块 - 负责进程信息收集、监控和管理操作
"""
import psutil
import signal
import time
from typing import Dict, List, Any, Tuple
from datetime import datetime

from ..core.base_monitor import BaseMonitor, DataProcessor, SecurityChecker


class ProcessMonitor(BaseMonitor):
    """进程监控器"""
    
    def collect_data(self) -> Dict[str, Any]:
        """收集进程相关数据"""
        return {
            'memory_processes': self.get_memory_top_processes(),
            'stats_summary': self.get_system_stats_summary()
        }
    
    def _get_process_status_display(self, proc_obj, status: str, cpu_percent: float) -> Tuple[str, str]:
        """获取进程状态的友好显示"""
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
        status_display = status_map.get(status, status)
        connection_info = None

        if status == 'sleeping':
            try:
                connections = proc_obj.connections()
                if connections:
                    status_display = '网络等待'
                    connection_info = f'{len(connections)}个连接'
                elif proc_obj.open_files():
                    status_display = 'I/O等待'
                elif cpu_percent > 0:
                    status_display = '活跃睡眠'
                else:
                    status_display = '空闲睡眠'
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        return status_display, connection_info or ''

    def get_memory_top_processes(self, min_memory_mb: int = 10, limit: int = 20) -> List[Dict[str, Any]]:
        """获取内存占用最多的进程"""
        processes = []
        
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
                
                # 获取CPU使用率
                try:
                    if proc.info['pid'] in cpu_procs:
                        cpu_percent = cpu_procs[proc.info['pid']].cpu_percent(interval=None)
                        process_info['cpu_percent'] = round(cpu_percent, 1)
                    else:
                        process_info['cpu_percent'] = round(proc_obj.cpu_percent(interval=None), 1)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_info['cpu_percent'] = 0.0
                
                # 获取详细进程状态
                try:
                    status = proc_obj.status()
                    process_info['status'] = status
                    status_display, connection_info = self._get_process_status_display(
                        proc_obj, status, process_info['cpu_percent'])
                    process_info['status_display'] = status_display
                    if connection_info:
                        process_info['connection_info'] = connection_info
                            
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
                    process_info['is_protected'] = SecurityChecker.is_protected_process(
                        process_info['name'], 
                        process_info['pid'], 
                        process_info['username']
                    )
                    
                    # 获取进程分类
                    process_info['category'] = SecurityChecker.get_process_category(
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
                    process_info['running_time'] = DataProcessor.format_running_time(create_time)
                        
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
        processes.sort(key=lambda x: x.get('memory_rss_mb', 0), reverse=True)
        return processes[:limit]
    
    def get_system_stats_summary(self) -> Dict[str, Any]:
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


class ProcessManager:
    """进程管理器 - 负责进程终止等管理操作"""
    
    def kill_process_by_port(self, port: int) -> Dict[str, Any]:
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
            
            killed_processes = []
            
            for proc_info in target_processes:
                proc_name = proc_info['name'].lower()
                
                # 使用安全检查
                try:
                    proc = proc_info['process']
                    username = proc.username()
                    if SecurityChecker.is_protected_process(proc_name, proc_info['pid'], username):
                        continue
                except (psutil.AccessDenied, psutil.NoSuchProcess):
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
    
    def kill_process_by_pid(self, pid: int) -> Dict[str, Any]:
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
            
            # 使用安全检查
            if SecurityChecker.is_protected_process(proc_name, pid, proc_username):
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