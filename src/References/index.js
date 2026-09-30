// @ts-nocheck
const vscode = require("vscode");
const FboReferenceProvider = require("./FboReferenceProvider");

const FBO_SELECTOR = [
    { language: "xml", scheme: "file" },
    { language: "sql", scheme: "file" },
    { language: "javascript", scheme: "file" },
    { pattern: "**/*.ent", scheme: "file" },
];

/**
 * @param {vscode.ExtensionContext} context
 * @param {{ getGroupRoots: () => {name:string, root:string}[] }} deps
 */
function registerReferences(context, deps) {
    const provider = new FboReferenceProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(FBO_SELECTOR, provider)
    );
    return { provider };
}

module.exports = { registerReferences, FBO_SELECTOR };
