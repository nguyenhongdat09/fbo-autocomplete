// File: src/DBQuery/media/js/ContextMenu.js

class ContextMenu {
    constructor(table) {
        this.table = table;
        this.menu = document.getElementById('contextMenu');
        this.isVisible = false;
        
        this.init();
    }

    init() {
        // Menu item click handlers
        document.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleAction(action);
                this.hide();
            });
        });

        // Hide menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.menu.contains(e.target)) {
                this.hide();
            }
        });

        // Prevent context menu on context menu itself
        this.menu.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    show(x, y) {
        // Position menu
        this.menu.style.left = x + 'px';
        this.menu.style.top = y + 'px';
        this.menu.style.display = 'block';
        this.isVisible = true;

        // Adjust position if menu goes off screen
        this.adjustPosition();
    }

    hide() {
        this.menu.style.display = 'none';
        this.isVisible = false;
    }

    adjustPosition() {
        const rect = this.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust horizontal position
        if (rect.right > viewportWidth) {
            this.menu.style.left = (viewportWidth - rect.width - 10) + 'px';
        }

        // Adjust vertical position
        if (rect.bottom > viewportHeight) {
            this.menu.style.top = (viewportHeight - rect.height - 10) + 'px';
        }
    }

    handleAction(action) {
        switch (action) {
            case 'copy':
                this.table.copySelected(false);
                break;
            case 'copyWithHeaders':
                this.table.copySelected(true);
                break;
            case 'selectAll':
                this.table.selectAll();
                break;
            default:
                console.warn('Unknown action:', action);
        }
    }

    updateMenuState() {
        // Enable/disable menu items based on selection
        const hasSelection = this.table.selectedCells.size > 0;
        
        document.querySelectorAll('.context-menu-item').forEach(item => {
            const action = item.dataset.action;
            
            if (action === 'copy' || action === 'copyWithHeaders') {
                item.style.opacity = hasSelection ? '1' : '0.5';
                item.style.pointerEvents = hasSelection ? 'auto' : 'none';
            }
        });
    }
}