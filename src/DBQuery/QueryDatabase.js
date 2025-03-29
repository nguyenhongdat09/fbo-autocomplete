const vscode = require("vscode");
const path = require("path");
const AnalystWebConfig = require("./analystWebConfig");
const sql = require("mssql"); // Thư viện kết nối SQL Server 
const Table = require("cli-table3"); // Import thư viện bảng
const colors = require('@colors/colors/safe');
class QueryDatabase {
    constructor(context, dbStatusBar) {
        this.context = context;
        this.dbStatusBar = dbStatusBar;
        this.dbInfo = null;
        this.outputChannel = vscode.window.createOutputChannel("FBO: SQL Query Results");
        // Đăng ký phím tắt F4
        let f4Command = vscode.commands.registerCommand("fbo-autocomplete.runQuery", () => {
            this.handleF4Press();
        });
        this.context.subscriptions.push(f4Command);
    }
    async logToOutputChannel(content) {
        const stripAnsi = (await import("strip-ansi")).default; // Import động
        const cleanContent = stripAnsi(content);
        this.outputChannel.appendLine(cleanContent);
    }

    /**
     * Tìm folder trước "App_Data"
     * @returns {string | null} Đường dẫn folder root hoặc null nếu không tìm thấy.
     */
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

    /**
     * Xử lý khi nhấn F4
     */
    async handleF4Press() {
        const rootFolder = this.getProjectRootFolder();
        if (!rootFolder) {
            vscode.window.showInformationMessage("Tô câu lệnh của bạn trên XML rồi F4 lại bạn nhé.");
            return;
        }

        const webConfigPath = path.join(rootFolder, "Web.config");
        console.log(webConfigPath)
        try {
            const analyst = new AnalystWebConfig(webConfigPath);
            analyst.loadConfig();
            const selectedDb = this.dbStatusBar.selectedDB.toLowerCase(); // "app" hoặc "sys"
            this.dbInfo = analyst.getDbConnection(selectedDb);
            //console.log(`Thông tin DB ${selectedDb.toUpperCase()}:`, this.dbInfo);
            //{server: '172.168.5.14\\SQL2008', database: 'LIKSIN_FBISP23_A', app_name: 'vscode', user: 'LIKSIN', password: 'fsd'}
            // Lấy text đang được tô sáng
            const editor = vscode.window.activeTextEditor;
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection).trim();

            if (selectedText) {
                await this.executeQuery(selectedText);
            } else {
                vscode.window.showErrorMessage("Vui lòng chọn một đoạn SQL để thực thi.");
            }
        } catch (error) {
            vscode.window.showErrorMessage("Lỗi khi đọc Web.config: " + error.message);
        }
    }
    /**
    * Kết nối DB và chạy query
    * @param {string} query - Câu lệnh SQL cần thực thi
    */
    async executeQuery(query) {
        if (!this.dbInfo) {
            vscode.window.showErrorMessage("Không có thông tin kết nối DB.");
            return;
        }

        const config = {
            user: this.dbInfo.user,
            password: this.dbInfo.password,
            server: this.dbInfo.server,
            database: this.dbInfo.database,
            options: { encrypt: false, enableArithAbort: true }
        };

        sql.connect(config, err => {
            if (err) {
                vscode.window.showErrorMessage("Lỗi kết nối SQL: " + err.message);
                return;
            }

            const request = new sql.Request();
            request.stream = true;

            let resultSets = []; // Mỗi bảng có 1 object { columns, rows }
            let currentSet = null; // Lưu bảng hiện tại
            let messages = [];

            request.on("info", info => {
                messages.push(info.message);
            });

            request.on("error", err => {
                messages.push("Error: " + err.message);
            });

            request.on("recordset", columns => {
                // Khi gặp bảng mới => tạo object mới để lưu
                currentSet = {
                    columns: Object.keys(columns), // Lấy tên cột
                    rows: []
                };
                resultSets.push(currentSet);
            });

            request.on("row", row => {
                if (currentSet) {
                    let rowData = Object.values(row).map(value => {
                        if (value instanceof Date) {
                            return value.toLocaleDateString("vi-VN"); // Chuyển về dd/MM/yyyy
                        }
                        return value;
                    });
                    currentSet.rows.push(rowData);
                }
            });


            request.on("rowsaffected", rowCount => {
                messages.push(`(${rowCount} rows affected)`);
            });

            request.on("done", async () => {
               
                /*
                const MAX_COLUMNS = 10; // Giới hạn số cột hiển thị
                this.outputChannel.clear();
                this.outputChannel.show();

                if (resultSets.length === 0) {
                    this.outputChannel.appendLine("Không có dữ liệu trả về.");
                    return;
                }

                for (let i = 0; i < resultSets.length; i++) {
                    let { columns, rows } = resultSets[i];

                    // Cắt số lượng cột nếu quá nhiều
                    if (columns.length > MAX_COLUMNS) {
                        columns = columns.slice(0, MAX_COLUMNS);
                        rows = rows.map(row => row.slice(0, MAX_COLUMNS));
                    }
                    let table = new Table({
                        chars: {
                            'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
                            'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
                            'left': '║', 'left-mid': '╟', 'mid': '═', 'mid-mid': '┼', // Gạch ngang đứt nét
                            'right': '║', 'right-mid': '╢', 'middle': '│'
                        },
                        head: columns,
                        colWidths: Array(columns.length).fill(20),
                        wordWrap: true,
                        style: { head: ["center"] }
                    });

                    rows.forEach(row => table.push(row));

                    await this.logToOutputChannel(`\n🔹 **Kết quả bảng ${i + 1}:**`);
                    await this.logToOutputChannel(table.toString());
                }
                    */
            });

            request.query(query);
        });
    }

}

module.exports = QueryDatabase;
