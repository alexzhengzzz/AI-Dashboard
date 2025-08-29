"""
DNS服务器相关API路由
"""
from flask import Blueprint, jsonify, request
from app.auth import auth_manager
from app.dns_server import dns_server
from app.dns_manager import dns_manager
from app.adblock import adblock_engine

dns_bp = Blueprint('dns_api', __name__, url_prefix='/api/dns')


@dns_bp.route('/status')
@auth_manager.login_required
def dns_status():
    """获取DNS服务器状态"""
    try:
        status = dns_server.get_status()
        stats = dns_manager.get_query_stats()
        adblock_stats = adblock_engine.get_stats()
        
        return jsonify({
            'success': True,
            'dns_server': status,
            'query_stats': stats,
            'adblock_stats': adblock_stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取DNS状态失败: {str(e)}'
        }), 500


@dns_bp.route('/start', methods=['POST'])
@auth_manager.login_required
def dns_start():
    """启动DNS服务器"""
    try:
        success, message = dns_server.start()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'启动DNS服务器失败: {str(e)}'
        }), 500


@dns_bp.route('/stop', methods=['POST'])
@auth_manager.login_required
def dns_stop():
    """停止DNS服务器"""
    try:
        success, message = dns_server.stop()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'停止DNS服务器失败: {str(e)}'
        }), 500


@dns_bp.route('/restart', methods=['POST'])
@auth_manager.login_required
def dns_restart():
    """重启DNS服务器"""
    try:
        success, message = dns_server.restart()
        return jsonify({
            'success': success,
            'message': message
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'重启DNS服务器失败: {str(e)}'
        }), 500


@dns_bp.route('/queries/recent')
@auth_manager.login_required
def dns_recent_queries():
    """获取最近的DNS查询"""
    try:
        limit = request.args.get('limit', 50, type=int)
        queries = dns_manager.get_recent_queries(limit)
        blocked_queries = dns_manager.get_recent_blocked_queries(limit)
        
        return jsonify({
            'success': True,
            'queries': queries,
            'blocked_queries': blocked_queries
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取查询记录失败: {str(e)}'
        }), 500


@dns_bp.route('/stats/hourly')
@auth_manager.login_required
def dns_hourly_stats():
    """获取按小时分组的DNS统计"""
    try:
        hours = request.args.get('hours', 24, type=int)
        stats = dns_manager.get_hourly_stats(hours)
        return jsonify({
            'success': True,
            'data': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取小时统计失败: {str(e)}'
        }), 500


@dns_bp.route('/clients')
@auth_manager.login_required
def dns_client_stats():
    """获取DNS客户端统计"""
    try:
        hours = request.args.get('hours', 24, type=int)
        clients = dns_manager.get_client_stats(hours)
        return jsonify({
            'success': True,
            'clients': clients
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取客户端统计失败: {str(e)}'
        }), 500


@dns_bp.route('/blocklist/update', methods=['POST'])
@auth_manager.login_required
def update_blocklist():
    """更新广告屏蔽列表"""
    try:
        results = adblock_engine.update_blocklists()
        return jsonify({
            'success': True,
            'results': results,
            'message': '屏蔽列表更新完成'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'更新屏蔽列表失败: {str(e)}'
        }), 500


@dns_bp.route('/whitelist', methods=['GET', 'POST', 'DELETE'])
@auth_manager.login_required
def manage_whitelist():
    """管理DNS白名单"""
    try:
        if request.method == 'GET':
            # 获取白名单
            whitelist = list(adblock_engine.whitelist_domains)
            return jsonify({
                'success': True,
                'whitelist': whitelist
            })
        
        elif request.method == 'POST':
            # 添加到白名单
            domain = request.json.get('domain', '').strip()
            if domain:
                adblock_engine.add_to_whitelist(domain)
                return jsonify({
                    'success': True,
                    'message': f'域名 {domain} 已添加到白名单'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '域名不能为空'
                }), 400
        
        elif request.method == 'DELETE':
            # 从白名单移除
            domain = request.json.get('domain', '').strip()
            if domain:
                adblock_engine.remove_from_whitelist(domain)
                return jsonify({
                    'success': True,
                    'message': f'域名 {domain} 已从白名单移除'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '域名不能为空'
                }), 400
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'白名单操作失败: {str(e)}'
        }), 500


@dns_bp.route('/cache/clear', methods=['POST'])
@auth_manager.login_required
def clear_dns_cache():
    """清空DNS缓存"""
    try:
        dns_server.resolver.clear_cache()
        return jsonify({
            'success': True,
            'message': 'DNS缓存已清空'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'清空DNS缓存失败: {str(e)}'
        }), 500


@dns_bp.route('/config')
@auth_manager.login_required
def dns_config():
    """获取DNS服务器配置"""
    try:
        config = {
            'upstream_servers': dns_server.upstream_servers,
            'port': dns_server.port,
            'bind_host': getattr(dns_server, 'bind_host', '0.0.0.0'),
            'cache_size': getattr(dns_server.resolver, 'cache_size', 1000) if hasattr(dns_server, 'resolver') else 1000,
            'blocklist_count': len(adblock_engine.blocked_domains),
            'whitelist_count': len(adblock_engine.whitelist_domains)
        }
        
        return jsonify({
            'success': True,
            'config': config
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取DNS配置失败: {str(e)}'
        }), 500


@dns_bp.route('/test', methods=['POST'])
@auth_manager.login_required
def dns_test():
    """测试DNS解析"""
    try:
        domain = request.json.get('domain', '').strip()
        if not domain:
            return jsonify({
                'success': False,
                'message': '域名不能为空'
            }), 400
        
        # 这里可以实现DNS测试逻辑
        # 暂时返回基本信息
        return jsonify({
            'success': True,
            'domain': domain,
            'message': f'DNS测试功能待实现: {domain}'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'DNS测试失败: {str(e)}'
        }), 500