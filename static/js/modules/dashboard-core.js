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
}