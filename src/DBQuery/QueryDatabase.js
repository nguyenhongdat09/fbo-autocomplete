// File: src/DBQuery/QueryDatabase.js
// Chức năng: Chạy file .sql dựa trên DB đang chọn trong DBStatusBarManager
 
const vscode = require("vscode");
const sql = require("mssql");
const DBStatusBarManager = require("./dbBar");

// Output channel và diagnostics cho việc chạy file .sql
const outputChannel = vscode.window.createOutputChannel("FBO SQL");
const sqlDiagnostics = vscode.languages.createDiagnosticCollection("fbo-sql");

/** Dòng chỉ chứa GO (batch separator của SSMS), không gửi lên server */
const GO_LINE_REGEX = /^\s*GO\s*$/im;

/**
 * Tách script thành các batch theo GO (giống SSMS). GO không được gửi lên SQL Server.
 * @param {string} sqlText
 * @returns {{ batches: string[], startLines: number[] }} startLines[i] = dòng bắt đầu (0-based) của batch i trong file
 */
function splitScriptByGo(sqlText) {
    const lines = sqlText.split(/\r\n|\r|\n/);
    const batches = [];
    const startLines = [];
    let current = [];
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (GO_LINE_REGEX.test(lines[i])) {
            const batch = current.join("\n").trim();
            if (batch) {
                batches.push(batch);
                startLines.push(startLine);
            }
            current = [];
            startLine = i + 1;
        } else {
            current.push(lines[i]);
        }
    }
    const last = current.join("\n").trim();
    if (last) {
        batches.push(last);
        startLines.push(startLine);
    }
    return { batches, startLines };
}

/**
 * Thực thi một batch SQL, trả về messages và hasError (và line number trong batch nếu lỗi)
 * @param {sql.ConnectionPool} pool - đã connect
 * @param {string} query
 * @param {number} batchStartLine - dòng bắt đầu batch trong file (0-based), dùng để cộng vào err.lineNumber
 * @returns {Promise<{messages:string[],hasError:boolean}>}
 */
function runOneBatch(pool, query, batchStartLine) {
    const messages = [];
    let hasError = false;
    return new Promise((resolve, reject) => {
        const request = new sql.Request(pool);
        request.stream = true;
        request.on("info", info => {
            if (info && info.message) messages.push(info.message);
        });
        request.on("error", err2 => {
            hasError = true;
            if (err2) {
                const lineInFile = (typeof err2.lineNumber === "number" && err2.lineNumber > 0)
                    ? batchStartLine + err2.lineNumber
                    : batchStartLine + 1;
                messages.push("Line " + lineInFile);
                if (err2.message) messages.push(err2.message);
            }
        });
        request.on("rowsaffected", rowCount => {
            if (typeof rowCount === "number") {
                messages.push(`(${rowCount} row${rowCount !== 1 ? "s" : ""} affected)`);
            }
        });
        request.on("done", () => resolve({ messages, hasError }));
        try {
            request.query(query);
        } catch (e) {
            hasError = true;
            messages.push("Line " + (batchStartLine + 1));
            messages.push(e.message);
            resolve({ messages, hasError });
        }
    });
}

/**
 * Thực thi script SQL (có thể chứa nhiều batch phân cách bởi GO), gom messages giống SSMS
 * @param {string} script - toàn bộ script (sẽ tách theo GO)
 * @param {{server:string,database:string,user:string,password:string}} connInfo
 * @returns {Promise<{messages:string[],hasError:boolean}>}
 */
async function executeSqlMessageOnly(script, connInfo) {
    if (!connInfo) {
        throw new Error("Không có thông tin kết nối DB.");
    }

    const { batches, startLines } = splitScriptByGo(script);
    if (batches.length === 0) {
        return { messages: [], hasError: false };
    }

    const config = {
        user: connInfo.user,
        password: connInfo.password,
        server: connInfo.server,
        database: connInfo.database,
        options: {
            encrypt: false,
            enableArithAbort: true,
            trustServerCertificate: true
        }
    };

    let pool;
    try {
        pool = await sql.connect(config);
    } catch (err) {
        return {
            messages: ["Connection error: " + (err && err.message)],
            hasError: true
        };
    }

    const allMessages = [];
    let hasError = false;
    try {
        for (let i = 0; i < batches.length; i++) {
            const { messages, hasError: batchError } = await runOneBatch(pool, batches[i], startLines[i]);
            allMessages.push(...messages);
            if (batchError) hasError = true;
        }
    } finally {
        try {
            await pool.close();
        } catch (e) {
            // ignore
        }
    }
    return { messages: allMessages, hasError };
}

