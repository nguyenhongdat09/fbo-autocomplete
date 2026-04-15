// File: src/DBQuery/media/js/SSMSTable.js

class SSMSTable {
    constructor(data, config) {
        this.data = data;
        this.config = config;

        // State
        this.selectedCells = new Set();
        this.focusedCell = null;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.columnWidths = new Map();

        // Components
        this.contextMenu = null;
        this.tabManager = null;

        // Current result set (support multiple in future)
        this.currentResultSetIndex = 0;

        this._globalListenersBound = false;
        this._resizeDocumentListenersBound = false;
        this._resizeDrag = { active: false, startX: 0, startWidth: 0, colIndex: -1 };
        this._onKeyDown = (e) => this.handleKeyDown(e);
        this._onTableContextMenu = (e) => {
            e.preventDefault();
            if (this.contextMenu) {
                this.contextMenu.show(e.clientX, e.clientY);
            }
        };
        this._onResizeMouseMove = (e) => {
            const s = this._resizeDrag;
            if (!s.active) return;
            const diff = e.clientX - s.startX;
            const newWidth = Math.max(
                this.config.ui.columnMinWidth,
                Math.min(this.config.ui.columnMaxWidth, s.startWidth + diff)
            );
            const th = document.querySelector(`th.column-header[data-col="${s.colIndex}"]`);
            if (th) {
                th.style.width = newWidth + 'px';
                this.columnWidths.set(s.colIndex, newWidth);
                document.querySelectorAll(`td[data-col="${s.colIndex}"]`).forEach((td) => {
                    td.style.width = newWidth + 'px';
                });
            }
        };
        this._onResizeMouseUp = () => {
            const s = this._resizeDrag;
            if (s.active) {
                s.active = false;
                document.querySelectorAll('.resize-handle').forEach((h) => {
                    h.classList.remove('resizing');
                });
                document.body.style.cursor = '';
            }
        };
    }

    render() {
        try {
            // Initialize components
            this.tabManager = new TabManager(this.data);
            this.tabManager.init();

            this.initResultSetSelect();

            // Render content
            this.renderTable();
            this.renderMessages();
            this.updateStatusBar();

            // Initialize context menu
            this.contextMenu = new ContextMenu(this);

            // Attach event listeners
            this.attachEventListeners();

            // Auto-switch to Messages tab if error
            if (this.data.hasError && this.config.messages.autoSwitchOnError) {
                this.tabManager.switchTab('messages');
            }

        } catch (error) {
            console.error('Render error:', error);
            this.showError(error.message);
        }
    }

    /**
     * Dropdown chọn result set khi có nhiều bảng (nhiều SELECT / nhiều batch).
     */
    initResultSetSelect() {
        const toolbar = document.getElementById('resultSetToolbar');
        const select = document.getElementById('resultSetSelect');
        if (!toolbar || !select) return;

        const sets = this.data.resultSets || [];
        if (sets.length <= 1) {
            toolbar.style.display = 'none';
            select.innerHTML = '';
            this.currentResultSetIndex = 0;
            return;
        }

        toolbar.style.display = 'flex';
        select.innerHTML = sets
            .map((rs, i) => {
                const label = rs.name || `Result set ${i + 1} (${rs.rowCount} rows)`;
                return `<option value="${i}">${this.escapeHtml(label)}</option>`;
            })
            .join('');

        const idx = Math.min(this.currentResultSetIndex, sets.length - 1);
        this.currentResultSetIndex = idx;
        select.value = String(idx);

        select.onchange = () => {
            this.currentResultSetIndex = parseInt(select.value, 10) || 0;
            this.clearSelection();
            this.renderTable();
            this.updateStatusBar();
            this.attachTableListenersOnly();
        };
    }

    renderTable() {
        const resultSet = this.getCurrentResultSet();
        if (!resultSet || resultSet.rowCount === 0) {
            this.showEmptyState();
            return;
        }

        const { columns, rows } = resultSet;

        // Build table HTML
        let html = '<table class="ssms-table">';

        // Header
        html += '<thead><tr>';
        html += this.renderCornerCell();
        html += columns.map((col, index) => this.renderColumnHeader(col, index)).join('');
        html += '</tr></thead>';

        // Body
        html += '<tbody>';
        html += rows.map((row, rowIndex) => this.renderRow(row, rowIndex, columns)).join('');
        html += '</tbody>';

        html += '</table>';

        document.getElementById('tableContainer').innerHTML = html;
    }

