"""
系统监控API路由
"""
from flask import Blueprint, jsonify, make_response
from app.auth import auth_manager
from app.services.monitor_service import monitor_service

system_bp = Blueprint('system_api', __name__, url_prefix='/api')


@system_bp.route('/stats')
@auth_manager.login_required
def api_stats():
    """获取系统统计数据"""
    stats = monitor_service.get_all_stats(force_full=True)
    response = make_response(jsonify(stats))
    # API数据不缓存或短期缓存
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@system_bp.route('/system/info')
@auth_manager.login_required
def system_info():
    """获取系统基本信息"""
    info = monitor_service.get_system_info()
    return jsonify({
        'success': True,
        'data': info
    })


@system_bp.route('/system/health')
@auth_manager.login_required
def system_health():
    """获取系统健康状态"""
    health = monitor_service.get_system_health_info()
    return jsonify({
        'success': True,
        'data': health
    })


@system_bp.route('/system/report')
@auth_manager.login_required
def system_report():
    """获取详细系统报告"""
    report = monitor_service.get_detailed_system_report()
    return jsonify({
        'success': True,
        'data': report
    })


@system_bp.route('/system/alerts')
@auth_manager.login_required
def system_alerts():
    """获取系统警报"""
    alerts = monitor_service.get_system_alerts()
    return jsonify({
        'success': True,
        'data': alerts
    })


@system_bp.route('/system/recommendations')
@auth_manager.login_required
def system_recommendations():
    """获取性能优化建议"""
    recommendations = monitor_service.get_performance_recommendations()
    return jsonify({
        'success': True,
        'data': recommendations
    })


@system_bp.route('/cpu')
@auth_manager.login_required
def cpu_info():
    """获取CPU信息"""
    cpu = monitor_service.get_cpu_info()
    return jsonify({
        'success': True,
        'data': cpu
    })


@system_bp.route('/memory')
@auth_manager.login_required
def memory_info():
    """获取内存信息"""
    memory = monitor_service.get_memory_info()
    return jsonify({
        'success': True,
        'data': memory
    })


@system_bp.route('/disk')
@auth_manager.login_required
def disk_info():
    """获取磁盘信息"""
    disk = monitor_service.get_disk_info()
    return jsonify({
        'success': True,
        'data': disk
    })


@system_bp.route('/network')
@auth_manager.login_required
def network_info():
    """获取网络信息"""
    network = monitor_service.get_network_info()
    return jsonify({
        'success': True,
        'data': network
    })


@system_bp.route('/network/connections')
@auth_manager.login_required
def network_connections():
    """获取网络连接摘要"""
    connections = monitor_service.get_network_connections_summary()
    return jsonify({
        'success': True,
        'data': connections
    })