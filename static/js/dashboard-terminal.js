/**
 * Terminal functionality module for the Server Dashboard
 * Extracted from dashboard.js to improve maintainability and reduce file size
 */

class DashboardTerminal {
    constructor(dashboard) {
        // Reference to main dashboard instance
        this.dashboard = dashboard;
        this.socket = dashboard.socket;
        
        // Terminal state variables
        this.terminals = new Map();
        this.currentTerminal = null;
        this.terminalCounter = 0;
        this.terminalSettings = null;
        
        // Mobile optimizations
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.resizeTimer = null;
        
        // Initialize terminal functionality
        this.init();
    }
    
    init() {
        // Initialize terminal WebSocket event handlers
        this.initSocketEvents();
        
        // Initialize terminal UI
        this.initTerminal();
    }
    
    initSocketEvents() {
        // Terminal WebSocket event handlers
        this.socket.on('terminal_created', (data) => {
            this.onTerminalCreated(data.session_id);
        });

        this.socket.on('terminal_output', (data) => {
            this.onTerminalOutput(data.data);
        });

        this.socket.on('terminal_error', (data) => {
            this.dashboard.showToast(data.message, 'error');
        });

        this.socket.on('terminal_closed', (data) => {
            this.onTerminalClosed(data.session_id);
        });
    }

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
                                this.dashboard.showToast('创建终端失败', 'error');
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
                this.dashboard.showToast('终端组件加载失败，请刷新页面', 'error');
                return;
            }

            if (typeof FitAddon === 'undefined' || typeof WebLinksAddon === 'undefined') {
                console.error('Terminal addons not loaded');
                this.dashboard.showToast('终端插件加载失败，请刷新页面', 'error');
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

        this.dashboard.showToast(`${terminalName} 已创建`, 'success');
        } catch (error) {
            console.error('Error in onTerminalCreated:', error);
            this.dashboard.showToast('创建终端时发生错误', 'error');
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

        this.dashboard.showToast(`${terminalInfo.name} 已关闭`, 'info');
    }

    clearCurrentTerminal() {
        if (this.currentTerminal) {
            this.currentTerminal.terminal.clear();
        }
    }

    // Terminal CSS styles
    static getTerminalStyles() {
        return `
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
    }

    // Apply terminal styles to the page
    static applyStyles() {
        const styleId = 'terminal-module-styles';
        let existingStyle = document.getElementById(styleId);
        
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = DashboardTerminal.getTerminalStyles();
        document.head.appendChild(style);
    }
}

// Apply terminal styles when the module is loaded
DashboardTerminal.applyStyles();