import sqlite3
import os
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict, Counter
import threading


class DNSManager:
    """
    DNS数据管理器，负责DNS查询日志、统计和配置管理
    """
    
    def __init__(self, db_path='data/dns.db'):
        self.db_path = db_path
        self.db_lock = threading.Lock()
        
        # 创建数据目录
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        # 初始化数据库
        self._init_database()
        
        # 内存统计缓存
        self.stats_cache = {
            'total_queries': 0,
            'blocked_queries': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'upstream_stats': defaultdict(lambda: {'success': 0, 'failed': 0})
        }
        
        # 加载统计缓存
        self._load_stats_cache()
    
    def _init_database(self):
        """
        初始化SQLite数据库
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # DNS查询日志表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dns_queries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    client_ip TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    query_type TEXT NOT NULL,
                    response_code TEXT,
                    response_time REAL,
                    upstream_server TEXT,
                    cached BOOLEAN DEFAULT FALSE
                )
            ''')
            
            # 屏蔽查询日志表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS blocked_queries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    client_ip TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    reason TEXT DEFAULT 'adblock'
                )
            ''')
            
            # DNS服务器事件日志表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS server_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    event_type TEXT NOT NULL,
                    description TEXT,
                    details TEXT
                )
            ''')
            
            # 统计数据表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS daily_stats (
                    date DATE PRIMARY KEY,
                    total_queries INTEGER DEFAULT 0,
                    blocked_queries INTEGER DEFAULT 0,
                    cache_hits INTEGER DEFAULT 0,
                    cache_misses INTEGER DEFAULT 0,
                    top_domains TEXT,
                    top_clients TEXT
                )
            ''')
            
            # DNS配置表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dns_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 创建索引
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON dns_queries(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_queries_domain ON dns_queries(domain)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_queries_client ON dns_queries(client_ip)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_blocked_timestamp ON blocked_queries(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_blocked_domain ON blocked_queries(domain)')
            
            conn.commit()
    
    def log_query(self, client_ip: str, domain: str, query_type: str, 
                  timestamp: datetime, response_code: str = None, 
                  response_time: float = None, upstream_server: str = None, 
                  cached: bool = False):
        """
        记录DNS查询日志
        """
        with self.db_lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute('''
                        INSERT INTO dns_queries 
                        (timestamp, client_ip, domain, query_type, response_code, 
                         response_time, upstream_server, cached)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (timestamp, client_ip, domain, query_type, response_code,
                          response_time, upstream_server, cached))
                    conn.commit()
                
                # 更新统计缓存
                self.stats_cache['total_queries'] += 1
                
            except Exception as e:
                print(f"记录DNS查询日志失败: {e}")
    
    def log_blocked_query(self, client_ip: str, domain: str, timestamp: datetime, reason: str = 'adblock'):
        """
        记录被屏蔽的查询日志
        """
        with self.db_lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute('''
                        INSERT INTO blocked_queries (timestamp, client_ip, domain, reason)
                        VALUES (?, ?, ?, ?)
                    ''', (timestamp, client_ip, domain, reason))
                    conn.commit()
                
                # 更新统计缓存
                self.stats_cache['blocked_queries'] += 1
                
            except Exception as e:
                print(f"记录屏蔽查询日志失败: {e}")
    
    def log_server_event(self, event_type: str, description: str, details: str = None):
        """
        记录DNS服务器事件日志
        """
        with self.db_lock:
            try:
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute('''
                        INSERT INTO server_events (timestamp, event_type, description, details)
                        VALUES (?, ?, ?, ?)
                    ''', (datetime.now(), event_type, description, details))
                    conn.commit()
                    
            except Exception as e:
                print(f"记录服务器事件日志失败: {e}")
    
    def record_cache_hit(self):
        """
        记录缓存命中
        """
        self.stats_cache['cache_hits'] += 1
    
    def record_cache_miss(self):
        """
        记录缓存未命中
        """
        self.stats_cache['cache_misses'] += 1
    
    def record_upstream_query(self, upstream_server: str, success: bool):
        """
        记录上游查询结果
        """
        if success:
            self.stats_cache['upstream_stats'][upstream_server]['success'] += 1
        else:
            self.stats_cache['upstream_stats'][upstream_server]['failed'] += 1
    
    def get_query_stats(self, hours: int = 24) -> Dict:
        """
        获取查询统计信息
        """
        start_time = datetime.now() - timedelta(hours=hours)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 总查询数
            cursor.execute('''
                SELECT COUNT(*) FROM dns_queries 
                WHERE timestamp > ?
            ''', (start_time,))
            total_queries = cursor.fetchone()[0]
            
            # 被屏蔽查询数
            cursor.execute('''
                SELECT COUNT(*) FROM blocked_queries 
                WHERE timestamp > ?
            ''', (start_time,))
            blocked_queries = cursor.fetchone()[0]
            
            # 查询类型分布
            cursor.execute('''
                SELECT query_type, COUNT(*) FROM dns_queries 
                WHERE timestamp > ?
                GROUP BY query_type
                ORDER BY COUNT(*) DESC
            ''', (start_time,))
            query_types = dict(cursor.fetchall())
            
            # 热门域名
            cursor.execute('''
                SELECT domain, COUNT(*) FROM dns_queries 
                WHERE timestamp > ?
                GROUP BY domain
                ORDER BY COUNT(*) DESC
                LIMIT 10
            ''', (start_time,))
            top_domains = cursor.fetchall()
            
            # 客户端统计
            cursor.execute('''
                SELECT client_ip, COUNT(*) FROM dns_queries 
                WHERE timestamp > ?
                GROUP BY client_ip
                ORDER BY COUNT(*) DESC
                LIMIT 10
            ''', (start_time,))
            top_clients = cursor.fetchall()
            
            # 热门屏蔽域名
            cursor.execute('''
                SELECT domain, COUNT(*) FROM blocked_queries 
                WHERE timestamp > ?
                GROUP BY domain
                ORDER BY COUNT(*) DESC
                LIMIT 10
            ''', (start_time,))
            top_blocked_domains = cursor.fetchall()
        
        return {
            'period_hours': hours,
            'total_queries': total_queries,
            'blocked_queries': blocked_queries,
            'allowed_queries': total_queries - blocked_queries,
            'block_rate': round(blocked_queries / max(total_queries, 1) * 100, 2),
            'query_types': query_types,
            'top_domains': top_domains,
            'top_clients': top_clients,
            'top_blocked_domains': top_blocked_domains,
            'cache_stats': {
                'hits': self.stats_cache['cache_hits'],
                'misses': self.stats_cache['cache_misses'],
                'hit_rate': round(self.stats_cache['cache_hits'] / 
                               max(self.stats_cache['cache_hits'] + self.stats_cache['cache_misses'], 1) * 100, 2)
            },
            'upstream_stats': dict(self.stats_cache['upstream_stats'])
        }
    
    def get_recent_queries(self, limit: int = 50) -> List[Dict]:
        """
        获取最近的查询记录
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT timestamp, client_ip, domain, query_type, response_code, 
                       response_time, upstream_server, cached
                FROM dns_queries
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (limit,))
            
            queries = []
            for row in cursor.fetchall():
                queries.append({
                    'timestamp': row[0],
                    'client_ip': row[1],
                    'domain': row[2],
                    'query_type': row[3],
                    'response_code': row[4],
                    'response_time': row[5],
                    'upstream_server': row[6],
                    'cached': bool(row[7])
                })
        
        return queries
    
    def get_recent_blocked_queries(self, limit: int = 50) -> List[Dict]:
        """
        获取最近被屏蔽的查询记录
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT timestamp, client_ip, domain, reason
                FROM blocked_queries
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (limit,))
            
            blocked_queries = []
            for row in cursor.fetchall():
                blocked_queries.append({
                    'timestamp': row[0],
                    'client_ip': row[1],
                    'domain': row[2],
                    'reason': row[3]
                })
        
        return blocked_queries
    
    def get_hourly_stats(self, hours: int = 24) -> Dict:
        """
        获取按小时分组的统计数据
        """
        start_time = datetime.now() - timedelta(hours=hours)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 按小时统计查询数
            cursor.execute('''
                SELECT 
                    strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                    COUNT(*) as query_count
                FROM dns_queries
                WHERE timestamp > ?
                GROUP BY strftime('%Y-%m-%d %H', timestamp)
                ORDER BY hour
            ''', (start_time,))
            hourly_queries = cursor.fetchall()
            
            # 按小时统计屏蔽数
            cursor.execute('''
                SELECT 
                    strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                    COUNT(*) as blocked_count
                FROM blocked_queries
                WHERE timestamp > ?
                GROUP BY strftime('%Y-%m-%d %H', timestamp)
                ORDER BY hour
            ''', (start_time,))
            hourly_blocked = dict(cursor.fetchall())
        
        # 合并数据
        hourly_data = []
        for hour, query_count in hourly_queries:
            blocked_count = hourly_blocked.get(hour, 0)
            hourly_data.append({
                'hour': hour,
                'queries': query_count,
                'blocked': blocked_count,
                'allowed': query_count - blocked_count
            })
        
        return {
            'hourly_data': hourly_data
        }
    
    def get_client_stats(self, hours: int = 24) -> List[Dict]:
        """
        获取客户端统计信息
        """
        start_time = datetime.now() - timedelta(hours=hours)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT 
                    client_ip,
                    COUNT(*) as total_queries,
                    SUM(CASE WHEN cached THEN 1 ELSE 0 END) as cached_queries
                FROM dns_queries
                WHERE timestamp > ?
                GROUP BY client_ip
                ORDER BY total_queries DESC
                LIMIT 20
            ''', (start_time,))
            
            clients = []
            for row in cursor.fetchall():
                client_ip = row[0]
                total_queries = row[1]
                cached_queries = row[2]
                
                # 获取该客户端的屏蔽查询数
                cursor.execute('''
                    SELECT COUNT(*) FROM blocked_queries
                    WHERE client_ip = ? AND timestamp > ?
                ''', (client_ip, start_time))
                blocked_queries = cursor.fetchone()[0]
                
                clients.append({
                    'client_ip': client_ip,
                    'total_queries': total_queries,
                    'blocked_queries': blocked_queries,
                    'allowed_queries': total_queries - blocked_queries,
                    'cached_queries': cached_queries,
                    'block_rate': round(blocked_queries / max(total_queries, 1) * 100, 2)
                })
        
        return clients
    
    def save_config(self, key: str, value: str):
        """
        保存配置
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO dns_config (key, value, updated_at)
                VALUES (?, ?, ?)
            ''', (key, value, datetime.now()))
            conn.commit()
    
    def get_config(self, key: str, default_value: str = None) -> Optional[str]:
        """
        获取配置
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM dns_config WHERE key = ?', (key,))
            result = cursor.fetchone()
            return result[0] if result else default_value
    
    def get_all_configs(self) -> Dict[str, str]:
        """
        获取所有配置
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT key, value FROM dns_config')
            return dict(cursor.fetchall())
    
    def cleanup_old_logs(self, days: int = 30):
        """
        清理旧的日志记录
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 清理旧的查询日志
            cursor.execute('DELETE FROM dns_queries WHERE timestamp < ?', (cutoff_date,))
            queries_deleted = cursor.rowcount
            
            # 清理旧的屏蔽日志
            cursor.execute('DELETE FROM blocked_queries WHERE timestamp < ?', (cutoff_date,))
            blocked_deleted = cursor.rowcount
            
            # 清理旧的事件日志
            cursor.execute('DELETE FROM server_events WHERE timestamp < ?', (cutoff_date,))
            events_deleted = cursor.rowcount
            
            conn.commit()
        
        return {
            'queries_deleted': queries_deleted,
            'blocked_deleted': blocked_deleted,
            'events_deleted': events_deleted
        }
    
    def _load_stats_cache(self):
        """
        从数据库加载统计缓存
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # 加载总查询数
                cursor.execute('SELECT COUNT(*) FROM dns_queries')
                self.stats_cache['total_queries'] = cursor.fetchone()[0]
                
                # 加载屏蔽查询数
                cursor.execute('SELECT COUNT(*) FROM blocked_queries')
                self.stats_cache['blocked_queries'] = cursor.fetchone()[0]
                
        except Exception as e:
            print(f"加载统计缓存失败: {e}")
    
    def export_data(self, start_date: str = None, end_date: str = None) -> Dict:
        """
        导出DNS数据
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 构建查询条件
            where_clause = ""
            params = []
            if start_date:
                where_clause += " WHERE timestamp >= ?"
                params.append(start_date)
            if end_date:
                where_clause += " AND timestamp <= ?" if where_clause else " WHERE timestamp <= ?"
                params.append(end_date)
            
            # 导出查询数据
            cursor.execute(f'SELECT * FROM dns_queries{where_clause}', params)
            queries = cursor.fetchall()
            
            # 导出屏蔽数据
            cursor.execute(f'SELECT * FROM blocked_queries{where_clause}', params)
            blocked = cursor.fetchall()
        
        return {
            'queries': queries,
            'blocked': blocked,
            'export_time': datetime.now().isoformat()
        }


# 全局DNS管理器实例
dns_manager = DNSManager()


def test_dns_manager():
    """
    测试DNS管理器功能
    """
    print("测试DNS管理器...")
    
    # 测试记录查询
    dns_manager.log_query('192.168.1.100', 'baidu.com', 'A', datetime.now())
    dns_manager.log_blocked_query('192.168.1.100', 'doubleclick.net', datetime.now())
    
    # 获取统计信息
    stats = dns_manager.get_query_stats()
    print(f"查询统计: {json.dumps(stats, indent=2, ensure_ascii=False)}")
    
    # 获取最近查询
    recent = dns_manager.get_recent_queries(10)
    print(f"最近查询数量: {len(recent)}")


if __name__ == "__main__":
    test_dns_manager()