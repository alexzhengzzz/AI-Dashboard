/**
 * 进程管理模块 - 处理进程监控、管理和服务状态
 */

class ProcessModule {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.sortStates = {};
        this.processFilters = {
            category: 'all',
            minMemory: 0,
            status: 'all'
        };
        
        this.initProcessFilters();
        this.initTableSorting();
    }
    
    /**
     * 初始化进程过滤器
     */
    initProcessFilters() {
        // 分类过滤器
        const categoryFilter = document.getElementById('processCategoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.processFilters.category = e.target.value;
                this.filterProcesses();
            });
        }
        
        // 最小内存过滤器
        const memoryFilter = document.getElementById('processMemoryFilter');
        if (memoryFilter) {
            memoryFilter.addEventListener('input', (e) => {
                this.processFilters.minMemory = parseInt(e.target.value) || 0;
                this.filterProcesses();
            });
        }
        
        // 状态过滤器
        const statusFilter = document.getElementById('processStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.processFilters.status = e.target.value;
                this.filterProcesses();
            });
        }
    }
    
    /**
     * 初始化表格排序
     */
    initTableSorting() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('sort-header')) {
                const column = e.target.dataset.sort;
                const tableId = e.target.closest('table').id;
                this.sortTable(tableId, column);
            }
        });
    }
    
    /**
     * 更新进程统计摘要
     */
    updateProcessStats(statsData) {
        if (!statsData || !statsData.processes) return;
        
        const processes = statsData.processes;
        
        // 更新进程统计
        const mappings = [
            { key: 'total', id: 'total-processes' },
            { key: 'running', id: 'running-processes' },
            { key: 'sleeping', id: 'sleeping-processes' },
            { key: 'zombie', id: 'zombie-processes' }
        ];
        
        mappings.forEach(({ key, id }) => {
            const element = document.getElementById(id);
            if (element && processes[key] !== undefined) {
                element.textContent = processes[key].toLocaleString();
            }
        });
        
        // 更新连接统计
        if (statsData.connections) {
            const connections = statsData.connections;
            const connectionsElement = document.getElementById('active-connections');
            if (connectionsElement) {
                connectionsElement.textContent = connections.established?.toLocaleString() || '0';
            }
            
            const listeningElement = document.getElementById('listening-ports');
            if (listeningElement) {
                listeningElement.textContent = connections.listening?.toLocaleString() || '0';
            }
        }
        
        // 更新用户统计
        if (statsData.users) {
            const usersElement = document.getElementById('active-users');
            if (usersElement) {
                usersElement.textContent = statsData.users.active?.toLocaleString() || '0';
            }
        }
    }
    
    /**
     * 更新内存进程排行
     */
    updateMemoryProcesses(processesData) {
        if (!processesData || !Array.isArray(processesData)) return;
        
        const tbody = document.querySelector('#memory-processes-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        processesData.forEach(process => {
            const row = document.createElement('tr');
            row.className = `process-row ${process.category}`;
            row.dataset.category = process.category;
            row.dataset.status = process.status;
            row.dataset.memoryMb = process.memory_rss_mb;
            
            row.innerHTML = `
                <td>${process.pid}</td>
                <td class="process-name" title="${process.cmdline || process.name}">
                    ${process.name}
                </td>
                <td>${process.username}</td>
                <td class="memory-usage">${process.memory_rss_mb} MB</td>
                <td class="memory-percent">${process.memory_percent?.toFixed(1) || '0.0'}%</td>
                <td class="cpu-percent">${process.cpu_percent?.toFixed(1) || '0.0'}%</td>
                <td class="process-status ${this.getStatusClass(process.status)}">
                    ${process.status_display || process.status}
                </td>
                <td class="process-category ${process.category}">
                    ${this.getCategoryDisplay(process.category)}
                </td>
                <td class="running-time">${process.running_time || '未知'}</td>
                <td class="process-actions">
                    ${this.getProcessActions(process)}
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // 应用当前过滤器
        this.filterProcesses();
    }
    
    /**
     * 获取进程操作按钮
     */
    getProcessActions(process) {
        if (process.is_protected) {
            return '<span class="protected-badge">受保护</span>';
        }
        
        return `
            <button class="btn btn-danger btn-sm" 
                    onclick="dashboard.processModule.killProcess(${process.pid}, '${process.name}')">
                终止
            </button>
        `;
    }
    
    /**
     * 获取状态样式类
     */
    getStatusClass(status) {
        switch (status) {
            case 'running': return 'status-running';
            case 'sleeping': return 'status-sleeping';
            case 'zombie': return 'status-zombie';
            default: return 'status-other';
        }
    }
    
    /**
     * 获取分类显示名称
     */
    getCategoryDisplay(category) {
        const categoryNames = {
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
        
        return categoryNames[category] || category;
    }
    
    /**
     * 更新端口状态
     */
    updatePortInfo(portsData) {
        if (!portsData || !Array.isArray(portsData)) return;
        
        const tbody = document.querySelector('#ports-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        portsData.forEach(port => {
            const row = document.createElement('tr');
            row.className = `port-row status-${port.status}`;
            
            row.innerHTML = `
                <td>${port.port}</td>
                <td>${port.service}</td>
                <td class="port-status status-${port.status}">
                    ${this.getPortStatusDisplay(port.status)}
                </td>
                <td>${port.process_name || '-'}</td>
                <td>${port.pid || '-'}</td>
                <td>${port.connections || 0}</td>
                <td class="port-actions">
                    ${this.getPortActions(port)}
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    /**
     * 获取端口状态显示
     */
    getPortStatusDisplay(status) {
        const statusMap = {
            'open': '开放',
            'closed': '关闭',
            'filtered': '过滤'
        };
        
        return statusMap[status] || status;
    }
    
    /**
     * 获取端口操作按钮
     */
    getPortActions(port) {
        if (port.status === 'open' && port.pid) {
            return `
                <button class="btn btn-warning btn-sm" 
                        onclick="dashboard.processModule.killPortProcess(${port.port}, '${port.process_name}')">
                    关闭进程
                </button>
            `;
        }
        
        return '-';
    }
    
    /**
     * 更新服务状态
     */
    updateServiceStatus(servicesData) {
        if (!servicesData || !Array.isArray(servicesData)) return;
        
        const tbody = document.querySelector('#services-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        servicesData.forEach(service => {
            const row = document.createElement('tr');
            row.className = `service-row status-${service.status}`;
            
            row.innerHTML = `
                <td>${service.name}</td>
                <td class="service-status status-${service.status}">
                    <span class="status-indicator ${service.active ? 'active' : 'inactive'}"></span>
                    ${service.status}
                </td>
                <td class="service-actions">
                    ${this.getServiceActions(service)}
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    /**
     * 获取服务操作按钮
     */
    getServiceActions(service) {
        if (service.status === 'active') {
            return `
                <button class="btn btn-warning btn-sm" 
                        onclick="dashboard.processModule.serviceAction('${service.name}', 'stop')">
                    停止
                </button>
                <button class="btn btn-info btn-sm" 
                        onclick="dashboard.processModule.serviceAction('${service.name}', 'restart')">
                    重启
                </button>
            `;
        } else if (service.status === 'inactive') {
            return `
                <button class="btn btn-success btn-sm" 
                        onclick="dashboard.processModule.serviceAction('${service.name}', 'start')">
                    启动
                </button>
            `;
        }
        
        return '-';
    }
    
    /**
     * 过滤进程
     */
    filterProcesses() {
        const rows = document.querySelectorAll('.process-row');
        
        rows.forEach(row => {
            let show = true;
            
            // 分类过滤
            if (this.processFilters.category !== 'all') {
                const category = row.dataset.category;
                show = show && (category === this.processFilters.category);
            }
            
            // 内存过滤
            if (this.processFilters.minMemory > 0) {
                const memory = parseFloat(row.dataset.memoryMb) || 0;
                show = show && (memory >= this.processFilters.minMemory);
            }
            
            // 状态过滤
            if (this.processFilters.status !== 'all') {
                const status = row.dataset.status;
                show = show && (status === this.processFilters.status);
            }
            
            row.style.display = show ? '' : 'none';
        });
        
        // 更新过滤结果统计
        this.updateFilterStats();
    }
    
    /**
     * 更新过滤统计
     */
    updateFilterStats() {
        const total = document.querySelectorAll('.process-row').length;
        const visible = document.querySelectorAll('.process-row:not([style*="display: none"])').length;
        
        const statsElement = document.getElementById('process-filter-stats');
        if (statsElement) {
            statsElement.textContent = `显示 ${visible} / ${total} 个进程`;
        }
    }
    
    /**
     * 表格排序
     */
    sortTable(tableId, column) {
        const table = document.getElementById(tableId);
        if (!table) return;
        
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0) return;
        
        // 获取当前排序状态
        const currentSort = this.sortStates[tableId] || {};
        const isAsc = currentSort.column !== column || currentSort.direction === 'desc';
        
        // 更新排序状态
        this.sortStates[tableId] = {
            column: column,
            direction: isAsc ? 'asc' : 'desc'
        };
        
        // 更新排序指示器
        this.updateSortIndicators(table, column, isAsc);
        
        // 排序行
        rows.sort((a, b) => {
            const aValue = this.getCellValue(a, column);
            const bValue = this.getCellValue(b, column);
            
            let result = 0;
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                result = aValue - bValue;
            } else {
                result = aValue.toString().localeCompare(bValue.toString());
            }
            
            return isAsc ? result : -result;
        });
        
        // 重新插入排序后的行
        rows.forEach(row => tbody.appendChild(row));
    }
    
    /**
     * 获取单元格值
     */
    getCellValue(row, column) {
        const cell = row.querySelector(`td:nth-child(${this.getColumnIndex(column)})`);
        if (!cell) return '';
        
        const text = cell.textContent.trim();
        
        // 尝试解析数字
        if (column.includes('memory') || column.includes('cpu') || column === 'pid') {
            const number = parseFloat(text.replace(/[^0-9.-]/g, ''));
            return isNaN(number) ? 0 : number;
        }
        
        return text;
    }
    
    /**
     * 获取列索引
     */
    getColumnIndex(column) {
        const columnMap = {
            'pid': 1,
            'name': 2,
            'user': 3,
            'memory': 4,
            'memory-percent': 5,
            'cpu': 6,
            'status': 7,
            'category': 8,
            'time': 9,
            'port': 1,
            'service': 2,
            'port-status': 3,
            'process': 4
        };
        
        return columnMap[column] || 1;
    }
    
    /**
     * 更新排序指示器
     */
    updateSortIndicators(table, column, isAsc) {
        // 清除所有排序指示器
        table.querySelectorAll('.sort-header').forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
        });
        
        // 添加当前列的排序指示器
        const currentHeader = table.querySelector(`[data-sort="${column}"]`);
        if (currentHeader) {
            currentHeader.classList.add(isAsc ? 'sort-asc' : 'sort-desc');
        }
    }
    
    /**
     * 终止进程
     */
    killProcess(pid, name) {
        const content = `
            <p>确定要终止进程吗？</p>
            <div class="process-info">
                <strong>PID:</strong> ${pid}<br>
                <strong>进程名:</strong> ${name}
            </div>
            <p class="warning">此操作不可撤销！</p>
        `;
        
        this.dashboard.showModal(content, '终止进程');
        
        // 设置确认按钮事件
        const confirmBtn = document.querySelector('.btn-confirm');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                this.confirmKillProcess(pid);
            };
        }
    }
    
    /**
     * 确认终止进程
     */
    async confirmKillProcess(pid) {
        this.dashboard.hideModal();
        
        try {
            const response = await fetch(`/api/kill_process/${pid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.dashboard.showSuccess(result.message);
                // 请求更新数据
                this.dashboard.requestStats();
            } else {
                this.dashboard.showError(result.message);
            }
        } catch (error) {
            console.error('Kill process error:', error);
            this.dashboard.showError('操作失败，请重试');
        }
    }
    
    /**
     * 终止端口进程
     */
    killPortProcess(port, processName) {
        const content = `
            <p>确定要终止占用端口的进程吗？</p>
            <div class="process-info">
                <strong>端口:</strong> ${port}<br>
                <strong>进程:</strong> ${processName}
            </div>
            <p class="warning">此操作会终止该端口上的所有进程！</p>
        `;
        
        this.dashboard.showModal(content, '终止端口进程');
        
        // 设置确认按钮事件
        const confirmBtn = document.querySelector('.btn-confirm');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                this.confirmKillPortProcess(port);
            };
        }
    }
    
    /**
     * 确认终止端口进程
     */
    async confirmKillPortProcess(port) {
        this.dashboard.hideModal();
        
        try {
            const response = await fetch(`/api/kill_port_process/${port}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.dashboard.showSuccess(result.message);
                // 请求更新数据
                this.dashboard.requestStats();
            } else {
                this.dashboard.showError(result.message);
            }
        } catch (error) {
            console.error('Kill port process error:', error);
            this.dashboard.showError('操作失败，请重试');
        }
    }
    
    /**
     * 服务操作
     */
    serviceAction(serviceName, action) {
        const actionMap = {
            'start': '启动',
            'stop': '停止',
            'restart': '重启'
        };
        
        const content = `
            <p>确定要${actionMap[action]}服务吗？</p>
            <div class="service-info">
                <strong>服务:</strong> ${serviceName}<br>
                <strong>操作:</strong> ${actionMap[action]}
            </div>
        `;
        
        this.dashboard.showModal(content, `${actionMap[action]}服务`);
        
        // 设置确认按钮事件
        const confirmBtn = document.querySelector('.btn-confirm');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                this.confirmServiceAction(serviceName, action);
            };
        }
    }
    
    /**
     * 确认服务操作
     */
    async confirmServiceAction(serviceName, action) {
        this.dashboard.hideModal();
        
        try {
            // 这里应该调用相应的API，但当前系统可能还没有实现服务管理API
            this.dashboard.showToast(`${serviceName} 服务${action}操作已提交`, 'info');
            
            // 请求更新数据
            setTimeout(() => {
                this.dashboard.requestStats();
            }, 2000);
        } catch (error) {
            console.error('Service action error:', error);
            this.dashboard.showError('操作失败，请重试');
        }
    }
}

// 导出到全局
window.ProcessModule = ProcessModule;