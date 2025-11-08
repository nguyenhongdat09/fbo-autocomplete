// File: src/DBQuery/QueryDatabase.js

const vscode = require("vscode");
 
const path = require("path");
const AnalystWebConfig = require("./analystWebConfig");
const sql = require("mssql");

class QueryDatabase {
    constructor(context, dbStatusBar) { 
        this.context = context;
        this.dbStatusBar = dbStatusBar;
        this.dbInfo = null;
        this.resultPanel = null; // ✅ Store panel instance

        // Register F4 command
        let f4Command = vscode.commands.registerCommand("fbo-autocomplete.runQuery", () => {
            this.handleF4Press();
        });
        this.context.subscriptions.push(f4Command);
    }

    getProjectRootFolder() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return null;

        const filePath = activeEditor.document.uri.fsPath;
        const parts = filePath.split(path.sep);
        const index = parts.findIndex(part => part === "App_Data");

        if (index > 0) {
            return parts.slice(0, index).join(path.sep);
        }

        return null;
    }

    async handleF4Press() {
        const rootFolder = this.getProjectRootFolder();
        if (!rootFolder) {
            vscode.window.showInformationMessage("Tô câu lệnh của bạn trên XML rồi F4 lại bạn nhé.");
            return;
        }

        const webConfigPath = path.join(rootFolder, "Web.config");

        try {
            const analyst = new AnalystWebConfig(webConfigPath);
            analyst.loadConfig();
            const selectedDb = this.dbStatusBar.selectedDB.toLowerCase();
            this.dbInfo = analyst.getDbConnection(selectedDb);

            const editor = vscode.window.activeTextEditor;
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection).trim();

            if (selectedText) {
                console.log('Executing query:', selectedText.substring(0, 100) + '...');

                // Show loading indicator
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Executing query...",
                    cancellable: false
                }, async () => {
                    try {
                        const result = await this.executeQuery(selectedText);

                        console.log('Query result:', result ? 'Success' : 'Null');

                        if (result) {
                            console.log('Result sets:', result.resultSets.length);
                            console.log('Messages:', result.messages.length);
                            console.log('Has error:', result.hasError);

                            try {
                                // ✅ Import QueryResultPanel
                                const QueryResultPanel = require("./QueryResultPanel");

                                // ✅ Reuse or create new panel
                                if (!this.resultPanel) {
                                    console.log('Creating new panel...');
                                    this.resultPanel = new QueryResultPanel(this.context);
                                } else {
                                    console.log('Reusing existing panel...');
                                }

                                console.log('Showing panel...');
                                this.resultPanel.show(result);
                                console.log('Panel shown successfully');

                            } catch (panelError) {
                                console.error('Panel error:', panelError);
                                console.error('Stack:', panelError.stack);
                                vscode.window.showErrorMessage('Error showing panel: ' + panelError.message);
                            }

                        } else {
                            console.error('Query returned null result');
                            vscode.window.showErrorMessage('Query returned no result');
                        }
                    } catch (queryError) {
                        console.error('Query execution error:', queryError);
                        console.error('Stack:', queryError.stack);
                        vscode.window.showErrorMessage('Query error: ' + queryError.message);
                    }
                });
            } else {
                vscode.window.showErrorMessage("Vui lòng chọn một đoạn SQL để thực thi.");
            }
        } catch (error) {
            console.error('F4 handler error:', error);
            console.error('Stack:', error.stack);
            vscode.window.showErrorMessage("Lỗi: " + error.message);
        }
    }


    async executeQuery(query) {
        if (!this.dbInfo) {
            throw new Error("Không có thông tin kết nối DB");
        }

        console.log('Connecting to database:', this.dbInfo.database);

        const config = {
            user: this.dbInfo.user,
            password: this.dbInfo.password,
            server: this.dbInfo.server,
            database: this.dbInfo.database,
            options: {
                encrypt: false,
                enableArithAbort: true,
                trustServerCertificate: true
            }
        };

        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            sql.connect(config, err => {
                if (err) {
                    console.error('SQL connection error:', err);
                    reject(new Error("Lỗi kết nối SQL: " + err.message));
                    return;
                }

                console.log('Connected to SQL Server');

                const request = new sql.Request();
                request.stream = true;

                let resultSets = [];
                let currentSet = null;
                let messages = [];
                let hasError = false;

                request.on("info", info => {
                    console.log('SQL Info:', info.message);
                    messages.push({
                        type: 'info',
                        message: info.message,
                        timestamp: new Date().toISOString()
                    });
                });

                request.on("error", err => {
                    console.error('SQL error:', err);
                    hasError = true;
                    messages.push({
                        type: 'error',
                        message: err.message,
                        timestamp: new Date().toISOString()
                    });
                });

                request.on("recordset", columns => {
                    console.log('Recordset received, columns:', Object.keys(columns).length);
                    currentSet = {
                        columns: this.parseColumns(columns),
                        rows: [],
                        rowCount: 0
                    };
                    resultSets.push(currentSet);
                });

                request.on("row", row => {
                    if (currentSet) {
                        const rowData = Object.values(row);
                        currentSet.rows.push(rowData);
                        currentSet.rowCount++;
                    }
                });

                request.on("rowsaffected", rowCount => {
                    console.log('Rows affected:', rowCount);
                    messages.push({
                        type: 'info',
                        message: `(${rowCount} row${rowCount !== 1 ? 's' : ''} affected)`,
                        timestamp: new Date().toISOString()
                    });
                });

                request.on("done", () => {
                    const executionTime = Date.now() - startTime;
                    console.log('Query completed in', executionTime, 'ms');
                    console.log('Result sets:', resultSets.length);

                    if (resultSets.length > 0) {
                        console.log('Total rows:', resultSets.reduce((sum, rs) => sum + rs.rowCount, 0));
                    }

                    // Check max rows limit
                    const totalRows = resultSets.reduce((sum, rs) => sum + rs.rowCount, 0);
                    const MAX_ROWS = 20000;

                    if (totalRows > MAX_ROWS) {
                        console.warn('Truncating results from', totalRows, 'to', MAX_ROWS);
                        messages.push({
                            type: 'warning',
                            message: `⚠️ Result truncated to ${MAX_ROWS} rows (total: ${totalRows})`,
                            timestamp: new Date().toISOString()
                        });

                        let remaining = MAX_ROWS;
                        resultSets = resultSets.map(rs => {
                            if (remaining <= 0) {
                                return { ...rs, rows: [], rowCount: 0 };
                            }
                            const take = Math.min(remaining, rs.rowCount);
                            remaining -= take;
                            return {
                                ...rs,
                                rows: rs.rows.slice(0, take),
                                rowCount: take
                            };
                        });
                    }

                    const result = {
                        resultSets,
                        messages,
                        executionTime,
                        query,
                        database: this.dbInfo.database,
                        hasError,
                        timestamp: new Date().toISOString()
                    };

                    console.log('Closing SQL connection...');

                    // ✅ Close connection properly
                    try {
                        sql.close(() => {
                            console.log('SQL connection closed');
                            resolve(result);
                        });
                    } catch (closeError) {
                        console.error('Error closing connection:', closeError);
                        // Still resolve even if close fails
                        resolve(result);
                    }
                });

                try {
                    console.log('Executing query...');
                    request.query(query);
                } catch (execError) {
                    console.error('Query execution error:', execError);
                    sql.close();
                    reject(new Error('Query execution error: ' + execError.message));
                }
            });
        });
    }

    /**
     * Execute SQL query and return structured result
     * @param {string} query - SQL query to execute
     * @returns {Promise<QueryResult>}
     */
    async executeQuery(query) {
        if (!this.dbInfo) {
            vscode.window.showErrorMessage("Không có thông tin kết nối DB.");
            return null;
        }

        const config = {
            user: this.dbInfo.user,
            password: this.dbInfo.password,
            server: this.dbInfo.server,
            database: this.dbInfo.database,
            options: {
                encrypt: false,
                enableArithAbort: true,
                trustServerCertificate: true
            }
        };

        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            sql.connect(config, err => {
                if (err) {
                    vscode.window.showErrorMessage("Lỗi kết nối SQL: " + err.message);
                    reject(err);
                    return;
                }

                const request = new sql.Request();
                request.stream = true;

                let resultSets = [];
                let currentSet = null;
                let messages = [];
                let hasError = false;

                request.on("info", info => {
                    messages.push({
                        type: 'info',
                        message: info.message,
                        timestamp: new Date().toISOString()
                    });
                });

                request.on("error", err => {
                    hasError = true;
                    messages.push({
                        type: 'error',
                        message: err.message,
                        timestamp: new Date().toISOString()
                    });
                });

                request.on("recordset", columns => {
                    // New result set
                    currentSet = {
                        columns: this.parseColumns(columns),
                        rows: [],
                        rowCount: 0
                    };
                    resultSets.push(currentSet);
                });

                request.on("row", row => {
                    if (currentSet) {
                        // Convert row to array, preserving order
                        const rowData = Object.values(row);
                        currentSet.rows.push(rowData);
                        currentSet.rowCount++;
                    }
                });

                request.on("rowsaffected", rowCount => {
                    messages.push({
                        type: 'info',
                        message: `(${rowCount} row${rowCount !== 1 ? 's' : ''} affected)`,
                        timestamp: new Date().toISOString()
                    });
                });

                request.on("done", () => {
                    const executionTime = Date.now() - startTime;

                    // Check max rows limit
                    const totalRows = resultSets.reduce((sum, rs) => sum + rs.rowCount, 0);
                    const MAX_ROWS = 20000; // ✅ From config

                    if (totalRows > MAX_ROWS) {
                        messages.push({
                            type: 'warning',
                            message: `⚠️ Result truncated to ${MAX_ROWS} rows (total: ${totalRows})`,
                            timestamp: new Date().toISOString()
                        });

                        // Truncate result sets
                        let remaining = MAX_ROWS;
                        resultSets = resultSets.map(rs => {
                            if (remaining <= 0) {
                                return { ...rs, rows: [], rowCount: 0 };
                            }
                            const take = Math.min(remaining, rs.rowCount);
                            remaining -= take;
                            return {
                                ...rs,
                                rows: rs.rows.slice(0, take),
                                rowCount: take
                            };
                        });
                    }

                    const result = {
                        resultSets,
                        messages,
                        executionTime,
                        query,
                        database: this.dbInfo.database,
                        hasError,
                        timestamp: new Date().toISOString()
                    };

                    sql.close();
                    resolve(result);
                });

                request.query(query);
            });
        });
    }

    /**
     * Parse column metadata
     */
    parseColumns(columns) {
        return Object.keys(columns).map(name => {
            const col = columns[name];
            return {
                name: name,
                type: col.type?.name || 'unknown',
                length: col.length,
                nullable: col.nullable,
                precision: col.precision,
                scale: col.scale
            };
        });
    }
}

module.exports = QueryDatabase;