/**
 * Chạy SQL cho file .sql hiện tại, dùng DB đang chọn trên status bar
 */
async function runCurrentSqlFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("Không có editor nào đang mở.");
        return;
    }

    const doc = editor.document;
    if (!doc || !doc.uri) {
        vscode.window.showErrorMessage("Không đọc được document hoặc uri.");
        console.error("[FBO runSqlFile] doc hoặc doc.uri undefined", { doc: !!doc, uri: doc && doc.uri });
        return;
    }
    const uri = doc.uri;
    const fsPath = uri.fsPath;
    if (uri.scheme !== "file" || typeof fsPath !== "string" || !fsPath.toLowerCase().endsWith(".sql")) {
        vscode.window.showErrorMessage("Chức năng này chỉ dùng cho file .sql.");
        return;
    }

    const selection = editor.selection;
    const sqlText = (selection && !selection.isEmpty)
        ? doc.getText(selection).trim()
        : doc.getText().trim();

    if (!sqlText) {
        vscode.window.showErrorMessage("Không có câu lệnh SQL để chạy.");
        return;
    }

    const dbStatus = DBStatusBarManager.current;
    if (!dbStatus || !dbStatus.dbInfoSelected || !dbStatus.dbInfoSelected.connection) {
        vscode.window.showErrorMessage("Chưa chọn database hoặc không lấy được thông tin kết nối từ status bar.");
        return;
    }

    // Xoá diagnostics cũ cho file hiện tại
    sqlDiagnostics.set(doc.uri, []);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Executing SQL file...",
        cancellable: false
    }, async () => {
        try {
            const { messages, hasError } = await executeSqlMessageOnly(
                sqlText,
                dbStatus.dbInfoSelected.connection
            );

            // Ghi ra OutputChannel giống tab Messages (bỏ qua dòng "Line N" chỉ dùng cho parse)
            outputChannel.clear();
            const lineOnlyRegex = /^Line\s+(\d+)$/i;
            if (messages.length) {
                messages.forEach(m => {
                    if (!lineOnlyRegex.test((m && m.trim) ? m.trim() : m)) {
                        outputChannel.appendLine(m);
                    }
                });
            } else {
                outputChannel.appendLine("(No messages)");
            }
            outputChannel.show(true);

            // Nếu có lỗi thì chỉ đưa message LỖI vào Problems (bỏ qua "(N rows affected)", "Line N" trung gian)
            if (hasError) {
                const diagnostics = [];
                const lineRegex = /^Line\s+(\d+)$/i;
                const isInfoMessage = (m) => /^\(\d+\s+rows?\s+affected\)$/i.test(m.trim()) || /^Completion\s+time:/i.test(m.trim()) || /^Line\s+\d+$/i.test(m);
                let lastErrorLine = 0; // 0-based
                for (const msg of messages) {
                    const lineMatch = msg.match(lineRegex);
                    if (lineMatch) {
                        const n = parseInt(lineMatch[1], 10);
                        if (!isNaN(n) && n > 0) {
                            lastErrorLine = Math.min(n - 1, doc.lineCount - 1);
                            if (lastErrorLine < 0) lastErrorLine = 0;
                        }
                        continue; // Không thêm "Line N" vào Problems
                    }
                    if (isInfoMessage(msg)) continue; // Bỏ qua rows affected, completion time
                    const line = lastErrorLine;
                    const range = new vscode.Range(line, 0, line, doc.lineAt(line).text.length);
                    diagnostics.push(new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error));
                }
                if (diagnostics.length) {
                    sqlDiagnostics.set(doc.uri, diagnostics);
                }
            }
        } catch (err) {
            console.error("[FBO runSqlFile] executeSqlMessageOnly/display error:", err);
            console.error("[FBO runSqlFile] stack:", err && err.stack);
            outputChannel.clear();
            outputChannel.appendLine(`Error: ${err && err.message}`);
            outputChannel.show(true);
        }
    });
}

module.exports = {
    runCurrentSqlFile
};