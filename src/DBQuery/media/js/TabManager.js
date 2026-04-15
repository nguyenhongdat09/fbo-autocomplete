// File: src/DBQuery/media/js/TabManager.js

class TabManager {
    constructor(data) {
        this.data = data;
        this.currentTab = 'results';
        this.tabs = [];
    }

    init() {
        this.createTabs();
        this.attachEventListeners();
    }

    createTabs() {
        const { resultSets, messages } = this.data;
        const container = document.getElementById('tabContainer');

        // Calculate totals
        const totalRows = resultSets.reduce((sum, rs) => sum + rs.rowCount, 0);
        const messageCount = messages.length;

        // Create tabs
        this.tabs = [
            {
                id: 'results',
                label: 'Results',
                count: totalRows,
                active: true
            },
            {
                id: 'messages',
                label: 'Messages',
                count: messageCount,
                active: false
            }
        ];

        // Render tabs
        const tabsHtml = this.tabs.map(tab => `
            <button class="tab ${tab.active ? 'active' : ''}" data-tab="${tab.id}">
                ${tab.label}
                <span class="tab-count">(${tab.count})</span>
            </button>
        `).join('');

        container.innerHTML = tabsHtml;
    }

    attachEventListeners() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                this.switchTab(tabId);
            });
        });
    }

    switchTab(tabId) {
        if (this.currentTab === tabId) return;

        this.currentTab = tabId;

        // Update tab styles
        document.querySelectorAll('.tab').forEach(tab => {
            const isActive = tab.dataset.tab === tabId;
            tab.classList.toggle('active', isActive);
        });

        // Show/hide content — phải dùng display:flex giống .tab-content.active trong CSS,
        // không dùng block (sẽ phá flex:1 của .table-wrapper / .messages-container → mất scrollbar).
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
        });

        const contentElement = document.getElementById(tabId + 'Tab');
        if (contentElement) {
            contentElement.classList.add('active');
            contentElement.style.display = 'flex';
            contentElement.style.flexDirection = 'column';
        }

        if (tabId === 'results') {
            requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
            });
        }
    }

    updateCount(tabId, count) {
        const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tab) {
            const countSpan = tab.querySelector('.tab-count');
            if (countSpan) {
                countSpan.textContent = `(${count})`;
            }
        }
    }
}