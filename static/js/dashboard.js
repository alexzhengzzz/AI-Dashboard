class Dashboard {
    constructor() {
        this.socket = io();
        this.cpuChart = null;
        this.networkChart = null;
        this.expandedChart = null;
        this.networkHistory = [];
        this.cpuHistory = [];
        this.maxHistoryLength = 20;
        
        // 新增状态管理
        this.currentTab = 'overview';
        this.collapsedCards = new Set();
        this.sortStates = {};
        this.toastId = 0;
        
        // 终端相关状态
        this.terminals = new Map();
        this.currentTerminal = null;
        this.terminalCounter = 0;
        
        // 加载状态管理
        this.isInitialLoad = true;
        this.dataLoadTimeout = null;
        this.loadingElements = new Set();
        
        // 数据缓存和增量更新
        this.cachedData = {};
        this.lastUpdateTime = 0;
        this.updateInterval = 5000; // 5秒更新间隔
        
        // DOM元素缓存
        this.domCache = new Map();
        
        // 显示初始加载指示器
        this.showInitialLoading();
        
        // 显示数据加载状态
        setTimeout(() => this.showDataLoading(), 100);
        
        this.initSocketEvents();
        this.initCharts();
        this.startDataRefresh();
        this.initDialogs();
        this.initTabs();
        this.initCollapse();
        this.initTableSorting();
        this.initFilters();
        this.initProcessFilters();
        this.initTerminal();
        this.initDNS();
        this.lastStatsData = null;
    }

    initSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('已连接');
            
            // 立即请求数据，并设置超时
            this.requestInitialData();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateStatus('连接断开 - 正在重连...');
            this.showDataLoading(); // 显示数据加载状态
        });

        this.socket.on('stats_update', (data) => {
            // 如果是初始加载，隐藏加载指示器
            if (this.isInitialLoad) {
                this.hideInitialLoading();
                this.hideDataLoading();
                this.isInitialLoad = false;
            }
            
            // 处理增量数据或完整数据
            if (data.incremental) {
                this.handleIncrementalUpdate(data);
            } else {
                this.cachedData = data;
                this.lastStatsData = data;
                this.updateDashboard(data);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateStatus('连接错误 - 正在重试...');
            
            // 如果连接错误且还在初始加载，尝试HTTP请求
            if (this.isInitialLoad) {
                this.requestStatsViaHTTP();
            }
        });

        // 终端WebSocket事件
        this.socket.on('terminal_created', (data) => {
            this.onTerminalCreated(data.session_id);
        });

        this.socket.on('terminal_output', (data) => {
            this.onTerminalOutput(data.data);
        });

        this.socket.on('terminal_error', (data) => {
            this.showToast(data.message, 'error');
        });

        this.socket.on('terminal_closed', (data) => {
            this.onTerminalClosed(data.session_id);
        });

        // DNS相关WebSocket事件
        this.socket.on('dns_status_update', (data) => {
            this.updateDNSStatus(data);
        });

        this.socket.on('dns_action_result', (data) => {
            this.handleDNSActionResult(data);
        });

        this.socket.on('dns_error', (data) => {
            this.showToast(data.message, 'dns-error');
        });

        this.socket.on('dns_update_status', (data) => {
            this.handleDNSUpdateStatus(data);
        });
    }

    initCharts() {
        // CPU Chart
        const cpuCtx = document.getElementById('cpu-chart').getContext('2d');
        this.cpuChart = new Chart(cpuCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU使用率',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        // Network Chart
        const networkCtx = document.getElementById('network-chart').getContext('2d');
        this.networkChart = new Chart(networkCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '接收',
                    data: [],
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    tension: 0.4
                }, {
                    label: '发送',
                    data: [],
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });
    }

    // DOM缓存和增量更新方法
    getCachedElement(selector) {
        if (!this.domCache.has(selector)) {
            const element = document.querySelector(selector);
            if (element) {
                this.domCache.set(selector, element);
            }
        }
        return this.domCache.get(selector);
    }

    handleIncrementalUpdate(incrementalData) {
        // 合并增量数据到缓存
        Object.assign(this.cachedData, incrementalData);
        this.cachedData.timestamp = incrementalData.timestamp;
        
        // 只更新有变化的部分
        if (incrementalData.cpu) {
            this.updateCpuMetrics(incrementalData.cpu);
        }
        if (incrementalData.memory) {
            this.updateMemoryMetrics(incrementalData.memory);
        }
        if (incrementalData.disk) {
            this.updateDiskMetrics(incrementalData.disk);
        }
        if (incrementalData.network) {
            this.updateNetworkMetrics(incrementalData.network);
        }
        if (incrementalData.health) {
            this.updateSystemHealth(incrementalData.health);
        }
        if (incrementalData.stats_summary) {
            this.updateStatsummary(incrementalData.stats_summary);
        }
        if (incrementalData.memory_processes) {
            this.updateMemoryProcessList(incrementalData.memory_processes);
        }
        if (incrementalData.ports) {
            this.updatePortsStatus(incrementalData.ports);
        }
        if (incrementalData.services) {
            this.updateServicesStatus(incrementalData.services);
        }
        
        // 更新概览指标
        this.updateOverviewMetrics(this.cachedData);
        this.updateStatus(`最后更新: ${new Date().toLocaleTimeString()}`);
    }

    startDataRefresh() {
        // 优化的刷新策略：减少不必要的请求
        let refreshCount = 0;
        let currentInterval = this.updateInterval;
        
        const refreshData = () => {
            const now = Date.now();
            
            // 如果页面不可见，降低更新频率
            if (document.hidden) {
                currentInterval = this.updateInterval * 3; // 15秒
            } else {
                currentInterval = this.updateInterval; // 5秒
            }
            
            if (this.socket.connected && (now - this.lastUpdateTime) >= currentInterval - 500) {
                this.socket.emit('request_stats');
                this.lastUpdateTime = now;
            }
        };
        
        // 初始立即请求一次数据
        if (this.socket.connected) {
            this.socket.emit('request_stats');
        }
        
        // 设置定时器
        this.refreshTimer = setInterval(refreshData, 1000); // 每秒检查一次
        
        // 页面可见性变化时调整更新频率
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('页面隐藏，降低更新频率');
            } else {
                console.log('页面恢复，恢复正常更新频率');
                // 页面恢复时立即请求一次数据
                if (this.socket.connected) {
                    this.socket.emit('request_stats');
                }
            }
        });
    }

    updateDashboard(data) {
        this.updateSystemInfo(data.system);
        this.updateSystemHealth(data.health);
        this.updateStatsummary(data.stats_summary);
        this.updateCpuMetrics(data.cpu);
        this.updateMemoryMetrics(data.memory);
        this.updateDiskMetrics(data.disk);
        this.updateNetworkMetrics(data.network);
        this.updateServicesStatus(data.services);
        this.updatePortsStatus(data.ports);
        this.updateMemoryProcessList(data.memory_processes);
        
        // 更新概览页面的指标（在网络数据更新后）
        this.updateOverviewMetrics(data);
        
        this.updateStatus(`最后更新: ${new Date().toLocaleTimeString()}`);
    }

    updateSystemInfo(system) {
        // 使用缓存的DOM元素
        const hostnameEl = this.getCachedElement('#hostname');
        const ipAddressEl = this.getCachedElement('#ip-address');
        const osDetailedEl = this.getCachedElement('#os-detailed');
        const uptimeEl = this.getCachedElement('#uptime');
        const cpuModelEl = this.getCachedElement('#cpu-model');
        const memoryTotalEl = this.getCachedElement('#memory-total');
        const systemUptimeDaysEl = this.getCachedElement('#system-uptime-days');
        
        if (hostnameEl) hostnameEl.textContent = system.hostname;
        if (ipAddressEl) ipAddressEl.textContent = system.ip_address || '获取中...';
        
        // 更新详细操作系统信息
        if (osDetailedEl) {
            if (system.os_detailed) {
                osDetailedEl.textContent = `${system.os_detailed.name} ${system.os_detailed.version}`;
            } else {
                osDetailedEl.textContent = `${system.os} ${system.os_release}`;
            }
        }
        
        if (uptimeEl) uptimeEl.textContent = system.uptime_string;
        
        // 更新CPU型号信息
        if (cpuModelEl) {
            if (system.cpu_detailed) {
                const cpuInfo = `${system.cpu_detailed.count}核 ${system.cpu_detailed.model || 'Unknown'}`;
                cpuModelEl.textContent = cpuInfo;
            } else {
                cpuModelEl.textContent = system.processor || 'Unknown';
            }
        }
        
        // 更新内存容量信息
        if (memoryTotalEl) {
            if (system.memory_detailed) {
                memoryTotalEl.textContent = `${system.memory_detailed.total_gb}GB`;
            } else {
                memoryTotalEl.textContent = '获取中...';
            }
        }
        
        // 更新系统运行天数
        if (system.uptime_seconds && systemUptimeDaysEl) {
            const days = Math.floor(system.uptime_seconds / 86400);
            systemUptimeDaysEl.textContent = `${days} 天`;
        }
    }

    updateCpuMetrics(cpu) {
        const usage = cpu.usage_percent;
        // 更新资源监控页面的CPU指标
        const cpuUsageElement = document.getElementById('cpu-usage');
        if (cpuUsageElement) {
            cpuUsageElement.textContent = usage.toFixed(1);
        }

        // 更新CPU状态
        const cpuStatus = document.getElementById('cpu-status');
        if (cpuStatus) {
            if (usage > 90) {
                cpuStatus.textContent = '严重';
                cpuStatus.className = 'metric-status critical';
            } else if (usage > 70) {
                cpuStatus.textContent = '警告';
                cpuStatus.className = 'metric-status warning';
            } else {
                cpuStatus.textContent = '正常';
                cpuStatus.className = 'metric-status';
            }
        }

        // 更新负载平均值（如果元素存在）
        const loadAvgElement = document.getElementById('load-avg');
        if (loadAvgElement) {
            loadAvgElement.textContent = 
                `${cpu.load_avg['1min']} ${cpu.load_avg['5min']} ${cpu.load_avg['15min']}`;
        }

        // 更新CPU图表
        this.cpuHistory.push(usage);
        if (this.cpuHistory.length > this.maxHistoryLength) {
            this.cpuHistory.shift();
        }

        const labels = Array.from({length: this.cpuHistory.length}, (_, i) => 
            new Date(Date.now() - (this.cpuHistory.length - 1 - i) * 5000).toLocaleTimeString()
        );

        if (this.cpuChart) {
            this.cpuChart.data.labels = labels;
            this.cpuChart.data.datasets[0].data = this.cpuHistory;
            this.cpuChart.update('none');
        }
    }

    updateMemoryMetrics(memory) {
        const usagePercent = memory.percent;
        const usedGB = (memory.used / (1024**3)).toFixed(1);
        const totalGB = (memory.total / (1024**3)).toFixed(1);

        // 使用缓存的DOM元素
        const memoryUsageEl = this.getCachedElement('#memory-usage');
        const memoryUsedGbEl = this.getCachedElement('#memory-used-gb');
        const memoryTotalGbEl = this.getCachedElement('#memory-total-gb');
        const memoryBarEl = this.getCachedElement('#memory-bar');

        if (memoryUsageEl) memoryUsageEl.textContent = usagePercent.toFixed(1);
        if (memoryUsedGbEl) memoryUsedGbEl.textContent = usedGB;
        if (memoryTotalGbEl) memoryTotalGbEl.textContent = totalGB;
        if (memoryBarEl) memoryBarEl.style.width = `${usagePercent}%`;
        
        // 更新内存状态
        const memoryStatus = document.getElementById('memory-status');
        if (memoryStatus) {
            if (usagePercent > 90) {
                memoryStatus.textContent = '严重';
                memoryStatus.className = 'metric-status critical';
            } else if (usagePercent > 80) {
                memoryStatus.textContent = '警告';
                memoryStatus.className = 'metric-status warning';
            } else {
                memoryStatus.textContent = '正常';
                memoryStatus.className = 'metric-status';
            }
        }
    }

    updateDiskMetrics(disks) {
        const diskInfo = document.getElementById('disk-info');
        diskInfo.innerHTML = '';

        disks.forEach(disk => {
            if (disk.mountpoint === '/' || disk.mountpoint.startsWith('/')) {
                const diskItem = document.createElement('div');
                diskItem.className = 'disk-item';
                
                const usedGB = (disk.used / (1024**3)).toFixed(1);
                const totalGB = (disk.total / (1024**3)).toFixed(1);
                
                diskItem.innerHTML = `
                    <div>
                        <strong>${disk.mountpoint}</strong> (${disk.fstype})
                        <div style="font-size: 12px; color: #718096;">${disk.device}</div>
                    </div>
                    <div class="disk-usage">
                        <span>${usedGB}GB / ${totalGB}GB</span>
                        <div class="disk-bar">
                            <div class="disk-used" style="width: ${disk.percent}%"></div>
                        </div>
                        <span>${disk.percent.toFixed(1)}%</span>
                    </div>
                `;
                diskInfo.appendChild(diskItem);
            }
        });
    }

    updateSystemHealth(health) {
        if (!health) return;
        
        // 更新健康评分
        const healthScore = document.getElementById('health-score');
        const healthStatus = document.getElementById('health-status');
        
        if (healthScore) {
            healthScore.textContent = health.score;
        }
        
        if (healthStatus) {
            healthStatus.textContent = health.status_text;
            // 根据状态设置颜色类
            const container = healthScore.parentElement;
            container.className = 'health-score-container';
            if (health.status === 'critical') {
                container.classList.add('critical');
            } else if (health.status === 'warning') {
                container.classList.add('warning');
            }
        }
        
        // 更新警告信息
        const warningsContainer = document.getElementById('health-warnings');
        if (warningsContainer) {
            warningsContainer.innerHTML = '';
            if (health.warnings && health.warnings.length > 0) {
                health.warnings.forEach(warning => {
                    const warningDiv = document.createElement('div');
                    warningDiv.className = 'health-warning';
                    warningDiv.textContent = warning;
                    warningsContainer.appendChild(warningDiv);
                });
            }
        }
    }
    
    updateStatsummary(stats) {
        if (!stats) return;
        
        // 更新活跃进程数
        const activeProcesses = document.getElementById('active-processes');
        if (activeProcesses && stats.processes) {
            activeProcesses.textContent = stats.processes.running;
        }
        
        // 更新网络连接数
        const networkConnections = document.getElementById('network-connections');
        if (networkConnections && stats.connections) {
            networkConnections.textContent = stats.connections.established;
        }
        
        // 更新在线用户数
        const activeUsers = document.getElementById('active-users');
        if (activeUsers && stats.users) {
            activeUsers.textContent = stats.users.active;
        }
        
        // 更新状态摘要的数据
        const totalProcesses = document.getElementById('total-processes');
        if (totalProcesses && stats.processes) {
            totalProcesses.textContent = stats.processes.total;
        }
        
        const runningProcesses = document.getElementById('running-processes');
        if (runningProcesses && stats.processes) {
            runningProcesses.textContent = stats.processes.running;
        }
        
        const establishedConnections = document.getElementById('established-connections');
        if (establishedConnections && stats.connections) {
            establishedConnections.textContent = stats.connections.established;
        }
        
        const onlineUsers = document.getElementById('online-users');
        if (onlineUsers && stats.users) {
            onlineUsers.textContent = stats.users.active;
        }
    }
    
    updateOverviewMetrics(data) {
        // 更新概览页面的CPU指标
        const cpuOverview = document.getElementById('cpu-overview');
        const cpuProgressBar = document.getElementById('cpu-progress-bar');
        const cpuLoadDetail = document.getElementById('cpu-load-detail');
        
        if (cpuOverview && data.cpu) {
            cpuOverview.textContent = `${data.cpu.usage_percent.toFixed(1)}%`;
        }
        
        if (cpuProgressBar && data.cpu) {
            cpuProgressBar.style.width = `${data.cpu.usage_percent}%`;
        }
        
        if (cpuLoadDetail && data.cpu) {
            cpuLoadDetail.textContent = `负载: ${data.cpu.load_avg['1min']}`;
        }
        
        // 更新概览页面的内存指标
        const memoryOverview = document.getElementById('memory-overview');
        const memoryProgressBar = document.getElementById('memory-progress-bar');
        const memoryDetail = document.getElementById('memory-detail');
        
        if (memoryOverview && data.memory) {
            memoryOverview.textContent = `${data.memory.percent.toFixed(1)}%`;
        }
        
        if (memoryProgressBar && data.memory) {
            memoryProgressBar.style.width = `${data.memory.percent}%`;
        }
        
        if (memoryDetail && data.memory) {
            const usedGB = (data.memory.used / (1024**3)).toFixed(1);
            const totalGB = (data.memory.total / (1024**3)).toFixed(1);
            memoryDetail.textContent = `${usedGB}GB / ${totalGB}GB`;
        }
        
        // 更新磁盘使用率
        if (data.disk && data.disk.length > 0) {
            const rootDisk = data.disk.find(d => d.mountpoint === '/') || data.disk[0];
            const diskOverview = document.getElementById('disk-overview');
            const diskProgressBar = document.getElementById('disk-progress-bar');
            const diskDetail = document.getElementById('disk-detail');
            
            if (diskOverview && rootDisk) {
                diskOverview.textContent = `${rootDisk.percent.toFixed(1)}%`;
            }
            
            if (diskProgressBar && rootDisk) {
                diskProgressBar.style.width = `${rootDisk.percent}%`;
            }
            
            if (diskDetail && rootDisk) {
                const usedGB = (rootDisk.used / (1024**3)).toFixed(1);
                const totalGB = (rootDisk.total / (1024**3)).toFixed(1);
                diskDetail.textContent = `${usedGB}GB / ${totalGB}GB`;
            }
        }
        
        // 更新网络流量显示 - 使用已计算的速率数据
        if (data.network && this.networkHistory.length > 0) {
            const networkOverview = document.getElementById('network-overview');
            const networkRxSpeed = document.getElementById('network-rx-speed');
            const networkTxSpeed = document.getElementById('network-tx-speed');
            
            const latestEntry = this.networkHistory[this.networkHistory.length - 1];
            const rxRate = latestEntry.rxRate || 0;
            const txRate = latestEntry.txRate || 0;
            const totalRate = rxRate + txRate;
            
            if (networkOverview) {
                networkOverview.textContent = `${totalRate.toFixed(3)} MB/s`;
            }
            
            if (networkRxSpeed) {
                networkRxSpeed.textContent = `${rxRate.toFixed(3)}`;
            }
            
            if (networkTxSpeed) {
                networkTxSpeed.textContent = `${txRate.toFixed(3)}`;
            }
        } else if (data.network) {
            // 首次初始化时显示0
            const networkOverview = document.getElementById('network-overview');
            const networkRxSpeed = document.getElementById('network-rx-speed');
            const networkTxSpeed = document.getElementById('network-tx-speed');
            
            if (networkOverview) {
                networkOverview.textContent = `0.000 MB/s`;
            }
            if (networkRxSpeed) {
                networkRxSpeed.textContent = `0.000`;
            }
            if (networkTxSpeed) {
                networkTxSpeed.textContent = `0.000`;
            }
        }
    }

    updateNetworkMetrics(network) {
        let totalRx = 0, totalTx = 0;
        
        network.forEach(iface => {
            if (iface.interface !== 'lo') {
                totalRx += iface.bytes_recv;
                totalTx += iface.bytes_sent;
            }
        });

        const rxMB = (totalRx / (1024**2)).toFixed(1);
        const txMB = (totalTx / (1024**2)).toFixed(1);

        document.getElementById('network-rx').textContent = `${rxMB} MB`;
        document.getElementById('network-tx').textContent = `${txMB} MB`;

        // 更新网络图表（显示速率变化，单位：MB/s）
        if (this.networkHistory.length > 0) {
            const lastEntry = this.networkHistory[this.networkHistory.length - 1];
            const timeDiff = 5; // 5秒间隔
            const rxRate = Math.max(0, (totalRx - lastEntry.rx) / (1024 * 1024 * timeDiff)); // MB/s
            const txRate = Math.max(0, (totalTx - lastEntry.tx) / (1024 * 1024 * timeDiff)); // MB/s
            
            this.networkHistory.push({ rx: totalRx, tx: totalTx, rxRate, txRate });
        } else {
            this.networkHistory.push({ rx: totalRx, tx: totalTx, rxRate: 0, txRate: 0 });
        }

        if (this.networkHistory.length > this.maxHistoryLength) {
            this.networkHistory.shift();
        }

        const labels = Array.from({length: this.networkHistory.length}, (_, i) => 
            new Date(Date.now() - (this.networkHistory.length - 1 - i) * 5000).toLocaleTimeString()
        );

        this.networkChart.data.labels = labels;
        this.networkChart.data.datasets[0].data = this.networkHistory.map(h => h.rxRate);
        this.networkChart.data.datasets[1].data = this.networkHistory.map(h => h.txRate);
        this.networkChart.update('none');
    }

    updateServicesStatus(services) {
        const servicesList = document.getElementById('services-list');
        servicesList.innerHTML = '';

        services.forEach(service => {
            const serviceItem = document.createElement('div');
            serviceItem.className = 'service-item';
            
            const statusClass = service.active ? 'active' : 
                               service.status === 'unknown' ? 'unknown' : 'inactive';
            
            serviceItem.innerHTML = `
                <span>${service.name}</span>
                <span class="service-status ${statusClass}">${service.status}</span>
            `;
            servicesList.appendChild(serviceItem);
        });
    }

    updatePortsStatus(ports) {
        const portsList = document.getElementById('ports-list');
        portsList.innerHTML = '';

        ports.forEach(port => {
            const portItem = document.createElement('div');
            portItem.className = 'port-item';
            
            let statusClass = 'closed';
            let statusText = '关闭';
            
            switch(port.status) {
                case 'open':
                    statusClass = 'open';
                    statusText = '开放';
                    break;
                case 'filtered':
                    statusClass = 'filtered';
                    statusText = '过滤';
                    break;
                case 'closed':
                default:
                    statusClass = 'closed';
                    statusText = '关闭';
                    break;
            }
            
            const processInfo = port.process_name ? 
                `<div class="port-process">${port.process_name}${port.pid ? ` (PID: ${port.pid})` : ''}</div>` : 
                '<div class="port-process">-</div>';
            
            // 为开放的端口添加关闭按钮
            const killButton = port.status === 'open' && port.pid ? 
                `<button class="kill-process-btn" data-port="${port.port}" data-process="${port.process_name}" data-pid="${port.pid}">关闭进程</button>` : 
                '';
            
            portItem.innerHTML = `
                <div class="port-info">
                    <div class="port-header">
                        <span class="port-number">${port.port}</span>
                        <span class="port-service">${port.service}</span>
                    </div>
                    ${processInfo}
                    <div class="port-connections">${port.connections > 0 ? `连接数: ${port.connections}` : ''}</div>
                </div>
                <div class="port-actions">
                    <div class="port-status ${statusClass}">${statusText}</div>
                    ${killButton}
                </div>
            `;
            portsList.appendChild(portItem);
        });
        
        // 添加按钮点击事件监听器
        portsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('kill-process-btn')) {
                const port = e.target.getAttribute('data-port');
                const processName = e.target.getAttribute('data-process');
                const pid = e.target.getAttribute('data-pid');
                this.showKillProcessDialog(port, processName, pid);
            }
        });
    }

    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // 更新按钮状态
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // 更新内容显示
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${targetTab}-tab`) {
                        content.classList.add('active');
                    }
                });
                
                this.currentTab = targetTab;
                
                // 重新初始化图表（如果需要）
                if (targetTab === 'resources') {
                    setTimeout(() => {
                        if (this.cpuChart) this.cpuChart.resize();
                        if (this.networkChart) this.networkChart.resize();
                    }, 100);
                }
            });
        });
        
        // 初始化快速导航按钮
        const actionBtns = document.querySelectorAll('.action-btn[data-tab]');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // 找到对应的标签按钮并触发点击
                const targetTabBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
                if (targetTabBtn) {
                    targetTabBtn.click();
                }
            });
        });
    }
    
    initCollapse() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('collapse-btn') || e.target.parentElement.classList.contains('collapse-btn')) {
                const btn = e.target.classList.contains('collapse-btn') ? e.target : e.target.parentElement;
                const targetId = btn.dataset.target;
                const targetElement = document.getElementById(targetId);
                const icon = btn.querySelector('span');
                
                if (targetElement) {
                    if (this.collapsedCards.has(targetId)) {
                        targetElement.classList.remove('collapsed');
                        icon.textContent = '−';
                        this.collapsedCards.delete(targetId);
                    } else {
                        targetElement.classList.add('collapsed');
                        icon.textContent = '+';
                        this.collapsedCards.add(targetId);
                    }
                }
            }
        });
    }
    
    initTableSorting() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('sortable')) {
                const th = e.target;
                const table = th.closest('table');
                const sortKey = th.dataset.sort;
                const tbody = table.querySelector('tbody');
                
                // 更新排序状态
                const currentSort = this.sortStates[table.className] || { key: null, order: 'asc' };
                
                if (currentSort.key === sortKey) {
                    currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.key = sortKey;
                    currentSort.order = 'asc';
                }
                
                this.sortStates[table.className] = currentSort;
                
                // 更新视觉指示器
                table.querySelectorAll('.sortable').forEach(header => {
                    header.classList.remove('sort-asc', 'sort-desc');
                });
                th.classList.add(`sort-${currentSort.order}`);
                
                // 排序表格行
                this.sortTableRows(tbody, sortKey, currentSort.order);
            }
        });
    }
    
    sortTableRows(tbody, sortKey, order) {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        rows.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortKey) {
                case 'pid':
                    aValue = parseInt(a.cells[0].textContent) || 0;
                    bValue = parseInt(b.cells[0].textContent) || 0;
                    break;
                case 'name':
                    aValue = a.cells[1].textContent.toLowerCase();
                    bValue = b.cells[1].textContent.toLowerCase();
                    break;
                case 'user':
                    aValue = a.cells[2].textContent.toLowerCase();
                    bValue = b.cells[2].textContent.toLowerCase();
                    break;
                case 'category':
                    aValue = a.cells[3].textContent.toLowerCase();
                    bValue = b.cells[3].textContent.toLowerCase();
                    break;
                case 'status':
                    aValue = a.cells[7].textContent.toLowerCase();
                    bValue = b.cells[7].textContent.toLowerCase();
                    break;
                case 'cpu':
                    aValue = parseFloat(a.cells[6].textContent) || 0;
                    bValue = parseFloat(b.cells[6].textContent) || 0;
                    break;
                case 'memory-mb':
                    aValue = parseInt(a.cells[4].textContent) || 0;
                    bValue = parseInt(b.cells[4].textContent) || 0;
                    break;
                case 'memory-percent':
                    aValue = parseFloat(a.cells[5].textContent) || 0;
                    bValue = parseFloat(b.cells[5].textContent) || 0;
                    break;
                default:
                    aValue = a.cells[0].textContent.toLowerCase();
                    bValue = b.cells[0].textContent.toLowerCase();
            }
            
            if (order === 'asc') {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            }
        });
        
        // 重新插入排序后的行
        rows.forEach(row => tbody.appendChild(row));
    }
    
    initFilters() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                const btn = e.target;
                const container = btn.closest('.card');
                const filterType = btn.dataset.filter;
                
                // 更新按钮状态
                container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // 应用过滤器
                this.applyFilter(container, filterType);
            }
        });
    }
    
    applyFilter(container, filterType) {
        const items = container.querySelectorAll('.service-item, .port-item');
        
        items.forEach(item => {
            let show = true;
            
            if (filterType !== 'all') {
                const statusElement = item.querySelector('.service-status, .port-status');
                if (statusElement) {
                    const hasStatus = statusElement.classList.contains(filterType) || 
                                    (filterType === 'active' && statusElement.classList.contains('active')) ||
                                    (filterType === 'inactive' && statusElement.classList.contains('inactive')) ||
                                    (filterType === 'open' && statusElement.classList.contains('open')) ||
                                    (filterType === 'closed' && statusElement.classList.contains('closed'));
                    show = hasStatus;
                }
            }
            
            item.style.display = show ? 'block' : 'none';
        });
    }
    
    initDialogs() {
        const confirmDialog = document.getElementById('confirm-dialog');
        const chartModal = document.getElementById('chart-modal');
        const confirmYes = document.getElementById('confirm-yes');
        const confirmNo = document.getElementById('confirm-no');
        
        // 确认对话框事件
        confirmNo.onclick = () => {
            this.hideModal(confirmDialog);
        };
        
        // 关闭按钮事件
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.onclick = (e) => {
                const modal = e.target.closest('.modal-overlay');
                this.hideModal(modal);
            };
        });
        
        // 点击背景关闭
        [confirmDialog, chartModal].forEach(modal => {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.hideModal(modal);
                }
            };
        });
        
        // 图表展开按钮
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('expand-chart-btn')) {
                const chartType = e.target.dataset.chart;
                this.showExpandedChart(chartType);
            }
        });
    }

    showKillProcessDialog(port, processName, pid) {
        const confirmDialog = document.getElementById('confirm-dialog');
        const confirmMessage = document.getElementById('confirm-message');
        const modalTitle = document.getElementById('modal-title');
        const confirmYes = document.getElementById('confirm-yes');
        
        modalTitle.textContent = '确认关闭进程';
        confirmMessage.innerHTML = `
            <strong>您确定要关闭以下进程吗？</strong><br><br>
            端口: <code>${port}</code><br>
            进程名: <code>${processName}</code><br>
            PID: <code>${pid}</code><br><br>
            <span style="color: #e53e3e; font-size: 14px;">此操作无法撤销！</span>
        `;
        
        confirmYes.onclick = () => {
            this.hideModal(confirmDialog);
            this.killProcess(port);
        };
        
        this.showModal(confirmDialog);
    }

    async killProcess(port) {
        try {
            const response = await fetch(`/api/kill_port_process/${port}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast(result.message, 'success');
                // 立即刷新数据
                this.socket.emit('request_stats');
            } else {
                this.showToast(result.message, 'error');
            }
        } catch (error) {
            this.showToast('操作失败: ' + error.message, 'error');
        }
    }

    
    showExpandedChart(chartType) {
        const modal = document.getElementById('chart-modal');
        const title = document.getElementById('chart-modal-title');
        const canvas = document.getElementById('expanded-chart');
        
        title.textContent = `${chartType.toUpperCase()} 详细图表`;
        
        // 复制原始图表的配置
        const sourceChart = chartType === 'cpu' ? this.cpuChart : this.networkChart;
        if (sourceChart && canvas) {
            const ctx = canvas.getContext('2d');
            
            // 销毁之前的扩展图表
            if (this.expandedChart) {
                this.expandedChart.destroy();
            }
            
            // 创建新的扩展图表
            this.expandedChart = new Chart(ctx, {
                type: sourceChart.config.type,
                data: JSON.parse(JSON.stringify(sourceChart.data)),
                options: {
                    ...sourceChart.config.options,
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
        
        this.showModal(modal);
    }
    
    showModal(modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    hideModal(modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    
    createToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const toastId = ++this.toastId;
        
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span>${message}</span>
                <button onclick="dashboard.removeToast(${toastId})" style="background: none; border: none; color: inherit; margin-left: 12px; cursor: pointer; font-size: 16px;">&times;</button>
            </div>
        `;
        toast.dataset.id = toastId;
        
        container.appendChild(toast);
        
        // 自动移除
        setTimeout(() => {
            this.removeToast(toastId);
        }, 5000);
        
        return toastId;
    }
    
    removeToast(toastId) {
        const toast = document.querySelector(`[data-id="${toastId}"]`);
        if (toast) {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    }
    
    showToast(message, type = 'info') {
        return this.createToast(message, type);
    }
    
    applyProcessFilters(processes) {
        const categoryFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        const memoryThreshold = parseInt(document.getElementById('memory-threshold')?.value || 10);
        const showProtected = document.getElementById('show-protected')?.checked !== false;
        
        return processes.filter(proc => {
            // 分类过滤
            if (categoryFilter !== 'all' && proc.category !== categoryFilter) {
                return false;
            }
            
            // 内存阈值过滤
            if ((proc.memory_rss_mb || 0) < memoryThreshold) {
                return false;
            }
            
            // 受保护进程过滤
            if (!showProtected && proc.is_protected) {
                return false;
            }
            
            return true;
        });
    }
    
    initProcessFilters() {
        // 分类筛选按钮
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                const container = e.target.closest('.card-filters');
                if (container) {
                    container.querySelectorAll('.filter-btn').forEach(btn => 
                        btn.classList.remove('active')
                    );
                    e.target.classList.add('active');
                    this.refreshMemoryProcesses();
                }
            }
        });
        
        // 内存阈值滑块
        const memoryThreshold = document.getElementById('memory-threshold');
        const memoryThresholdValue = document.getElementById('memory-threshold-value');
        if (memoryThreshold && memoryThresholdValue) {
            memoryThreshold.addEventListener('input', (e) => {
                memoryThresholdValue.textContent = e.target.value + ' MB';
                this.refreshMemoryProcesses();
            });
        }
        
        // 显示受保护进程复选框
        const showProtected = document.getElementById('show-protected');
        if (showProtected) {
            showProtected.addEventListener('change', () => {
                this.refreshMemoryProcesses();
            });
        }
    }
    
    refreshMemoryProcesses() {
        // 重新获取和显示内存进程列表
        if (this.lastStatsData && this.lastStatsData.memory_processes) {
            this.updateMemoryProcessList(this.lastStatsData.memory_processes);
        }
    }


    updateMemoryProcessList(memoryProcesses) {
        const tbody = document.getElementById('memory-processes-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // 应用过滤器
        let filteredProcesses = this.applyProcessFilters(memoryProcesses);

        filteredProcesses.forEach(proc => {
            const row = document.createElement('tr');
            const canKill = !proc.is_protected;
            const cmdline = proc.cmdline && proc.cmdline.length > 30 ? 
                           proc.cmdline.substring(0, 30) + '...' : proc.cmdline;
            
            // 状态显示样式
            const statusClass = this.getProcessStatusClass(proc.status_display);
            const statusDisplay = proc.status_display || '未知';
            
            // CPU使用率显示
            const cpuPercent = (proc.cpu_percent || 0).toFixed(1);
            const cpuClass = proc.cpu_percent > 5 ? 'high-cpu' : proc.cpu_percent > 1 ? 'medium-cpu' : 'low-cpu';
            
            // 运行时间显示
            const runningTime = proc.running_time || '未知';
            
            // 分类显示
            const categoryMap = {
                'kernel': '内核',
                'system_service': '系统服务',
                'web_server': 'Web服务',
                'database': '数据库',
                'development': '开发工具',
                'desktop': '桌面环境',
                'browser': '浏览器',
                'user_app': '用户应用',
                'other': '其他'
            };
            const categoryDisplay = categoryMap[proc.category] || proc.category || '未知';
            const categoryClass = `category-${proc.category}`;
            
            row.innerHTML = `
                <td>${proc.pid || '-'}</td>
                <td>${proc.name || '-'}</td>
                <td>${proc.username || '-'}</td>
                <td><span class="category-badge ${categoryClass}">${categoryDisplay}</span></td>
                <td>${proc.memory_rss_mb || 0}</td>
                <td>${(proc.memory_percent || 0).toFixed(1)}%</td>
                <td class="${cpuClass}">${cpuPercent}%</td>
                <td class="status-col">
                    <span class="status-badge ${statusClass}" title="运行时间: ${runningTime}">
                        ${statusDisplay}
                    </span>
                </td>
                <td class="command-col" title="${proc.cmdline || '-'}">
                    <span class="command-text">${cmdline || '-'}</span>
                </td>
                <td>
                    ${canKill ? 
                        `<button class="kill-process-btn" onclick="dashboard.confirmKillProcess(${proc.pid}, '${proc.name}', ${proc.memory_rss_mb})">终止</button>` :
                        '<span class="protected">受保护</span>'
                    }
                </td>
            `;
            row.dataset.category = proc.category;
            row.dataset.protected = proc.is_protected ? 'true' : 'false';
            row.dataset.memoryMb = proc.memory_rss_mb || 0;
            tbody.appendChild(row);
        });
        
        // 添加命令行工具提示
        this.addCommandTooltips(tbody);
    }
    
    getProcessStatusClass(status) {
        const statusClassMap = {
            '运行中': 'status-running',
            '活跃睡眠': 'status-active-sleep', 
            '网络等待': 'status-network-wait',
            'I/O等待': 'status-io-wait',
            '空闲睡眠': 'status-idle-sleep',
            '睡眠': 'status-sleeping',
            '磁盘等待': 'status-disk-wait',
            '僵尸进程': 'status-zombie',
            '已停止': 'status-stopped',
            '未知': 'status-unknown'
        };
        return statusClassMap[status] || 'status-unknown';
    }
    
    addCommandTooltips(tbody) {
        const commandCells = tbody.querySelectorAll('.command-col');
        
        commandCells.forEach(cell => {
            const span = cell.querySelector('.command-text');
            const fullCommand = cell.title;
            
            if (fullCommand && fullCommand !== '-' && span.textContent !== fullCommand) {
                cell.addEventListener('mouseenter', (e) => {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'command-tooltip';
                    tooltip.textContent = fullCommand;
                    
                    document.body.appendChild(tooltip);
                    
                    const rect = cell.getBoundingClientRect();
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.top = `${rect.bottom + 5}px`;
                    tooltip.style.display = 'block';
                    
                    cell.dataset.tooltipId = Date.now();
                    tooltip.dataset.tooltipId = cell.dataset.tooltipId;
                });
                
                cell.addEventListener('mouseleave', (e) => {
                    const tooltip = document.querySelector(`[data-tooltip-id="${cell.dataset.tooltipId}"]`);
                    if (tooltip) {
                        tooltip.remove();
                    }
                });
            }
        });
    }

    confirmKillProcess(pid, name, memoryMB) {
        const dialog = document.getElementById('confirm-dialog');
        const message = document.getElementById('confirm-message');
        const modalTitle = document.getElementById('modal-title');
        
        modalTitle.textContent = '确认终止进程';
        message.innerHTML = `
            <strong>您确定要终止以下进程吗？</strong><br><br>
            PID: <code>${pid}</code><br>
            进程名: <code>${name}</code><br>
            内存占用: <code>${memoryMB}MB</code><br><br>
            <span style="color: #e53e3e; font-size: 14px;">此操作无法撤销！</span>
        `;
        
        document.getElementById('confirm-yes').onclick = () => {
            this.killProcess(pid);
            this.hideModal(dialog);
        };
        
        this.showModal(dialog);
    }

    async killProcess(pidOrPort) {
        this.showLoadingIndicator('正在终止进程...');
        
        try {
            const isPort = typeof pidOrPort === 'string' && pidOrPort.length <= 5;
            const endpoint = isPort ? `/api/kill_port_process/${pidOrPort}` : `/api/kill_process/${pidOrPort}`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast(result.message || '进程已成功终止', 'success');
                // 立即刷新数据
                this.socket.emit('request_stats');
            } else {
                this.showToast(`操作失败: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error killing process:', error);
            this.showToast('网络错误，操作失败', 'error');
        } finally {
            this.hideLoadingIndicator();
        }
    }
    
    showLoadingIndicator(message = '加载中...') {
        const indicator = document.getElementById('loading-indicator');
        const messageEl = document.getElementById('loading-message');
        
        if (messageEl) messageEl.textContent = message;
        indicator.style.display = 'flex';
    }
    
    hideLoadingIndicator() {
        const indicator = document.getElementById('loading-indicator');
        indicator.style.display = 'none';
    }

    updateStatus(status) {
        document.getElementById('last-update').textContent = status;
    }
    
    // 显示初始加载指示器
    showInitialLoading() {
        const loadingOverlay = document.getElementById('loading-indicator');
        const loadingMessage = document.getElementById('loading-message');
        
        if (loadingOverlay && loadingMessage) {
            loadingMessage.textContent = '正在连接服务器并加载数据...';
            loadingOverlay.style.display = 'flex';
        }
        
        // 设置加载超时（15秒后强制隐藏）
        this.dataLoadTimeout = setTimeout(() => {
            this.hideInitialLoading();
            this.showToast('数据加载超时，请刷新页面重试', 'warning');
        }, 15000);
    }
    
    // 隐藏初始加载指示器
    hideInitialLoading() {
        const loadingOverlay = document.getElementById('loading-indicator');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        // 清除超时定时器
        if (this.dataLoadTimeout) {
            clearTimeout(this.dataLoadTimeout);
            this.dataLoadTimeout = null;
        }
    }
    
    // 请求初始数据
    requestInitialData() {
        // 1. 立即通过WebSocket请求数据
        this.socket.emit('request_stats');
        
        // 2. 同时通过HTTP请求初始数据（作为备用）
        this.requestStatsViaHTTP();
        
        // 3. 如果2秒内没有收到数据，再次请求
        setTimeout(() => {
            if (this.isInitialLoad) {
                this.socket.emit('request_stats');
            }
        }, 2000);
        
        // 4. 如果5秒内还没有收到数据，第三次请求
        setTimeout(() => {
            if (this.isInitialLoad) {
                this.socket.emit('request_stats');
                // 再次尝试HTTP请求
                this.requestStatsViaHTTP();
            }
        }, 5000);
    }
    
    // 通过HTTP请求统计数据（作为备用方案）
    async requestStatsViaHTTP() {
        try {
            const response = await fetch('/api/stats');
            if (response.ok) {
                const data = await response.json();
                // 如果还在初始加载状态，处理数据
                if (this.isInitialLoad) {
                    this.hideInitialLoading();
                    this.hideDataLoading();
                    this.isInitialLoad = false;
                    this.updateDashboard(data);
                    console.log('Initial data loaded via HTTP');
                }
            }
        } catch (error) {
            console.warn('HTTP stats request failed:', error);
            // HTTP失败不阻塞，继续等待WebSocket
        }
    }
    
    // 显示数据加载状态
    showDataLoading() {
        // 为关键数据元素显示加载状态
        const loadingElements = [
            'cpu-usage', 'cpu-overview', 'memory-usage', 'memory-overview',
            'disk-overview', 'network-overview', 'hostname', 'ip-address',
            'uptime', 'health-score', 'active-processes', 'network-connections'
        ];
        
        loadingElements.forEach(id => {
            const element = document.getElementById(id);
            if (element && !element.classList.contains('loading-pulse')) {
                element.classList.add('loading-pulse');
                this.loadingElements.add(id);
            }
        });
    }
    
    // 隐藏数据加载状态
    hideDataLoading() {
        this.loadingElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('loading-pulse');
            }
        });
        this.loadingElements.clear();
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 终端相关方法
    initTerminal() {
        // 使用try-catch确保终端功能错误不会影响其他功能
        try {
            // 延迟绑定事件，确保DOM已加载
            setTimeout(() => {
                try {
                    const newTerminalBtn = document.getElementById('new-terminal-btn');
                    const clearTerminalBtn = document.getElementById('clear-terminal-btn');
                    
                    if (newTerminalBtn) {
                        newTerminalBtn.addEventListener('click', () => {
                            try {
                                console.log('New terminal button clicked');
                                this.createNewTerminal();
                            } catch (error) {
                                console.error('Error creating terminal:', error);
                                this.showToast('创建终端失败', 'error');
                            }
                        });
                    } else {
                        console.log('New terminal button not found');
                    }

                    if (clearTerminalBtn) {
                        clearTerminalBtn.addEventListener('click', () => {
                            try {
                                this.clearCurrentTerminal();
                            } catch (error) {
                                console.error('Error clearing terminal:', error);
                            }
                        });
                    }

                    // 初始化虚拟键盘
                    this.initMobileKeyboard();

                    // 初始化终端设置控件
                    this.initTerminalSettings();

                    // 检测移动设备
                    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    // 移动端优化
                    if (this.isMobile) {
                        this.initMobileOptimizations();
                        const mobileKeyboard = document.getElementById('mobile-keyboard');
                        if (mobileKeyboard) {
                            mobileKeyboard.style.display = 'block';
                        }
                    }
                    
                    // 监听窗口大小变化
                    window.addEventListener('resize', () => {
                        try {
                            this.handleResize();
                        } catch (error) {
                            console.error('Error handling resize:', error);
                        }
                    });
                } catch (error) {
                    console.error('Error initializing terminal:', error);
                }
            }, 1000);
        } catch (error) {
            console.error('Critical error in terminal initialization:', error);
        }
    }

    initTerminalSettings() {
        try {
            // 动态计算最佳字体大小
            const pixelRatio = window.devicePixelRatio || 1;
            const screenWidth = window.innerWidth;
            let defaultFontSize;
            
            if (this.isMobile) {
                // 移动端：根据屏幕宽度调整字体大小
                if (screenWidth <= 320) {
                    defaultFontSize = 14; // 超小屏
                } else if (screenWidth <= 480) {
                    defaultFontSize = 15; // 小屏
                } else {
                    defaultFontSize = 16; // 平板
                }
            } else {
                // 桌面端：根据像素密度和屏幕宽度调整
                if (pixelRatio >= 2 && screenWidth >= 1920) {
                    defaultFontSize = 18; // 高分辨率大屏
                } else if (pixelRatio >= 1.5) {
                    defaultFontSize = 17; // 高分辨率中屏
                } else if (screenWidth >= 1440) {
                    defaultFontSize = 17; // 大屏普通分辨率
                } else {
                    defaultFontSize = 16; // 标准屏幕
                }
            }

            // 终端设置默认值
            this.terminalSettings = {
                fontSize: defaultFontSize,
                theme: 'dark'
            };

            // 从localStorage加载设置
            this.loadTerminalSettings();

            // 更新显示
            this.updateFontSizeDisplay();
            this.updateThemeSelector();

            // 绑定字体大小控件
            const fontDecrease = document.getElementById('font-decrease');
            const fontIncrease = document.getElementById('font-increase');
            
            if (fontDecrease) {
                fontDecrease.addEventListener('click', () => {
                    try {
                        this.adjustFontSize(-2);
                    } catch (error) {
                        console.error('Error adjusting font size:', error);
                    }
                });
            }

            if (fontIncrease) {
                fontIncrease.addEventListener('click', () => {
                    try {
                        this.adjustFontSize(2);
                    } catch (error) {
                        console.error('Error adjusting font size:', error);
                    }
                });
            }

            // 绑定主题选择器
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('change', (e) => {
                    try {
                        this.changeTheme(e.target.value);
                    } catch (error) {
                        console.error('Error changing theme:', error);
                    }
                });
            }
        } catch (error) {
            console.error('Error initializing terminal settings:', error);
        }
        
        // 初始化时立即应用字体优化
        setTimeout(() => {
            this.forceRefreshTerminalStyles();
        }, 500);
    }

    loadTerminalSettings() {
        try {
            const saved = localStorage.getItem('terminal-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.terminalSettings = { ...this.terminalSettings, ...settings };
            }
        } catch (error) {
            console.warn('Failed to load terminal settings:', error);
        }
    }

    saveTerminalSettings() {
        try {
            localStorage.setItem('terminal-settings', JSON.stringify(this.terminalSettings));
        } catch (error) {
            console.warn('Failed to save terminal settings:', error);
        }
    }

    updateFontSizeDisplay() {
        const display = document.getElementById('font-size-display');
        if (display) {
            display.textContent = this.terminalSettings.fontSize;
        }
    }

    updateThemeSelector() {
        const selector = document.getElementById('theme-selector');
        if (selector) {
            selector.value = this.terminalSettings.theme;
        }
    }

    adjustFontSize(delta) {
        const newSize = Math.max(10, Math.min(24, this.terminalSettings.fontSize + delta));
        if (newSize !== this.terminalSettings.fontSize) {
            this.terminalSettings.fontSize = newSize;
            this.updateFontSizeDisplay();
            this.saveTerminalSettings();
            this.applySettingsToAllTerminals();
        }
    }

    changeTheme(theme) {
        if (theme !== this.terminalSettings.theme) {
            this.terminalSettings.theme = theme;
            this.saveTerminalSettings();
            this.applySettingsToAllTerminals();
        }
    }

    getTerminalTheme(themeName) {
        const themes = {
            dark: {
                background: '#1e1e1e',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selection: '#ffffff20',
                black: '#1e1e1e',
                red: '#f87171',
                green: '#10b981',
                yellow: '#fbbf24',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#f3f4f6',
                brightBlack: '#6b7280',
                brightRed: '#fca5a5',
                brightGreen: '#34d399',
                brightYellow: '#fcd34d',
                brightBlue: '#60a5fa',
                brightMagenta: '#c084fc',
                brightCyan: '#22d3ee',
                brightWhite: '#ffffff'
            },
            light: {
                background: '#ffffff',
                foreground: '#1f2937',
                cursor: '#1f2937',
                selection: '#e5e7eb',
                black: '#374151',
                red: '#dc2626',
                green: '#059669',
                yellow: '#d97706',
                blue: '#2563eb',
                magenta: '#7c3aed',
                cyan: '#0891b2',
                white: '#f9fafb',
                brightBlack: '#6b7280',
                brightRed: '#ef4444',
                brightGreen: '#10b981',
                brightYellow: '#f59e0b',
                brightBlue: '#3b82f6',
                brightMagenta: '#8b5cf6',
                brightCyan: '#06b6d4',
                brightWhite: '#ffffff'
            },
            green: {
                background: '#0d1117',
                foreground: '#00ff41',
                cursor: '#00ff41',
                selection: '#00ff4120',
                black: '#0d1117',
                red: '#ff5555',
                green: '#00ff41',
                yellow: '#ffff55',
                blue: '#55aaff',
                magenta: '#ff55ff',
                cyan: '#55ffff',
                white: '#bbbbbb',
                brightBlack: '#555555',
                brightRed: '#ff8888',
                brightGreen: '#88ff88',
                brightYellow: '#ffff88',
                brightBlue: '#8888ff',
                brightMagenta: '#ff88ff',
                brightCyan: '#88ffff',
                brightWhite: '#ffffff'
            },
            blue: {
                background: '#1e3a8a',
                foreground: '#e0e7ff',
                cursor: '#e0e7ff',
                selection: '#e0e7ff20',
                black: '#1e40af',
                red: '#fca5a5',
                green: '#86efac',
                yellow: '#fcd34d',
                blue: '#93c5fd',
                magenta: '#c4b5fd',
                cyan: '#67e8f9',
                white: '#e0e7ff',
                brightBlack: '#3730a3',
                brightRed: '#fecaca',
                brightGreen: '#bbf7d0',
                brightYellow: '#fde68a',
                brightBlue: '#bfdbfe',
                brightMagenta: '#ddd6fe',
                brightCyan: '#a5f3fc',
                brightWhite: '#ffffff'
            }
        };
        return themes[themeName] || themes.dark;
    }

    applySettingsToAllTerminals() {
        this.terminals.forEach(terminalInfo => {
            const terminal = terminalInfo.terminal;
            
            try {
                // 应用字体设置（与4.19.0版本兼容）
                terminal.options.fontSize = this.terminalSettings.fontSize;
                terminal.options.lineHeight = 1.2;          // 防止字体被压扁
                terminal.options.fontWeight = '600';        // 加粗字体提高清晰度
                terminal.options.fontWeightBold = '800';    // 粗体更加明显
                terminal.options.letterSpacing = 0.3;       // 优化字符间距
                
                // 应用主题
                const theme = this.getTerminalTheme(this.terminalSettings.theme);
                Object.keys(theme).forEach(key => {
                    terminal.options.theme[key] = theme[key];
                });

                // 强制刷新终端显示
                terminal.refresh(0, terminal.rows - 1);
                terminal.reset();
                terminal.clear();
                
                // 重新适应大小并刷新布局
                if (terminalInfo.fitAddon) {
                    setTimeout(() => {
                        terminalInfo.fitAddon.fit();
                        // 再次刷新以确保设置生效
                        terminal.refresh(0, terminal.rows - 1);
                    }, 150);
                }
                
                // 强制更新DOM样式
                const terminalElement = document.getElementById(`terminal-${terminalInfo.id}`);
                if (terminalElement) {
                    // 触发重新渲染
                    terminalElement.style.display = 'none';
                    terminalElement.offsetHeight; // 强制重流
                    terminalElement.style.display = 'block';
                }
                
            } catch (error) {
                console.warn(`终端 ${terminalInfo.id} 字体设置应用失败:`, error);
            }
        });
        
        console.log('已应用优化字体设置到所有终端');
        
        // 立即更新CSS样式以确保效果可见
        this.forceRefreshTerminalStyles();
    }
    
    // 强制刷新终端样式 - 解决字体显示问题
    forceRefreshTerminalStyles() {
        // 动态添加强化样式
        const styleId = 'terminal-font-fix';
        let existingStyle = document.getElementById(styleId);
        
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .terminal-instance .xterm-rows span {
                font-weight: 600 !important;
                letter-spacing: 0.3px !important;
                line-height: 1.2 !important;
                -webkit-font-smoothing: antialiased !important;
            }
            .terminal-instance .xterm-rows > div > span {
                font-weight: 600 !important;
                letter-spacing: 0.3px !important;
            }
            .terminal-instance .xterm-char-measure-element {
                font-weight: 600 !important;
                letter-spacing: 0.3px !important;
                line-height: 1.2 !important;
            }
        `;
        
        document.head.appendChild(style);
        
        // 在下一帧刷新所有终端显示
        requestAnimationFrame(() => {
            this.terminals.forEach(terminalInfo => {
                const terminal = terminalInfo.terminal;
                if (terminal && terminal.refresh) {
                    terminal.refresh(0, terminal.rows - 1);
                }
            });
        });
        
        console.log('已强制刷新终端字体样式');
    }

    // 移动端优化
    initMobileOptimizations() {
        console.log('Initializing mobile optimizations...');
        
        // 设置移动端默认字体大小
        if (!this.terminalSettings) {
            this.terminalSettings = {
                fontSize: 17,
                theme: 'dark'
            };
        }
        
        // 添加触摸优化
        this.addTouchOptimizations();
        
        // 阻止页面缩放
        this.preventZoom();
        
        // 优化键盘行为
        this.optimizeVirtualKeyboard();
    }

    addTouchOptimizations() {
        // 为小按钮添加更大的触摸区域
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .btn.btn-small {
                    position: relative;
                }
                
                .btn.btn-small::before {
                    content: '';
                    position: absolute;
                    top: -10px;
                    left: -10px;
                    right: -10px;
                    bottom: -10px;
                    border-radius: 8px;
                }
                
                .terminal-tab .close-terminal::before {
                    top: -8px;
                    left: -8px;
                    right: -8px;
                    bottom: -8px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    preventZoom() {
        // 阻止双击缩放
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function (event) {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // 阻止手势缩放
        document.addEventListener('gesturestart', function (e) {
            e.preventDefault();
        });
        
        document.addEventListener('gesturechange', function (e) {
            e.preventDefault();
        });
        
        document.addEventListener('gestureend', function (e) {
            e.preventDefault();
        });
    }

    optimizeVirtualKeyboard() {
        // 优化虚拟键盘的显示和隐藏
        const mobileKeyboard = document.getElementById('mobile-keyboard');
        if (!mobileKeyboard) return;
        
        // 添加滑动手势隐藏/显示键盘
        let startY = 0;
        let isKeyboardVisible = true;
        
        mobileKeyboard.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        });
        
        mobileKeyboard.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            
            if (Math.abs(diff) > 50) {
                if (diff > 0 && isKeyboardVisible) {
                    // 下滑隐藏键盘
                    mobileKeyboard.style.transform = 'translateY(100%)';
                    isKeyboardVisible = false;
                } else if (diff < 0 && !isKeyboardVisible) {
                    // 上滑显示键盘
                    mobileKeyboard.style.transform = 'translateY(0)';
                    isKeyboardVisible = true;
                }
                startY = currentY;
            }
        });
        
        // 添加键盘切换按钮
        this.addKeyboardToggle();
    }

    addKeyboardToggle() {
        const terminalControls = document.querySelector('.terminal-controls');
        if (!terminalControls || !this.isMobile) return;
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-small keyboard-toggle';
        toggleBtn.innerHTML = '⌨️';
        toggleBtn.title = '显示/隐藏虚拟键盘';
        
        toggleBtn.addEventListener('click', () => {
            const mobileKeyboard = document.getElementById('mobile-keyboard');
            if (!mobileKeyboard) return;
            
            const isHidden = mobileKeyboard.style.transform === 'translateY(100%)';
            if (isHidden) {
                mobileKeyboard.style.transform = 'translateY(0)';
                toggleBtn.innerHTML = '⌨️';
            } else {
                mobileKeyboard.style.transform = 'translateY(100%)';
                toggleBtn.innerHTML = '⌨️';
            }
        });
        
        // 添加到主控制区域
        const mainControls = terminalControls.querySelector('.terminal-main-controls');
        if (mainControls) {
            mainControls.appendChild(toggleBtn);
        }
    }

    handleResize() {
        // 处理窗口大小变化
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
        }
        
        this.resizeTimer = setTimeout(() => {
            // 重新适应所有终端大小
            this.terminals.forEach(terminalInfo => {
                if (terminalInfo.fitAddon) {
                    terminalInfo.fitAddon.fit();
                }
            });
            
            // 更新移动设备检测
            const newIsMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
            
            if (newIsMobile !== this.isMobile) {
                this.isMobile = newIsMobile;
                
                // 调整字体大小（基于设备和屏幕分辨率）
                if (this.terminalSettings) {
                    let baseFontSize;
                    const pixelRatio = window.devicePixelRatio || 1;
                    const screenWidth = window.innerWidth;
                    
                    if (this.isMobile) {
                        // 移动端：增大字体以提高可读性
                        if (screenWidth <= 320) {
                            baseFontSize = 16; // 超小屏
                        } else if (screenWidth <= 480) {
                            baseFontSize = 17; // 小屏
                        } else {
                            baseFontSize = 18; // 平板
                        }
                    } else {
                        // 桌面端：根据像素密度和屏幕宽度优化字体大小
                        if (pixelRatio >= 2 && screenWidth >= 1920) {
                            baseFontSize = 18; // 高分辨率大屏
                        } else if (pixelRatio >= 1.5) {
                            baseFontSize = 17; // 高分辨率中屏
                        } else if (screenWidth >= 1440) {
                            baseFontSize = 17; // 大屏普通分辨率
                        } else {
                            baseFontSize = 16; // 标准屏幕
                        }
                    }
                    
                    if (baseFontSize !== this.terminalSettings.fontSize) {
                        this.terminalSettings.fontSize = baseFontSize;
                        this.updateFontSizeDisplay();
                        this.applySettingsToAllTerminals();
                        this.saveTerminalSettings();
                        console.log(`Terminal font size adjusted to ${baseFontSize}px for ${this.isMobile ? 'mobile' : 'desktop'} (ratio: ${pixelRatio}, width: ${screenWidth})`);
                    }
                }
                
                // 显示或隐藏虚拟键盘
                const mobileKeyboard = document.getElementById('mobile-keyboard');
                if (mobileKeyboard) {
                    mobileKeyboard.style.display = this.isMobile ? 'block' : 'none';
                }
            }
        }, 250);
    }

    initMobileKeyboard() {
        const keyboard = document.getElementById('mobile-keyboard');
        if (keyboard) {
            keyboard.addEventListener('click', (e) => {
                if (e.target.classList.contains('key-btn')) {
                    const key = e.target.dataset.key;
                    this.sendKeyToTerminal(key);
                }
            });
        }
    }

    sendKeyToTerminal(key) {
        if (!this.currentTerminal) return;

        let data = '';
        switch (key) {
            case 'Tab':
                data = '\t';
                break;
            case 'Enter':
                data = '\r';
                break;
            case 'Escape':
                data = '\x1b';
                break;
            case 'ArrowUp':
                data = '\x1b[A';
                break;
            case 'ArrowDown':
                data = '\x1b[B';
                break;
            case 'ArrowRight':
                data = '\x1b[C';
                break;
            case 'ArrowLeft':
                data = '\x1b[D';
                break;
            case 'Home':
                data = '\x1b[H';
                break;
            case 'End':
                data = '\x1b[F';
                break;
            case 'PageUp':
                data = '\x1b[5~';
                break;
            case 'PageDown':
                data = '\x1b[6~';
                break;
            case 'Ctrl+C':
                data = '\x03';
                break;
            case 'Ctrl+D':
                data = '\x04';
                break;
            case 'Ctrl+Z':
                data = '\x1a';
                break;
            case 'Ctrl+L':
                data = '\x0c';
                break;
            default:
                return;
        }

        this.socket.emit('terminal_input', {
            session_id: this.currentTerminal.sessionId,
            data: data
        });
    }

    createNewTerminal() {
        console.log('Creating new terminal...');
        this.socket.emit('terminal_create');
    }

    onTerminalCreated(sessionId) {
        try {
            console.log('Terminal created with session ID:', sessionId);
            const terminalId = ++this.terminalCounter;
            const terminalName = `终端 ${terminalId}`;

            // 使用当前设置的字体大小和主题
            const theme = this.getTerminalTheme(this.terminalSettings?.theme || 'dark');
            const fontSize = this.terminalSettings?.fontSize || (this.isMobile ? 17 : 16);

            // 检查xterm.js依赖是否加载
            if (typeof Terminal === 'undefined') {
                console.error('Terminal library not loaded');
                this.showToast('终端组件加载失败，请刷新页面', 'error');
                return;
            }

            if (typeof FitAddon === 'undefined' || typeof WebLinksAddon === 'undefined') {
                console.error('Terminal addons not loaded');
                this.showToast('终端插件加载失败，请刷新页面', 'error');
                return;
            }

            // 创建xterm终端实例（优化字体显示）
            const terminal = new Terminal({
                theme: theme,
                fontSize: fontSize,
                lineHeight: 1.2,  // 适当的行高防止被压扁
                fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "SF Mono", "Monaco", "Consolas", "DejaVu Sans Mono", "Liberation Mono", "Ubuntu Mono", "Courier New", monospace',
                fontWeight: '600',      // 加粗普通字体
                fontWeightBold: '800',  // 加粗粗体字体
                letterSpacing: 0.3,     // 适当字符间距提高可读性
                cursorBlink: true,
                cursorStyle: 'block',
                scrollback: 1000,
                convertEol: true,
                allowTransparency: false
            });

        // 创建插件
        const fitAddon = new FitAddon.FitAddon();
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);

        // 创建终端容器
        const terminalDiv = document.createElement('div');
        terminalDiv.className = 'terminal-instance';
        terminalDiv.id = `terminal-${terminalId}`;
        terminalDiv.style.display = 'none';

        // 创建标签页
        const terminalTab = document.createElement('div');
        terminalTab.className = 'terminal-tab';
        terminalTab.innerHTML = `
            <span class="tab-title">${terminalName}</span>
            <button class="close-terminal" data-terminal-id="${terminalId}" title="关闭终端">×</button>
        `;

        // 添加到DOM
        document.getElementById('terminal-sessions').appendChild(terminalDiv);
        document.getElementById('terminal-tabs').appendChild(terminalTab);

        // 打开终端
        terminal.open(terminalDiv);
        fitAddon.fit();

        // 存储终端信息
        const terminalInfo = {
            id: terminalId,
            sessionId: sessionId,
            terminal: terminal,
            fitAddon: fitAddon,
            div: terminalDiv,
            tab: terminalTab,
            name: terminalName
        };

        this.terminals.set(terminalId, terminalInfo);

        // 设置为当前终端
        this.switchToTerminal(terminalId);

        // 绑定事件
        terminal.onData((data) => {
            this.socket.emit('terminal_input', {
                session_id: sessionId,
                data: data
            });
        });

        terminal.onResize(({ cols, rows }) => {
            this.socket.emit('terminal_resize', {
                session_id: sessionId,
                cols: cols,
                rows: rows
            });
        });

        // 标签页点击事件
        terminalTab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('close-terminal')) {
                this.switchToTerminal(terminalId);
            }
        });

        // 关闭按钮事件
        terminalTab.querySelector('.close-terminal').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTerminal(terminalId);
        });

        // 隐藏欢迎消息
        document.getElementById('no-terminal-message').style.display = 'none';

        // 窗口调整大小时重新适应
        const resizeObserver = new ResizeObserver(() => {
            if (this.currentTerminal && this.currentTerminal.id === terminalId) {
                setTimeout(() => fitAddon.fit(), 100);
            }
        });
        resizeObserver.observe(terminalDiv);

        this.showToast(`${terminalName} 已创建`, 'success');
        } catch (error) {
            console.error('Error in onTerminalCreated:', error);
            this.showToast('创建终端时发生错误', 'error');
        }
    }

    onTerminalOutput(data) {
        console.log('Terminal output received:', data.substring(0, 100));
        if (this.currentTerminal) {
            this.currentTerminal.terminal.write(data);
        } else {
            console.log('No current terminal to write to');
        }
    }

    onTerminalClosed(sessionId) {
        // 找到对应的终端并关闭
        for (const [id, terminal] of this.terminals) {
            if (terminal.sessionId === sessionId) {
                this.closeTerminalById(id);
                break;
            }
        }
    }

    switchToTerminal(terminalId) {
        const terminalInfo = this.terminals.get(terminalId);
        if (!terminalInfo) return;

        // 隐藏所有终端
        this.terminals.forEach(terminal => {
            terminal.div.style.display = 'none';
            terminal.tab.classList.remove('active');
        });

        // 显示选中的终端
        terminalInfo.div.style.display = 'block';
        terminalInfo.tab.classList.add('active');

        this.currentTerminal = terminalInfo;

        // 重新适应大小和焦点
        setTimeout(() => {
            terminalInfo.fitAddon.fit();
            terminalInfo.terminal.focus();
        }, 100);
    }

    closeTerminal(terminalId) {
        const terminalInfo = this.terminals.get(terminalId);
        if (!terminalInfo) return;

        // 发送关闭信号到服务器
        this.socket.emit('terminal_close', {
            session_id: terminalInfo.sessionId
        });

        this.closeTerminalById(terminalId);
    }

    closeTerminalById(terminalId) {
        const terminalInfo = this.terminals.get(terminalId);
        if (!terminalInfo) return;

        // 清理DOM
        terminalInfo.div.remove();
        terminalInfo.tab.remove();

        // 清理终端实例
        terminalInfo.terminal.dispose();

        // 从Map中删除
        this.terminals.delete(terminalId);

        // 如果关闭的是当前终端，切换到另一个终端或显示欢迎消息
        if (this.currentTerminal && this.currentTerminal.id === terminalId) {
            if (this.terminals.size > 0) {
                const firstTerminalId = this.terminals.keys().next().value;
                this.switchToTerminal(firstTerminalId);
            } else {
                this.currentTerminal = null;
                document.getElementById('no-terminal-message').style.display = 'block';
            }
        }

        this.showToast(`${terminalInfo.name} 已关闭`, 'info');
    }

    clearCurrentTerminal() {
        if (this.currentTerminal) {
            this.currentTerminal.terminal.clear();
        }
    }

    // ===== DNS相关方法 =====
    
    initDNS() {
        // DNS状态管理
        this.dnsQueryChart = null;
        this.dnsStatus = {
            running: false,
            stats: {},
            adblockStats: {}
        };
        
        // 绑定DNS控制按钮事件
        const startBtn = document.getElementById('dns-start-btn');
        const stopBtn = document.getElementById('dns-stop-btn');
        const restartBtn = document.getElementById('dns-restart-btn');
        const updateBlocklistBtn = document.getElementById('update-blocklist-btn');
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        const refreshQueriesBtn = document.getElementById('refresh-queries-btn');
        const addWhitelistBtn = document.getElementById('add-whitelist-btn');
        
        if (startBtn) startBtn.addEventListener('click', () => this.startDNSServer());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopDNSServer());
        if (restartBtn) restartBtn.addEventListener('click', () => this.restartDNSServer());
        if (updateBlocklistBtn) updateBlocklistBtn.addEventListener('click', () => this.updateBlocklist());
        if (clearCacheBtn) clearCacheBtn.addEventListener('click', () => this.clearDNSCache());
        if (refreshQueriesBtn) refreshQueriesBtn.addEventListener('click', () => this.refreshDNSQueries());
        if (addWhitelistBtn) addWhitelistBtn.addEventListener('click', () => this.addToWhitelist());
        
        // 绑定管理标签页事件
        const managementTabBtns = document.querySelectorAll('.management-tab-btn');
        managementTabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.getAttribute('data-target');
                this.switchManagementTab(target);
            });
        });
        
        // 绑定查询过滤器事件
        const queryFilter = document.getElementById('query-filter');
        if (queryFilter) {
            queryFilter.addEventListener('change', () => this.filterDNSQueries());
        }
        
        // 绑定回车键添加白名单
        const whitelistInput = document.getElementById('whitelist-domain-input');
        if (whitelistInput) {
            whitelistInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addToWhitelist();
                }
            });
        }
        
        // 初始化DNS图表
        this.initDNSChart();
        
        // 在标签页切换到DNS时请求DNS状态
        const dnsTabBtn = document.querySelector('[data-tab="dns"]');
        if (dnsTabBtn) {
            dnsTabBtn.addEventListener('click', () => {
                this.requestDNSStatus();
            });
        }
    }
    
    initDNSChart() {
        const ctx = document.getElementById('dns-query-chart');
        if (!ctx) return;
        
        this.dnsQueryChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '总查询',
                        data: [],
                        borderColor: '#4299e1',
                        backgroundColor: 'rgba(66, 153, 225, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '被屏蔽',
                        data: [],
                        borderColor: '#f56565',
                        backgroundColor: 'rgba(245, 101, 101, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'DNS查询趋势 (24小时)'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        });
    }
    
    requestDNSStatus() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('dns_request_status');
        } else {
            // 使用HTTP API作为备用
            fetch('/api/dns/status')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        this.updateDNSStatus({
                            dns_server: data.dns_server,
                            query_stats: data.query_stats,
                            adblock_stats: data.adblock_stats
                        });
                    }
                })
                .catch(error => {
                    console.error('Failed to fetch DNS status:', error);
                });
        }
    }
    
    updateDNSStatus(data) {
        const { dns_server, query_stats, adblock_stats } = data;
        
        // 更新服务器状态
        const statusIcon = document.getElementById('dns-server-status');
        const statusText = document.getElementById('dns-server-status-text');
        const listenAddress = document.getElementById('dns-listen-address');
        const uptime = document.getElementById('dns-uptime');
        
        if (dns_server.running) {
            if (statusIcon) statusIcon.textContent = '🟢';
            if (statusText) statusText.textContent = '运行中';
        } else {
            if (statusIcon) statusIcon.textContent = '🔴';
            if (statusText) statusText.textContent = '未运行';
        }
        
        if (listenAddress) listenAddress.textContent = `${dns_server.host}:${dns_server.port}`;
        if (uptime) {
            const uptimeText = dns_server.running ? this.formatUptime(dns_server.uptime) : '-';
            uptime.textContent = uptimeText;
        }
        
        // 更新查询统计
        const totalQueries = document.getElementById('total-queries');
        const blockedQueries = document.getElementById('blocked-queries');
        const allowedQueries = document.getElementById('allowed-queries');
        const blockRate = document.getElementById('block-rate');
        
        if (totalQueries) totalQueries.textContent = query_stats.total_queries || 0;
        if (blockedQueries) blockedQueries.textContent = query_stats.blocked_queries || 0;
        if (allowedQueries) allowedQueries.textContent = query_stats.allowed_queries || 0;
        if (blockRate) blockRate.textContent = `${query_stats.block_rate || 0}%`;
        
        // 更新广告屏蔽统计
        const blockedDomainsCount = document.getElementById('blocked-domains-count');
        const cacheHitRate = document.getElementById('cache-hit-rate');
        const lastUpdate = document.getElementById('last-update');
        
        if (blockedDomainsCount) blockedDomainsCount.textContent = adblock_stats.total_blocked_domains || 0;
        if (cacheHitRate) cacheHitRate.textContent = `${query_stats.cache_stats?.hit_rate || 0}%`;
        if (lastUpdate) {
            const updateText = adblock_stats.last_update ? 
                new Date(adblock_stats.last_update).toLocaleString() : '-';
            lastUpdate.textContent = updateText;
        }
        
        // 更新屏蔽列表源状态
        this.updateBlocklistSources(adblock_stats.blocklist_sources);
        
        // 更新DNS查询图表
        this.updateDNSChart(query_stats);
        
        // 更新查询记录
        this.loadDNSQueries();
        
        // 更新白名单
        this.loadWhitelist();
        
        // 更新客户端统计
        this.loadClientStats();
        
        // 更新热门域名
        this.loadTopDomains(query_stats.top_domains);
    }
    
    updateDNSChart(stats) {
        if (!this.dnsQueryChart) return;
        
        fetch('/api/dns/stats/hourly')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data.hourly_data) {
                    const hourlyData = data.data.hourly_data;
                    const labels = hourlyData.map(item => new Date(item.hour).toLocaleTimeString());
                    const totalData = hourlyData.map(item => item.queries);
                    const blockedData = hourlyData.map(item => item.blocked);
                    
                    this.dnsQueryChart.data.labels = labels;
                    this.dnsQueryChart.data.datasets[0].data = totalData;
                    this.dnsQueryChart.data.datasets[1].data = blockedData;
                    this.dnsQueryChart.update();
                }
            })
            .catch(error => {
                console.error('Failed to update DNS chart:', error);
            });
    }
    
    updateBlocklistSources(sources) {
        const sourcesList = document.getElementById('blocklist-sources-list');
        if (!sourcesList || !sources) return;
        
        sourcesList.innerHTML = '';
        
        Object.entries(sources).forEach(([name, enabled]) => {
            const sourceItem = document.createElement('div');
            sourceItem.className = `source-item ${enabled ? 'enabled' : 'disabled'}`;
            sourceItem.innerHTML = `
                <span>${name}</span>
                <span class="source-status ${enabled ? 'enabled' : 'disabled'}">
                    ${enabled ? '启用' : '禁用'}
                </span>
            `;
            sourcesList.appendChild(sourceItem);
        });
    }
    
    loadDNSQueries() {
        fetch('/api/dns/queries/recent?limit=50')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.updateDNSQueriesTable(data.queries, data.blocked_queries);
                }
            })
            .catch(error => {
                console.error('Failed to load DNS queries:', error);
            });
    }
    
    updateDNSQueriesTable(queries, blockedQueries) {
        const tbody = document.getElementById('dns-queries-tbody');
        if (!tbody) return;
        
        // 合并查询记录
        const allQueries = [
            ...queries.map(q => ({ ...q, blocked: false })),
            ...blockedQueries.map(q => ({ ...q, blocked: true, query_type: 'BLOCKED' }))
        ];
        
        // 按时间排序
        allQueries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        tbody.innerHTML = '';
        allQueries.slice(0, 50).forEach(query => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(query.timestamp).toLocaleTimeString()}</td>
                <td>${query.client_ip}</td>
                <td><code>${query.domain}</code></td>
                <td>${query.query_type || 'A'}</td>
                <td>
                    <span class="query-status ${query.blocked ? 'blocked' : 'allowed'}">
                        ${query.blocked ? '已屏蔽' : '已允许'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
    
    loadWhitelist() {
        fetch('/api/dns/whitelist')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.updateWhitelistDisplay(data.whitelist);
                }
            })
            .catch(error => {
                console.error('Failed to load whitelist:', error);
            });
    }
    
    updateWhitelistDisplay(whitelist) {
        const container = document.getElementById('whitelist-list');
        if (!container) return;
        
        container.innerHTML = '';
        whitelist.forEach(domain => {
            const item = document.createElement('div');
            item.className = 'whitelist-item';
            item.innerHTML = `
                <span class="whitelist-domain">${domain}</span>
                <button class="remove-whitelist-btn" onclick="dashboard.removeFromWhitelist('${domain}')">
                    移除
                </button>
            `;
            container.appendChild(item);
        });
    }
    
    loadClientStats() {
        fetch('/api/dns/clients')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.updateClientStatsDisplay(data.clients);
                }
            })
            .catch(error => {
                console.error('Failed to load client stats:', error);
            });
    }
    
    updateClientStatsDisplay(clients) {
        const container = document.getElementById('clients-stats-list');
        if (!container) return;
        
        container.innerHTML = '';
        clients.forEach(client => {
            const blockRateClass = client.block_rate > 50 ? 'high' : 
                                   client.block_rate > 20 ? 'medium' : 'low';
            
            const item = document.createElement('div');
            item.className = 'client-item';
            item.innerHTML = `
                <div class="client-ip">${client.client_ip}</div>
                <div class="client-stats">
                    <div class="client-stat">
                        <span class="client-stat-value">${client.total_queries}</span>
                        <span class="client-stat-label">总查询</span>
                    </div>
                    <div class="client-stat">
                        <span class="client-stat-value">${client.blocked_queries}</span>
                        <span class="client-stat-label">屏蔽</span>
                    </div>
                    <div class="client-stat">
                        <span class="client-stat-value">${client.cached_queries}</span>
                        <span class="client-stat-label">缓存</span>
                    </div>
                </div>
                <div class="client-block-rate ${blockRateClass}">
                    ${client.block_rate}%
                </div>
            `;
            container.appendChild(item);
        });
    }
    
    loadTopDomains(topDomains) {
        const container = document.getElementById('top-domains-list');
        if (!container || !topDomains) return;
        
        container.innerHTML = '';
        topDomains.forEach(([domain, count]) => {
            const item = document.createElement('div');
            item.className = 'domain-item';
            item.innerHTML = `
                <span class="domain-name">${domain}</span>
                <span class="domain-count">${count}</span>
            `;
            container.appendChild(item);
        });
    }
    
    // DNS控制方法
    startDNSServer() {
        this.socket.emit('dns_start');
        this.showToast('正在启动DNS服务器...', 'dns-info');
    }
    
    stopDNSServer() {
        this.socket.emit('dns_stop');
        this.showToast('正在停止DNS服务器...', 'dns-info');
    }
    
    restartDNSServer() {
        this.socket.emit('dns_restart');
        this.showToast('正在重启DNS服务器...', 'dns-info');
    }
    
    updateBlocklist() {
        this.socket.emit('dns_update_blocklist');
        this.showToast('正在更新屏蔽列表，请稍候...', 'dns-info');
    }
    
    clearDNSCache() {
        this.socket.emit('dns_clear_cache');
        this.showToast('正在清空DNS缓存...', 'dns-info');
    }
    
    refreshDNSQueries() {
        this.loadDNSQueries();
        this.showToast('查询记录已刷新', 'dns-success');
    }
    
    addToWhitelist() {
        const input = document.getElementById('whitelist-domain-input');
        const domain = input.value.trim();
        
        if (!domain) {
            this.showToast('请输入域名', 'dns-error');
            return;
        }
        
        fetch('/api/dns/whitelist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showToast(data.message, 'dns-success');
                input.value = '';
                this.loadWhitelist();
            } else {
                this.showToast(data.message, 'dns-error');
            }
        })
        .catch(error => {
            console.error('Failed to add to whitelist:', error);
            this.showToast('添加白名单失败', 'dns-error');
        });
    }
    
    removeFromWhitelist(domain) {
        if (!confirm(`确定要从白名单中移除 ${domain} 吗？`)) {
            return;
        }
        
        fetch('/api/dns/whitelist', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showToast(data.message, 'dns-success');
                this.loadWhitelist();
            } else {
                this.showToast(data.message, 'dns-error');
            }
        })
        .catch(error => {
            console.error('Failed to remove from whitelist:', error);
            this.showToast('移除白名单失败', 'dns-error');
        });
    }
    
    switchManagementTab(targetTab) {
        // 切换按钮状态
        document.querySelectorAll('.management-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-target="${targetTab}"]`).classList.add('active');
        
        // 切换内容显示
        document.querySelectorAll('.management-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(targetTab).classList.add('active');
    }
    
    filterDNSQueries() {
        const filter = document.getElementById('query-filter').value;
        const tbody = document.getElementById('dns-queries-tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const statusCell = row.querySelector('.query-status');
            if (!statusCell) return;
            
            const isBlocked = statusCell.classList.contains('blocked');
            const isAllowed = statusCell.classList.contains('allowed');
            
            let show = true;
            if (filter === 'blocked' && !isBlocked) show = false;
            if (filter === 'allowed' && !isAllowed) show = false;
            
            row.style.display = show ? '' : 'none';
        });
    }
    
    handleDNSActionResult(data) {
        const { action, success, message } = data;
        const toastType = success ? 'dns-success' : 'dns-error';
        
        let actionText = '';
        switch (action) {
            case 'start': actionText = 'DNS服务器启动'; break;
            case 'stop': actionText = 'DNS服务器停止'; break;
            case 'restart': actionText = 'DNS服务器重启'; break;
            case 'clear_cache': actionText = 'DNS缓存清空'; break;
            default: actionText = 'DNS操作';
        }
        
        this.showToast(`${actionText}${success ? '成功' : '失败'}: ${message}`, toastType);
        
        // 刷新状态
        if (success) {
            setTimeout(() => this.requestDNSStatus(), 1000);
        }
    }
    
    handleDNSUpdateStatus(data) {
        const { status, message, results } = data;
        
        if (status === 'updating') {
            this.showToast(message, 'dns-info');
        } else if (status === 'completed') {
            let successCount = 0;
            if (results) {
                successCount = Object.values(results).filter(r => r).length;
            }
            this.showToast(`${message} (${successCount}个列表更新成功)`, 'dns-success');
            
            // 刷新状态
            setTimeout(() => this.requestDNSStatus(), 1000);
        }
    }
    
    formatUptime(uptimeSeconds) {
        if (!uptimeSeconds || uptimeSeconds < 0) return '0秒';
        
        if (uptimeSeconds < 60) return `${uptimeSeconds}秒`;
        if (uptimeSeconds < 3600) return `${Math.floor(uptimeSeconds / 60)}分钟`;
        if (uptimeSeconds < 86400) return `${Math.floor(uptimeSeconds / 3600)}小时`;
        return `${Math.floor(uptimeSeconds / 86400)}天`;
    }
}

