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
        
        this.initSocketEvents();
        this.initCharts();
        this.startDataRefresh();
        this.initDialogs();
        this.initTabs();
        this.initCollapse();
        this.initTableSorting();
        this.initFilters();
    }

    initSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('已连接');
            this.socket.emit('request_stats');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateStatus('连接断开');
        });

        this.socket.on('stats_update', (data) => {
            this.updateDashboard(data);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateStatus('连接错误');
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

    startDataRefresh() {
        // 每5秒请求一次数据
        setInterval(() => {
            if (this.socket.connected) {
                this.socket.emit('request_stats');
            }
        }, 5000);
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
        this.updateProcessList(data.processes);
        this.updateMemoryProcessList(data.memory_processes);
        
        // 更新概览页面的指标
        this.updateOverviewMetrics(data);
        
        this.updateStatus(`最后更新: ${new Date().toLocaleTimeString()}`);
    }

    updateSystemInfo(system) {
        document.getElementById('hostname').textContent = system.hostname;
        document.getElementById('ip-address').textContent = system.ip_address || '获取中...';
        
        // 更新详细操作系统信息
        if (system.os_detailed) {
            document.getElementById('os-detailed').textContent = 
                `${system.os_detailed.name} ${system.os_detailed.version}`;
        } else {
            document.getElementById('os-detailed').textContent = `${system.os} ${system.os_release}`;
        }
        
        document.getElementById('uptime').textContent = system.uptime_string;
        
        // 更新CPU型号信息
        if (system.cpu_detailed) {
            const cpuInfo = `${system.cpu_detailed.count}核 ${system.cpu_detailed.model || 'Unknown'}`;
            document.getElementById('cpu-model').textContent = cpuInfo;
        } else {
            document.getElementById('cpu-model').textContent = system.processor || 'Unknown';
        }
        
        // 更新内存容量信息
        if (system.memory_detailed) {
            document.getElementById('memory-total').textContent = `${system.memory_detailed.total_gb}GB`;
        } else {
            document.getElementById('memory-total').textContent = '获取中...';
        }
        
        // 更新系统运行天数
        if (system.uptime_seconds) {
            const days = Math.floor(system.uptime_seconds / 86400);
            const element = document.getElementById('system-uptime-days');
            if (element) {
                element.textContent = `${days} 天`;
            }
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

        document.getElementById('memory-usage').textContent = usagePercent.toFixed(1);
        document.getElementById('memory-used-gb').textContent = usedGB;
        document.getElementById('memory-total-gb').textContent = totalGB;
        document.getElementById('memory-bar').style.width = `${usagePercent}%`;
        
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
        
        // 更新网络流量显示
        if (data.network) {
            let totalRx = 0, totalTx = 0;
            
            data.network.forEach(iface => {
                if (iface.interface !== 'lo') {
                    totalRx += iface.bytes_recv;
                    totalTx += iface.bytes_sent;
                }
            });
            
            const networkOverview = document.getElementById('network-overview');
            const networkRxSpeed = document.getElementById('network-rx-speed');
            const networkTxSpeed = document.getElementById('network-tx-speed');
            
            if (this.networkHistory.length > 0) {
                const lastEntry = this.networkHistory[this.networkHistory.length - 1];
                const rxRate = Math.max(0, (totalRx - lastEntry.rx) / (1024 * 1024 * 5)); // MB/s
                const txRate = Math.max(0, (totalTx - lastEntry.tx) / (1024 * 1024 * 5)); // MB/s
                
                if (networkOverview) {
                    const totalRate = (rxRate + txRate).toFixed(2);
                    networkOverview.textContent = `${totalRate} MB/s`;
                }
                
                if (networkRxSpeed) {
                    networkRxSpeed.textContent = `${rxRate.toFixed(2)} MB/s`;
                }
                
                if (networkTxSpeed) {
                    networkTxSpeed.textContent = `${txRate.toFixed(2)} MB/s`;
                }
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

        // 更新网络图表（显示速率变化）
        if (this.networkHistory.length > 0) {
            const lastEntry = this.networkHistory[this.networkHistory.length - 1];
            const rxRate = Math.max(0, (totalRx - lastEntry.rx) / (1024 * 5)); // KB/s
            const txRate = Math.max(0, (totalTx - lastEntry.tx) / (1024 * 5)); // KB/s
            
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
                case 'user':
                    aValue = a.cells[1].textContent.toLowerCase();
                    bValue = b.cells[1].textContent.toLowerCase();
                    break;
                case 'cpu':
                case 'memory':
                case 'memory-percent':
                    const cellIndex = sortKey === 'cpu' ? 2 : sortKey === 'memory' ? 3 : sortKey === 'memory-percent' ? 4 : 3;
                    aValue = parseFloat(a.cells[cellIndex].textContent) || 0;
                    bValue = parseFloat(b.cells[cellIndex].textContent) || 0;
                    break;
                case 'memory-mb':
                    aValue = parseInt(a.cells[3].textContent) || 0;
                    bValue = parseInt(b.cells[3].textContent) || 0;
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

    updateProcessList(processes) {
        const tbody = document.getElementById('processes-tbody');
        tbody.innerHTML = '';

        processes.slice(0, 10).forEach(proc => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${proc.pid || '-'}</td>
                <td>${proc.name || '-'}</td>
                <td>${(proc.cpu_percent || 0).toFixed(1)}%</td>
                <td>${(proc.memory_percent || 0).toFixed(1)}%</td>
                <td>${proc.status || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateMemoryProcessList(memoryProcesses) {
        const tbody = document.getElementById('memory-processes-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        memoryProcesses.forEach(proc => {
            const row = document.createElement('tr');
            const canKill = proc.username !== 'root' || proc.pid > 1000;
            const cmdline = proc.cmdline && proc.cmdline.length > 30 ? 
                           proc.cmdline.substring(0, 30) + '...' : proc.cmdline;
            
            row.innerHTML = `
                <td>${proc.pid || '-'}</td>
                <td>${proc.name || '-'}</td>
                <td>${proc.username || '-'}</td>
                <td>${proc.memory_rss_mb || 0}</td>
                <td>${(proc.memory_percent || 0).toFixed(1)}%</td>
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
            tbody.appendChild(row);
        });
        
        // 添加命令行工具提示
        this.addCommandTooltips(tbody);
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

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
`;
document.head.appendChild(style);