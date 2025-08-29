import os
import re
import time
import threading
from datetime import datetime
from typing import Dict, List, Set, Optional
from urllib.parse import urlparse

import requests
import aiofiles


class AdblockEngine:
    """
    广告屏蔽引擎，支持多种广告屏蔽列表格式
    """
    
    def __init__(self, data_dir='data/blocklists'):
        self.data_dir = data_dir
        self.blocked_domains: Set[str] = set()
        self.whitelist_domains: Set[str] = set()
        self.blocklist_sources = {
            'easylist': {
                'url': 'https://easylist.to/easylist/easylist.txt',
                'type': 'adblock_plus',
                'enabled': True
            },
            'easylist_china': {
                'url': 'https://easylist-downloads.adblockplus.org/easylistchina.txt',
                'type': 'adblock_plus',
                'enabled': True
            },
            'adguard_base': {
                'url': 'https://filters.adtidy.org/extension/chromium/filters/2.txt',
                'type': 'adblock_plus',
                'enabled': True
            },
            'steven_black': {
                'url': 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
                'type': 'hosts',
                'enabled': True
            },
            'malware_domains': {
                'url': 'https://mirror1.malwaredomains.com/files/justdomains',
                'type': 'domains',
                'enabled': True
            }
        }
        
        # 统计信息
        self.total_blocked_domains = 0
        self.last_update = None
        self.update_thread = None
        self.auto_update_enabled = True
        self.auto_update_interval = 86400  # 24小时
        
        # 创建数据目录
        os.makedirs(self.data_dir, exist_ok=True)
        
        # 加载本地屏蔽列表
        self._load_local_blocklists()
        
        # 启动自动更新
        if self.auto_update_enabled:
            self._start_auto_update()
    
    def is_blocked(self, domain: str) -> bool:
        """
        检查域名是否被屏蔽
        """
        domain = domain.lower().strip('.')
        
        # 检查白名单
        if self._is_whitelisted(domain):
            return False
        
        # 检查是否直接匹配
        if domain in self.blocked_domains:
            return True
        
        # 检查子域名
        parts = domain.split('.')
        for i in range(len(parts)):
            subdomain = '.'.join(parts[i:])
            if subdomain in self.blocked_domains:
                return True
        
        return False
    
    def _is_whitelisted(self, domain: str) -> bool:
        """
        检查域名是否在白名单中
        """
        domain = domain.lower().strip('.')
        
        if domain in self.whitelist_domains:
            return True
        
        # 检查子域名白名单
        parts = domain.split('.')
        for i in range(len(parts)):
            subdomain = '.'.join(parts[i:])
            if subdomain in self.whitelist_domains:
                return True
        
        return False
    
    def add_to_whitelist(self, domain: str):
        """
        添加域名到白名单
        """
        domain = domain.lower().strip('.')
        self.whitelist_domains.add(domain)
        self._save_whitelist()
    
    def remove_from_whitelist(self, domain: str):
        """
        从白名单移除域名
        """
        domain = domain.lower().strip('.')
        self.whitelist_domains.discard(domain)
        self._save_whitelist()
    
    def add_to_blocklist(self, domain: str):
        """
        添加域名到自定义屏蔽列表
        """
        domain = domain.lower().strip('.')
        self.blocked_domains.add(domain)
        self._save_custom_blocklist()
    
    def remove_from_blocklist(self, domain: str):
        """
        从屏蔽列表移除域名
        """
        domain = domain.lower().strip('.')
        self.blocked_domains.discard(domain)
        self._save_custom_blocklist()
    
    def update_blocklists(self, force=False) -> Dict[str, bool]:
        """
        更新所有屏蔽列表
        """
        results = {}
        
        for name, source in self.blocklist_sources.items():
            if not source['enabled']:
                continue
                
            try:
                print(f"正在更新 {name}...")
                success = self._download_and_parse_blocklist(name, source)
                results[name] = success
                
                if success:
                    print(f"{name} 更新成功")
                else:
                    print(f"{name} 更新失败")
                    
            except Exception as e:
                print(f"更新 {name} 时出错: {e}")
                results[name] = False
        
        # 重新加载所有屏蔽列表
        self._load_local_blocklists()
        self.last_update = datetime.now()
        
        return results
    
    def _download_and_parse_blocklist(self, name: str, source: Dict) -> bool:
        """
        下载并解析屏蔽列表
        """
        try:
            # 下载屏蔽列表
            headers = {
                'User-Agent': 'DNS-AdBlock/1.0 (+https://example.com/)'
            }
            response = requests.get(source['url'], headers=headers, timeout=30)
            response.raise_for_status()
            
            # 解析内容
            domains = set()
            content = response.text
            
            if source['type'] == 'hosts':
                domains = self._parse_hosts_format(content)
            elif source['type'] == 'adblock_plus':
                domains = self._parse_adblock_plus_format(content)
            elif source['type'] == 'domains':
                domains = self._parse_domains_format(content)
            
            # 保存到文件
            filename = os.path.join(self.data_dir, f'{name}.txt')
            with open(filename, 'w', encoding='utf-8') as f:
                for domain in sorted(domains):
                    f.write(f"{domain}\n")
            
            print(f"{name}: 加载了 {len(domains)} 个域名")
            return True
            
        except Exception as e:
            print(f"下载 {name} 失败: {e}")
            return False
    
    def _parse_hosts_format(self, content: str) -> Set[str]:
        """
        解析hosts文件格式
        """
        domains = set()
        
        for line in content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            parts = line.split()
            if len(parts) >= 2:
                ip = parts[0]
                domain = parts[1]
                
                # 只处理屏蔽IP (0.0.0.0, 127.0.0.1等)
                if ip in ['0.0.0.0', '127.0.0.1', '::1', '::']:
                    domain = domain.lower().strip('.')
                    if self._is_valid_domain(domain):
                        domains.add(domain)
        
        return domains
    
    def _parse_adblock_plus_format(self, content: str) -> Set[str]:
        """
        解析AdBlock Plus格式
        """
        domains = set()
        
        for line in content.split('\n'):
            line = line.strip()
            if not line or line.startswith('!') or line.startswith('['):
                continue
            
            # 简单的域名提取
            if '||' in line:
                # ||example.com^ 格式
                match = re.search(r'\|\|([^/\^]+)', line)
                if match:
                    domain = match.group(1).lower().strip('.')
                    if self._is_valid_domain(domain):
                        domains.add(domain)
            elif line.startswith('@@'):
                # 白名单规则，暂时跳过
                continue
            else:
                # 尝试提取域名
                domain_match = re.search(r'([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', line)
                if domain_match:
                    domain = domain_match.group(1).lower().strip('.')
                    if self._is_valid_domain(domain):
                        domains.add(domain)
        
        return domains
    
    def _parse_domains_format(self, content: str) -> Set[str]:
        """
        解析纯域名列表格式
        """
        domains = set()
        
        for line in content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            domain = line.lower().strip('.')
            if self._is_valid_domain(domain):
                domains.add(domain)
        
        return domains
    
    def _is_valid_domain(self, domain: str) -> bool:
        """
        验证域名格式
        """
        if not domain or domain == 'localhost':
            return False
        
        # 基本域名格式检查
        if not re.match(r'^[a-zA-Z0-9.-]+$', domain):
            return False
        
        if '..' in domain or domain.startswith('.') or domain.endswith('.'):
            return False
        
        parts = domain.split('.')
        if len(parts) < 2:
            return False
        
        # 检查TLD
        tld = parts[-1]
        if not re.match(r'^[a-zA-Z]{2,}$', tld):
            return False
        
        return True
    
    def _load_local_blocklists(self):
        """
        加载本地屏蔽列表文件
        """
        self.blocked_domains.clear()
        
        # 加载下载的屏蔽列表
        for name in self.blocklist_sources.keys():
            filename = os.path.join(self.data_dir, f'{name}.txt')
            if os.path.exists(filename):
                try:
                    with open(filename, 'r', encoding='utf-8') as f:
                        for line in f:
                            domain = line.strip().lower()
                            if domain and self._is_valid_domain(domain):
                                self.blocked_domains.add(domain)
                except Exception as e:
                    print(f"加载 {filename} 失败: {e}")
        
        # 加载自定义屏蔽列表
        custom_file = os.path.join(self.data_dir, 'custom_blocklist.txt')
        if os.path.exists(custom_file):
            try:
                with open(custom_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        domain = line.strip().lower()
                        if domain and self._is_valid_domain(domain):
                            self.blocked_domains.add(domain)
            except Exception as e:
                print(f"加载自定义屏蔽列表失败: {e}")
        
        # 加载白名单
        whitelist_file = os.path.join(self.data_dir, 'whitelist.txt')
        if os.path.exists(whitelist_file):
            try:
                with open(whitelist_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        domain = line.strip().lower()
                        if domain and self._is_valid_domain(domain):
                            self.whitelist_domains.add(domain)
            except Exception as e:
                print(f"加载白名单失败: {e}")
        
        self.total_blocked_domains = len(self.blocked_domains)
        print(f"总共加载了 {self.total_blocked_domains} 个屏蔽域名")
    
    def _save_custom_blocklist(self):
        """
        保存自定义屏蔽列表
        """
        filename = os.path.join(self.data_dir, 'custom_blocklist.txt')
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                for domain in sorted(self.blocked_domains):
                    f.write(f"{domain}\n")
        except Exception as e:
            print(f"保存自定义屏蔽列表失败: {e}")
    
    def _save_whitelist(self):
        """
        保存白名单
        """
        filename = os.path.join(self.data_dir, 'whitelist.txt')
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                for domain in sorted(self.whitelist_domains):
                    f.write(f"{domain}\n")
        except Exception as e:
            print(f"保存白名单失败: {e}")
    
    def _start_auto_update(self):
        """
        启动自动更新线程
        """
        def update_worker():
            while self.auto_update_enabled:
                try:
                    # 如果从未更新过，或者超过更新间隔，则执行更新
                    if (not self.last_update or 
                        (datetime.now() - self.last_update).total_seconds() > self.auto_update_interval):
                        print("开始自动更新屏蔽列表...")
                        self.update_blocklists()
                    
                    # 每小时检查一次
                    time.sleep(3600)
                    
                except Exception as e:
                    print(f"自动更新出错: {e}")
                    time.sleep(3600)
        
        self.update_thread = threading.Thread(target=update_worker, daemon=True)
        self.update_thread.start()
    
    def get_stats(self) -> Dict:
        """
        获取屏蔽引擎统计信息
        """
        return {
            'total_blocked_domains': self.total_blocked_domains,
            'whitelist_domains': len(self.whitelist_domains),
            'last_update': self.last_update.isoformat() if self.last_update else None,
            'auto_update_enabled': self.auto_update_enabled,
            'blocklist_sources': {
                name: source['enabled'] 
                for name, source in self.blocklist_sources.items()
            }
        }
    
    def get_top_blocked_domains(self, limit=10) -> List[str]:
        """
        获取最常见的屏蔽域名（示例）
        """
        # 这里可以基于实际的查询统计返回
        # 目前返回一些常见的广告域名示例
        common_ad_domains = [
            'doubleclick.net',
            'googleadservices.com',
            'googlesyndication.com',
            'googletagmanager.com',
            'facebook.com',
            'google-analytics.com',
            'scorecardresearch.com',
            'amazon-adsystem.com',
            'adsystem.amazon.com',
            'amazon.adsystem.com'
        ]
        
        blocked_common = [d for d in common_ad_domains if d in self.blocked_domains]
        return blocked_common[:limit]
    
    def enable_blocklist_source(self, name: str):
        """
        启用屏蔽列表源
        """
        if name in self.blocklist_sources:
            self.blocklist_sources[name]['enabled'] = True
    
    def disable_blocklist_source(self, name: str):
        """
        禁用屏蔽列表源
        """
        if name in self.blocklist_sources:
            self.blocklist_sources[name]['enabled'] = False


# 全局广告屏蔽引擎实例
adblock_engine = AdblockEngine()


def test_adblock_engine():
    """
    测试广告屏蔽引擎
    """
    print("测试广告屏蔽引擎...")
    
    # 测试一些域名
    test_domains = [
        'baidu.com',  # 正常域名
        'doubleclick.net',  # 广告域名
        'google.com',  # 正常域名
        'googleadservices.com',  # 广告域名
        'example.com'  # 正常域名
    ]
    
    for domain in test_domains:
        blocked = adblock_engine.is_blocked(domain)
        print(f"{domain}: {'屏蔽' if blocked else '允许'}")
    
    # 显示统计
    stats = adblock_engine.get_stats()
    print(f"统计信息: {stats}")


if __name__ == "__main__":
    test_adblock_engine()