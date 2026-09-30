// @ts-nocheck
// Worker thread cho CheckLegacy — chạy entity resolve + expand + rule checks
// ngoài main thread để Ctrl+S / tree / typing không bị block.
// vscode shim: các module check chỉ cần Range/Diagnostic/Severity/window/document.

const { parentPort } = require("worker_threads");
const Module = require("module");

// ---------- vscode shim ----------
const errors = [];
let currentEditorShim = null;

class ShimRange {
    constructor(sl, sc, el, ec) {
        this.start = { line: sl, character: sc };
        this.end = { line: el, character: ec };
    }
}
class ShimDiagnostic {
    constructor(range, message, severity) {
        this.range = range;
        this.message = message;
        this.severity = severity;
    }
}
const vscodeShim = {
    Range: ShimRange,
    Diagnostic: ShimDiagnostic,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    window: {
        showErrorMessage: (m) => { errors.push(String(m)); return Promise.resolve(); },
        get activeTextEditor() { return currentEditorShim; },
    },
    workspace: {
        onDidSaveTextDocument: () => ({ dispose() { } }),
        onDidOpenTextDocument: () => ({ dispose() { } }),
    },
    Uri: { file: (p) => ({ fsPath: p, scheme: "file" }) },
};

const _origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === "vscode") return vscodeShim;
    return _origRequire.apply(this, arguments);
};

// ---------- document shim ----------
class DocShim {
    constructor(filePath, content) {
        this.uri = { fsPath: filePath, scheme: "file" };
        this.fileName = filePath;
        this.languageId = "xml";
        this.version = 1;
        this._text = content;
        this._lines = content.split(/\r?\n/);
        this._starts = null;
    }
    getText() { return this._text; }
    get lineCount() { return this._lines.length; }
    lineAt(n) {
        const i = Math.min(Math.max(0, n | 0), this._lines.length - 1);
        const text = this._lines[i] || "";
        return { lineNumber: i, text, range: new ShimRange(i, 0, i, text.length), isEmptyOrWhitespace: !text.trim() };
    }
    positionAt(offset) {
        if (!this._starts) {
            this._starts = [0];
            for (let i = 0; i < this._text.length; i++) {
                if (this._text.charCodeAt(i) === 10) this._starts.push(i + 1);
            }
        }
        let lo = 0, hi = this._starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this._starts[mid] <= offset) lo = mid; else hi = mid - 1;
        }
        return { line: lo, character: offset - this._starts[lo] };
    }
    offsetAt(pos) {
        if (!this._starts) { this.positionAt(0); }
        return (this._starts[pos.line] || 0) + pos.character;
    }
}

// ---------- check modules (sau khi shim vscode) ----------
const { replaceEntity, getEntityContentsForDoc } = require("./CheckLegacyEntity");
const { checkLegacyItem, getFieldOnFields, getFieldOnView } = require("./CheckLegacyFields");
const { checkStructureRules } = require("./CheckLegacyStructure");
const { checkGridRules } = require("./CheckLegacyGrid");
const { escapeRegExp } = require("./CheckLegacyUtils");

/**
 * Check 1 file — logic giống CheckLegacyCode.run phần entity+expand+rules.
 * @param {{filePath:string, content:string, isGrid:boolean, doctype:string, full?:boolean}} msg
 * full=true → check toàn bộ rule (nút Check Legacy); false = mode save, chỉ check field/view cơ bản
 */
async function runCheck(msg) {
    const t0 = Date.now();
    errors.length = 0;
    const { filePath, content: originalContent, isGrid, doctype } = msg;
    const full = !!msg.full;
    let content = originalContent;

    const tResolve0 = Date.now();
    const entityContents = await getEntityContentsForDoc(filePath, doctype);
    const tResolve = Date.now() - tResolve0;
    const tExpand0 = Date.now();

    // Expand entity trong <fields>/<views> — giống run() nhưng không cần setTimeout yield
    // (worker thread không block UI)
    const fieldsBlockRegex = /<fields>([\s\S]*?)<\/fields>/gi;
    const viewsBlockRegex = /<views>[\s\S]*?<\/views>/gi;
    let iterations = 0;
    const maxIterations = 5;
    let hasReplaced = true;
    while (hasReplaced && iterations < maxIterations) {
        hasReplaced = false;
        iterations++;
        let targetSections = "";
        let match;
        fieldsBlockRegex.lastIndex = 0;
        while ((match = fieldsBlockRegex.exec(content)) !== null) targetSections += match[0] + "\n";
        viewsBlockRegex.lastIndex = 0;
        while ((match = viewsBlockRegex.exec(content)) !== null) targetSections += match[0] + "\n";
        if (!targetSections) break;

        const ent_content = replaceEntity(targetSections, entityContents);
        if (ent_content.length === 0) break;
        const entityMap = new Map();
        for (const ent of ent_content) {
            if (ent.content !== "") entityMap.set(ent.entity, ent.content.replace(/\r?\n/g, " "));
        }
        if (entityMap.size === 0) break;
        const entityRegex = new RegExp([...entityMap.keys()].map(k => escapeRegExp(k)).join("|"), "g");
        const nextContent = content.replace(entityRegex, m => entityMap.get(m) || m);
        if (nextContent !== content) { content = nextContent; hasReplaced = true; }
    }
    const tExpand = Date.now() - tExpand0;
    const tRules0 = Date.now();

    const docShim = new DocShim(filePath, originalContent);
    const editorShim = { document: docShim };
    currentEditorShim = editorShim;

    const diagnostics = [];
    if (isGrid) {
        checkGridRules(editorShim, content, originalContent, diagnostics);
    } else {
        const field_item = getFieldOnView(content);
        const fields_declare = getFieldOnFields(content);
        const viewsContent = (content.match(/<views>[\s\S]*?<\/views>/gi) || []).join("\n");
        const fieldsContent = (content.match(/<fields>[\s\S]*?<\/fields>/gi) || []).join("\n");
        const entityLeftRe = /&(?!(gt|lt|amp|quot|apos);)[\w.]+;/;
        checkLegacyItem(editorShim, field_item, fields_declare, diagnostics,
            entityLeftRe.test(viewsContent), entityLeftRe.test(fieldsContent), { fieldNotOnView: full });
        if (full) checkStructureRules(editorShim, content, diagnostics, true);
    }

    currentEditorShim = null;
    return {
        diags: diagnostics.map(d => ({
            sl: d.range.start.line, sc: d.range.start.character,
            el: d.range.end.line, ec: d.range.end.character,
            message: d.message, severity: d.severity,
        })),
        errors: errors.slice(),
        elapsed: Date.now() - t0,
        timings: { resolve: tResolve, expand: tExpand, rules: Date.now() - tRules0, iters: iterations },
    };
}

async function warm(msg) {
    try { await getEntityContentsForDoc(msg.filePath, msg.doctype); } catch { /* best-effort */ }
    return { ok: true };
}

if (parentPort) parentPort.on("message", (msg) => {
    (async () => {
        try {
            if (msg.type === "check") {
                const res = await runCheck(msg);
                parentPort.postMessage({ id: msg.id, ...res });
            } else if (msg.type === "warm") {
                const res = await warm(msg);
                parentPort.postMessage({ id: msg.id, warm: true, ...res });
            }
        } catch (err) {
            parentPort.postMessage({ id: msg.id, error: String(err && err.message || err) });
        }
    })();
});
