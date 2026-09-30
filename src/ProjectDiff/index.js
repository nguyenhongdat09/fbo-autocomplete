// @ts-nocheck
const vscode = require("vscode");
const { runDiffWithReference } = require("./ProjectDiffCommand");

/**
 * @param {vscode.ExtensionContext} context
 * @param {{ getGroupRoots:()=>{name:string,root:string}[], getIndexService?:()=>any }} deps
 */
function registerProjectDiff(context, deps) {
    context.subscriptions.push(
        vscode.commands.registerCommand("fbo-autocomplete.diffWithReference", (uri, uris) =>
            runDiffWithReference(uri, {
                getGroupRoots: deps.getGroupRoots,
                getIndexService: deps.getIndexService,
                memento: context.workspaceState,
            }, uris)
        )
    );
}

module.exports = { registerProjectDiff };
