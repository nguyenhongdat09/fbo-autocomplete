// File: src/DBQuery/QueryDatabaseVisualResult.js
// Chạy file .sql, gom recordsets → panel webview (nhiều bảng). DB từ DBStatusBarManager.

const vscode = require("vscode");
const sql = require("mssql");
const DBStatusBarManager = require("./dbBar");
const QueryResultPanel = require("./QueryResultPanel");
const { sqlDiagnostics } = require("./QueryDatabase");

/** Khớp media/js/config.js performance.maxRows */
const MAX_ROWS_PER_RESULT_SET = 20000;

/** Dòng chỉ chứa GO — không gửi lên server */
const GO_LINE_REGEX = /^\s*GO\s*$/im;

const SQL_CONNECTION_TIMEOUT_MS = 120000;
const SQL_REQUEST_TIMEOUT_MS = 0;

/**
 * @param {string} sqlText
 * @returns {{ batches: string[], startLines: number[] }}
 */
function splitScriptByGo(sqlText) {
    const lines = sqlText.split(/\r\n|\r|\n/);
    const batches = [];
    const startLines = [];
    let current = [];
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (GO_LINE_REGEX.test(lines[i])) {
            const batch = current.join("\n");
            if (batch.trim()) {
                batches.push(batch);
                startLines.push(startLine);
            }
            current = [];
            startLine = i + 1;
        } else {
            current.push(lines[i]);
        }
    }
    const last = current.join("\n");
    if (last.trim()) {
        batches.push(last);
        startLines.push(startLine);
    }
    return { batches, startLines };
}

/**
 * Giá trị an toàn cho JSON / webview
 * @param {*} val
 * @returns {*}
 */
function serializeCell(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === "bigint") return val.toString();
    if (Buffer.isBuffer(val)) return val.toString("base64");
    if (val instanceof Date) return val.toISOString();
    return val;
}

/**
 * Scale SQL (decimal/numeric/money) từ metadata tedious — dùng format hiển thị giống SSMS (vd 0.000).
 * @param {*} meta
 * @returns {number|null}
 */
function readColumnSqlScale(meta) {
    if (!meta || typeof meta !== "object") return null;
    if (typeof meta.scale === "number" && meta.scale >= 0) {
        return meta.scale;
    }
    const t = meta.type;
    if (!t || typeof t !== "object") return null;
    if (typeof t.scale === "number" && t.scale >= 0) {
        return t.scale;
    }
    if (typeof t.declaration === "function") {
        try {
            const decl = String(t.declaration());
            const m = decl.match(/\(\s*\d+\s*,\s*(\d+)\s*\)/);
            if (m) {
                const sc = parseInt(m[1], 10);
                if (!isNaN(sc)) return sc;
            }
        } catch (e) {
            /* ignore */
        }
    }
    const tname = String(t.name || "").toLowerCase();
    if (tname === "money" || tname === "smallmoney") {
        return 4;
    }
    return null;
}

/**
 * Metadata cột cho webview (columns[].name / type / scale, rows là mảng giá trị theo thứ tự cột).
 * @param {string} name
 * @param {*} meta
 * @returns {{ name: string, type: string, scale: number|null }}
 */
function columnMeta(name, meta) {
    const out = { name, type: "unknown", scale: null };
    if (meta && typeof meta === "object") {
        const t = meta.type;
        const typeName = t && (t.name || t.declaration || t);
        out.type = typeof typeName === "string" ? typeName : "unknown";
        out.scale = readColumnSqlScale(meta);
    }
    return out;
}

/**
 * Trả về mảng giá trị theo thứ tự cột metadata.
 * Hỗ trợ trường hợp mssql gom nhiều cột không tên vào key "" thành 1 mảng.
 * @param {Record<string, any>} row
 * @param {string[]} sourceColNames
 * @returns {any[]}
 */
