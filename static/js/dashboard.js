class Dashboard {
    constructor() {
        this.socket = io();
        this.cpuChart = null;
        this.networkChart = null;
        this.networkHistory = [];
        this.cpuHistory = [];
        this.maxHistoryLength = 20;
        
        this.initSocketEvents();
        this.initCharts();
        this.startDataRefresh();
        this.initDialogs();
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
        this.updateCpuMetrics(data.cpu);
        this.updateMemoryMetrics(data.memory);
        this.updateDiskMetrics(data.disk);
        this.updateNetworkMetrics(data.network);
        this.updateServicesStatus(data.services);
        this.updatePortsStatus(data.ports);
        this.updateProcessList(data.processes);
        this.updateMemoryProcessList(data.memory_processes);
        this.updateStatus(`最后更新: ${new Date().toLocaleTimeString()}`);
    }

    updateSystemInfo(system) {
        document.getElementById('hostname').textContent = system.hostname;
        document.getElementById('ip-address').textContent = system.ip_address || '获取中...';
        document.getElementById('os-info').textContent = `${system.os} ${system.os_release}`;
        document.getElementById('uptime').textContent = system.uptime_string;
        document.getElementById('architecture').textContent = system.architecture;
    }

    updateCpuMetrics(cpu) {
        const usage = cpu.usage_percent;
        document.getElementById('cpu-usage').textContent = usage.toFixed(1);
        document.getElementById('load-avg').textContent = 
            `${cpu.load_avg['1min']} ${cpu.load_avg['5min']} ${cpu.load_avg['15min']}`;

        // 更新CPU图表
        this.cpuHistory.push(usage);
        if (this.cpuHistory.length > this.maxHistoryLength) {
            this.cpuHistory.shift();
        }

        const labels = Array.from({length: this.cpuHistory.length}, (_, i) => 
            new Date(Date.now() - (this.cpuHistory.length - 1 - i) * 5000).toLocaleTimeString()
        );

        this.cpuChart.data.labels = labels;
        this.cpuChart.data.datasets[0].data = this.cpuHistory;
        this.cpuChart.update('none');
    }

    updateMemoryMetrics(memory) {
        const usagePercent = memory.percent;
        const usedGB = (memory.used / (1024**3)).toFixed(1);
        const totalGB = (memory.total / (1024**3)).toFixed(1);

        document.getElementById('memory-usage').textContent = usagePercent.toFixed(1);
        document.getElementById('memory-used-gb').textContent = usedGB;
        document.getElementById('memory-total-gb').textContent = totalGB;
        document.getElementById('memory-bar').style.width = `${usagePercent}%`;
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

    initDialogs() {
        const confirmDialog = document.getElementById('confirm-dialog');
        const confirmYes = document.getElementById('confirm-yes');
        const confirmNo = document.getElementById('confirm-no');
        
        confirmNo.onclick = () => {
            confirmDialog.style.display = 'none';
        };
        
        // 点击对话框外部关闭
        confirmDialog.onclick = (e) => {
            if (e.target === confirmDialog) {
                confirmDialog.style.display = 'none';
            }
        };
    }

    showKillProcessDialog(port, processName, pid) {
        const confirmDialog = document.getElementById('confirm-dialog');
        const confirmMessage = document.getElementById('confirm-message');
        const confirmYes = document.getElementById('confirm-yes');
        
        confirmMessage.textContent = `您确定要关闭端口 ${port} 上的进程 "${processName}" (PID: ${pid}) 吗？`;
        
        confirmYes.onclick = () => {
            confirmDialog.style.display = 'none';
            this.killProcess(port);
        };
        
        confirmDialog.style.display = 'flex';
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

    showToast(message, type = 'info') {
        const toast = document.getElementById('result-toast');
        const toastMessage = document.getElementById('toast-message');
        
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
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
                <td title="${proc.cmdline || '-'}">${cmdline || '-'}</td>
                <td>
                    ${canKill ? 
                        `<button class="kill-process-btn" onclick="dashboard.confirmKillProcess(${proc.pid}, '${proc.name}', ${proc.memory_rss_mb})">终止</button>` :
                        '<span class="protected">受保护</span>'
                    }
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    confirmKillProcess(pid, name, memoryMB) {
        const dialog = document.getElementById('confirm-dialog');
        const message = document.getElementById('confirm-message');
        
        message.innerHTML = `
            <strong>确认终止进程？</strong><br>
            PID: ${pid}<br>
            进程名: ${name}<br>
            内存占用: ${memoryMB}MB<br><br>
            <span style="color: #ff6b6b;">此操作无法撤销！</span>
        `;
        
        dialog.style.display = 'flex';
        
        document.getElementById('confirm-yes').onclick = () => {
            this.killProcess(pid);
            dialog.style.display = 'none';
        };
        
        document.getElementById('confirm-no').onclick = () => {
            dialog.style.display = 'none';
        };
    }

    async killProcess(pid) {
        try {
            const response = await fetch(`/api/kill_process/${pid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast(`成功终止进程 PID: ${pid}`, 'success');
            } else {
                this.showToast(`终止进程失败: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error killing process:', error);
            this.showToast('网络错误，无法终止进程', 'error');
        }
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

// 初始化仪表板
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});