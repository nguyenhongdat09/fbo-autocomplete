// @ts-nocheck
// WorkspaceSymbolProvider — Ctrl+T search field/entity/action/proc/file
// trên toàn bộ group (project) đã có trên FBO File tree.

const vscode = require("vscode");
const path = require("path");

const MAX_RESULTS = 400;

const KIND_MAP = {
    field: vscode.SymbolKind.Field,
    item: vscode.SymbolKind.Property,
    entity: vscode.SymbolKind.Interface,
    action: vscode.SymbolKind.Event,
    button: vscode.SymbolKind.Event,
    controller: vscode.SymbolKind.Class,
    call: vscode.SymbolKind.Function,
    proc: vscode.SymbolKind.Function,
    function: vscode.SymbolKind.Function,
    view: vscode.SymbolKind.Object,
    trigger: vscode.SymbolKind.Event,
    table: vscode.SymbolKind.Struct,
    file: vscode.SymbolKind.File,
};

/** query: space = AND, * = nhiều ký tự, ? = 1 ký tự. Case-insensitive. */
function buildMatcher(query) {
    const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return () => true;
    const regs = terms.map(t => {
        if (!/[*?%_]/.test(t)) return null; // substring thường
        const re = t
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/[*%]/g, ".*")
            .replace(/[?_]/g, ".");
        return new RegExp("^" + re + "$", "i");
    });
    return (name) => {
        const n = String(name || "").toLowerCase();
        return terms.every((t, i) => (regs[i] ? regs[i].test(n) : n.includes(t)));
    };
}

/** Group root chứa file đang mở (prefix dài nhất). null nếu không xác định. */
function resolveActiveRoot(roots) {
    const ed = vscode.window.activeTextEditor;
    if (!ed || !ed.document || ed.document.uri.scheme !== "file") return null;
    const fp = path.normalize(ed.document.uri.fsPath).toLowerCase();
    let best = null;
    for (const g of roots) {
        const r = path.normalize(String(g.root || "")).toLowerCase();
        if (fp === r || fp.startsWith(r + path.sep)) {
            if (!best || r.length > best._len) best = Object.assign({}, g, { _len: r.length });
        }
    }
    return best;
}

class FboWorkspaceSymbolProvider {
    /**
     * @param {{
     *   getGroupRoots: () => {name:string, root:string}[],
     *   symbolIndex: any,
     *   getIndexService?: () => any,
     * }} deps
     */
    constructor(deps) {
        this._deps = deps || {};
    }

    /**
     * @param {string} query
     * @param {vscode.CancellationToken} token
     */
    async provideWorkspaceSymbols(query, token) {
        const rootsAll = this._deps.getGroupRoots ? this._deps.getGroupRoots() : [];
        if (!rootsAll.length) return [];

        // Scope: mặc định chỉ project của file đang mở; "all" = mọi group trên tree
        const scope = String(vscode.workspace.getConfiguration("fbo-autocomplete")
            .get("workspaceSymbolScope", "current"));
        const activeRoot = resolveActiveRoot(rootsAll);
        const roots = (scope === "all" || !activeRoot) ? rootsAll : [activeRoot];

        const match = buildMatcher(query);
        const out = [];

        await Promise.all(roots.map(async (g) => {
            if (token && token.isCancellationRequested) return;
            let idx;
            try {
                idx = await this._deps.symbolIndex.ensure(g.root);
            } catch {
                return;
            }
            if (token && token.isCancellationRequested) return;

            // Symbol trong file (field/entity/action/proc/...)
            for (const s of idx.symbols) {
                if (!match(s.name)) continue;
                out.push(new vscode.SymbolInformation(
                    s.name,
                    KIND_MAP[s.kind] || vscode.SymbolKind.Object,
                    `${g.name} • ${s.kind}${s.detail ? " • " + s.detail : ""}`,
                    new vscode.Location(
                        vscode.Uri.file(s.file),
                        new vscode.Position(s.line, Math.max(0, s.col))
                    )
                ));
                if (out.length >= MAX_RESULTS) return;
            }

            // File symbols từ filesRel (không cần đọc nội dung)
            for (const rel of idx.filesRel || []) {
                if (out.length >= MAX_RESULTS) return;
                const base = path.basename(rel);
                if (!match(base) && !match(rel)) continue;
                out.push(new vscode.SymbolInformation(
                    base,
                    vscode.SymbolKind.File,
                    `${g.name} • ${path.dirname(rel)}`,
                    new vscode.Location(vscode.Uri.file(path.join(g.root, rel)), new vscode.Position(0, 0))
                ));
            }
        }));

        return out.slice(0, MAX_RESULTS);
    }
}

module.exports = FboWorkspaceSymbolProvider;
