import socket
import socketserver
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Set

import dns.resolver
import dns.message
import dns.query
import dns.name
import dns.rdatatype
import dns.rdataclass
import dns.rrset
import dns.rdata

from .dns_manager import dns_manager
from .adblock import adblock_engine


class CustomDNSResolver:
    """
    自定义DNS解析器，支持广告屏蔽和统计功能
    """
    
    def __init__(self):
        self.upstream_servers = [
            '8.8.8.8',  # Google DNS
            '1.1.1.1',  # Cloudflare DNS
            '114.114.114.114',  # 114 DNS
            '223.5.5.5'  # 阿里DNS
        ]
        self.cache: Dict[str, Tuple[dns.message.Message, float]] = {}
        self.cache_ttl = 300  # 5分钟缓存
        self.query_count = 0
        self.blocked_count = 0
        self.running = False
        
    def resolve(self, request: dns.message.Message, client_address: tuple) -> dns.message.Message:
        """
        DNS查询解析入口点
        """
        # 创建响应消息
        response = dns.message.make_response(request)
        
        # 获取查询信息
        if not request.question:
            response.set_rcode(dns.rcode.FORMERR)
            return response
            
        question = request.question[0]
        qname = str(question.name).rstrip('.')
        qtype = question.rdtype
        client_ip = client_address[0] if client_address else 'unknown'
        
        self.query_count += 1
        
        # 记录DNS查询
        dns_manager.log_query(
            client_ip=client_ip,
            domain=qname,
            query_type=dns.rdatatype.to_text(qtype),
            timestamp=datetime.now()
        )
        
        try:
            # 检查是否为广告域名
            if adblock_engine.is_blocked(qname):
                self.blocked_count += 1
                dns_manager.log_blocked_query(client_ip, qname, datetime.now())
                
                # 返回空响应（NXDOMAIN 或 0.0.0.0）
                if qtype == dns.rdatatype.A:
                    rrset = dns.rrset.from_text(question.name, 60, dns.rdataclass.IN, dns.rdatatype.A, '0.0.0.0')
                    response.answer.append(rrset)
                elif qtype == dns.rdatatype.AAAA:
                    rrset = dns.rrset.from_text(question.name, 60, dns.rdataclass.IN, dns.rdatatype.AAAA, '::')
                    response.answer.append(rrset)
                else:
                    response.set_rcode(dns.rcode.NXDOMAIN)
                    
                return response
            
            # 检查缓存
            cache_key = f"{qname}:{qtype}"
            if cache_key in self.cache:
                cached_reply, cache_time = self.cache[cache_key]
                if time.time() - cache_time < self.cache_ttl:
                    dns_manager.record_cache_hit()
                    return cached_reply
            
            # 执行上游DNS查询
            upstream_reply = self._query_upstream(qname, qtype, request.id)
            if upstream_reply:
                # 缓存结果
                self.cache[cache_key] = (upstream_reply, time.time())
                dns_manager.record_cache_miss()
                return upstream_reply
            else:
                # 查询失败，返回SERVFAIL
                response.set_rcode(dns.rcode.SERVFAIL)
                return response
                
        except Exception as e:
            print(f"DNS解析错误: {e}")
            response.set_rcode(dns.rcode.SERVFAIL)
            return response
    
    def _query_upstream(self, domain: str, qtype: int, query_id: int) -> Optional[dns.message.Message]:
        """
        向上游DNS服务器查询
        """
        for upstream in self.upstream_servers:
            try:
                # 构建查询消息
                query = dns.message.make_query(domain, qtype)
                query.id = query_id
                
                # 向上游服务器发送查询
                response = dns.query.udp(query, upstream, timeout=3)
                
                if response and response.answer:
                    dns_manager.record_upstream_query(upstream, True)
                    return response
                    
            except Exception as e:
                print(f"上游DNS查询失败 {upstream}: {e}")
                dns_manager.record_upstream_query(upstream, False)
                continue
        
        return None
    
    def get_stats(self) -> Dict:
        """
        获取DNS服务器统计信息
        """
        return {
            'total_queries': self.query_count,
            'blocked_queries': self.blocked_count,
            'block_rate': round(self.blocked_count / max(self.query_count, 1) * 100, 2),
            'cache_size': len(self.cache),
            'upstream_servers': self.upstream_servers,
            'running': self.running
        }
    
    def clear_cache(self):
        """
        清空DNS缓存
        """
        self.cache.clear()
        
    def update_upstream_servers(self, servers: List[str]):
        """
        更新上游DNS服务器列表
        """
        self.upstream_servers = servers