    renderCornerCell() {
        return `<th class="corner-cell" id="cornerCell" title="Select all">☐</th>`;
    }

    renderColumnHeader(column, index) {
        const width = this.columnWidths.get(index) || this.config.ui.columnMinWidth;

        return `
            <th class="column-header" 
                data-col="${index}" 
                style="width: ${width}px;"
                title="${column.name} (${column.type})">
                ${this.escapeHtml(column.name)}
                <div class="resize-handle" data-col="${index}"></div>
            </th>
        `;
    }

    renderRow(row, rowIndex, columns) {
        let html = '<tr>';

        // Row number
        html += `<td class="row-number" data-row="${rowIndex}">${rowIndex + 1}</td>`;

        // Data cells
        row.forEach((cell, colIndex) => {
            html += this.renderCell(cell, rowIndex, colIndex, columns[colIndex]);
        });

        html += '</tr>';
        return html;
    }

    renderCell(value, rowIndex, colIndex, column) {
        const isNull = value === null || value === undefined;
        const cellClass = this.getCellClass(value, column.type, isNull);
        const displayValue = this.formatCellValue(value, column.type, isNull);

        return `
            <td class="${cellClass}" 
                data-row="${rowIndex}" 
                data-col="${colIndex}"
                title="${this.escapeHtml(displayValue)}">
                ${this.escapeHtml(displayValue)}
            </td>
        `;
    }

    getCellClass(value, type, isNull) {
        let classes = [];

        if (isNull) {
            classes.push('null-cell');
        }

        // Add type-specific class
        if (type && type.toLowerCase().includes('int') ||
            type && type.toLowerCase().includes('numeric') ||
            type && type.toLowerCase().includes('decimal') ||
            type && type.toLowerCase().includes('float')) {
            classes.push('type-number');
        } else if (type && type.toLowerCase().includes('date')) {
            classes.push('type-datetime');
        }

        return classes.join(' ');
    }

    formatCellValue(value, type, isNull) {
        if (isNull) {
            return this.config.formatting.nullDisplay;
        }

        // Keep SQL date format (no conversion)
        if (type && type.toLowerCase().includes('date')) {
            return String(value);
        }

        // Truncate long text
        const str = String(value);
        const maxLength = this.config.formatting.maxCellTextLength;

        if (str.length > maxLength) {
            return str.substring(0, maxLength) + this.config.formatting.truncateIndicator;
        }

        return str;
    }

