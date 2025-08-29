/**
 * 系统监控模块 - 处理CPU、内存、磁盘、网络监控显示
 */

class MonitoringModule {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.cpuChart = null;
        this.networkChart = null;
        this.expandedChart = null;
        this.networkHistory = [];
        this.cpuHistory = [];
        this.maxHistoryLength = 20;
        
        this.initCharts();
        this.initFilters();
    }
    
    /**
     * 初始化图表
     */
    initCharts() {
        this.initCPUChart();
        this.initNetworkChart();
    }
    
    /**
     * 初始化CPU图表
     */
    initCPUChart() {
        const ctx = document.getElementById('cpuChart');
        if (!ctx) return;
        
        this.cpuChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU使用率',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                elements: {
                    point: {
                        radius: 0
                    }
                }
            }
        });
    }
    
    /**
     * 初始化网络图表
     */
    initNetworkChart() {
        const ctx = document.getElementById('networkChart');
        if (!ctx) return;
        
        this.networkChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '接收',
                        data: [],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: '发送',
                        data: [],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return this.dashboard.formatBytes(value);
                            }.bind(this)
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    /**
     * 初始化过滤器
     */
    initFilters() {
        // 磁盘过滤器
        const diskFilter = document.getElementById('diskFilter');
        if (diskFilter) {
            diskFilter.addEventListener('change', () => {
                this.filterDiskInfo();
            });
        }
        
        // 网络接口过滤器
        const networkFilter = document.getElementById('networkFilter');
        if (networkFilter) {
            networkFilter.addEventListener('change', () => {
                this.filterNetworkInfo();
            });
        }
    }
    
    /**
     * 更新系统信息
     */
    updateSystemInfo(systemData) {
        if (!systemData) return;
        
        const mappings = [
            { key: 'hostname', id: 'hostname' },
            { key: 'os', id: 'os' },
            { key: 'architecture', id: 'architecture' },
            { key: 'ip_address', id: 'ip-address' },
            { key: 'uptime_string', id: 'uptime' }
        ];
        
        mappings.forEach(({ key, id }) => {
            const element = document.getElementById(id);
            if (element && systemData[key]) {
                element.textContent = systemData[key];
            }
        });
        
        // 更新详细系统信息（如果有）
        if (systemData.os_detailed) {
            this.updateDetailedSystemInfo(systemData.os_detailed);
        }
        
        if (systemData.cpu_detailed) {
            this.updateDetailedCPUInfo(systemData.cpu_detailed);
        }
    }
    
    /**
     * 更新详细系统信息
     */
    updateDetailedSystemInfo(osDetailed) {
        const osElement = document.getElementById('os');
        if (osElement && osDetailed.name) {
            let osText = osDetailed.name;
            if (osDetailed.version) {
                osText += ` ${osDetailed.version}`;
            }
            if (osDetailed.codename) {
                osText += ` (${osDetailed.codename})`;
            }
            osElement.textContent = osText;
        }
    }
    
    /**
     * 更新详细CPU信息
     */
    updateDetailedCPUInfo(cpuDetailed) {
        const cpuElement = document.getElementById('cpu-info');
        if (cpuElement && cpuDetailed.model) {
            let cpuText = `${cpuDetailed.count} 核`;
            if (cpuDetailed.frequency && cpuDetailed.frequency.current) {
                cpuText += ` @ ${cpuDetailed.frequency.current.toFixed(2)} MHz`;
            }
            cpuElement.textContent = cpuText;
        }
    }
    
    /**
     * 更新CPU信息
     */
    updateCPUInfo(cpuData) {
        if (!cpuData) return;
        
        // 更新CPU使用率显示
        const cpuUsageElement = document.getElementById('cpu-usage');
        if (cpuUsageElement) {
            cpuUsageElement.textContent = `${cpuData.usage_percent}%`;
            
            // 更新进度条
            const progressBar = cpuUsageElement.parentElement.querySelector('.progress-fill');
            if (progressBar) {
                progressBar.style.width = `${cpuData.usage_percent}%`;
                progressBar.className = `progress-fill ${this.getUsageClass(cpuData.usage_percent)}`;
            }
        }
        
        // 更新负载平均值
        if (cpuData.load_avg) {
            const loadAvgElement = document.getElementById('load-avg');
            if (loadAvgElement) {
                loadAvgElement.textContent = 
                    `${cpuData.load_avg['1min']} ${cpuData.load_avg['5min']} ${cpuData.load_avg['15min']}`;
            }
        }
        
        // 更新CPU图表
        this.updateCPUChart(cpuData.usage_percent);
        
        // 更新每个CPU核心使用率
        this.updateCPUCores(cpuData.usage_per_cpu);
    }
    
    /**
     * 更新CPU图表
     */
    updateCPUChart(usage) {
        if (!this.cpuChart) return;
        
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        
        this.cpuHistory.push({ time: timeLabel, usage: usage });
        
        if (this.cpuHistory.length > this.maxHistoryLength) {
            this.cpuHistory.shift();
        }
        
        this.cpuChart.data.labels = this.cpuHistory.map(item => item.time);
        this.cpuChart.data.datasets[0].data = this.cpuHistory.map(item => item.usage);
        this.cpuChart.update('none');
    }
    
    /**
     * 更新CPU核心显示
     */
    updateCPUCores(coresData) {
        if (!coresData || !Array.isArray(coresData)) return;
        
        const coresContainer = document.getElementById('cpu-cores');
        if (!coresContainer) return;
        
        coresContainer.innerHTML = '';
        
        coresData.forEach((usage, index) => {
            const coreElement = document.createElement('div');
            coreElement.className = 'cpu-core';
            coreElement.innerHTML = `
                <div class="core-label">核心 ${index}</div>
                <div class="core-usage ${this.getUsageClass(usage)}">${usage}%</div>
            `;
            coresContainer.appendChild(coreElement);
        });
    }
    
    /**
     * 更新内存信息
     */
    updateMemoryInfo(memoryData) {
        if (!memoryData) return;
        
        // 更新内存使用率
        const memoryUsageElement = document.getElementById('memory-usage');
        if (memoryUsageElement) {
            memoryUsageElement.textContent = `${memoryData.percent.toFixed(1)}%`;
            
            const progressBar = memoryUsageElement.parentElement.querySelector('.progress-fill');
            if (progressBar) {
                progressBar.style.width = `${memoryData.percent}%`;
                progressBar.className = `progress-fill ${this.getUsageClass(memoryData.percent)}`;
            }
        }
        
        // 更新内存详情
        const memoryDetailsElement = document.getElementById('memory-details');
        if (memoryDetailsElement) {
            memoryDetailsElement.innerHTML = `
                <div>总计: ${this.dashboard.formatBytes(memoryData.total)}</div>
                <div>已用: ${this.dashboard.formatBytes(memoryData.used)}</div>
                <div>可用: ${this.dashboard.formatBytes(memoryData.available)}</div>
                <div>缓存: ${this.dashboard.formatBytes(memoryData.cached || 0)}</div>
            `;
        }
        
        // 更新Swap信息
        if (memoryData.swap_total > 0) {
            const swapElement = document.getElementById('swap-usage');
            if (swapElement) {
                swapElement.textContent = `${memoryData.swap_percent.toFixed(1)}%`;
                
                const progressBar = swapElement.parentElement.querySelector('.progress-fill');
                if (progressBar) {
                    progressBar.style.width = `${memoryData.swap_percent}%`;
                    progressBar.className = `progress-fill ${this.getUsageClass(memoryData.swap_percent)}`;
                }
            }
        }
    }
    
    /**
     * 更新磁盘信息
     */
    updateDiskInfo(diskData) {
        if (!diskData || !Array.isArray(diskData)) return;
        
        const diskContainer = document.getElementById('disk-info');
        if (!diskContainer) return;
        
        diskContainer.innerHTML = '';
        
        diskData.forEach(disk => {
            const diskElement = document.createElement('div');
            diskElement.className = 'disk-item';
            diskElement.innerHTML = `
                <div class="disk-header">
                    <span class="disk-device">${disk.device}</span>
                    <span class="disk-mountpoint">${disk.mountpoint}</span>
                    <span class="disk-usage ${this.getUsageClass(disk.percent)}">${disk.percent}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${this.getUsageClass(disk.percent)}" 
                         style="width: ${disk.percent}%"></div>
                </div>
                <div class="disk-details">
                    <span>总计: ${this.dashboard.formatBytes(disk.total)}</span>
                    <span>已用: ${this.dashboard.formatBytes(disk.used)}</span>
                    <span>可用: ${this.dashboard.formatBytes(disk.free)}</span>
                    <span>类型: ${disk.fstype}</span>
                </div>
            `;
            diskContainer.appendChild(diskElement);
        });
    }
    
    /**
     * 更新网络信息
     */
    updateNetworkInfo(networkData) {
        if (!networkData || !Array.isArray(networkData)) return;
        
        // 计算总的网络流量
        let totalSent = 0;
        let totalRecv = 0;
        
        networkData.forEach(iface => {
            totalSent += iface.bytes_sent;
            totalRecv += iface.bytes_recv;
        });
        
        // 更新网络图表
        this.updateNetworkChart(totalRecv, totalSent);
        
        // 更新网络接口列表
        const networkContainer = document.getElementById('network-interfaces');
        if (networkContainer) {
            networkContainer.innerHTML = '';
            
            networkData.forEach(iface => {
                const ifaceElement = document.createElement('div');
                ifaceElement.className = 'network-interface';
                ifaceElement.innerHTML = `
                    <div class="interface-header">
                        <span class="interface-name">${iface.interface}</span>
                        <span class="interface-stats">
                            ↓ ${this.dashboard.formatBytes(iface.bytes_recv)} 
                            ↑ ${this.dashboard.formatBytes(iface.bytes_sent)}
                        </span>
                    </div>
                    <div class="interface-details">
                        <span>数据包: ↓ ${iface.packets_recv.toLocaleString()} ↑ ${iface.packets_sent.toLocaleString()}</span>
                        <span>错误: ↓ ${iface.errin} ↑ ${iface.errout}</span>
                        <span>丢包: ↓ ${iface.dropin} ↑ ${iface.dropout}</span>
                    </div>
                `;
                networkContainer.appendChild(ifaceElement);
            });
        }
    }
    
    /**
     * 更新网络图表
     */
    updateNetworkChart(recv, sent) {
        if (!this.networkChart) return;
        
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        
        this.networkHistory.push({ time: timeLabel, recv: recv, sent: sent });
        
        if (this.networkHistory.length > this.maxHistoryLength) {
            this.networkHistory.shift();
        }
        
        this.networkChart.data.labels = this.networkHistory.map(item => item.time);
        this.networkChart.data.datasets[0].data = this.networkHistory.map(item => item.recv);
        this.networkChart.data.datasets[1].data = this.networkHistory.map(item => item.sent);
        this.networkChart.update('none');
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
     * 过滤磁盘信息
     */
    filterDiskInfo() {
        const filter = document.getElementById('diskFilter')?.value || 'all';
        const diskItems = document.querySelectorAll('.disk-item');
        
        diskItems.forEach(item => {
            const usageText = item.querySelector('.disk-usage')?.textContent || '0%';
            const usage = parseFloat(usageText);
            
            let show = true;
            switch (filter) {
                case 'high':
                    show = usage >= 80;
                    break;
                case 'medium':
                    show = usage >= 50 && usage < 80;
                    break;
                case 'low':
                    show = usage < 50;
                    break;
                default:
                    show = true;
            }
            
            item.style.display = show ? 'block' : 'none';
        });
    }
    
    /**
     * 过滤网络接口信息
     */
    filterNetworkInfo() {
        const filter = document.getElementById('networkFilter')?.value || 'all';
        const networkInterfaces = document.querySelectorAll('.network-interface');
        
        networkInterfaces.forEach(item => {
            const interfaceName = item.querySelector('.interface-name')?.textContent || '';
            
            let show = true;
            switch (filter) {
                case 'ethernet':
                    show = interfaceName.startsWith('eth') || interfaceName.startsWith('en');
                    break;
                case 'wireless':
                    show = interfaceName.startsWith('wl') || interfaceName.startsWith('wi');
                    break;
                case 'virtual':
                    show = interfaceName.startsWith('vir') || interfaceName.startsWith('docker') || 
                           interfaceName.startsWith('br');
                    break;
                default:
                    show = true;
            }
            
            item.style.display = show ? 'block' : 'none';
        });
    }
    
    /**
     * 展开图表
     */
    expandChart(chartType) {
        const modal = document.getElementById('chartModal') || this.createChartModal();
        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body');
        
        modalTitle.textContent = chartType === 'cpu' ? 'CPU使用率历史' : '网络流量历史';
        modalBody.innerHTML = `<canvas id="expanded-chart"></canvas>`;
        
        modal.style.display = 'flex';
        
        // 创建放大的图表
        setTimeout(() => {
            this.createExpandedChart(chartType);
        }, 100);
    }
    
    /**
     * 创建图表模态框
     */
    createChartModal() {
        const modalHTML = `
            <div id="chartModal" class="modal-overlay">
                <div class="modal large-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">图表</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').style.display='none'">×</button>
                    </div>
                    <div class="modal-body"></div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        return document.getElementById('chartModal');
    }
    
    /**
     * 创建放大的图表
     */
    createExpandedChart(chartType) {
        const ctx = document.getElementById('expanded-chart');
        if (!ctx) return;
        
        if (this.expandedChart) {
            this.expandedChart.destroy();
        }
        
        const config = chartType === 'cpu' ? this.cpuChart.config : this.networkChart.config;
        this.expandedChart = new Chart(ctx, {
            ...config,
            data: JSON.parse(JSON.stringify(config.data)),
            options: {
                ...config.options,
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

// 导出到全局
window.MonitoringModule = MonitoringModule;