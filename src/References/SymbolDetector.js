// @ts-nocheck
// Nhận diện symbol tại vị trí con trỏ trong file FBO (xml/f/sql/js).
// Trả { kind, text, range } — kind quyết định globs + cách rename.

const path = require("path");
const vscode = require("vscode");

/**
 * kind:
 *  - field       : <field name="X">, <item name="X">, [X] trong view item, f.X / g.X
 *  - entity      : &X; hoặc <!ENTITY X
 *  - action      : id="X" trong <action>/<button>, case "X"
 *  - controller  : controller="X"
 *  - callTarget  : showForm('X'), request('X')
 *  - sqlObject   : từ trong khối <query>/<command> hoặc file .sql (proc/table)
 *  - word        : fallback — đổi/tìm theo literal
 */

const ENTITY_RE = /&([A-Za-z_][\w.]*);/g;
const ATTR_RE = /([A-Za-z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
const VIEW_REF_RE = /\[([A-Za-z_][\w.]*)\]/g;
const CALL_RE = /\b(?:showForm|request|callAction|callMethod)\s*\(\s*["']([^"']+)["']/g;
const WORD_RE = /[A-Za-z_][\w$#.]*/g;

function inRange(ch, start, end) {
    return ch >= start && ch < end;
}

/** Tag mở gần nhất trước vị trí trong dòng: <field / <item / <action ... */
function enclosingTag(line, ch) {
    const before = line.slice(0, ch);
    const m = before.match(/<([a-zA-Z][\w-]*)[^<>]*$/);
    return m ? m[1].toLowerCase() : "";
}

/** Offset đang nằm trong khối nào của document (query/command/fields/views/clientScript). */
function enclosingBlock(document, offset) {
    const head = document.getText(new vscode.Range(new vscode.Position(0, 0), document.positionAt(offset)));
    const blocks = [
        ["sql", /<query\b|<command\b|<commands\b/gi, /<\/query\s*>|<\/command\s*>|<\/commands\s*>/gi],
        ["fields", /<fields\b/gi, /<\/fields\s*>/gi],
        ["views", /<views\b/gi, /<\/views\s*>/gi],
        ["script", /<clientScript\b/gi, /<\/clientScript\s*>/gi],
    ];
    let result = "";
    for (const [name, openRe, closeRe] of blocks) {
        openRe.lastIndex = 0; closeRe.lastIndex = 0;
        let lastOpen = -1, lastClose = -1, m;
        while ((m = openRe.exec(head)) !== null) lastOpen = m.index;
        while ((m = closeRe.exec(head)) !== null) lastClose = m.index;
        if (lastOpen > lastClose) { result = name; break; }
    }
    return result;
}

/**
 * @param {import('vscode').TextDocument} document
 * @param {import('vscode').Position} position
 * @returns {{kind:string, text:string, range:import('vscode').Range}|null}
 */
function detectSymbol(document, position) {
    let line;
    try {
        line = document.lineAt(position.line).text;
    } catch {
        return null;
    }
    const ch = position.character;
    const offset = document.offsetAt(position);
    const ext = path.extname(document.uri.fsPath || "").toLowerCase();

    let m;

    // 1. Entity &X;
    ENTITY_RE.lastIndex = 0;
    while ((m = ENTITY_RE.exec(line)) !== null) {
        if (inRange(ch, m.index, m.index + m[0].length)) {
            const start = m.index + 1;
            return { kind: "entity", text: m[1], range: new vscode.Range(position.line, start, position.line, start + m[1].length) };
        }
    }

    // 2. Giá trị trong attr "X"
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(line)) !== null) {
        const value = m[3] !== undefined ? m[3] : m[4];
        const valueStart = m.index + m[0].indexOf(m[2]) + 1;
        const valueEnd = valueStart + value.length;
        if (!inRange(ch, valueStart, valueEnd)) continue;

        // Ưu tiên [field] bên trong value — vd value="11: [status].Label, [status]"
        const vref = /\[([A-Za-z_][\w.]*)\]/g;
        let vm;
        while ((vm = vref.exec(value)) !== null) {
            const vStart = valueStart + vm.index + 1;
            if (inRange(ch, vStart, vStart + vm[1].length)) {
                return { kind: "field", text: vm[1], range: new vscode.Range(position.line, vStart, position.line, vStart + vm[1].length) };
            }
        }

        const attr = m[1].toLowerCase();
        const tag = enclosingTag(line, valueStart);
        let kind = "attr";
        if (attr === "name") {
            kind = tag === "item" ? "item" : "field";
        } else if (attr === "controller") {
            kind = "controller";
        } else if (attr === "id" && (tag === "action" || tag === "button")) {
            kind = "action";
        } else if (value && !/\s/.test(value)) {
            kind = "attr";
        }
        if (!value) return null;
        return { kind, text: value, range: new vscode.Range(position.line, valueStart, position.line, valueEnd) };
    }

    // 3. [field] trong view item
    VIEW_REF_RE.lastIndex = 0;
    while ((m = VIEW_REF_RE.exec(line)) !== null) {
        if (inRange(ch, m.index, m.index + m[0].length)) {
            const start = m.index + 1;
            return { kind: "field", text: m[1], range: new vscode.Range(position.line, start, position.line, start + m[1].length) };
        }
    }

    // 4. showForm('X') / request('X')
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(line)) !== null) {
        const start = m.index + m[0].indexOf(m[1]);
        if (inRange(ch, start, start + m[1].length)) {
            return { kind: "callTarget", text: m[1], range: new vscode.Range(position.line, start, position.line, start + m[1].length) };
        }
    }

    // 5. Bare word — quyết định kind theo khối bao ngoài / extension
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(line)) !== null) {
        if (inRange(ch, m.index, m.index + m[0].length)) {
            const text = m[0];
            let kind = "word";
            if (ext === ".sql") {
                kind = "sqlObject";
            } else if (ext === ".xml" || ext === ".ent") {
                const block = enclosingBlock(document, offset);
                if (block === "sql") kind = "sqlObject";
                else if (block === "script") kind = "word";
            }
            return { kind, text, range: new vscode.Range(position.line, m.index, position.line, m.index + text.length) };
        }
    }
    return null;
}

/** Globs theo kind — giới hạn phạm vi rg cho đúng loại file. .f = file mã hóa tự sinh, bỏ qua. */
function globsForKind(kind) {
    switch (kind) {
        case "field":
        case "item":
            return ["*.xml", "*.ent", "*.js", "*.sql"];
        case "entity":
            return ["*.xml", "*.ent", "*.txt"];
        case "action":
        case "controller":
        case "callTarget":
            return ["*.xml", "*.ent", "*.js", "*.aspx"];
        case "sqlObject":
            return ["*.xml", "*.ent", "*.sql", "*.aspx"];
        default:
            return ["*.xml", "*.ent", "*.js", "*.sql", "*.aspx"];
    }
}

/** Kind nào được phép rename */
function isRenameable(kind) {
    return ["field", "item", "entity", "action", "controller", "callTarget", "sqlObject", "word", "attr"].includes(kind);
}

module.exports = { detectSymbol, globsForKind, isRenameable };
