// Peek SQL: lấy tên object từ selection trong XML, kiểm tra sys.objects, gọi sp_helptext, hiển thị Hover.

const vscode = require("vscode");
const sql = require("mssql");
const DBStatusBarManager = require("./dbBar");

class PeekSql {
    constructor() {
        /** @type {string | null} */
        this._lastPeekUri = null;
        /** @type {vscode.Range | null} */
        this._lastPeekRange = null;
        /** @type {string | null} */
        this._lastPeekContent = null;
        /** @type {boolean} true nếu nội dung là bảng cột (type U), false nếu là SQL definition */
        this._lastPeekIsTable = false;
    }

    /**
     * Trạng thái last peek (uri, range, content).
     * @returns {{ lastPeekUri: string | null, lastPeekRange: vscode.Range | null, lastPeekContent: string | null }}
     */
    getLastPeekState() {
        return {
            lastPeekUri: this._lastPeekUri,
            lastPeekRange: this._lastPeekRange,
            lastPeekContent: this._lastPeekContent
        };
    }

    /**
     * Copy nội dung Peek SQL lần gần nhất vào clipboard (dùng cho command peekSqlCopyContent).
     */
    async copyContentToClipboard() {
        const text = this._lastPeekContent || "";
        if (!text) {
            vscode.window.showInformationMessage("Không có nội dung Peek SQL để copy.");
            return;
        }
        await vscode.env.clipboard.writeText(text);
    }

    /**
     * Lấy type của object (P, FN, IF, TF, V, U) hoặc null nếu không tồn tại.
     * @param {sql.ConnectionPool} pool
     * @param {string} objectName
     * @returns {Promise<string | null>}
     */
    async _getObjectType(pool, objectName) {
        const request = pool.request();
        request.input("name", sql.NVarChar(128), objectName);
        const result = await request.query(
            `SELECT type
             FROM sys.objects
             WHERE type IN ('P','FN','IF','TF','V','U') AND is_ms_shipped = 0 AND name = @name`
        );
        if (!result.recordset || result.recordset.length === 0) return null;
        const t = result.recordset[0].type;
        return t != null ? String(t).trim() : null;
    }

    /**
     * Format kiểu dữ liệu từ sys.columns để hiển thị (vd: char(12), numeric(16,2), bit).
     * @param {{ data_type: string, max_length: number, precision: number, scale: number }} row
     * @returns {string}
     */
    _formatColumnType(row) {
        const dt = (row.data_type || "").toLowerCase();
        const maxLen = row.max_length;
        const prec = row.precision;
        const scale = row.scale;
        if (dt === "char" || dt === "varchar" || dt === "binary" || dt === "varbinary") {
            return maxLen === -1 ? `${dt}(max)` : `${dt}(${maxLen})`;
        }
        if (dt === "nchar" || dt === "nvarchar") {
            return maxLen === -1 ? `${dt}(max)` : `${dt}(${maxLen / 2})`;
        }
        if (dt === "numeric" || dt === "decimal") {
            return `${dt}(${prec || 0},${scale || 0})`;
        }
        return dt;
    }

    /**
     * Lấy danh sách cột của bảng (type = U).
     * @param {sql.ConnectionPool} pool
     * @param {string} objectName
     * @returns {Promise<Array<{ column_name: string, data_type: string, max_length: number, precision: number, scale: number }>>}
     */
    async _getTableColumns(pool, objectName) {
        const request = pool.request();
        request.input("name", sql.NVarChar(128), objectName);
        const result = await request.query(
            `SELECT
                c.name AS column_name,
                TYPE_NAME(c.user_type_id) AS data_type,
                c.max_length,
                c.precision,
                c.scale
             FROM sys.objects AS obj
             JOIN sys.columns AS c ON obj.object_id = c.object_id
             WHERE obj.type IN ('U') AND obj.name = @name
             ORDER BY obj.name, c.column_id`
        );
        return result.recordset || [];
    }

    /**
     * Lấy định nghĩa object bằng sp_helptext (proc/view/function), nối các dòng thành một chuỗi.
     * @param {sql.ConnectionPool} pool
     * @param {string} objectName
     * @returns {Promise<string>}
     */
    async _getObjectDefinition(pool, objectName) {
        const request = pool.request();
        request.input("name", sql.NVarChar(128), objectName);
        const result = await request.query("EXEC sp_helptext @name");
        const recordset = result.recordset;
        if (!recordset || recordset.length === 0) return "";
        const colName = Object.keys(recordset[0])[0];
        return recordset.map((r) => r[colName]).join("");
    }

