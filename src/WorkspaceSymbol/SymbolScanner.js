// @ts-check
// Scan nội dung 1 file → danh sách symbol cho Ctrl+T.
// Kinds: field | item | entity | action | button | controller | call | object | file

const path = require("path");

// .f là file mã hóa tự sinh từ .xml — không scan/index/rename trên nó
const XML_SYMBOL_EXTS = new Set([".xml", ".ent", ".txt"]);
const SQL_EXTS = new Set([".sql"]);
const ALL_SCAN_EXTS = new Set([...XML_SYMBOL_EXTS, ...SQL_EXTS]);

const MAX_FILE_BYTES = 2 * 1024 * 1024; // bỏ qua file > 2MB
// Bump khi đổi format/logic scan → record cũ trong LevelDB tự rescan
const SCANNER_VERSION = 2;

/**
 * @typedef {{ name:string, kind:string, detail:string, file:string, line:number, col:number }} FboSymbol
 */

/** Bảng offset → line (0-based), build 1 lần/file */
function buildLineIndex(content) {
    const starts = [0];
    for (let i = 0; i < content.length; i++) {
        if (content.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return starts;
}

function lineOf(starts, offset) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo;
}

function pushMatch(out, starts, file, kind, name, offset, detail) {
    if (!name) return;
    const line = lineOf(starts, offset);
    out.push({
        name,
        kind,
        detail: detail || "",
        file,
        line,
        col: Math.max(0, offset - starts[line]),
    });
}

/**
 * Quét regex có capture group 1 = tên symbol.
 * offset của group 1 = match.index + match[0].indexOf(match[1])
 */
function scanRegex(out, starts, file, content, regex, kind, detail) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(content)) !== null) {
        const grpIdx = m[0].indexOf(m[1]);
        pushMatch(out, starts, file, kind, m[1], m.index + (grpIdx >= 0 ? grpIdx : 0), detail);
        if (m[0].length === 0) regex.lastIndex++;
    }
}

/**
 * @param {string} filePath
 * @param {string} content
 * @returns {FboSymbol[]}
 */
function scanFile(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    const out = [];
    const starts = buildLineIndex(content);

    if (ext === ".sql") {
        let m;
        // Định nghĩa object: create/alter proc|function|view|trigger <name>
        const reObj = /\b(?:create|alter)\s+(proc|procedure|function|view|trigger)\s+([\[\]\w.$#]+)/gi;
        while ((m = reObj.exec(content)) !== null) {
            const name = m[2];
            const grpIdx = m[0].indexOf(name);
            pushMatch(out, starts, filePath, m[1].toLowerCase().replace("procedure", "proc"),
                name, m.index + (grpIdx >= 0 ? grpIdx : 0), path.basename(filePath));
        }
        // Lời gọi: exec <name>
        const reExec = /\bexec(?:ute)?\s+(?:@\w+\s*=\s*)?([\[\]\w.$#]+)/gi;
        while ((m = reExec.exec(content)) !== null) {
            if (/^[@]/.test(m[1])) continue;
            const grpIdx = m[0].indexOf(m[1]);
            pushMatch(out, starts, filePath, "call", m[1], m.index + (grpIdx >= 0 ? grpIdx : 0), "exec");
        }
        return out;
    }

    if (!XML_SYMBOL_EXTS.has(ext)) return out;

    // Entity khai báo trong DOCTYPE
    scanRegex(out, starts, filePath, content, /<!ENTITY\s+([^\s>]+)/gi, "entity", "DOCTYPE");

    // <field name="x">
    scanRegex(out, starts, filePath, content,
        /<field\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi, "field", "");
    // <item name="x">
    scanRegex(out, starts, filePath, content,
        /<item\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi, "item", "");
    // <action id="x"> / <button id="x">
    scanRegex(out, starts, filePath, content,
        /<action\b[^>]*?\bid\s*=\s*["']([^"']+)["']/gi, "action", "");
    scanRegex(out, starts, filePath, content,
        /<button\b[^>]*?\bid\s*=\s*["']([^"']+)["']/gi, "button", "");
    // controller="X"
    scanRegex(out, starts, filePath, content,
        /\bcontroller\s*=\s*["']([^"']+)["']/g, "controller", "");
    // showForm('X') trong clientScript
    scanRegex(out, starts, filePath, content,
        /\bshowForm\s*\(\s*["']([^"']+)["']/g, "call", "showForm");
    // EXEC proc trong <query>/<command>
    scanRegex(out, starts, filePath, content,
        /\bexec(?:ute)?\s+(?:@\w+\s*=\s*)?([\[\]\w.$#]+)/gi, "call", "exec");

    return out;
}

module.exports = { scanFile, ALL_SCAN_EXTS, MAX_FILE_BYTES, SCANNER_VERSION };
