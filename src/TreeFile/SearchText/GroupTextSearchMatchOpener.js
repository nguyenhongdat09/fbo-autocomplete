// @ts-nocheck

const vscode = require("vscode");
const GroupTextSearchKinds = require("./GroupTextSearchKinds");

class GroupTextSearchMatchOpener {
    /**
     * @param {{
     *   uri: string,
     *   startLine: number,
     *   startCharacter: number,
     *   endLine: number,
     *   endCharacter: number,
     * }} payload
     */
    static async openMatch(payload) {
        if (!payload || !payload.uri) {
            return;
        }
        const uri = vscode.Uri.file(String(payload.uri));
        const range = new vscode.Range(
            Number(payload.startLine) || 0,
            Number(payload.startCharacter) || 0,
            Number(payload.endLine) || 0,
            Number(payload.endCharacter) || 0
        );
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: true });
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    /**
     * @param {import('vscode').ExtensionContext} context
     */
    static register(context) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                GroupTextSearchKinds.CMD_OPEN_MATCH,
                async (payload) => {
                    try {
                        await GroupTextSearchMatchOpener.openMatch(payload);
                    } catch (err) {
                        const msg = err && err.message ? err.message : String(err);
                        vscode.window.showErrorMessage(`Cannot open match: ${msg}`);
                    }
                }
            )
        );
    }
}

module.exports = GroupTextSearchMatchOpener;
