// @ts-nocheck
// Field Tracer — trace 1 field xuyên các tầng:
//   defs (khai báo <field name>) → views/items → command/SQL trong XML → file .sql
//   → DB objects (sys.sql_modules) → file trùng tên.
// Trả model { field, sections: [{key,title,items:[{file,line0,col0,preview,tag}]}] }.
// options.sections: Set<key> — chỉ chạy mục được chọn (undefined = tất cả).

const fs = require("fs");
const path = require("path");
const { findMatches, escapeRe } = require("../References/ReferenceSearch");

const SECTION_DEFS = [
    { key: "defs", title: "Khai báo field (Dir/Filter/Grid)" },
    { key: "views", title: "View / Item layout" },
    { key: "sqlCmd", title: "Command / Query trong XML" },
    { key: "script", title: "Client script (f./g./[\"field\"])" },
    { key: "otherXml", title: "Tham chiếu khác trong XML" },
    { key: "sqlFiles", title: "File .sql trong project" },
    { key: "db", title: "DB objects (proc/view/function chứa field)" },
    { key: "files", title: "File trùng tên" },
];

/** Phân loại 1 dòng match theo pattern FBO. */
function classifyLine(lineText, field) {
    const lt = lineText || "";
    const f = escapeRe(field);
    if (new RegExp(`<field\\b[^>]*name\\s*=\\s*["']${f}["']`, "i").test(lt)) return "def";
    if (new RegExp(`<item\\b[^>]*name\\s*=\\s*["']${f}["']`, "i").test(lt)) return "view";
    if (new RegExp(`\\[${f}\\]`).test(lt)) return "view";
    if (/\b(exec|execute|insert|update|delete|select|join|where)\b/i.test(lt)) return "sql";
    if (new RegExp(`\\b[fg]\\.${f}\\b|\\[\\s*["']${f}["']\\s*\\]`).test(lt)) return "script";
    if (/&[\w.]+;/.test(lt) && new RegExp(`&${f};`).test(lt)) return "entity";
    return "other";
}

/**
 * DB objects (proc/view/function/trigger) chứa field — qua DB status bar connection.
 * @param {string} field
 * @returns {Promise<Array>} items hoặc [] nếu chưa chọn DB
 */
