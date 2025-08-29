/**
 * 仪表板核心框架 - 提供基础的Dashboard类和通用功能
 */

class DashboardCore {
    constructor() {
        this.socket = io();
        this.currentTab = 'overview';
        this.collapsedCards = new Set();
        this.sortStates = {};
        this.toastId = 0;
        
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
        
        // 页面可见性检测
        this.isPageVisible = !document.hidden;
        this.setupVisibilityListener();
        
        // 初始化事件
        this.initSocketEvents();
        this.initTabs();
        this.initCollapse();
        this.initDialogs();
    }
    
    /**
     * Socket连接事件初始化
     */
    initSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('已连接');
            this.requestInitialData();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateStatus('连接断开 - 正在重连...');
            this.showDataLoading();
        });

        this.socket.on('stats_update', (data) => {
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
                this.updateDashboard(data);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateStatus('连接错误 - 正在重试...');
            
            if (this.isInitialLoad) {
                this.requestStatsViaHTTP();
            }
        });
    }
    
    /**
     * 页面可见性监听器
     */
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            this.isPageVisible = !document.hidden;
            
            if (this.isPageVisible) {
                // 页面变为可见时，立即请求数据
                this.requestStats();
                this.updateInterval = 5000; // 恢复正常更新间隔
            } else {
                // 页面隐藏时，延长更新间隔
                this.updateInterval = 15000;
            }
        });
    }
    
    /**
     * 请求初始数据
     */
    requestInitialData() {
        this.showDataLoading();
        this.socket.emit('request_stats');
        
        // 设置超时
        this.dataLoadTimeout = setTimeout(() => {
            if (this.isInitialLoad) {
                console.warn('Initial data load timeout, trying HTTP fallback');
                this.requestStatsViaHTTP();
            }
        }, 10000);
    }
    
    /**
     * 请求统计数据
     */
    requestStats() {
        if (this.socket.connected) {
            this.socket.emit('request_stats');
        }
    }
    
    /**
     * HTTP方式获取数据（备用方案）
     */
    async requestStatsViaHTTP() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            this.hideInitialLoading();
            this.hideDataLoading();
            this.isInitialLoad = false;
            this.cachedData = data;
            this.updateDashboard(data);
        } catch (error) {
            console.error('HTTP stats request failed:', error);
            this.showError('无法连接到服务器，请检查网络连接');
        }
    }
    
    /**
     * 处理增量数据更新
     */
    handleIncrementalUpdate(incrementalData) {
        // 合并增量数据到缓存数据
        Object.assign(this.cachedData, incrementalData);
        
        // 只更新有变化的部分
        this.updateDashboardIncremental(incrementalData);
    }
    
    /**
     * 标签页初始化
     */
    initTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.target.dataset.tab;
                this.switchTab(targetTab);
            });
        });
    }
    
    /**
     * 切换标签页
     */
    switchTab(tabName) {
        // 移除所有活动状态
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // 添加新的活动状态
        const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
        const targetContent = document.getElementById(`${tabName}-tab`);
        
        if (targetBtn && targetContent) {
            targetBtn.classList.add('active');
            targetContent.classList.add('active');
            this.currentTab = tabName;
            
            // 触发标签页切换事件
            this.onTabSwitch(tabName);
        }
    }
    
    /**
     * 标签页切换回调（由子类实现）
     */
    onTabSwitch(tabName) {
        // Override in subclasses
    }
    
    /**
     * 折叠功能初始化
     */
    initCollapse() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('collapse-btn')) {
                const targetId = e.target.dataset.target;
                this.toggleCollapse(targetId);
            }
        });
    }
    
    /**
     * 切换折叠状态
     */
    toggleCollapse(targetId) {
        const targetElement = document.getElementById(targetId);
        const collapseBtn = document.querySelector(`[data-target="${targetId}"]`);
        
        if (targetElement && collapseBtn) {
            targetElement.classList.toggle('collapsed');
            const isCollapsed = targetElement.classList.contains('collapsed');
            
            // 更新按钮图标
            collapseBtn.querySelector('span').textContent = isCollapsed ? '+' : '−';
            
            // 记录折叠状态
            if (isCollapsed) {
                this.collapsedCards.add(targetId);
            } else {
                this.collapsedCards.delete(targetId);
            }
        }
    }
    
    /**
     * 对话框初始化
     */
    initDialogs() {
        // 点击遮罩关闭对话框
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.hideModal();
            }
        });
    }
    
    /**
     * 显示对话框
     */
    showModal(content, title = '确认操作') {
        const modal = document.getElementById('confirmModal') || this.createModal();
        const modalTitle = modal.querySelector('.modal-title');
        const modalContent = modal.querySelector('.modal-content');
        
        if (modalTitle) modalTitle.textContent = title;
        if (modalContent) modalContent.innerHTML = content;
        
        modal.style.display = 'flex';
    }
    
    /**
     * 隐藏对话框
     */
    hideModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    /**
     * 创建对话框元素
     */
    createModal() {
        const modalHTML = `
            <div id="confirmModal" class="modal-overlay" style="display: none;">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">确认操作</h3>
                    </div>
                    <div class="modal-body">
                        <div class="modal-content"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-cancel" onclick="dashboard.hideModal()">取消</button>
                        <button class="btn btn-confirm">确认</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        return document.getElementById('confirmModal');
    }
    
    /**
     * 显示Toast提示
     */
    showToast(message, type = 'info', duration = 3000) {
        const toastId = `toast-${++this.toastId}`;
        const toastHTML = `
            <div id="${toastId}" class="toast toast-${type}">
                <span class="toast-message">${message}</span>
                <button class="toast-close" onclick="this.parentElement.remove()">×</button>
            </div>
        `;
        
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        
        // 自动移除
        if (duration > 0) {
            setTimeout(() => {
                const toast = document.getElementById(toastId);
                if (toast) {
                    toast.remove();
                }
            }, duration);
        }
    }
    
    /**
     * 显示错误信息
     */
    showError(message) {
        this.showToast(message, 'error', 5000);
    }
    
    /**
     * 显示成功信息
     */
    showSuccess(message) {
        this.showToast(message, 'success', 3000);
    }
    
    /**
     * 更新连接状态
     */
    updateStatus(status) {
        const statusElement = document.getElementById('last-update');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }
    
    /**
     * 显示初始加载状态
     */
    showInitialLoading() {
        this.updateStatus('正在连接服务器...');
    }
    
    /**
     * 隐藏初始加载状态
     */
    hideInitialLoading() {
        if (this.dataLoadTimeout) {
            clearTimeout(this.dataLoadTimeout);
            this.dataLoadTimeout = null;
        }
    }
    
    /**
     * 显示数据加载状态
     */
    showDataLoading() {
        this.updateStatus('正在加载数据...');
    }
    
    /**
     * 隐藏数据加载状态
     */
    hideDataLoading() {
        // Will be updated by data update
    }
    
    /**
     * 缓存DOM元素
     */
    cacheElement(key, selector) {
        if (!this.domCache.has(key)) {
            this.domCache.set(key, document.querySelector(selector));
        }
        return this.domCache.get(key);
    }
    
    /**
     * 格式化字节大小
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 格式化百分比
     */
    formatPercent(value) {
        return `${value.toFixed(1)}%`;
    }
    
    /**
     * 更新仪表板（由子类实现）
     */
    updateDashboard(data) {
        throw new Error('updateDashboard method must be implemented by subclass');
    }
    
    /**
     * 增量更新仪表板（由子类实现）
     */
    updateDashboardIncremental(data) {
        // 默认实现：调用完整更新
        this.updateDashboard(this.cachedData);
    }
}

// 导出到全局
window.DashboardCore = DashboardCore;