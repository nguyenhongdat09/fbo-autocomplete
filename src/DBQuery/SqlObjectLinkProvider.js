// Ctrl+Hover / Ctrl+Click trên tên object SQL (proc / view / function / trigger).
// - DocumentLinkProvider: CHỈ tạo link candidate sau exec/call hoặc
//   alter/create/drop + proc/function/view/trigger — chỗ gần như chắc chắn là
//   object code (không link sau from/join/into/update vì đó là bảng) →
//   không gạch chân lan khắp file.
//   resolveDocumentLink (Ctrl+Hover lên link) mới query sys.objects:
//   đúng loại → target = command URI + tooltip → Ctrl+Click tạo file .sql temp.
// - HoverProvider: hover → check DB (cache + dedupe pending) → nếu đúng loại thì
//   hiện tooltip kèm link "Tạo file .sql temp" click được ngay trong tooltip
//   (cover cả token không nằm trong ngữ cảnh link, vd: select fn_abc(x)).

const vscode = require("vscode");
const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const DBStatusBarManager = require("./dbBar");
const PeekSql = require("./PeekSql");
const { createSqlTempFile, resolveSqlTempFolder, isAntigravityIde } = require("../Utils/sqlTempFile");

// Loại object được phép tạo link → .sql temp. Bảng (U) loại trừ — xem cột qua Peek SQL selection.
/** @type {Object.<string, string>} */
const LINKABLE_TYPES = { P: "procedure", FN: "function", IF: "function", TF: "function", V: "view", TR: "trigger" };

