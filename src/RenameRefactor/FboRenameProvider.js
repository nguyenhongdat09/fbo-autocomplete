// @ts-nocheck
// Rename refactor xuyên file (F2) — mỗi edit gắn needsConfirmation
// để VS Code mở Refactor Preview, user tick chọn từng chỗ thay đổi.

const vscode = require("vscode");
const path = require("path");
const { detectSymbol, globsForKind, isRenameable } = require("../References/SymbolDetector");
const { findMatches, isDeclarationMatch, scanOpenDocuments } = require("../References/ReferenceSearch");

const MAX_EDITS = 3000;
const VALID_NAME = /^[A-Za-z_][\w$#]*$/;

function normPath(p) {
    return path.normalize(String(p || "")).toLowerCase();
}

/** Chọn phạm vi rename: chỉ file đang mở, hoặc toàn bộ project. */
async function pickScope(document) {
    // tránh Enter của rename input leak sang accept picker này
    await new Promise(r => setTimeout(r, 150));
    const pick = await vscode.window.showQuickPick([
        {
            label: "$(file) Chỉ trong file này",
            description: path.basename(document.uri.fsPath),
            detail: "Đổi trong file đang mở — gồm cả chỗ chưa save",
            key: "file",
        },
        {
            label: "$(folder-library) Tất cả project",
            description: "Mọi file XML/.ent/.sql trên FBO tree",
            key: "all",
        },
    ], {
        title: "Phạm vi rename",
        ignoreFocusOut: true,
    });
    return pick ? pick.key : null;
}

class FboRenameProvider {
    /**
     * @param {{ getGroupRoots: () => {name:string, root:string}[] }} deps
     */
    constructor(deps) {
        this._deps = deps || {};
    }

    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     */
    prepareRename(document, position) {
        const sym = detectSymbol(document, position);
        if (!sym || !sym.text || !isRenameable(sym.kind)) {
            throw new Error("Không rename được ở vị trí này.");
        }
        return { range: sym.range, placeholder: sym.text };
    }

    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @param {string} newName
     * @param {vscode.CancellationToken} token
     */
    async provideRenameEdits(document, position, newName, token) {
        const sym = detectSymbol(document, position);
        if (!sym || !sym.text || !isRenameable(sym.kind)) {
            throw new Error("Không rename được ở vị trí này.");
        }
        if (!VALID_NAME.test(newName)) {
            throw new Error(`Tên mới không hợp lệ: "${newName}" (chỉ chữ/số/_/$/#, không bắt đầu bằng số).`);
        }
        if (newName === sym.text) return new vscode.WorkspaceEdit();

        const scope = await pickScope(document);
        if (scope === null) return new vscode.WorkspaceEdit(); // user Esc → không đổi gì

        let matches;
        if (scope === "file") {
            // scan trực tiếp buffer đang mở (bắt cả nội dung chưa save)
            const me = normPath(document.uri.fsPath);
            matches = scanOpenDocuments([path.dirname(document.uri.fsPath)], sym.text, true, false)
                .filter(m => normPath(m.file) === me);
        } else {
            const roots = (this._deps.getGroupRoots ? this._deps.getGroupRoots() : [])
                .map(g => g.root);
            if (!roots.length) throw new Error("Không có group/project nào để quét.");
            matches = await findMatches(roots, sym.text, {
                globs: globsForKind(sym.kind),
                wordMatch: true,
                caseSensitive: false,
                token,
            });
        }
        if (matches.length > MAX_EDITS) {
            throw new Error(`Quá nhiều chỗ tham chiếu (${matches.length}) — hãy thu hẹp rồi rename lại.`);
        }
        if (!matches.length) return new vscode.WorkspaceEdit();

        const edit = new vscode.WorkspaceEdit();
        for (const m of matches) {
            if (token && token.isCancellationRequested) break;
            const isDecl = isDeclarationMatch(m, sym.text);
            edit.replace(
                vscode.Uri.file(m.file),
                new vscode.Range(m.line0, m.col0, m.line0, m.endCol),
                newName,
                {
                    needsConfirmation: true,
                    label: `${path.basename(m.file)}:${m.line0 + 1}`,
                    description: isDecl ? "declaration" : sym.kind,
                }
            );
        }
        return edit;
    }
}

module.exports = FboRenameProvider;
