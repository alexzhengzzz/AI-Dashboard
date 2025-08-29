"""
系统健康监控模块 - 负责系统健康状态评估和预警
"""
import psutil
from typing import Dict, List, Any
from ..core.base_monitor import BaseMonitor


class HealthMonitor(BaseMonitor):
    """系统健康监控器"""
    
    def collect_data(self) -> Dict[str, Any]:
        """收集系统健康数据"""
        return self.get_system_health_info()
    
    def get_system_health_info(self) -> Dict[str, Any]:
        """获取系统健康状态信息"""
        # 获取基础系统数据
        cpu_info = self._get_cpu_basic_info()
        memory_info = self._get_memory_basic_info()
        disk_info = self._get_disk_basic_info()
        
        # 计算系统健康评分（0-100）
        health_score = 100
        warnings = []
        critical_issues = []
        
        # CPU评分
        cpu_usage = cpu_info.get('usage_percent', 0)
        if cpu_usage > 90:
            health_score -= 30
            critical_issues.append('CPU使用率过高')
        elif cpu_usage > 70:
            health_score -= 15
            warnings.append('CPU使用率较高')
        
        # 内存评分
        memory_usage = memory_info.get('percent', 0)
        if memory_usage > 90:
            health_score -= 30
            critical_issues.append('内存使用率过高')
        elif memory_usage > 80:
            health_score -= 15
            warnings.append('内存使用率较高')
        
        # 磁盘评分
        for disk in disk_info:
            disk_usage = disk.get('percent', 0)
            mountpoint = disk.get('mountpoint', 'unknown')
            
            if disk_usage > 95:
                health_score -= 25
                critical_issues.append(f'磁盘 {mountpoint} 空间不足')
            elif disk_usage > 85:
                health_score -= 10
                warnings.append(f'磁盘 {mountpoint} 空间较满')
        
        # 负载评分
        load_1min = cpu_info.get('load_avg', {}).get('1min', 0)
        cpu_count = cpu_info.get('cpu_count', 1)
        if load_1min > cpu_count * 2:
            health_score -= 20
            critical_issues.append('系统负载过高')
        elif load_1min > cpu_count * 1.5:
            health_score -= 10
            warnings.append('系统负载较高')
        
        # Swap使用率检查
        swap_percent = memory_info.get('swap_percent', 0)
        if swap_percent > 50:
            health_score -= 15
            warnings.append('Swap使用率过高')
        
        health_score = max(0, health_score)
        
        # 确定健康状态
        if health_score >= 80:
            status = 'excellent'
            status_text = '优秀'
            status_color = 'green'
        elif health_score >= 60:
            status = 'good'
            status_text = '良好'
            status_color = 'blue'
        elif health_score >= 40:
            status = 'warning'
            status_text = '警告'
            status_color = 'orange'
        else:
            status = 'critical'
            status_text = '严重'
            status_color = 'red'
        
        return {
            'score': health_score,
            'status': status,
            'status_text': status_text,
            'status_color': status_color,
            'warnings': warnings,
            'critical_issues': critical_issues,
            'details': {
                'cpu_usage': cpu_usage,
                'memory_usage': memory_usage,
                'swap_usage': swap_percent,
                'load_average': load_1min,
                'disk_usage': [{'mountpoint': d['mountpoint'], 'percent': d['percent']} for d in disk_info]
            }
        }
    
    def _get_cpu_basic_info(self) -> Dict[str, Any]:
        """获取CPU基础信息"""
        try:
            import os
            # 使用更短的间隔减少阻塞时间
            cpu_percent = psutil.cpu_percent(interval=0.1)
            load_avg = getattr(os, 'getloadavg', lambda: [0, 0, 0])()
            
            return {
                'usage_percent': round(cpu_percent, 2),
                'load_avg': {
                    '1min': round(load_avg[0], 2),
                    '5min': round(load_avg[1], 2),
                    '15min': round(load_avg[2], 2)
                },
                'cpu_count': psutil.cpu_count()
            }
        except:
            return {'usage_percent': 0, 'load_avg': {'1min': 0, '5min': 0, '15min': 0}, 'cpu_count': 1}
    
    def _get_memory_basic_info(self) -> Dict[str, Any]:
        """获取内存基础信息"""
        try:
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            return {
                'total': memory.total,
                'used': memory.used,
                'percent': memory.percent,
                'swap_total': swap.total,
                'swap_used': swap.used,
                'swap_percent': swap.percent
            }
        except:
            return {'total': 0, 'used': 0, 'percent': 0, 'swap_total': 0, 'swap_used': 0, 'swap_percent': 0}
    
    def _get_disk_basic_info(self) -> List[Dict[str, Any]]:
        """获取磁盘基础信息"""
        disk_usage = []
        try:
            for partition in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    disk_usage.append({
                        'mountpoint': partition.mountpoint,
                        'total': usage.total,
                        'used': usage.used,
                        'percent': round(usage.used / usage.total * 100, 2) if usage.total > 0 else 0
                    })
                except PermissionError:
                    continue
        except:
            pass
        return disk_usage
    
    def get_performance_recommendations(self) -> List[Dict[str, Any]]:
        """获取性能优化建议"""
        recommendations = []
        health_info = self.get_system_health_info()
        
        # CPU优化建议
        cpu_usage = health_info['details']['cpu_usage']
        if cpu_usage > 80:
            recommendations.append({
                'category': 'CPU',
                'priority': 'high',
                'issue': f'CPU使用率过高 ({cpu_usage:.1f}%)',
                'suggestions': [
                    '检查高CPU使用率的进程并优化',
                    '考虑增加CPU核心数',
                    '优化应用程序的CPU密集型操作'
                ]
            })
        
        # 内存优化建议
        memory_usage = health_info['details']['memory_usage']
        if memory_usage > 80:
            recommendations.append({
                'category': '内存',
                'priority': 'high',
                'issue': f'内存使用率过高 ({memory_usage:.1f}%)',
                'suggestions': [
                    '关闭不必要的应用程序',
                    '增加系统内存',
                    '检查内存泄漏',
                    '优化缓存策略'
                ]
            })
        
        # 磁盘优化建议
        for disk in health_info['details']['disk_usage']:
            if disk['percent'] > 85:
                recommendations.append({
                    'category': '磁盘',
                    'priority': 'high' if disk['percent'] > 95 else 'medium',
                    'issue': f'磁盘 {disk["mountpoint"]} 空间不足 ({disk["percent"]:.1f}%)',
                    'suggestions': [
                        '清理不必要的文件',
                        '移动大文件到其他磁盘',
                        '配置日志轮转',
                        '扩展磁盘容量'
                    ]
                })
        
        # 负载优化建议
        load_avg = health_info['details']['load_average']
        cpu_count = psutil.cpu_count()
        if load_avg > cpu_count * 1.5:
            recommendations.append({
                'category': '系统负载',
                'priority': 'medium',
                'issue': f'系统负载较高 ({load_avg:.2f}/{cpu_count})',
                'suggestions': [
                    '减少并发任务数量',
                    '优化I/O密集型操作',
                    '检查系统瓶颈',
                    '考虑负载均衡'
                ]
            })
        
        return recommendations
    
    def get_system_alerts(self) -> List[Dict[str, Any]]:
        """获取系统警报"""
        alerts = []
        health_info = self.get_system_health_info()
        
        # 添加关键问题作为警报
        for issue in health_info['critical_issues']:
            alerts.append({
                'level': 'critical',
                'message': issue,
                'timestamp': psutil.time.time(),
                'category': 'system_health'
            })
        
        # 添加警告作为警报
        for warning in health_info['warnings']:
            alerts.append({
                'level': 'warning',
                'message': warning,
                'timestamp': psutil.time.time(),
                'category': 'system_health'
            })
        
        # 检查进程异常
        try:
            zombie_count = len([p for p in psutil.process_iter() if p.status() == psutil.STATUS_ZOMBIE])
            if zombie_count > 5:
                alerts.append({
                    'level': 'warning',
                    'message': f'发现 {zombie_count} 个僵尸进程',
                    'timestamp': psutil.time.time(),
                    'category': 'process'
                })
        except:
            pass
        
        # 检查网络连接异常
        try:
            connections = psutil.net_connections()
            time_wait_count = len([c for c in connections if c.status == 'TIME_WAIT'])
            if time_wait_count > 1000:
                alerts.append({
                    'level': 'warning',
                    'message': f'TIME_WAIT连接过多 ({time_wait_count})',
                    'timestamp': psutil.time.time(),
                    'category': 'network'
                })
        except:
            pass
        
        return alerts
    
    def get_system_statistics(self) -> Dict[str, Any]:
        """获取系统统计信息，整合进程、连接、用户等统计数据"""
        stats = {
            'processes': self._get_process_statistics(),
            'network': self._get_network_statistics(),
            'users': self._get_user_statistics(),
            'system': self._get_system_runtime_statistics()
        }
        return stats
    
    def _get_process_statistics(self) -> Dict[str, int]:
        """获取进程统计"""
        try:
            process_count = {
                'total': 0,
                'running': 0,
                'sleeping': 0,
                'zombie': 0,
                'stopped': 0
            }
            
            for proc in psutil.process_iter(['status']):
                try:
                    status = proc.info['status']
                    process_count['total'] += 1
                    
                    if status == psutil.STATUS_RUNNING:
                        process_count['running'] += 1
                    elif status == psutil.STATUS_SLEEPING:
                        process_count['sleeping'] += 1
                    elif status == psutil.STATUS_ZOMBIE:
                        process_count['zombie'] += 1
                    elif status == psutil.STATUS_STOPPED:
                        process_count['stopped'] += 1
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            return process_count
        except Exception:
            return {'total': 0, 'running': 0, 'sleeping': 0, 'zombie': 0, 'stopped': 0}
    
    def _get_network_statistics(self) -> Dict[str, int]:
        """获取网络连接统计"""
        try:
            connections = psutil.net_connections()
            connection_stats = {
                'total': len(connections),
                'established': 0,
                'listen': 0,
                'time_wait': 0,
                'close_wait': 0
            }
            
            for conn in connections:
                if conn.status == 'ESTABLISHED':
                    connection_stats['established'] += 1
                elif conn.status == 'LISTEN':
                    connection_stats['listen'] += 1
                elif conn.status == 'TIME_WAIT':
                    connection_stats['time_wait'] += 1
                elif conn.status == 'CLOSE_WAIT':
                    connection_stats['close_wait'] += 1
            
            return connection_stats
        except Exception:
            return {'total': 0, 'established': 0, 'listen': 0, 'time_wait': 0, 'close_wait': 0}
    
    def _get_user_statistics(self) -> Dict[str, Any]:
        """获取用户会话统计"""
        try:
            users = psutil.users()
            user_stats = {
                'total_sessions': len(users),
                'unique_users': len(set(user.name for user in users)),
                'user_list': []
            }
            
            # 获取用户详情
            user_detail = {}
            for user in users:
                if user.name not in user_detail:
                    user_detail[user.name] = {
                        'name': user.name,
                        'sessions': 0,
                        'terminals': []
                    }
                user_detail[user.name]['sessions'] += 1
                if user.terminal:
                    user_detail[user.name]['terminals'].append(user.terminal)
            
            user_stats['user_list'] = list(user_detail.values())
            return user_stats
        except Exception:
            return {'total_sessions': 0, 'unique_users': 0, 'user_list': []}
    
    def _get_system_runtime_statistics(self) -> Dict[str, Any]:
        """获取系统运行时统计"""
        try:
            boot_time = psutil.boot_time()
            current_time = psutil.time.time()
            uptime_seconds = int(current_time - boot_time)
            
            # 计算运行时间
            days = uptime_seconds // 86400
            hours = (uptime_seconds % 86400) // 3600
            minutes = (uptime_seconds % 3600) // 60
            
            uptime_string = f"{days}天{hours}小时{minutes}分钟" if days > 0 else f"{hours}小时{minutes}分钟"
            
            # 获取系统负载
            load_avg = getattr(psutil, 'getloadavg', lambda: [0, 0, 0])()
            
            return {
                'uptime_seconds': uptime_seconds,
                'uptime_days': days,
                'uptime_string': uptime_string,
                'load_average_1min': round(load_avg[0], 2),
                'load_average_5min': round(load_avg[1], 2),
                'load_average_15min': round(load_avg[2], 2),
                'cpu_count': psutil.cpu_count()
            }
        except Exception:
            return {
                'uptime_seconds': 0,
                'uptime_days': 0,
                'uptime_string': '未知',
                'load_average_1min': 0,
                'load_average_5min': 0,
                'load_average_15min': 0,
                'cpu_count': 1
            }