async function traceInDatabase(field) {
    let connInfo = null;
    try {
        const DBStatusBarManager = require("../DBQuery/dbBar");
        connInfo = DBStatusBarManager.current &&
            DBStatusBarManager.current.dbInfoSelected &&
            DBStatusBarManager.current.dbInfoSelected.connection;
    } catch {
        return [];
    }
    if (!connInfo) return [];

    try {
        const sql = require("mssql");
        const pool = await sql.connect({
            user: connInfo.user,
            password: connInfo.password,
            server: connInfo.server,
            database: connInfo.database,
            connectionTimeout: 10000,
            requestTimeout: 30000,
            options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
        });
        try {
            const safe = String(field).replace(/'/g, "''");
            const rs = await pool.request().query(
                `SELECT o.name, o.type_desc, s.name AS schema_name
                 FROM sys.sql_modules m
                 JOIN sys.objects o ON o.object_id = m.object_id
                 JOIN sys.schemas s ON s.schema_id = o.schema_id
                 WHERE CHARINDEX('${safe}', m.definition) > 0
                 ORDER BY o.type_desc, o.name`
            );
            return (rs.recordset || []).map(r => ({
                file: `${r.schema_name}.${r.name}`,
                line0: 0,
                col0: 0,
                preview: r.type_desc,
                tag: "db",
                isDbObject: true,
            }));
        } finally {
            try { await pool.close(); } catch { /* ignore */ }
        }
    } catch (err) {
        return [{ file: "", line0: 0, col0: 0, preview: `DB query lỗi: ${err && err.message}`, tag: "db-error" }];
    }
}

/**
 * @param {string} field
 * @param {{
 *   roots: {name:string, root:string}[],
 *   symbolIndex?: any,
 *   getIndexService?: () => any,
 *   token?: any,
 *   sections?: Set<string>,   // chỉ trace các mục này; undefined = tất cả
 * }} deps
 */
async function traceField(field, deps) {
    const roots = (deps.roots || []);
    const rootPaths = roots.map(g => g.root);
    const cancelled = () => !!(deps.token && deps.token.isCancellationRequested);
    const want = deps.sections instanceof Set
        ? deps.sections
        : new Set(SECTION_DEFS.map(s => s.key));
    const model = { field, sections: [], roots: roots.map(g => ({ name: g.name, root: g.root })) };
    const pushSection = (key, items) => {
        if (!want.has(key)) return;
        const def = SECTION_DEFS.find(s => s.key === key);
        model.sections.push({ key, title: def.title, items });
    };

    // 1. Definitions từ symbol index
    if (want.has("defs") && !cancelled()) {
        const defs = [];
        if (deps.symbolIndex) {
            for (const g of roots) {
                if (cancelled()) break;
                try {
                    const idx = await deps.symbolIndex.ensure(g.root);
                    for (const s of idx.symbols) {
                        if ((s.kind === "field" || s.kind === "item") && s.name.toLowerCase() === field.toLowerCase()) {
                            defs.push({
                                file: s.file, line0: s.line, col0: s.col,
                                preview: `${g.name} • ${s.kind}`, tag: "def",
                            });
                        }
                    }
                } catch { /* bỏ qua root lỗi */ }
            }
        }
        // Symbol index chỉ có vị trí — đọc line thật để preview code (defs ít, rẻ)
        if (defs.length) {
            const byFile = new Map();
            for (const d of defs) {
                if (!byFile.has(d.file)) byFile.set(d.file, []);
                byFile.get(d.file).push(d);
            }
            await Promise.all([...byFile].map(async ([f, items]) => {
                try {
                    const txt = await fs.promises.readFile(f, "utf8");
                    const lines = txt.split(/\r?\n/);
                    for (const it of items) {
                        const lineText = (lines[it.line0] || "").trim();
                        if (lineText) it.preview = lineText;
                    }
                } catch { /* giữ preview cũ */ }
            }));
        }
        pushSection("defs", defs);
    }

    if (cancelled()) return null;

    // 2. Usage trong XML/.ent — 1 lần rg nuôi 4 section
    const xmlKeys = ["views", "sqlCmd", "script", "otherXml"];
    if (xmlKeys.some(k => want.has(k))) {
        const xmlMatches = await findMatches(rootPaths, field, {
            globs: ["*.xml", "*.ent"],
            wordMatch: true,
            caseSensitive: false,
            token: deps.token,
        });
        if (cancelled()) return null;
        const buckets = { view: [], sql: [], script: [], other: [] };
        for (const m of xmlMatches) {
            const tag = classifyLine(m.lineText, field);
            const item = { file: m.file, line0: m.line0, col0: m.col0, preview: m.lineText.trim(), tag };
            if (tag === "def") continue; // đã có ở section defs (đầy đủ hơn)
            (buckets[tag] || buckets.other).push(item);
        }
        pushSection("views", buckets.view);
        pushSection("sqlCmd", buckets.sql);
        pushSection("script", buckets.script);
        pushSection("otherXml", buckets.other);
    }

    // 3. File .sql (script/proc source)
    if (want.has("sqlFiles") && !cancelled()) {
        const sqlMatches = await findMatches(rootPaths, field, {
            globs: ["*.sql"],
            wordMatch: true,
            caseSensitive: false,
            token: deps.token,
        });
        if (cancelled()) return null;
        pushSection("sqlFiles", sqlMatches.map(m => ({
            file: m.file, line0: m.line0, col0: m.col0, preview: m.lineText.trim(), tag: "sql",
        })));
    }

    // 4. DB objects (nếu đã chọn DB trên status bar)
    if (want.has("db") && !cancelled()) {
        const dbItems = await traceInDatabase(field);
        if (cancelled()) return null;
        if (dbItems.length) pushSection("db", dbItems);
    }

    // 5. File trùng tên (lookup/report/controller mang tên field)
    if (want.has("files") && !cancelled()) {
        const fileItems = [];
        const svc = deps.getIndexService && deps.getIndexService();
        if (svc && typeof svc.ensureIndex === "function") {
            const fieldLower = field.toLowerCase();
            for (const g of roots) {
                if (cancelled()) break;
                try {
                    const idx = await svc.ensureIndex(g.root, false);
                    for (const rel of idx.filesRel || []) {
                        const base = path.basename(rel).toLowerCase();
                        if (base === fieldLower || base.startsWith(fieldLower + ".")) {
                            fileItems.push({
                                file: path.join(g.root, rel), line0: 0, col0: 0,
                                preview: `${g.name} • ${rel}`, tag: "file",
                            });
                        }
                    }
                } catch { /* ignore */ }
            }
        }
        pushSection("files", fileItems);
    }

    return cancelled() ? null : model;
}

module.exports = { traceField, SECTION_DEFS };