function rowToCellsByColumnOrder(row, sourceColNames) {
    const safeRow = row && typeof row === "object" ? row : {};
    const unnamedBucket =
        Object.prototype.hasOwnProperty.call(safeRow, "") && Array.isArray(safeRow[""])
            ? safeRow[""]
            : null;
    let unnamedIndex = 0;
    const seenByName = new Map();

    return sourceColNames.map((colName, colIndex) => {
        const occ = seenByName.get(colName) || 0;
        seenByName.set(colName, occ + 1);

        if (colName === "" && unnamedBucket) {
            if (unnamedIndex < unnamedBucket.length) {
                return serializeCell(unnamedBucket[unnamedIndex++]);
            }
        }

        if (Object.prototype.hasOwnProperty.call(safeRow, colName)) {
            const direct = safeRow[colName];
            // key "" có thể chứa cả mảng đại diện nhiều cột, không lấy trực tiếp mảng này làm 1 ô.
            if (!(colName === "" && Array.isArray(direct))) {
                // Cột trùng tên (vd: select ma_bp, ma_bp) thường được mssql gom thành mảng theo key duy nhất.
                // Tách theo lần xuất hiện của tên cột để giữ đủ số cột như SSMS.
                if (Array.isArray(direct)) {
                    if (occ < direct.length) {
                        return serializeCell(direct[occ]);
                    }
                    return null;
                }
                return serializeCell(direct);
            }
        }

        if (Array.isArray(safeRow) && colIndex < safeRow.length) {
            return serializeCell(safeRow[colIndex]);
        }

        if (unnamedBucket && unnamedIndex < unnamedBucket.length) {
            return serializeCell(unnamedBucket[unnamedIndex++]);
        }

        return null;
    });
}

/**
 * Chuẩn hóa danh sách cột theo metadata + dữ liệu hàng đầu tiên có giá trị.
 * Trường hợp mssql trả 1 key nhưng value là mảng (do cột trùng tên), bung thành nhiều cột cùng tên.
 * @param {string[]} sourceColNames
 * @param {Record<string, any>[]} rows
 * @returns {string[]}
 */
function normalizeSourceColumnNames(sourceColNames, rows) {
    if (!Array.isArray(sourceColNames) || sourceColNames.length === 0) {
        return [];
    }
    const rowList = Array.isArray(rows) ? rows : [];
    const emptyCountInSource = sourceColNames.filter((n) => !n).length;
    let unnamedExpandLen = 0;
    if (emptyCountInSource === 1) {
        for (let i = 0; i < rowList.length; i++) {
            const r = rowList[i];
            if (!r || typeof r !== "object") continue;
            if (!Object.prototype.hasOwnProperty.call(r, "")) continue;
            const v = r[""];
            if (Array.isArray(v) && v.length > 1) {
                unnamedExpandLen = v.length;
            }
            break;
        }
    }

    const expanded = [];
    let emptyExpanded = false;
    for (const colName of sourceColNames) {
        if (!colName) {
            if (!emptyExpanded && unnamedExpandLen > 1) {
                for (let i = 0; i < unnamedExpandLen; i++) {
                    expanded.push("");
                }
                emptyExpanded = true;
            } else {
                expanded.push(colName);
            }
            continue;
        }
        let arrayLen = 0;
        for (let i = 0; i < rowList.length; i++) {
            const r = rowList[i];
            if (!r || typeof r !== "object") continue;
            if (!Object.prototype.hasOwnProperty.call(r, colName)) continue;
            const v = r[colName];
            if (Array.isArray(v) && v.length > 1) {
                arrayLen = v.length;
            }
            break;
        }
        if (arrayLen > 1) {
            for (let i = 0; i < arrayLen; i++) {
                expanded.push(colName);
            }
        } else {
            expanded.push(colName);
        }
    }
    return expanded;
}

function unquoteSqlIdent(name) {
    const s = String(name || "").trim();
    if (!s) return "";
    if (s.startsWith("[") && s.endsWith("]")) return s.slice(1, -1);
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    if (s.startsWith("`") && s.endsWith("`")) return s.slice(1, -1);
    return s;
}

function splitSqlSelectList(selectList) {
    const out = [];
    let cur = "";
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;
    const s = String(selectList || "");
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const next = s[i + 1];
        if (inSingle) {
            cur += ch;
            if (ch === "'" && next === "'") {
                cur += next;
                i++;
            } else if (ch === "'") {
                inSingle = false;
            }
            continue;
        }
        if (inDouble) {
            cur += ch;
            if (ch === '"') inDouble = false;
            continue;
        }
        if (inBracket) {
            cur += ch;
            if (ch === "]") inBracket = false;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            cur += ch;
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            cur += ch;
            continue;
        }
        if (ch === "[") {
            inBracket = true;
            cur += ch;
            continue;
        }
        if (ch === "(") {
            depth++;
            cur += ch;
            continue;
        }
        if (ch === ")") {
            if (depth > 0) depth--;
            cur += ch;
            continue;
        }
        if (ch === "," && depth === 0) {
            out.push(cur.trim());
            cur = "";
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

function projectNameFromExpr(expr) {
    const e = String(expr || "").trim();
    if (!e) return "";
    const asMatch = e.match(/\bas\s+(\[[^\]]+\]|"[^"]+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\s*$/i);
    if (asMatch) return unquoteSqlIdent(asMatch[1]);

    // Không alias: biến @a, biểu thức, hằng số -> (No column name)
    if (/^@[A-Za-z_][A-Za-z0-9_]*$/i.test(e)) return "";
    if (/^[0-9]+(\.[0-9]+)?$/.test(e)) return "";
    if (/^N?'(?:''|[^'])*'$/.test(e)) return "";

    // Cột thường: a, a.b, [a], [a].[b]
    const parts = e.split(".").map((x) => x.trim()).filter(Boolean);
    if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (/^\[[^\]]+\]$/.test(last) || /^"[^"]+"$/.test(last) || /^`[^`]+`$/.test(last) || /^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) {
            return unquoteSqlIdent(last);
        }
    }
    return "";
}