    renderMessages() {
        const container = document.getElementById('messagesContainer');
        const { messages, executionTime, database } = this.data;

        let html = '<div class="messages-content">';

        // Header info
        html += `<div class="message-line info">`;
        html += `<span class="message-icon">ℹ️</span>`;
        html += `<span class="message-content">Database: ${database}</span>`;
        html += `</div>`;

        html += `<div class="message-line info">`;
        html += `<span class="message-icon">⏱️</span>`;
        html += `<span class="message-content">Execution time: ${executionTime}ms</span>`;
        html += `</div>`;

        html += '<br>';

        // Messages
        (messages || []).forEach((msg) => {
            const text = typeof msg === 'string' ? msg : (msg && msg.message) || '';
            const mtype = typeof msg === 'string' ? 'info' : (msg && msg.type) || 'info';
            const icon = mtype === 'error' ? '❌' :
                mtype === 'warning' ? '⚠️' : 'ℹ️';

            html += `<div class="message-line ${mtype}">`;
            html += `<span class="message-icon">${icon}</span>`;
            html += `<span class="message-content">${this.escapeHtml(text)}</span>`;
            html += `</div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    showEmptyState() {
        const html = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>No Results</h3>
                <p>The query returned no data.</p>
            </div>
        `;
        document.getElementById('tableContainer').innerHTML = html;
    }

    showError(message) {
        const html = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <h3>Error</h3>
                <pre>${this.escapeHtml(message)}</pre>
            </div>
        `;
        document.getElementById('tableContainer').innerHTML = html;
    }

    getCurrentResultSet() {
        return this.data.resultSets[this.currentResultSetIndex];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    // File: src/DBQuery/media/js/SSMSTable.js (continued)

    attachEventListeners() {
        if (!this._globalListenersBound) {
            this._globalListenersBound = true;
            document.addEventListener('keydown', this._onKeyDown);
            const tc = document.getElementById('tableContainer');
            if (tc) {
                tc.addEventListener('contextmenu', this._onTableContextMenu);
            }
        }
        this.attachTableListenersOnly();
    }

    attachTableListenersOnly() {
        const cornerCell = document.getElementById('cornerCell');
        if (cornerCell) {
            cornerCell.addEventListener('click', () => this.selectAll());
        }

        document.querySelectorAll('.column-header').forEach((th) => {
            th.addEventListener('click', (e) => {
                if (e.target.classList.contains('resize-handle')) return;

                const colIndex = parseInt(e.currentTarget.dataset.col, 10);

                if (e.shiftKey) {
                    this.sortByColumn(colIndex);
                } else {
                    this.selectColumn(colIndex);
                }
            });
        });

        this.attachResizeHandlers();

        document.querySelectorAll('.row-number').forEach((td) => {
            td.addEventListener('click', (e) => {
                const rowIndex = parseInt(e.currentTarget.dataset.row, 10);
                this.selectRow(rowIndex);
            });
        });

        document.querySelectorAll('td[data-row][data-col]').forEach((td) => {
            if (!td.classList.contains('row-number')) {
                td.addEventListener('click', (e) => this.handleCellClick(e));
                td.addEventListener('dblclick', (e) => this.handleCellDoubleClick(e));
            }
        });
    }

    attachResizeHandlers() {
        if (!this._resizeDocumentListenersBound) {
            this._resizeDocumentListenersBound = true;
            document.addEventListener('mousemove', this._onResizeMouseMove);
            document.addEventListener('mouseup', this._onResizeMouseUp);
        }

        document.querySelectorAll('.resize-handle').forEach((handle) => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const s = this._resizeDrag;
                s.active = true;
                s.startX = e.clientX;
                s.colIndex = parseInt(e.target.dataset.col, 10);
                const th = e.target.parentElement;
                s.startWidth = th.offsetWidth;
                handle.classList.add('resizing');
                document.body.style.cursor = 'col-resize';
            });
        });
    }

    handleKeyDown(e) {
        // Ctrl+C - Copy
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            this.copySelected(false);
        }

        // Ctrl+A - Select all
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            this.selectAll();
        }

        // Escape - Clear selection
        if (e.key === 'Escape') {
            this.clearSelection();
        }

        // Arrow keys - Navigate
        if (this.focusedCell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            this.navigateWithArrows(e.key);
        }
    }

    navigateWithArrows(key) {
        if (!this.focusedCell) return;

        const { row, col } = this.focusedCell;
        const resultSet = this.getCurrentResultSet();
        let newRow = row;
        let newCol = col;

        switch (key) {
            case 'ArrowUp':
                newRow = Math.max(0, row - 1);
                break;
            case 'ArrowDown':
                newRow = Math.min(resultSet.rowCount - 1, row + 1);
                break;
            case 'ArrowLeft':
                newCol = Math.max(0, col - 1);
                break;
            case 'ArrowRight':
                newCol = Math.min(resultSet.columns.length - 1, col + 1);
                break;
        }

        if (newRow !== row || newCol !== col) {
            this.clearSelection();
            this.selectCell(newRow, newCol);
            this.focusCell(newRow, newCol);
            this.scrollToCell(newRow, newCol);
        }
    }

    scrollToCell(row, col) {
        const cell = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    handleCellClick(e) {
        const rowIndex = parseInt(e.target.dataset.row);
        const colIndex = parseInt(e.target.dataset.col);

        if (e.ctrlKey) {
            // Multi-select
            this.toggleCell(rowIndex, colIndex);
        } else if (e.shiftKey && this.focusedCell) {
            // Range select
            this.selectRange(this.focusedCell.row, this.focusedCell.col, rowIndex, colIndex);
        } else {
            // Single select
            this.clearSelection();
            this.selectCell(rowIndex, colIndex);
        }

        this.focusCell(rowIndex, colIndex);
    }

    handleCellDoubleClick(e) {
        const cell = e.target;
        const text = cell.textContent;

        // Copy cell value to clipboard on double-click
        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback
            cell.style.outline = '2px solid green';
            setTimeout(() => {
                cell.style.outline = '';
            }, 300);
        });
    }

    // ============================================
    // Selection Methods
    // ============================================

    selectCell(row, col) {
        const key = `${row},${col}`;
        this.selectedCells.add(key);
        this.updateCellHighlight(row, col, true);
        this.updateStatusBar();
    }

    toggleCell(row, col) {
        const key = `${row},${col}`;
        if (this.selectedCells.has(key)) {
            this.selectedCells.delete(key);
            this.updateCellHighlight(row, col, false);
        } else {
            this.selectedCells.add(key);
            this.updateCellHighlight(row, col, true);
        }
        this.updateStatusBar();
    }

    selectRow(rowIndex) {
        this.clearSelection();
        const resultSet = this.getCurrentResultSet();
        const { columns } = resultSet;

        for (let col = 0; col < columns.length; col++) {
            this.selectCell(rowIndex, col);
        }

        // Highlight row number
        const rowNumber = document.querySelector(`.row-number[data-row="${rowIndex}"]`);
        if (rowNumber) {
            rowNumber.classList.add('selected');
        }
    }

    selectColumn(colIndex) {
        this.clearSelection();
        const resultSet = this.getCurrentResultSet();
        const { rowCount } = resultSet;

        for (let row = 0; row < rowCount; row++) {
            this.selectCell(row, colIndex);
        }

        // Highlight column header
        const header = document.querySelector(`.column-header[data-col="${colIndex}"]`);
        if (header) {
            header.classList.add('selected');
        }
    }

    selectRange(startRow, startCol, endRow, endCol) {
        this.clearSelection();

        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                this.selectCell(row, col);
            }
        }
    }

    selectAll() {
        // Clear existing selection first
        this.clearSelection();

        const resultSet = this.getCurrentResultSet();
        if (!resultSet) return;

        const { columns, rowCount } = resultSet;

        // Check if too many cells
        const totalCells = columns.length * rowCount;
        const MAX_SELECT = 50000; // Limit to prevent freeze

        if (totalCells > MAX_SELECT) {
            const confirm = window.confirm(
                `Selecting ${totalCells} cells may cause performance issues.\n\n` +
                `Rows: ${rowCount}\n` +
                `Columns: ${columns.length}\n\n` +
                `Do you want to continue?`
            );

            if (!confirm) {
                return;
            }

            // Show loading overlay
            this.showLoading(true);
        }

        // Use setTimeout to prevent UI blocking
        setTimeout(() => {
            try {
                // Select all cells
                for (let row = 0; row < rowCount; row++) {
                    for (let col = 0; col < columns.length; col++) {
                        this.selectedCells.add(`${row},${col}`);
                    }
                }

                // Batch update UI
                this.batchUpdateSelection();

                // Highlight corner cell
                const corner = document.getElementById('cornerCell');
                if (corner) {
                    corner.classList.add('selected');
                }

                this.updateStatusBar();

            } catch (error) {
                console.error('Select all error:', error);
                alert('Error selecting all cells: ' + error.message);
            } finally {
                this.showLoading(false);
            }
        }, 10);
    }
    // Add new method for batch selection update
    batchUpdateSelection() {
        // Get all cells that need highlighting
        const cells = document.querySelectorAll('td[data-row][data-col]');

        // Use DocumentFragment for better performance
        cells.forEach(cell => {
            if (!cell.classList.contains('row-number')) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                const key = `${row},${col}`;

                if (this.selectedCells.has(key)) {
                    cell.classList.add('selected');
                }
            }
        });
    }

    // Add loading overlay control
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    clearSelection() {
        this.selectedCells.clear();

        // Remove all selected classes
        document.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Remove focused class
        document.querySelectorAll('.focused').forEach(el => {
            el.classList.remove('focused');
        });

        this.updateStatusBar();
    }

    focusCell(row, col) {
        // Remove previous focus
        document.querySelectorAll('.focused').forEach(el => {
            el.classList.remove('focused');
        });

        // Add new focus
        const cell = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.add('focused');
            this.focusedCell = { row, col };
        }
    }

    updateCellHighlight(row, col, selected) {
        const cell = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.toggle('selected', selected);
        }
    }

    // ============================================
    // Copy Methods
    // ============================================

    copySelected(includeHeaders) {
        if (this.selectedCells.size === 0) {
            console.warn('No cells selected');
            return;
        }

        const data = this.getSelectedData(includeHeaders);

        navigator.clipboard.writeText(data).then(() => {
            // Show success message in status bar
            this.showStatusMessage('✓ Copied to clipboard', 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            this.showStatusMessage('✗ Copy failed', 2000);
        });
    }

    getSelectedData(includeHeaders) {
        const resultSet = this.getCurrentResultSet();
        const { columns, rows } = resultSet;

        // Parse selected cells
        const selected = Array.from(this.selectedCells)
            .map(key => key.split(',').map(Number));

        // Group by rows
        const rowMap = new Map();
        selected.forEach(([row, col]) => {
            if (!rowMap.has(row)) {
                rowMap.set(row, []);
            }
            rowMap.get(row).push({ col, value: rows[row][col] });
        });

        let result = '';

        // Get column indices
        const colIndices = [...new Set(selected.map(([_, col]) => col))].sort((a, b) => a - b);

        // Add headers if needed
        if (includeHeaders) {
            result += colIndices.map(col => columns[col].name).join('\t') + '\n';
        }

        // Add data rows
        const sortedRows = [...rowMap.entries()].sort(([a], [b]) => a - b);

        sortedRows.forEach(([rowIndex, cells]) => {
            const sortedCells = cells.sort((a, b) => a.col - b.col);
            const rowData = sortedCells.map(c => {
                if (c.value === null || c.value === undefined) {
                    return this.config.formatting.nullDisplay;
                }
                return String(c.value);
            });
            result += rowData.join('\t') + '\n';
        });

        return result;
    }

    // ============================================
    // Sort Methods
    // ============================================

    sortByColumn(colIndex) {
        // Toggle sort direction
        if (this.sortColumn === colIndex) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = colIndex;
            this.sortDirection = 'asc';
        }

        // Get current result set
        const resultSet = this.getCurrentResultSet();
        const { rows } = resultSet;

        // Sort rows
        rows.sort((a, b) => {
            const aVal = a[colIndex];
            const bVal = b[colIndex];

            // NULL values always go to bottom
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            // Compare values
            let comparison = 0;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else {
                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                comparison = aStr.localeCompare(bStr);
            }

            return this.sortDirection === 'asc' ? comparison : -comparison;
        });

        // Re-render table
        this.clearSelection();
        this.renderTable();
        this.attachEventListeners();

        // Update header with sort indicator
        document.querySelectorAll('.column-header').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });

        const header = document.querySelector(`.column-header[data-col="${colIndex}"]`);
        if (header) {
            header.classList.add(`sorted-${this.sortDirection}`);
        }
    }

    // ============================================
    // Status Bar & Statistics
    // ============================================

    updateStatusBar() {
        const resultSet = this.getCurrentResultSet();
        const { rowCount } = resultSet;
        const { executionTime, database } = this.data;

        // Row info
        document.getElementById('rowInfo').textContent =
            `${rowCount} row${rowCount !== 1 ? 's' : ''}`;

        const selectedEl = document.getElementById('selectedInfo');
        if (selectedEl) {
            selectedEl.textContent = `Selected: ${this.selectedCells.size}`;
        }

        // Statistics
        this.updateStatistics();

        // Execution time
        document.getElementById('executionTime').textContent =
            `${executionTime}ms`;

        // Database info
        document.getElementById('dbInfo').textContent =
            `Database: ${database}`;
    }

    updateStatistics() {
        const statsElement = document.getElementById('statisticsInfo');

        if (this.selectedCells.size === 0 || !this.config.features.showStatistics) {
            statsElement.textContent = '';
            return;
        }

        const resultSet = this.getCurrentResultSet();
        const { rows, columns } = resultSet;

        // Get selected values (only numeric)
        const values = [];
        this.selectedCells.forEach(key => {
            const [row, col] = key.split(',').map(Number);
            const value = rows[row][col];

            if (typeof value === 'number' && !isNaN(value)) {
                values.push(value);
            }
        });

        if (values.length === 0) {
            statsElement.textContent = '';
            return;
        }

        // Calculate statistics
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        statsElement.textContent =
            `Sum: ${sum.toFixed(2)} | Avg: ${avg.toFixed(2)} | Min: ${min} | Max: ${max}`;
    }

    showStatusMessage(message, duration = 3000) {
        const statusBar = document.getElementById('statusBar');
        const originalContent = statusBar.innerHTML;

        statusBar.innerHTML = `<div class="status-item">${message}</div>`;

        setTimeout(() => {
            statusBar.innerHTML = originalContent;
            this.updateStatusBar();
        }, duration);
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SSMSTable;
}
// Continue in next part...
