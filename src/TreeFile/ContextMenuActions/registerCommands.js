const vscode = require("vscode");

function registerCommands(handler) {
    const commandMap = [
        { name: "fboFile.openRevealFolder", handler: handler.openRevealFolder.bind(handler) },
        { name: "fboFile.CopyPath", handler: () => handler.CopyPath() },
        { name: "fboFile.CopyFile", handler: () => handler.copyFile() },
        { name: "fboFile.CopyNameOfFile", handler: () => handler.copyNameOfFile() },
        { name: "fboFile.CopyNameOfFileNoEx", handler: () => handler.copyNameOfFileNoEx() },
        { name: "fboFile.DeleteFile", handler: async () => await handler.deleteFile() },
        { name: "fboFile.FixWebConfig", handler: async (group) => await handler.fixWebConfig(group) },
        { name: "fboFile.OpenWebConfig", handler: async (group) => await handler.openWebConfig(group) },
        { name: "fboFile.ConfigProjectRoot", handler: async (group) => await handler.configProjectRoot(group) },
        { name: "fboFile.ExpandAll", handler: async (group) => await handler.expandAll(group) },
        { name: "fboFile.DeleteStruct", handler: async (group) => await handler.deleteStruct(group) },
        { name: "fboFile.NewSqlTemp", handler: async (group) => await handler.newSqlTemp(group) },
        { name: "fboFile.NewSqlTempOnWorkspace", handler: async (group) => await handler.newSqlTempOnWorkspace(group) },
        { name: "fboFile.SearchTextInGroup", handler: async (group) => await handler.treeDataProvider.runGroupTextSearch?.(group) },
        { name: "fboFile.PasteFilesToGroup", handler: async (group) => await handler.PasteFilesToGroup(group) },
        { name: "fboFile.GenerateCopyFile", handler: async () => await handler.GenerateCopyFile() },
        { name: "fboFile.RenameFile", handler: async () => handler.renameFileCommand() }
    ];
    for (const { name, handler: h } of commandMap) {
        handler.context.subscriptions.push(
            vscode.commands.registerCommand(name, h)
        );
    }
}

module.exports = registerCommands;
