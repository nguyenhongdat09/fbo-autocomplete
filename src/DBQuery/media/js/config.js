// File: src/DBQuery/media/js/config.js

const CONFIG = {
    // Performance settings
    performance: {
        maxRows: 20000,              // ✅ Dễ chỉnh
        warningThreshold: 10000,     // Warn when > 10k rows
        pageSize: 100,               // Virtual scrolling page size
        enableVirtualScroll: true    // Enable for large datasets
    },

    // UI settings
    ui: {
        theme: 'auto',  // 'auto' | 'light' | 'dark'
        fontSize: 12,
        fontFamily: 'Consolas, "Courier New", monospace',
        
        // Colors (will use CSS variables for VSCode theme)
        colors: {
            nullBackground: '#FFFFE0',
            nullText: '#666666',
            selectedBackground: '#0078D4',
            selectedText: '#FFFFFF',
            headerBackground: '#F3F3F3',
            headerText: '#000000',
            borderColor: '#D4D4D4',
            hoverBackground: '#E5F3FF',
            rowNumberBackground: '#F0F0F0',
            alternateRowBackground: '#FAFAFA'
        },
        
        // Cell dimensions
        rowHeight: 25,
        columnMinWidth: 80,
        columnMaxWidth: 600,
        rowNumberWidth: 50,
        
        // Show/hide features
        showAlternateRows: false,
        showGridLines: true,
        showRowNumbers: true,
        showStatusBar: true
    },

    // Feature toggles
    features: {
        enableSort: true,
        enableColumnResize: true,
        enableCellNavigation: true,
        enableContextMenu: true,
        enableKeyboardShortcuts: true,
        enableMultiSelect: true,
        enableColumnSelect: true,
        enableRowSelect: true,
        enableSelectAll: true,
        
        // Copy options
        enableCopy: true,
        enableCopyWithHeaders: true,
        
        // Statistics
        showStatistics: true,
        statisticsTypes: ['count', 'sum', 'avg', 'min', 'max']
    },

    // Data formatting
    formatting: {
        nullDisplay: 'NULL',
        dateFormat: 'keep',  // 'keep' | 'locale' | 'iso'
        numberFormat: 'keep', // 'keep' | 'locale'
        booleanFormat: 'numeric', // 'numeric' | 'text'
        
        // Truncate long text
        maxCellTextLength: 1000,
        truncateIndicator: '...'
    },

    // Messages tab
    messages: {
        showExecutionTime: true,
        showRowCount: true,
        showWarnings: true,
        autoSwitchOnError: true  // Auto switch to Messages tab on error
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}