/**
 * 重构后的主Dashboard类 - 整合所有模块
 */

class Dashboard extends DashboardCore {
    constructor() {
        super();
        
        // 初始化子模块
        this.monitoringModule = new MonitoringModule(this);
        this.processModule = new ProcessModule(this);
        this.terminalModule = null; // 按需加载
        this.dnsModule = null; // 按需加载
        
        // 健康状态
        this.healthStatus = null;
        
        // 启动自动刷新
        this.startDataRefresh();
        
        // 初始化交互事件
        this.initializeOverviewInteractions();
        
        console.log('重构后的Dashboard已初始化');
    }
    
    /**
     * 启动数据自动刷新
     */
    startDataRefresh() {
        // 立即请求一次数据
        this.requestStats();
        
        // 设置定时刷新
        setInterval(() => {
            if (this.isPageVisible && this.socket.connected) {
                this.requestStats();
            }
        }, this.updateInterval);
    }
    
    /**
     * 初始化概览页面交互
     */
    initializeOverviewInteractions() {
        // 监控面板点击跳转
        document.querySelectorAll('.monitor-item[data-tab]').forEach(item => {
            item.addEventListener('click', () => {
                const tabName = item.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });
        
        // 统计项点击跳转
        document.querySelectorAll('.stat-item[data-tab]').forEach(item => {
            item.addEventListener('click', () => {
                const tabName = item.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });
        
        // 导航按钮点击
        document.querySelectorAll('.nav-btn[data-tab]').forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });
        
        // 添加hover效果
        this.addHoverEffects();
    }
    
    /**
     * 添加hover效果
     */
    addHoverEffects() {
        // 为可点击的卡片添加hover样式
        const clickableItems = document.querySelectorAll('.monitor-item[data-tab], .stat-item[data-tab]');
        clickableItems.forEach(item => {
            item.style.cursor = 'pointer';
            item.addEventListener('mouseenter', () => {
                item.style.transform = 'translateY(-2px)';
                item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                item.style.transition = 'all 0.2s ease';
            });
            item.addEventListener('mouseleave', () => {
                item.style.transform = 'translateY(0)';
                item.style.boxShadow = '';
            });
        });
    }
    
    /**
     * 标签页切换处理
     */
    onTabSwitch(tabName) {
        switch (tabName) {
            case 'terminal':
                this.loadTerminalModule();
                break;
            case 'dns':
                this.loadDNSModule();
                break;
            case 'processes':
                // 进程页面切换时刷新数据
                this.requestStats();
                break;
        }
    }
    
    /**
     * 按需加载终端模块
     */
    async loadTerminalModule() {
        if (this.terminalModule) return;
        
        try {
            // 动态加载终端模块
            if (typeof TerminalModule === 'undefined') {
                await this.loadScript('/static/js/modules/terminal.js');
            }
            
            this.terminalModule = new TerminalModule(this);
            console.log('终端模块已加载');
        } catch (error) {
            console.error('加载终端模块失败:', error);
            this.showError('终端功能加载失败');
        }
    }
    
    /**
     * 按需加载DNS模块
     */
    async loadDNSModule() {
        if (this.dnsModule) return;
        
        try {
            // 动态加载DNS模块
            if (typeof DNSModule === 'undefined') {
                await this.loadScript('/static/js/modules/dns.js');
            }
            
            this.dnsModule = new DNSModule(this);
            console.log('DNS模块已加载');
        } catch (error) {
            console.error('加载DNS模块失败:', error);
            this.showError('DNS功能加载失败');
        }
    }
    
    /**
     * 动态加载脚本
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * 更新仪表板 - 主更新方法
     */
    updateDashboard(data) {
        if (!data) return;
        
        // 更新时间戳
        this.updateTimestamp(data.timestamp);
        
        // 更新各个模块
        this.updateOverview(data);
        this.updateResources(data);
        this.updateProcesses(data);
        this.updateServices(data);
        
        // 保存最后更新的数据
        this.lastStatsData = data;
    }
    
    /**
     * 增量更新仪表板
     */
    updateDashboardIncremental(data) {
        if (!data) return;
        
        // 更新时间戳
        this.updateTimestamp(data.timestamp);
        
        // 只更新有变化的部分
        if (data.system) this.updateSystemOverview(data);
        if (data.health) this.updateHealthStatus(data.health);
        if (data.system_stats) this.updateSystemStatistics(data.system_stats);
        if (data.cpu) this.monitoringModule.updateCPUInfo(data.cpu);
        if (data.memory) this.monitoringModule.updateMemoryInfo(data.memory);
        if (data.disk) this.monitoringModule.updateDiskInfo(data.disk);
        if (data.network) this.monitoringModule.updateNetworkInfo(data.network);
        if (data.memory_processes) this.processModule.updateMemoryProcesses(data.memory_processes);
        if (data.stats_summary) this.processModule.updateProcessStats(data.stats_summary);
        if (data.ports) this.processModule.updatePortInfo(data.ports);
        if (data.services) this.processModule.updateServiceStatus(data.services);
    }
    
    /**
     * 更新时间戳
     */
    updateTimestamp(timestamp) {
        if (timestamp) {
            const date = new Date(timestamp);
            this.updateStatus(`最后更新: ${date.toLocaleTimeString()}`);
            this.lastUpdateTime = Date.now();
        }
    }
    
    /**
     * 更新概览标签页
     */
    updateOverview(data) {
        // 系统信息
        if (data.system) {
            this.monitoringModule.updateSystemInfo(data.system);
        }
        
        // 健康状态
        if (data.health) {
            this.updateHealthStatus(data.health);
        }
        
        // 系统统计
        if (data.system_stats) {
            this.updateSystemStatistics(data.system_stats);
        }
        
        // 快速统计（向后兼容）
        if (data.stats_summary) {
            this.updateQuickStats(data.stats_summary);
        }
        
        // 实时监控面板更新
        if (data.cpu) {
            this.updateRealtimeMonitoring('cpu', data.cpu);
        }
        
        if (data.memory) {
            this.updateRealtimeMonitoring('memory', data.memory);
        }
        
        if (data.disk) {
            this.updateRealtimeMonitoring('disk', data.disk);
        }
        
        if (data.network) {
            this.updateRealtimeMonitoring('network', data.network);
        }
    }
    
    /**
     * 更新系统概览
     */
    updateSystemOverview(data) {
        if (data.system) {
            this.monitoringModule.updateSystemInfo(data.system);
        }
    }
    
    /**
     * 更新健康状态
     */
    updateHealthStatus(healthData) {
        this.healthStatus = healthData;
        
        // 更新健康评分
        const scoreElement = document.getElementById('health-score');
        if (scoreElement) {
            scoreElement.textContent = healthData.score;
            scoreElement.className = `health-score ${healthData.status}`;
        }
        
        // 更新健康状态文本
        const statusElement = document.getElementById('health-status-text');
        if (statusElement) {
            statusElement.textContent = healthData.status_text;
            statusElement.className = `health-status ${healthData.status}`;
        }
        
        // 更新警告和关键问题
        this.updateHealthAlerts(healthData);
    }
    
    /**
     * 更新健康警报
     */
    updateHealthAlerts(healthData) {
        // 更新警告列表
        const warningsElement = document.getElementById('health-warnings');
        if (warningsElement && healthData.warnings) {
            if (healthData.warnings.length > 0) {
                warningsElement.innerHTML = healthData.warnings.map(warning => 
                    `<div class="warning-item">⚠️ ${warning}</div>`
                ).join('');
                warningsElement.style.display = 'block';
            } else {
                warningsElement.style.display = 'none';
            }
        }
        
        // 更新关键问题列表
        const criticalElement = document.getElementById('health-critical');
        if (criticalElement && healthData.critical_issues) {
            if (healthData.critical_issues.length > 0) {
                criticalElement.innerHTML = healthData.critical_issues.map(issue => 
                    `<div class="critical-item">🚨 ${issue}</div>`
                ).join('');
                criticalElement.style.display = 'block';
            } else {
                criticalElement.style.display = 'none';
            }
        }
    }
    
    /**
     * 更新系统统计
     */
    updateSystemStatistics(systemStats) {
        if (!systemStats) return;
        
        // 更新进程统计
        if (systemStats.processes) {
            this.updateElement('total-processes', systemStats.processes.total?.toLocaleString() || '0');
            this.updateElement('running-processes', systemStats.processes.running?.toLocaleString() || '0');
        }
        
        // 更新网络连接统计
        if (systemStats.network) {
            this.updateElement('established-connections', systemStats.network.established?.toLocaleString() || '0');
            this.updateElement('listening-ports', systemStats.network.listen?.toLocaleString() || '0');
        }
        
        // 更新用户统计
        if (systemStats.users) {
            this.updateElement('online-users', systemStats.users.unique_users?.toLocaleString() || '0');
            this.updateElement('user-sessions', systemStats.users.total_sessions?.toLocaleString() || '0');
        }
        
        // 更新系统运行时间
        if (systemStats.system) {
            this.updateElement('system-uptime', systemStats.system.uptime_string || '未知');
        }
        
        // 更新系统警告（基于健康状态）
        if (this.healthStatus) {
            const totalAlerts = (this.healthStatus.warnings?.length || 0) + (this.healthStatus.critical_issues?.length || 0);
            const criticalAlerts = this.healthStatus.critical_issues?.length || 0;
            this.updateElement('system-alerts', totalAlerts.toString());
            this.updateElement('critical-alerts', criticalAlerts.toString());
        }
    }
    
    /**
     * 更新系统运行时间
     */
    updateSystemUptime(systemStats) {
        if (systemStats?.system) {
            // 更新概览中的运行时间
            this.updateElement('system-uptime', systemStats.system.uptime_string || '未知');
            // 为了向后兼容，同时更新原有的运行时间显示
            this.updateElement('system-uptime-days', `${systemStats.system.uptime_days || 0} 天`);
        }
    }
    
    /**
     * 更新快速统计（向后兼容）
     */
    updateQuickStats(statsData) {
        // 更新进程数量
        const totalProcessesElement = document.getElementById('quick-processes');
        if (totalProcessesElement && statsData.processes) {
            totalProcessesElement.textContent = statsData.processes.total?.toLocaleString() || '0';
        }
        
        // 更新活跃连接
        const connectionsElement = document.getElementById('quick-connections');
        if (connectionsElement && statsData.connections) {
            connectionsElement.textContent = statsData.connections.established?.toLocaleString() || '0';
        }
        
        // 更新活跃用户
        const usersElement = document.getElementById('quick-users');
        if (usersElement && statsData.users) {
            usersElement.textContent = statsData.users.active?.toLocaleString() || '0';
        }
    }
    
    /**
     * 更新实时监控面板
     */
    updateRealtimeMonitoring(type, data) {
        switch (type) {
            case 'cpu':
                this.updateCPUMonitoring(data);
                break;
            case 'memory':
                this.updateMemoryMonitoring(data);
                break;
            case 'disk':
                this.updateDiskMonitoring(data);
                break;
            case 'network':
                this.updateNetworkMonitoring(data);
                break;
        }
    }
    
    /**
     * 更新CPU监控
     */
    updateCPUMonitoring(cpuData) {
        const usage = cpuData.usage_percent || 0;
        const loadAvg = cpuData.load_avg?.['1min'] || 0;
        
        this.updateElement('cpu-overview', `${usage.toFixed(1)}%`);
        this.updateElement('cpu-load-detail', `负载: ${loadAvg}`);
        
        // 更新进度条
        const progressBar = document.getElementById('cpu-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${Math.min(usage, 100)}%`;
            progressBar.className = `monitor-progress cpu-progress ${this.getUsageClass(usage)}`;
        }
        
        // 更新监控指示器颜色
        this.updateMonitoringIndicator();
    }
    
    /**
     * 更新内存监控
     */
    updateMemoryMonitoring(memoryData) {
        const usage = memoryData.percent || 0;
        const usedGB = this.formatBytes(memoryData.used);
        const totalGB = this.formatBytes(memoryData.total);
        
        this.updateElement('memory-overview', `${usage.toFixed(1)}%`);
        this.updateElement('memory-detail', `${usedGB} / ${totalGB}`);
        
        // 更新进度条
        const progressBar = document.getElementById('memory-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${Math.min(usage, 100)}%`;
            progressBar.className = `monitor-progress memory-progress ${this.getUsageClass(usage)}`;
        }
    }
    
    /**
     * 更新磁盘监控
     */
    updateDiskMonitoring(diskData) {
        if (!diskData || !Array.isArray(diskData) || diskData.length === 0) return;
        
        // 获取主要磁盘（通常是根分区）
        const mainDisk = diskData.find(disk => disk.mountpoint === '/') || diskData[0];
        const usage = mainDisk.percent || 0;
        const usedGB = this.formatBytes(mainDisk.used);
        const totalGB = this.formatBytes(mainDisk.total);
        
        this.updateElement('disk-overview', `${usage.toFixed(1)}%`);
        this.updateElement('disk-detail', `${usedGB} / ${totalGB}`);
        
        // 更新进度条
        const progressBar = document.getElementById('disk-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${Math.min(usage, 100)}%`;
            progressBar.className = `monitor-progress disk-progress ${this.getUsageClass(usage)}`;
        }
    }
    
    /**
     * 更新网络监控
     */
    updateNetworkMonitoring(networkData) {
        if (!networkData || !Array.isArray(networkData) || networkData.length === 0) return;
        
        // 计算所有网络接口的总流量
        let totalRxBytes = 0;
        let totalTxBytes = 0;
        
        networkData.forEach(interface => {
            totalRxBytes += interface.bytes_recv || 0;
            totalTxBytes += interface.bytes_sent || 0;
        });
        
        // 计算网络速度（这里需要与上次的数据比较，简化处理显示总量）
        const rxSpeed = this.formatBytes(totalRxBytes);
        const txSpeed = this.formatBytes(totalTxBytes);
        
        this.updateElement('network-overview', `${this.formatBytes(totalRxBytes + totalTxBytes)}`);
        this.updateElement('network-rx-speed', rxSpeed);
        this.updateElement('network-tx-speed', txSpeed);
    }
    
    /**
     * 更新监控指示器
     */
    updateMonitoringIndicator() {
        const indicator = document.getElementById('monitoring-indicator');
        if (indicator) {
            indicator.style.color = '#4ade80'; // 绿色表示正在更新
            setTimeout(() => {
                indicator.style.color = '#6b7280'; // 灰色表示待机
            }, 500);
        }
    }
    
    /**
     * 更新CPU概览（向后兼容）
     */
    updateCPUOverview(cpuData) {
        this.updateCPUMonitoring(cpuData);
    }
    
    /**
     * 更新内存概览
     */
    updateMemoryOverview(memoryData) {
        const memoryOverviewElement = document.getElementById('memory-overview');
        if (memoryOverviewElement) {
            const usage = memoryData.percent || 0;
            memoryOverviewElement.innerHTML = `
                <div class="metric-header">
                    <span>内存使用率</span>
                    <span class="metric-value ${this.getUsageClass(usage)}">${usage.toFixed(1)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${this.getUsageClass(usage)}" style="width: ${usage}%"></div>
                </div>
                <div class="metric-details">
                    <span>已用: ${this.formatBytes(memoryData.used)}</span>
                    <span>总计: ${this.formatBytes(memoryData.total)}</span>
                </div>
            `;
        }
    }
    
    /**
     * 更新资源监控标签页
     */
    updateResources(data) {
        if (data.cpu) {
            this.monitoringModule.updateCPUInfo(data.cpu);
        }
        
        if (data.memory) {
            this.monitoringModule.updateMemoryInfo(data.memory);
        }
        
        if (data.disk) {
            this.monitoringModule.updateDiskInfo(data.disk);
        }
        
        if (data.network) {
            this.monitoringModule.updateNetworkInfo(data.network);
        }
    }
    
    /**
     * 更新进程管理标签页
     */
    updateProcesses(data) {
        if (data.memory_processes) {
            this.processModule.updateMemoryProcesses(data.memory_processes);
        }
        
        if (data.stats_summary) {
            this.processModule.updateProcessStats(data.stats_summary);
        }
    }
    
    /**
     * 更新服务端口标签页
     */
    updateServices(data) {
        if (data.ports) {
            this.processModule.updatePortInfo(data.ports);
        }
        
        if (data.services) {
            this.processModule.updateServiceStatus(data.services);
        }
    }
    
    /**
     * 根据使用率获取样式类
     */
    getUsageClass(usage) {
        if (usage >= 90) return 'critical';
        if (usage >= 75) return 'warning';
        if (usage >= 50) return 'moderate';
        return 'low';
    }
    
    /**
     * 展开图表
     */
    expandChart(chartType) {
        this.monitoringModule.expandChart(chartType);
    }
    
    /**
     * 获取当前健康状态
     */
    getHealthStatus() {
        return this.healthStatus;
    }
    
    /**
     * 获取缓存的数据
     */
    getCachedData() {
        return this.cachedData;
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        if (this.terminalModule) {
            this.terminalModule.cleanup();
        }
        
        if (this.dnsModule) {
            this.dnsModule.cleanup();
        }
        
        // 清理图表
        if (this.monitoringModule.cpuChart) {
            this.monitoringModule.cpuChart.destroy();
        }
        
        if (this.monitoringModule.networkChart) {
            this.monitoringModule.networkChart.destroy();
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查必要的依赖是否加载
    if (typeof io === 'undefined') {
        console.error('Socket.IO not loaded');
        return;
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    // 创建全局Dashboard实例
    window.dashboard = new Dashboard();
    
    console.log('重构后的仪表板已启动');
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', function() {
    if (window.dashboard) {
        window.dashboard.cleanup();
    }
});