function extractSelectProjectionNames(queryText) {
    const q = String(queryText || "");
    const m = /\bselect\b/i.exec(q);
    if (!m) return null;
    const start = m.index + m[0].length;
    let i = start;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;
    let end = -1;
    for (; i < q.length; i++) {
        const ch = q[i];
        const next = q[i + 1];
        if (inSingle) {
            if (ch === "'" && next === "'") {
                i++;
            } else if (ch === "'") {
                inSingle = false;
            }
            continue;
        }
        if (inDouble) {
            if (ch === '"') inDouble = false;
            continue;
        }
        if (inBracket) {
            if (ch === "]") inBracket = false;
            continue;
        }
        if (ch === "'") { inSingle = true; continue; }
        if (ch === '"') { inDouble = true; continue; }
        if (ch === "[") { inBracket = true; continue; }
        if (ch === "(") { depth++; continue; }
        if (ch === ")") { if (depth > 0) depth--; continue; }
        if (depth === 0 && /\bf\b/i.test(ch)) {
            const maybeFrom = q.slice(i, i + 4);
            const before = i === 0 ? " " : q[i - 1];
            const after = q[i + 4] || " ";
            if (/^from$/i.test(maybeFrom) && /\W/.test(before) && /\W/.test(after)) {
                end = i;
                break;
            }
        }
    }
    if (end < 0) return null;
    const list = q.slice(start, end).trim();
    if (!list) return null;
    const exprs = splitSqlSelectList(list);
    if (!exprs.length) return null;
    return exprs.map(projectNameFromExpr);
}

function normalizeColNameKey(n) {
    return String(n == null ? "" : n).trim().toLowerCase();
}

function canApplyParsedOrder(parsedNames, sourceColNames) {
    if (!Array.isArray(parsedNames) || !Array.isArray(sourceColNames)) return false;
    if (!parsedNames.length || parsedNames.length !== sourceColNames.length) return false;
    const cntA = new Map();
    const cntB = new Map();
    parsedNames.forEach((n) => {
        const k = normalizeColNameKey(n);
        cntA.set(k, (cntA.get(k) || 0) + 1);
    });
    sourceColNames.forEach((n) => {
        const k = normalizeColNameKey(n);
        cntB.set(k, (cntB.get(k) || 0) + 1);
    });
    if (cntA.size !== cntB.size) return false;
    for (const [k, v] of cntA.entries()) {
        if ((cntB.get(k) || 0) !== v) return false;
    }
    return true;
}

/**
 * @param {sql.ConnectionPool} pool
 * @param {string} query
 * @param {number} batchIndex 0-based
 * @param {number} batchStartLine 0-based dòng đầu batch trong file
 * @param {number} resultSetOffset chỉ số bắt đầu đặt tên Result set N
 * @returns {Promise<{ resultSets: object[], messages: {type:string,message:string}[], hasError: boolean, nextResultSetOffset: number }>}
 */
