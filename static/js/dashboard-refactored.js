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
        
        // 快速统计
        if (data.stats_summary) {
            this.updateQuickStats(data.stats_summary);
        }
        
        // CPU和内存概览
        if (data.cpu) {
            this.updateCPUOverview(data.cpu);
        }
        
        if (data.memory) {
            this.updateMemoryOverview(data.memory);
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
     * 更新快速统计
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
     * 更新CPU概览
     */
    updateCPUOverview(cpuData) {
        const cpuOverviewElement = document.getElementById('cpu-overview');
        if (cpuOverviewElement) {
            const usage = cpuData.usage_percent || 0;
            cpuOverviewElement.innerHTML = `
                <div class="metric-header">
                    <span>CPU使用率</span>
                    <span class="metric-value ${this.getUsageClass(usage)}">${usage}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${this.getUsageClass(usage)}" style="width: ${usage}%"></div>
                </div>
            `;
        }
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