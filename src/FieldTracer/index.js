// @ts-nocheck
const vscode = require("vscode");
const { runTraceField } = require("./FieldTracerCommand");

/**
 * @param {vscode.ExtensionContext} context
 * @param {{
 *   getGroupRoots: () => {name:string, root:string}[],
 *   symbolIndex?: any,
 *   getIndexService?: () => any,
 * }} deps
 */
function registerFieldTracer(context, deps) {
    context.subscriptions.push(
        vscode.commands.registerCommand("fbo-autocomplete.traceField", () =>
            runTraceField(context, deps)
        )
    );
}

module.exports = { registerFieldTracer };