async function runOneBatchVisual(pool, query, batchIndex, batchStartLine, resultSetOffset) {
    const messages = [];
    const resultSets = [];
    let hasError = false;
    let nextOffset = resultSetOffset;

    try {
        const request = new sql.Request(pool);
        request.on("info", (info) => {
            if (info && info.message) {
                messages.push({ type: "print", message: String(info.message) });
            }
        });
        const result = await request.query(query);

        let rss = [];
        if (Array.isArray(result.recordsets) && result.recordsets.length > 0) {
            rss = result.recordsets;
        } else if (result.recordset) {
            rss = [result.recordset];
        }

        for (let ri = 0; ri < rss.length; ri++) {
            const rs = rss[ri];
            if (!Array.isArray(rs)) continue;

            /** @type {any} */
            const rsAny = rs;
            const rawCols = rsAny.columns;
            let sourceColNames = [];
            if (Array.isArray(rawCols)) {
                sourceColNames = rawCols.map((c) => (c && c.name) || "");
            } else if (rawCols && typeof rawCols === "object") {
                sourceColNames = Object.keys(rawCols);
            } else if (rs.length > 0) {
                sourceColNames = Object.keys(rs[0]);
            }

            sourceColNames = normalizeSourceColumnNames(sourceColNames, rs);

            // Giữ đúng thứ tự SELECT khi metadata object làm lệch thứ tự cột (đặc biệt cột trùng tên).
            // Chỉ áp dụng khi parse được danh sách SELECT và multiset tên cột khớp hoàn toàn.
            const parsedOrder = extractSelectProjectionNames(query);
            if (canApplyParsedOrder(parsedOrder, sourceColNames)) {
                sourceColNames = parsedOrder;
            }

            // mssql có thể gom nhiều cột không tên vào key "" dạng mảng (vd: select @a, @b).
            // Khi metadata chỉ còn 1 key "", bung theo số phần tử để hiển thị đủ số cột.
            if (
                sourceColNames.length === 1 &&
                sourceColNames[0] === "" &&
                rs.length > 0 &&
                rs[0] &&
                Array.isArray(rs[0][""]) &&
                rs[0][""].length > 1
            ) {
                sourceColNames = Array.from({ length: rs[0][""].length }, () => "");
            }
            const displayColNames = sourceColNames.map((n) =>
                n == null || String(n).trim() === "" ? "(No column name)" : String(n)
            );

            let columns;
            if (Array.isArray(rawCols) && rawCols.length) {
                columns = displayColNames.map((displayName, i) =>
                    columnMeta(displayName, rawCols[i] || rawCols[sourceColNames[i]])
                );
            } else if (rawCols && typeof rawCols === "object" && !Array.isArray(rawCols)) {
                columns = displayColNames.map((displayName, i) =>
                    columnMeta(displayName, rawCols[sourceColNames[i]])
                );
            } else {
                columns = displayColNames.map((displayName) => columnMeta(displayName, null));
            }

            let rows = rs.map((r) => rowToCellsByColumnOrder(r, sourceColNames));
            const fullCount = rows.length;
            if (fullCount > MAX_ROWS_PER_RESULT_SET) {
                rows = rows.slice(0, MAX_ROWS_PER_RESULT_SET);
                messages.push({
                    type: "warning",
                    message: `Result set ${nextOffset + 1}: chỉ hiển thị ${MAX_ROWS_PER_RESULT_SET}/${fullCount} dòng (giới hạn).`,
                });
            }

            const name =
                rss.length > 1
                    ? `Batch ${batchIndex + 1} — Result ${ri + 1} (${rows.length} rows)`
                    : `Result set ${nextOffset + 1} (${rows.length} rows)`;

            resultSets.push({
                name,
                columns,
                rows,
                rowCount: rows.length,
            });
            nextOffset += 1;
        }

        const ra = result.rowsAffected;
        if (Array.isArray(ra)) {
            ra.forEach((n) => {
                if (typeof n === "number" && n >= 0) {
                    messages.push({
                        type: "system",
                        message: `(${n} row${n !== 1 ? "s" : ""} affected)`,
                    });
                }
            });
        }
    } catch (err) {
        hasError = true;
        const lineInFile =
            typeof err.lineNumber === "number" && err.lineNumber > 0
                ? batchStartLine + err.lineNumber
                : batchStartLine + 1;
        messages.push({ type: "error", message: "Line " + lineInFile });
        if (err.message) messages.push({ type: "error", message: err.message });
    }

    return { resultSets, messages, hasError, nextResultSetOffset: nextOffset };
}

/**
 * @param {string} script
 * @param {{server:string,database:string,user:string,password:string}} connInfo
 * @returns {Promise<{ resultSets: object[], messages: {type:string,message:string}[], hasError: boolean }>}
 */
/**
 * @param {string} script
 * @param {{server:string,database:string,user:string,password:string}} connInfo
 * @param {number} [lineOffset] Cộng vào chỉ số dòng batch (0-based) khi script là đoạn chọn — map về document
 */
