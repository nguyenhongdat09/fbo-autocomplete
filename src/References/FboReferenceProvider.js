// @ts-nocheck
// Find All References cho symbol FBO — field/entity/action/controller/proc/table.
// Shift+F12 / "Find All References" trong xml/f/sql/js.

const vscode = require("vscode");
const { detectSymbol, globsForKind } = require("./SymbolDetector");
const { findMatches, isDeclarationMatch } = require("./ReferenceSearch");

class FboReferenceProvider {
    /**
     * @param {{ getGroupRoots: () => {name:string, root:string}[] }} deps
     */
    constructor(deps) {
        this._deps = deps || {};
    }

    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @param {{includeDeclaration:boolean}} context
     * @param {vscode.CancellationToken} token
     */
    async provideReferences(document, position, context, token) {
        const sym = detectSymbol(document, position);
        if (!sym || !sym.text) return [];

        const roots = (this._deps.getGroupRoots ? this._deps.getGroupRoots() : [])
            .map(g => g.root);
        if (!roots.length) return [];

        const matches = await findMatches(roots, sym.text, {
            globs: globsForKind(sym.kind),
            wordMatch: true,
            caseSensitive: false,
            token,
        });

        const locations = [];
        for (const m of matches) {
            if (token && token.isCancellationRequested) break;
            if (context && context.includeDeclaration === false && isDeclarationMatch(m, sym.text)) {
                continue;
            }
            locations.push(new vscode.Location(
                vscode.Uri.file(m.file),
                new vscode.Range(m.line0, m.col0, m.line0, m.endCol)
            ));
        }
        return locations;
    }
}

module.exports = FboReferenceProvider;
