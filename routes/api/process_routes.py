"""
进程管理API路由
"""
from flask import Blueprint, jsonify, request
from app.auth import auth_manager
from app.services.monitor_service import monitor_service

process_bp = Blueprint('process_api', __name__, url_prefix='/api')


@process_bp.route('/processes/memory')
@auth_manager.login_required
def memory_processes():
    """获取内存使用排行"""
    min_memory_mb = request.args.get('min_memory_mb', 10, type=int)
    limit = request.args.get('limit', 20, type=int)
    
    processes = monitor_service.get_memory_top_processes(min_memory_mb, limit)
    return jsonify({
        'success': True,
        'data': processes
    })


@process_bp.route('/processes/stats')
@auth_manager.login_required
def process_stats():
    """获取进程统计摘要"""
    stats = monitor_service.get_system_stats_summary()
    return jsonify({
        'success': True,
        'data': stats
    })


@process_bp.route('/kill_port_process/<int:port>', methods=['POST'])
@auth_manager.login_required
def kill_port_process(port):
    """根据端口号关闭进程"""
    try:
        result = monitor_service.kill_process_by_port(port)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'操作失败: {str(e)}'
        }), 500


@process_bp.route('/kill_process/<int:pid>', methods=['POST'])
@auth_manager.login_required
def kill_process_by_pid(pid):
    """根据PID关闭进程"""
    try:
        result = monitor_service.kill_process_by_pid(pid)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'操作失败: {str(e)}'
        }), 500


@process_bp.route('/ports')
@auth_manager.login_required
def port_info():
    """获取端口状态信息"""
    ports = monitor_service.get_port_info()
    return jsonify({
        'success': True,
        'data': ports
    })


@process_bp.route('/services')
@auth_manager.login_required
def services_status():
    """获取服务状态"""
    services = monitor_service.get_services_status()
    return jsonify({
        'success': True,
        'data': services
    })