// 全局变量
let dashboard;

// 初始化仪表板
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new Dashboard();
});

// 添加CSS动画样式
const style = document.createElement('style');
style.textContent = `
@keyframes toastSlideOut {
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}

.command-text {
    cursor: help;
}

.loading-overlay {
    backdrop-filter: blur(3px);
}

.stat-item.pulse {
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

.tab-content {
    min-height: 400px;
}

.metric-card .card-body {
    min-height: 200px;
}

/* 终端样式 */
.terminal-container {
    margin: 20px 0;
}

.terminal-card {
    background: #2d3748;
    border: 1px solid #4a5568;
    border-radius: 8px;
}

.terminal-card .card-header {
    background: #2d3748;
    border-bottom: 1px solid #4a5568;
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.terminal-card .card-header h3 {
    color: #e2e8f0;
    margin: 0;
}

.terminal-controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

.terminal-tabs {
    display: flex;
    gap: 5px;
    margin-left: 15px;
}

.terminal-tab {
    background: #4a5568;
    border: 1px solid #718096;
    border-radius: 4px 4px 0 0;
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #cbd5e0;
    font-size: 14px;
    transition: background 0.2s;
}

.terminal-tab:hover {
    background: #718096;
}

.terminal-tab.active {
    background: #1e1e1e;
    color: #ffffff;
}

.close-terminal {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
}

.close-terminal:hover {
    background: rgba(255, 255, 255, 0.2);
}

.terminal-body {
    background: #1e1e1e;
    padding: 0;
    min-height: 500px;
}

.terminal-content {
    position: relative;
    height: 100%;
}

.no-terminal-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 400px;
    color: #a0aec0;
    text-align: center;
    padding: 40px;
}

.welcome-icon {
    font-size: 48px;
    margin-bottom: 20px;
}

.no-terminal-message h4 {
    color: #e2e8f0;
    margin: 0 0 10px 0;
    font-size: 24px;
}

.no-terminal-message p {
    margin: 0 0 30px 0;
    font-size: 16px;
}

.terminal-features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    max-width: 500px;
}

.feature-item {
    background: rgba(255, 255, 255, 0.05);
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 14px;
}

.terminal-sessions {
    min-height: 500px;
    position: relative;
}

.terminal-instance {
    height: 500px;
    padding: 0;
}

.terminal-instance .xterm {
    padding: 15px;
}

.mobile-keyboard {
    display: none;
    background: #2d3748;
    border-top: 1px solid #4a5568;
    padding: 15px;
}

.keyboard-row {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 8px;
}

.key-btn {
    background: #4a5568;
    border: 1px solid #718096;
    color: #e2e8f0;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
    min-width: 50px;
}

.key-btn:hover {
    background: #718096;
}

.key-btn:active {
    background: #2d3748;
}

.arrow-btn {
    font-size: 16px;
    font-weight: bold;
}

.btn {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    border: none;
    transition: background 0.2s;
}

.btn-primary {
    background: #4c51bf;
    color: white;
}

.btn-primary:hover {
    background: #5a67d8;
}

.btn-secondary {
    background: #718096;
    color: white;
}

.btn-secondary:hover {
    background: #4a5568;
}

/* 移动端适配 */
@media (max-width: 768px) {
    .terminal-controls {
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .terminal-tabs {
        margin-left: 0;
        margin-top: 8px;
        flex-wrap: wrap;
    }
    
    .terminal-tab {
        font-size: 12px;
        padding: 6px 10px;
    }
    
    .terminal-instance {
        height: 400px;
    }
    
    .terminal-sessions {
        min-height: 400px;
    }
    
    .mobile-keyboard {
        display: block;
    }
    
    .key-btn {
        padding: 10px 8px;
        min-width: 45px;
        font-size: 11px;
    }
}
`;
document.head.appendChild(style);