async function executeSqlVisual(script, connInfo, lineOffset) {
    if (!connInfo) {
        throw new Error("Không có thông tin kết nối DB.");
    }

    const baseLine = typeof lineOffset === "number" && lineOffset > 0 ? lineOffset : 0;

    const { batches, startLines } = splitScriptByGo(script);
    if (batches.length === 0) {
        return { resultSets: [], messages: [], hasError: false };
    }

    const config = {
        user: connInfo.user,
        password: connInfo.password,
        server: connInfo.server,
        database: connInfo.database,
        connectionTimeout: SQL_CONNECTION_TIMEOUT_MS,
        requestTimeout: SQL_REQUEST_TIMEOUT_MS,
        options: {
            encrypt: false,
            enableArithAbort: true,
            trustServerCertificate: true,
        },
    };

    let pool;
    try {
        pool = await sql.connect(config);
    } catch (err) {
        return {
            resultSets: [],
            messages: [{ type: "error", message: "Connection error: " + (err && err.message) }],
            hasError: true,
        };
    }

    const allResultSets = [];
    const allMessages = [];
    let hasError = false;
    let rsOffset = 0;

    try {
        for (let i = 0; i < batches.length; i++) {
            const { resultSets, messages, hasError: batchErr, nextResultSetOffset } = await runOneBatchVisual(
                pool,
                batches[i],
                i,
                startLines[i] + baseLine,
                rsOffset
            );
            allResultSets.push(...resultSets);
            allMessages.push(...messages);
            if (batchErr) hasError = true;
            rsOffset = nextResultSetOffset;
        }
    } finally {
        try {
            await pool.close();
        } catch (e) {
            // ignore
        }
    }

    return { resultSets: allResultSets, messages: allMessages, hasError };
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function runCurrentSqlFileVisual(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("Không có editor nào đang mở.");
        return;
    }

    const doc = editor.document;
    if (!doc || !doc.uri) {
        vscode.window.showErrorMessage("Không đọc được document hoặc uri.");
        return;
    }
    const uri = doc.uri;
    const fsPath = uri.fsPath;
    const lower = typeof fsPath === "string" ? fsPath.toLowerCase() : "";
    if (uri.scheme !== "file" || (!lower.endsWith(".sql") && !lower.endsWith(".xml"))) {
        vscode.window.showErrorMessage("Chức năng này chỉ dùng cho file .sql hoặc .xml.");
        return;
    }

    const selection = editor.selection;
    const isSelection = selection && !selection.isEmpty;
    /** Không trim toàn file: trim xóa dòng trống đầu → lệch số dòng lỗi so với editor (vd select 1/0 sau vài dòng trống). */
    const sqlText = isSelection ? doc.getText(selection) : doc.getText();
    const lineOffsetForBatches = isSelection ? selection.start.line : 0;

    if (!sqlText.trim()) {
        vscode.window.showErrorMessage("Không có câu lệnh SQL để chạy.");
        return;
    }

    const dbStatus = DBStatusBarManager.current;
    if (!dbStatus || !dbStatus.dbInfoSelected || !dbStatus.dbInfoSelected.connection) {
        vscode.window.showErrorMessage("Chưa chọn database hoặc không lấy được thông tin kết nối từ status bar.");
        return;
    }

    sqlDiagnostics.set(doc.uri, []);

    const t0 = Date.now();

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Executing SQL (visual)...",
            cancellable: false,
        },
        async () => {
            try {
                const { resultSets, messages, hasError } = await executeSqlVisual(
                    sqlText,
                    dbStatus.dbInfoSelected.connection,
                    lineOffsetForBatches
                );

                const payload = {
                    resultSets,
                    messages,
                    hasError,
                    executionTime: Date.now() - t0,
                    database: dbStatus.dbInfoSelected.connection.database || "",
                };

                const panel = QueryResultPanel.getShared(context);
                panel.show(payload);

                if (hasError) {
                    const diagnostics = [];
                    const lineRegex = /^Line\s+(\d+)$/i;
                    let lastErrorLine = 0;
                    for (const item of messages) {
                        const msg = String(item && item.message ? item.message : "");
                        const msgType = item && item.type ? String(item.type) : "info";
                        if (msgType !== "error") continue;
                        const lineMatch = msg.match(lineRegex);
                        if (lineMatch) {
                            const n = parseInt(lineMatch[1], 10);
                            if (!isNaN(n) && n > 0) {
                                lastErrorLine = Math.min(n - 1, doc.lineCount - 1);
                                if (lastErrorLine < 0) lastErrorLine = 0;
                            }
                            continue;
                        }
                        const line = lastErrorLine;
                        const range = new vscode.Range(line, 0, line, doc.lineAt(line).text.length);
                        diagnostics.push(new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error));
                    }
                    if (diagnostics.length) {
                        sqlDiagnostics.set(doc.uri, diagnostics);
                    }
                }
            } catch (err) {
                console.error("[FBO runSqlFile visual]", err);
                vscode.window.showErrorMessage("Run SQL (visual): " + (err && err.message));
            }
        }
    );
}

module.exports = {
    runCurrentSqlFileVisual,
    executeSqlVisual,
};
