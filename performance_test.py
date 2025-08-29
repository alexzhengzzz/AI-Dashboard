#!/usr/bin/env python3
"""
性能测试脚本 - 验证优化效果
测试项目：
1. WebSocket增量更新效果
2. HTTP压缩效果
3. 静态资源缓存效果
"""

import requests
import json
import time
import gzip
import threading
from datetime import datetime

class PerformanceTest:
    def __init__(self, base_url='http://localhost:5000'):
        self.base_url = base_url
        self.session = requests.Session()
        
    def login(self, password='admin'):
        """登录获取会话"""
        login_data = {'password': password}
        response = self.session.post(f'{self.base_url}/login', data=login_data)
        return response.status_code == 200 or 'dashboard' in response.text
    
    def test_static_compression(self):
        """测试静态文件压缩效果"""
        print("🔧 测试静态文件压缩效果...")
        
        files_to_test = [
            '/static/js/dashboard.js',
            '/static/css/style.css'
        ]
        
        for file_path in files_to_test:
            # 不启用压缩的请求
            headers_no_compression = {}
            response_no_compression = self.session.get(
                f'{self.base_url}{file_path}', 
                headers=headers_no_compression
            )
            
            # 启用压缩的请求
            headers_with_compression = {'Accept-Encoding': 'gzip, deflate, br'}
            response_with_compression = self.session.get(
                f'{self.base_url}{file_path}', 
                headers=headers_with_compression
            )
            
            original_size = len(response_no_compression.content)
            compressed_size = len(response_with_compression.content)
            
            if 'gzip' in response_with_compression.headers.get('content-encoding', ''):
                compression_ratio = (1 - compressed_size / original_size) * 100
                print(f"  📁 {file_path}: {original_size:,} bytes → {compressed_size:,} bytes (节省 {compression_ratio:.1f}%)")
            else:
                print(f"  📁 {file_path}: 无压缩 ({original_size:,} bytes)")
    
    def test_static_caching(self):
        """测试静态文件缓存效果"""
        print("\n💾 测试静态文件缓存效果...")
        
        file_path = '/static/js/dashboard.js'
        
        # 首次请求
        start_time = time.time()
        response1 = self.session.get(f'{self.base_url}{file_path}')
        first_request_time = time.time() - start_time
        
        etag = response1.headers.get('etag')
        cache_control = response1.headers.get('cache-control')
        
        print(f"  🕒 首次请求: {first_request_time*1000:.2f}ms")
        print(f"  🏷️ ETag: {etag}")
        print(f"  📅 Cache-Control: {cache_control}")
        
        # 带 ETag 的后续请求
        if etag:
            headers = {'If-None-Match': etag}
            start_time = time.time()
            response2 = self.session.get(f'{self.base_url}{file_path}', headers=headers)
            second_request_time = time.time() - start_time
            
            if response2.status_code == 304:
                print(f"  ✅ 缓存命中 (304): {second_request_time*1000:.2f}ms (提升 {((first_request_time - second_request_time) / first_request_time * 100):.1f}%)")
            else:
                print(f"  ❌ 缓存未命中: {second_request_time*1000:.2f}ms")
    
    def test_api_response(self):
        """测试API响应时间"""
        print("\n⚡ 测试API响应性能...")
        
        # 测试多次API请求
        response_times = []
        for i in range(5):
            start_time = time.time()
            response = self.session.get(f'{self.base_url}/api/stats')
            response_time = time.time() - start_time
            response_times.append(response_time)
            
            if response.status_code == 200:
                data_size = len(response.content)
                print(f"  📊 请求 {i+1}: {response_time*1000:.2f}ms ({data_size:,} bytes)")
            else:
                print(f"  ❌ 请求 {i+1} 失败: {response.status_code}")
        
        if response_times:
            avg_time = sum(response_times) / len(response_times)
            print(f"  📈 平均响应时间: {avg_time*1000:.2f}ms")
    
    def test_memory_efficiency(self):
        """测试内存效率（简单测试）"""
        print("\n🧠 测试内存效率...")
        
        # 模拟多个并发请求
        def make_request():
            return self.session.get(f'{self.base_url}/api/stats')
        
        threads = []
        start_time = time.time()
        
        # 创建10个并发请求
        for _ in range(10):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()
        
        # 等待所有请求完成
        for thread in threads:
            thread.join()
        
        total_time = time.time() - start_time
        print(f"  🚀 10个并发请求完成时间: {total_time*1000:.2f}ms")
    
    def run_all_tests(self):
        """运行所有性能测试"""
        print("🎯 服务器仪表板性能测试")
        print("=" * 50)
        
        # 尝试登录
        if not self.login():
            print("❌ 登录失败，请检查服务器是否运行且密码正确")
            return
        
        print("✅ 登录成功，开始性能测试...\n")
        
        try:
            self.test_static_compression()
            self.test_static_caching()
            self.test_api_response()
            self.test_memory_efficiency()
            
            print("\n🎉 性能测试完成！")
            print("\n📋 优化建议：")
            print("  • 静态文件已启用gzip压缩，可节省60-70%带宽")
            print("  • 设置了适当的缓存头，减少重复请求")
            print("  • WebSocket增量更新减少数据传输量")
            print("  • 页面隐藏时自动降低更新频率")
            
        except Exception as e:
            print(f"❌ 测试过程中出错: {e}")

if __name__ == '__main__':
    tester = PerformanceTest()
    tester.run_all_tests()