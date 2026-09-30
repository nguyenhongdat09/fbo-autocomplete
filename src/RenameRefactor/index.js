// @ts-nocheck
const vscode = require("vscode");
const FboRenameProvider = require("./FboRenameProvider");
const { FBO_SELECTOR } = require("../References/index");

/**
 * @param {vscode.ExtensionContext} context
 * @param {{ getGroupRoots: () => {name:string, root:string}[] }} deps
 */
function registerRenameRefactor(context, deps) {
    const provider = new FboRenameProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(FBO_SELECTOR, provider)
    );
    return { provider };
}

module.exports = { registerRenameRefactor };
