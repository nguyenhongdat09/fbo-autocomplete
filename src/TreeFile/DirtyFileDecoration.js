// Decoration “chưa lưu” — màu accent tím chart (sang, rõ hơn editorInfo, vẫn theo theme).
const vscode = require("vscode");

/** Badge mảnh; kèm ThemeColor để đồng bộ Dark/Light */
const DIRTY_BADGE = "\u00B7";

/**
 * @param {vscode.ExtensionContext} context
 */
function registerDirtyFileDecorations(context) {
    const emitter = new vscode.EventEmitter();

    const provider = {
        onDidChangeFileDecorations: emitter.event,
        provideFileDecoration(uri, _token) {
            if (uri.scheme !== "file") {
                return undefined;
            }
            const doc = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === uri.toString()
            );
            if (doc && doc.isDirty) {
                return {
                    badge: DIRTY_BADGE,
                    tooltip: "Chưa lưu (dirty)",
                    color: new vscode.ThemeColor("charts.purple"),
                };
            }
            return undefined;
        },
    };

    const refresh = (/** @type {vscode.Uri | vscode.Uri[] | undefined} */ uris) => {
        emitter.fire(uris);
    };

    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(provider),
        vscode.workspace.onDidChangeTextDocument((e) => {
            refresh(e.document.uri);
        }),
        vscode.workspace.onDidSaveTextDocument((doc) => {
            refresh(doc.uri);
        }),
        vscode.workspace.onDidCloseTextDocument((doc) => {
            refresh(doc.uri);
        }),
        vscode.workspace.onDidOpenTextDocument((doc) => {
            if (doc.uri.scheme === "file") {
                refresh(doc.uri);
            }
        })
    );
}

module.exports = { registerDirtyFileDecorations };