    /**
     * Command handler: lấy selection, check DB, sp_helptext, set last peek, show hover.
     * Chỉ dùng khi editor là file XML (caller/package.json when đã check).
     */
    async runPeekSql() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("Không có editor nào đang mở.");
            return;
        }

        const doc = editor.document;
        const fn = (doc.fileName || "").toLowerCase();
        if (doc.uri.scheme !== "file" || (!fn.endsWith(".xml") && !fn.endsWith(".sql"))) {
            vscode.window.showInformationMessage("Peek SQL chỉ dùng cho file XML hoặc SQL.");
            return;
        }

        const selection = editor.selection;
        const selectedText = (selection && !selection.isEmpty ? doc.getText(selection) : "").trim();
        if (!selectedText) {
            vscode.window.showInformationMessage("Vui lòng tô chọn tên object (proc/view/function) để Peek SQL.");
            return;
        }

        const dbStatus = DBStatusBarManager.current;
        if (!dbStatus || !dbStatus.dbInfoSelected || !dbStatus.dbInfoSelected.connection) {
            vscode.window.showErrorMessage("Chưa chọn database. Hãy chọn DB trên status bar.");
            return;
        }

        const conn = dbStatus.dbInfoSelected.connection;
        const config = {
            user: conn.user,
            password: conn.password,
            server: conn.server,
            database: conn.database,
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
            vscode.window.showErrorMessage("Lỗi kết nối DB: " + (err && err.message));
            return;
        }

        try {
            const objectType = await this._getObjectType(pool, selectedText);
            if (!objectType) {
                vscode.window.showInformationMessage("Object không tồn tại: " + selectedText);
                return;
            }

            let content = "";
            let isTable = false;

            if ((objectType || "").toUpperCase() === "U") {
                const columns = await this._getTableColumns(pool, selectedText);
                if (!columns.length) {
                    vscode.window.showInformationMessage("Không lấy được cột cho bảng: " + selectedText);
                    return;
                }
                const lines = ["| Column Name | Type |", "|-------------|------|"];
                for (const col of columns) {
                    const typeStr = this._formatColumnType(col);
                    lines.push(`| ${col.column_name} | ${typeStr} |`);
                }
                content = lines.join("\n");
                isTable = true;
            } else {
                content = await this._getObjectDefinition(pool, selectedText);
                if (!content) {
                    vscode.window.showInformationMessage("Không lấy được định nghĩa cho: " + selectedText);
                    return;
                }
            }

            this._lastPeekUri = doc.uri.toString();
            this._lastPeekRange = new vscode.Range(selection.start, selection.end);
            this._lastPeekContent = content;
            this._lastPeekIsTable = isTable;

            await vscode.commands.executeCommand("editor.action.showHover");
        } catch (err) {
            vscode.window.showErrorMessage("Peek SQL lỗi: " + (err && err.message));
        } finally {
            try {
                await pool.close();
            } catch (e) {
                // ignore
            }
        }
    }

    /**
     * HoverProvider cho XML: khi có last peek cho đúng uri + range thì trả về Hover với nội dung định nghĩa.
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @returns {vscode.Hover | null}
     */
    provideHover(document, position) {
        if (!this._lastPeekContent || !this._lastPeekUri || !this._lastPeekRange) return null;
        if (document.uri.toString() !== this._lastPeekUri) return null;
        if (!this._lastPeekRange.contains(position)) return null;

        const md = new vscode.MarkdownString();
        md.appendMarkdown("### Peek SQL\n\n");
        md.appendMarkdown("[Copy to clipboard](command:fbo-autocomplete.peekSqlCopyContent)\n\n");
        if (this._lastPeekIsTable) {
            md.appendMarkdown(this._lastPeekContent);
        } else {
            md.appendCodeblock(this._lastPeekContent, "sql");
        }
        md.isTrusted = true;
        return new vscode.Hover(md, this._lastPeekRange);
    }
}

module.exports = PeekSql;