// Token dưới con trỏ (dùng cho hover): [bracketed], schema.name hoặc tên thường
const WORD_RE = /\[[^\]\r\n]+\](?:\.\[[^\]\r\n]+\]|\.\b[A-Za-z_][\w#$]*)*|\b[A-Za-z_][\w#$]*(?:\.\b[A-Za-z_][\w#$]*|\.\[[^\]\r\n]+\])*/;

// Link candidates (dùng cho document links) — CHỈ ngữ cảnh gần như chắc chắn là
// proc/function/view/trigger. KHÔNG link sau from/join/into/update vì đó là bảng,
// cũng không link dbo.xxx trần vì không biết loại trước khi resolve.
// 1) exec/call + (schema.)?object — schema: dbo. / sys. / [dbo]. / [sys].
const KW_REF_RE = /\b(?:exec(?:ute)?|call)\s+((?:(?:dbo|sys|\[(?:dbo|sys)\])\s*\.\s*)?(?:\[[^\]\r\n]+\]|[A-Za-z_][\w#$]*))/gi;
// 2) alter/create/drop + loại object + (schema.)?object
const KW_DDL_RE = /\b(?:alter|create|drop)\s+(?:proc(?:edure)?|function|view|trigger)\s+((?:(?:dbo|sys|\[(?:dbo|sys)\])\s*\.\s*)?(?:\[[^\]\r\n]+\]|[A-Za-z_][\w#$]*))/gi;

const MAX_LINKS_PER_DOC = 20000;
const MIN_NAME_LENGTH = 3;

// globalState key: map "đường dẫn file .sql temp (lowercase)" -> thông tin nguồn (project/DB)
const SOURCE_MAP_KEY = "fbo.sqlTempSourceMap";

// Manifest do fastbusiness-mcp (clone_things) ghi cạnh file .sql temp —
// process ngoài không ghi được globalState nên dùng file JSON làm kênh chung.
// { "<filePath.lower()>": {object_name, group_label, db_type, server, database, created_at} }
const MANIFEST_NAME = ".fbo_sql_temp_source.json";
// Cache theo mtime — tránh đọc đĩa mỗi lần đổi tab
const _manifestCache = new Map(); // manifestPath -> { mtimeMs, data }

/**
 * Fallback đọc nguồn từ manifest cạnh file .sql (fastbusiness-mcp ghi).
 * @param {string} filePath
 * @returns {{object_name: string, group_label: string, db_type: string, server: string, database: string, created_at: string} | null}
 */
function readManifestSource(filePath) {
    try {
        const manifest_path = path.join(path.dirname(String(filePath)), MANIFEST_NAME);
        if (!fs.existsSync(manifest_path)) return null;
        const mtime_ms = fs.statSync(manifest_path).mtimeMs;
        const key = String(filePath).toLowerCase();
        const cached = _manifestCache.get(manifest_path);
        if (cached && cached.mtimeMs === mtime_ms) {
            return cached.data[key] || null;
        }
        const data = JSON.parse(fs.readFileSync(manifest_path, "utf8")) || {};
        _manifestCache.set(manifest_path, { mtimeMs: mtime_ms, data });
        if (_manifestCache.size > 50) _manifestCache.clear();
        return data[key] || null;
    } catch (err) {
        return null;
    }
}

// Token SQL keyword / XML structural hay gặp — bỏ qua để giảm query
const SKIP_WORDS = new Set([
    "select", "from", "where", "and", "or", "not", "null", "join", "left", "right", "inner", "outer",
    "full", "cross", "on", "as", "is", "in", "set", "insert", "update", "delete", "into", "values",
    "order", "by", "group", "having", "union", "all", "distinct", "top", "case", "when", "then",
    "else", "end", "begin", "declare", "exec", "execute", "if", "while", "return", "returns",
    "varchar", "nvarchar", "char", "nchar", "int", "bigint", "smallint", "tinyint", "numeric",
    "decimal", "float", "real", "bit", "datetime", "smalldatetime", "date", "time", "text", "ntext",
    "like", "between", "exists", "count", "sum", "avg", "min", "max", "coalesce", "isnull", "nullif",
    "cast", "convert", "nolock", "with", "create", "alter", "drop", "table", "proc", "procedure",
    "function", "trigger", "view", "go", "print", "use", "transaction", "commit", "rollback",
    "try", "catch", "throw", "raiserror", "cursor", "fetch", "open", "close", "deallocate",
    "instead", "after", "asc", "desc", "identity", "primary", "key", "foreign", "references",
    "constraint", "default", "check", "unique", "index", "clustered", "nonclustered", "output",
    "inserted", "deleted", "merge", "using", "matched", "over", "partition", "row_number",
    "apply", "pivot", "unpivot", "offset", "next", "rows", "only", "escape", "collate",
    "sp_executesql", "newid", "getdate", "dateadd", "datediff", "upper", "lower", "ltrim", "rtrim",
    "len", "substring", "replace", "stuff", "charindex", "abs", "round", "ceiling", "floor",
    // token XML / FBO controller
    "xml", "version", "encoding", "field", "fields", "item", "items", "command", "commands",
    "name", "value", "type", "title", "width", "height", "tab", "tabs", "caption", "colspan",
    "rowspan", "source", "target", "event", "events", "handler", "module", "namespace", "class",
    "property", "attribute", "element", "schema", "config", "configs", "setting", "settings",
    "option", "options", "param", "params", "parameter", "parameters", "dir", "grid", "filter",
    "report", "query", "lookup", "template", "templates", "form", "forms", "control", "controls",
    "label", "data", "column", "columns", "row", "rows", "cell", "cells", "header", "footer",
    "style", "id", "href", "src", "true", "false", "yes", "no", "description"
]);

class SqlObjectLinkProvider {
    /**
     * @param {vscode.ExtensionContext} [context]
     */
    constructor(context) {
        this._context = context;
        this._peek = new PeekSql();
        /** @type {sql.ConnectionPool | null} */
        this._pool = null;
        /** @type {Promise<sql.ConnectionPool> | null} */
        this._poolPromise = null;
        this._poolKey = "";
        /** @type {Map<string, string | null>} cache "server/db|name" -> object type hoặc null */
        this._typeCache = new Map();
        /** @type {Map<string, Promise<string | null>>} query đang chạy (dedupe hover + link resolve) */
        this._pending = new Map();
    }

    /**
     * Pool dùng chung (giữ mở trong session) — tránh connect/close mỗi lần hover.
     * @returns {Promise<sql.ConnectionPool | null>}
     */
    async _getPool() {
        /** @type {any} */
        const dbStatus = DBStatusBarManager.current;
        const conn = dbStatus && dbStatus.dbInfoSelected && dbStatus.dbInfoSelected.connection;
        if (!conn) return null;

        const key = `${conn.user}@${conn.server}/${conn.database}`;
        if (this._poolKey === key) {
            if (this._pool && this._pool.connected) return this._pool;
            if (this._poolPromise) return this._poolPromise;
        }

        // Đổi DB → đóng pool cũ, clear cache
        if (this._pool) {
            const oldPool = this._pool;
            this._pool = null;
            this._typeCache.clear();
            oldPool.close().catch(() => { });
        }
        this._poolKey = key;

        this._poolPromise = sql.connect({
            user: conn.user,
            password: conn.password,
            server: conn.server,
            database: conn.database,
            connectionTimeout: 5000,
            options: {
                encrypt: false,
                enableArithAbort: true,
                trustServerCertificate: true
            }
        }).then((pool) => {
            this._pool = pool;
            this._poolPromise = null;
            return pool;
        }).catch((err) => {
            this._poolPromise = null;
            throw err;
        });
        return this._poolPromise;
    }

    /**
     * Lấy type object (cache + dedupe pending). Trả null nếu: chưa chọn DB, lỗi query, object không tồn tại.
     * @param {string} objectName
     * @returns {Promise<string | null>}
     */
    async _resolveType(objectName) {
        let pool;
        try {
            pool = await this._getPool();
        } catch (err) {
            const errObj = /** @type {any} */ (err);
            console.error("[FBO sqlObjectLink] connect error:", errObj && errObj.message);
            return null;
        }
        if (!pool) return null;

        const cache_key = `${this._poolKey}|${objectName.toLowerCase()}`;
        if (this._typeCache.has(cache_key)) return this._typeCache.get(cache_key) ?? null;
        if (this._pending.has(cache_key)) return this._pending.get(cache_key) ?? Promise.resolve(null);

        const task = (async () => {
            try {
                const type = await this._peek._getObjectType(pool, objectName);
                this._typeCache.set(cache_key, type);
                return type;
            } catch (err) {
                const errObj = /** @type {any} */ (err);
                console.error("[FBO sqlObjectLink] query error:", errObj && errObj.message);
                // Pool hỏng → reset để lần sau reconnect
                if (this._pool) {
                    const oldPool = this._pool;
                    this._pool = null;
                    oldPool.close().catch(() => { });
                }
                return null;
            }
        })();
        this._pending.set(cache_key, task);
        try {
            return await task;
        } finally {
            this._pending.delete(cache_key);
        }
    }

    /**
     * Trích object name từ token: bỏ ngoặc vuông, lấy phần sau dấu chấm cuối.
     * @param {string} raw
     * @returns {string | null}
     */
    _extractObjectName(raw) {
        if (!raw) return null;
        const clean = raw.replace(/[\[\]]/g, "");
        const dot = clean.lastIndexOf(".");
        return dot >= 0 ? clean.slice(dot + 1) : clean;
    }

    /**
     * Tạo DocumentLink candidate tại range token (chưa resolve).
     * @param {vscode.TextDocument} document
     * @param {vscode.DocumentLink[]} links
     * @param {Set<string>} seen
     * @param {number} startOffset
     * @param {number} endOffset
     * @param {string} raw
     */
    _pushLink(document, links, seen, startOffset, endOffset, raw) {
        if (links.length >= MAX_LINKS_PER_DOC) return;
        const object_name = this._extractObjectName(raw);
        if (!object_name || object_name.length < MIN_NAME_LENGTH) return;
        if (SKIP_WORDS.has(object_name.toLowerCase())) return;
        const key = `${startOffset}:${endOffset}`;
        if (seen.has(key)) return;
        seen.add(key);
        const link = new vscode.DocumentLink(new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset)));
        /** @type {any} */ (link)._fboObjectName = object_name;
        links.push(link);
    }

    /**
     * Chỉ tạo link candidate cho token trong ngữ cảnh SQL — không scan bừa toàn bộ identifier.
     * @param {vscode.TextDocument} document
     * @returns {vscode.DocumentLink[]}
     */
    provideDocumentLinks(document) {
        /** @type {vscode.DocumentLink[]} */
        const links = [];
        const seen = new Set();
        const text = document.getText();

        let m;
        KW_REF_RE.lastIndex = 0;
        while ((m = KW_REF_RE.exec(text)) !== null) {
            const tok = m[1];
            const tok_start = m.index + m[0].length - tok.length;
            this._pushLink(document, links, seen, tok_start, tok_start + tok.length, tok);
        }

        KW_DDL_RE.lastIndex = 0;
        while ((m = KW_DDL_RE.exec(text)) !== null) {
            const tok = m[1];
            const tok_start = m.index + m[0].length - tok.length;
            this._pushLink(document, links, seen, tok_start, tok_start + tok.length, tok);
        }

        return links;
    }

    /**
     * Resolve khi user Ctrl+Hover lên link: check DB, đúng loại → gán target + tooltip.
     * @param {vscode.DocumentLink} link
     * @param {vscode.CancellationToken} token
     * @returns {Promise<vscode.DocumentLink>}
     */
    async resolveDocumentLink(link, token) {
        try {
            const object_name = /** @type {any} */ (link)._fboObjectName;
            if (!object_name) return link;

            const type = await this._resolveType(object_name);
            if (token && token.isCancellationRequested) return link;
            if (!type) return link;

            const type_label = LINKABLE_TYPES[String(type).toUpperCase()];
            if (!type_label) return link; // bảng (U) hoặc loại khác → không link

            link.target = vscode.Uri.parse(
                `command:fbo-autocomplete.openSqlObjectTemp?${encodeURIComponent(JSON.stringify([object_name]))}`
            );
            link.tooltip = `Ctrl+Click: tạo file .sql temp cho ${type_label} '${object_name}'`;
        } catch (err) {
            const errObj = /** @type {any} */ (err);
            console.error("[FBO sqlObjectLink] resolve error:", errObj && errObj.message);
        }
        return link;
    }

    /**
     * Lấy object candidate dưới con trỏ (cho hover). Trả null nếu không phải tên hợp lệ.
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @returns {{ name: string, range: vscode.Range } | null}
     */
    _wordAt(document, position) {
        const range = document.getWordRangeAtPosition(position, WORD_RE);
        if (!range) return null;
        const raw = document.getText(range);
        // Dạng word.word: chỉ nhận khi là schema.object (dbo./sys.) hoặc [bracketed] — bỏ qua alias.cột
        if (raw.indexOf(".") >= 0 && raw[0] !== "[" && !/^(?:dbo|sys)\./i.test(raw)) return null;
        const object_name = this._extractObjectName(raw);
        if (!object_name || object_name.length < MIN_NAME_LENGTH) return null;
        if (SKIP_WORDS.has(object_name.toLowerCase())) return null;
        return { name: object_name, range };
    }

    /**
     * HoverProvider — hover là check (cache + dedupe, mỗi từ tối đa 1 query).
     * Đúng loại → tooltip báo click sẽ tạo .sql temp + link click được ngay.
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @param {vscode.CancellationToken} token
     * @returns {Promise<vscode.Hover | null>}
     */
    async provideHover(document, position, token) {
        try {
            const info = this._wordAt(document, position);
            if (!info) return null;

            const type = await this._resolveType(info.name);
            if (token && token.isCancellationRequested) return null;
            if (!type) return null;

            const type_label = LINKABLE_TYPES[String(type).toUpperCase()];
            if (!type_label) return null;

            const args = encodeURIComponent(JSON.stringify([info.name]));
            const md = new vscode.MarkdownString();
            md.supportThemeIcons = true;
            md.isTrusted = true;
            md.appendMarkdown(`$(database) **${type_label}** \`${info.name}\`\n\n`);
            md.appendMarkdown(`[$(new-file) Tạo file .sql temp](command:fbo-autocomplete.openSqlObjectTemp?${args} "Tạo file .sql temp chứa definition (ALTER) của object này")\n\n`);
            md.appendMarkdown(`*Hoặc Ctrl+Click vào tên object.*`);
            return new vscode.Hover(md, info.range);
        } catch (err) {
            const errObj = /** @type {any} */ (err);
            console.error("[FBO sqlObjectLink] provideHover error:", errObj && errObj.message);
            return null;
        }
    }

    /**
     * Command handler: click → tạo file .sql temp chứa definition (ALTER) của object.
     * @param {string | {objectName?: string}} arg
     */
    async openObjectToSqlTemp(arg) {
        const object_name = typeof arg === "string" ? arg : (arg && arg.objectName);
        if (!object_name) return;

        const config = vscode.workspace.getConfiguration("fbo-autocomplete");
        const folder_path = config.get("sqlTempFolder");
        if (!folder_path) {
            vscode.window.showErrorMessage(`Chưa cấu hình đường dẫn thư mục tạo file .sql. Vui lòng cấu hình 'fbo-autocomplete.sqlTempFolder' trong Settings.`);
            return;
        }

        const type = await this._resolveType(object_name);
        if (!type) {
            vscode.window.showInformationMessage("Object không tồn tại (hoặc chưa chọn DB): " + object_name);
            return;
        }
        if (!LINKABLE_TYPES[String(type).toUpperCase()]) {
            vscode.window.showInformationMessage(`'${object_name}' không phải proc/view/function/trigger.`);
            return;
        }

        const pool = await this._getPool();
        if (!pool) {
            vscode.window.showErrorMessage("Chưa chọn database. Hãy chọn DB trên status bar.");
            return;
        }

        let content = await this._peek._getObjectDefinition(pool, object_name);
        if (!content) {
            vscode.window.showInformationMessage("Không lấy được định nghĩa cho: " + object_name);
            return;
        }
        content = this._peek._transformDefinitionForAlter(type, content);

        const is_antigravity = isAntigravityIde();
        const target_folder = resolveSqlTempFolder(folder_path, is_antigravity);
        if (!is_antigravity && !fs.existsSync(target_folder)) {
            vscode.window.showErrorMessage(`Thư mục '${target_folder}' không tồn tại. Vui lòng kiểm tra lại cấu hình.`);
            return;
        }

        const { filePath, fileName } = createSqlTempFile(target_folder, object_name, content);
        await this._rememberSource(filePath, object_name);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Đã tạo file ${fileName}`);
    }

    /**
     * Ghi nhớ (ẩn) nguồn gốc của file .sql temp: project label + db type + server/database
     * theo DB đang chọn trên status bar lúc tạo file.
     * @param {string} filePath
     * @param {string} objectName
     */
    async _rememberSource(filePath, objectName) {
        /** @type {any} */
        const dbStatus = DBStatusBarManager.current;
        const info = dbStatus && dbStatus.dbInfoSelected;
        if (!info || !info.groupLabel) return;

        await SqlObjectLinkProvider.recordSource(this._context, filePath, {
            object_name: objectName,
            group_label: info.groupLabel,
            db_type: info.dbType || "",
            server: (info.connection && info.connection.server) || "",
            database: (info.connection && info.connection.database) || ""
        });
    }

    /**
     * Ghi nguồn cho file .sql temp: globalState (nội bộ extension) + manifest
     * .fbo_sql_temp_source.json cạnh file (kênh chung với fastbusiness-mcp —
     * file tạo bởi ai cũng đọc được, user mở trực tiếp check được).
     * @param {vscode.ExtensionContext | null | undefined} context
     * @param {string} filePath
     * @param {{object_name?: string, group_label: string, db_type?: string, server?: string, database?: string}} source
     */
    static async recordSource(context, filePath, source) {
        if (!filePath || !source || !source.group_label) return;
        const key = String(filePath).toLowerCase();
        const entry = {
            object_name: source.object_name || "",
            group_label: source.group_label,
            db_type: source.db_type || "app",
            server: source.server || "",
            database: source.database || "",
            created_at: new Date().toISOString()
        };

        if (context && context.globalState) {
            const map = Object.assign({}, context.globalState.get(SOURCE_MAP_KEY));
            map[key] = entry;
            // Prune: giữ tối đa 500 entry mới nhất (theo thứ tự ghi)
            const keys = Object.keys(map);
            while (keys.length > 500) {
                delete map[keys.shift()];
            }
            await context.globalState.update(SOURCE_MAP_KEY, map);
        }

        try {
            const manifest_path = path.join(path.dirname(String(filePath)), MANIFEST_NAME);
            let data = {};
            if (fs.existsSync(manifest_path)) {
                data = JSON.parse(fs.readFileSync(manifest_path, "utf8")) || {};
            }
            data[key] = entry;
            fs.writeFileSync(manifest_path, JSON.stringify(data, null, 1), "utf8");
            _manifestCache.delete(manifest_path);
        } catch (e) { /* không chặn flow chính */ }
    }

    /**
     * Tra nguồn gốc của 1 file .sql temp (null nếu không có).
     * @param {vscode.ExtensionContext} context
     * @param {string} filePath
     * @returns {{object_name: string, group_label: string, db_type: string, server: string, database: string, created_at: string} | null}
     */
    static getSourceInfo(context, filePath) {
        if (!filePath) return null;
        const key = String(filePath).toLowerCase();
        if (context && context.globalState) {
            const map = context.globalState.get(SOURCE_MAP_KEY) || {};
            if (map[key]) return map[key];
        }
        // Fallback: manifest do fastbusiness-mcp ghi cạnh file .sql temp
        return readManifestSource(filePath);
    }

    /**
     * Đổi tab sang file .sql temp có ghi nhớ nguồn → tự đổi DB trên status bar
     * về đúng project đó ("{group_label} (App|Sys)") — tôn trọng pin DB,
     * giống cơ chế XML auto-switch của tree.
     * @param {vscode.TextEditor | undefined} editor
     */
    handleActiveEditorChange(editor) {
        try {
            const doc = editor && editor.document;
            if (!doc || doc.uri.scheme !== "file") return;
            if (!(doc.fileName || "").toLowerCase().endsWith(".sql")) return;

            /** @type {any} */
            const dbStatus = DBStatusBarManager.current;
            if (!dbStatus) {
                console.log(`[FBO sqlTemp] ${doc.fileName}: DBStatusBar chưa init → bỏ qua`);
                return;
            }

            const info = SqlObjectLinkProvider.getSourceInfo(this._context, doc.uri.fsPath);
            if (!info || !info.group_label) {
                console.log(`[FBO sqlTemp] ${doc.fileName}: không có nguồn ghi nhớ → giữ DB hiện tại`);
                return;
            }

            const label = `${info.group_label} (${info.db_type === "sys" ? "Sys" : "App"})`;
            if (dbStatus.selectedDB === label) {
                console.log(`[FBO sqlTemp] ${doc.fileName}: DB hiện tại đã là '${label}' → không cần đổi`);
                return;
            }
            // Label không có trong dbOptions (project chưa load) → bỏ qua để không phá DB hiện tại
            if (Array.isArray(dbStatus.dbOptions) && dbStatus.dbOptions.length > 0 && !dbStatus.dbOptions.includes(label)) {
                console.log(`[FBO sqlTemp] ${doc.fileName}: '${label}' không có trong dbOptions → bỏ qua`);
                return;
            }

            if (typeof dbStatus.tryAutoUpdateText === "function") {
                const switched = dbStatus.tryAutoUpdateText(label);
                if (!switched) console.log(`[FBO sqlTemp] ${doc.fileName}: DB đang pin → không switch sang '${label}'`);
            } else if (typeof dbStatus.updateText === "function") {
                dbStatus.updateText(label);
            }
        } catch (err) {
            const errObj = /** @type {any} */ (err);
            console.error("[FBO sqlObjectLink] handleActiveEditorChange error:", errObj && errObj.message);
        }
    }

    dispose() {
        if (this._pool) {
            const pool = this._pool;
            this._pool = null;
            pool.close().catch(() => { });
        }
    }
}

module.exports = SqlObjectLinkProvider;