class DNSRequestHandler(socketserver.BaseRequestHandler):
    """
    DNS请求处理器
    """
    
    def handle(self):
        """处理DNS请求"""
        try:
            data, sock = self.request
            client_address = self.client_address
            
            # 解析DNS请求
            try:
                request = dns.message.from_wire(data)
            except Exception as e:
                print(f"解析DNS请求失败: {e}")
                return
                
            # 使用解析器处理请求
            response = self.server.resolver.resolve(request, client_address)
            
            # 发送响应
            response_data = response.to_wire()
            sock.sendto(response_data, client_address)
            
        except Exception as e:
            print(f"处理DNS请求错误: {e}")


class AsyncDNSServer:
    """
    异步DNS服务器管理器
    """
    
    def __init__(self, host='0.0.0.0', port=8053):
        self.host = host
        self.port = port
        self.resolver = CustomDNSResolver()
        self.server = None
        self.server_thread = None
        self.running = False
        self.start_time = None
        
    def start(self):
        """
        启动DNS服务器
        """
        if self.running:
            return False, "DNS服务器已在运行"
            
        try:
            # 创建UDP服务器
            self.server = socketserver.UDPServer((self.host, self.port), DNSRequestHandler)
            self.server.resolver = self.resolver
            
            # 启动服务器线程
            self.server_thread = threading.Thread(target=self._run_server, daemon=True)
            self.server_thread.start()
            
            # 等待服务器启动
            time.sleep(1)
            
            self.running = True
            self.resolver.running = True
            self.start_time = time.time()
            
            dns_manager.log_server_event('DNS服务器启动', f'{self.host}:{self.port}')
            return True, f"DNS服务器已启动在 {self.host}:{self.port}"
            
        except Exception as e:
            return False, f"DNS服务器启动失败: {str(e)}"
    
    def stop(self):
        """
        停止DNS服务器
        """
        if not self.running:
            return False, "DNS服务器未运行"
            
        try:
            if self.server:
                self.server.shutdown()
                self.server.server_close()
            self.running = False
            self.resolver.running = False
            self.start_time = None
            
            dns_manager.log_server_event('DNS服务器停止', f'{self.host}:{self.port}')
            return True, "DNS服务器已停止"
            
        except Exception as e:
            return False, f"DNS服务器停止失败: {str(e)}"
    
    def _run_server(self):
        """
        在后台线程中运行DNS服务器
        """
        try:
            self.server.serve_forever()
        except Exception as e:
            print(f"DNS服务器运行错误: {e}")
            self.running = False
            self.resolver.running = False
    
    def is_running(self) -> bool:
        """
        检查DNS服务器是否正在运行
        """
        return self.running
    
    def get_status(self) -> Dict:
        """
        获取DNS服务器状态
        """
        uptime = 0
        if self.running and self.start_time:
            uptime = max(0, int(time.time() - self.start_time))
            
        return {
            'running': self.running,
            'host': self.host,
            'port': self.port,
            'stats': self.resolver.get_stats(),
            'uptime': uptime
        }
    
    def restart(self):
        """
        重启DNS服务器
        """
        self.stop()
        time.sleep(2)
        return self.start()


# 全局DNS服务器实例
dns_server = AsyncDNSServer()


def test_dns_server():
    """
    测试DNS服务器功能
    """
    print("测试DNS服务器...")
    
    # 启动服务器
    success, message = dns_server.start()
    print(f"启动结果: {success}, {message}")
    
    if success:
        time.sleep(2)
        
        # 测试DNS查询
        try:
            import subprocess
            result = subprocess.run(['dig', '@127.0.0.1', '-p', str(dns_server.port), 'baidu.com', '+short'], 
                                 capture_output=True, text=True, timeout=5)
            print(f"测试查询结果: {result.stdout}")
        except Exception as e:
            print(f"测试查询失败: {e}")
        
        # 显示统计
        stats = dns_server.get_status()
        print(f"服务器状态: {stats}")
        
        # 停止服务器
        dns_server.stop()


if __name__ == "__main__":
    test_dns_server()