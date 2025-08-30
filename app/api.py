from flask import Blueprint, jsonify, request, make_response
from .auth import auth_manager
from .monitor import monitor
from .dns_server import dns_server
from .dns_manager import dns_manager
from .adblock import adblock_engine

api = Blueprint('api', __name__)

@api.route('/stats')
@auth_manager.login_required
def api_stats():
    stats = monitor.get_all_stats(force_full=True)
    response = make_response(jsonify(stats))
    # API数据不缓存或短期缓存
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@api.route('/kill_port_process/<int:port>', methods=['POST'])
@auth_manager.login_required
def kill_port_process(port):
    try:
        result = monitor.kill_process_by_port(port)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'操作失败: {str(e)}'
        })

@api.route('/kill_process/<int:pid>', methods=['POST'])
@auth_manager.login_required
def kill_process_by_pid(pid):
    try:
        result = monitor.kill_process_by_pid(pid)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'操作失败: {str(e)}'
        }), 500

# DNS相关API路由
@api.route('/dns/status')
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

@api.route('/dns/start', methods=['POST'])
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

@api.route('/dns/stop', methods=['POST'])
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

@api.route('/dns/restart', methods=['POST'])
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

@api.route('/dns/queries/recent')
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

@api.route('/dns/stats/hourly')
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

@api.route('/dns/clients')
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

@api.route('/dns/blocklist/update', methods=['POST'])
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

@api.route('/dns/whitelist', methods=['GET', 'POST', 'DELETE'])
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

@api.route('/dns/cache/clear', methods=['POST'])
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
