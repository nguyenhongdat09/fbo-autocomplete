const vscode = require("vscode");
const ReadXMLRunner = require("./ReadXMLRunner");

/**
 * Peek Definition cho &EntityName; (ReadXML.exe mode 1).
 * Khong dang ky F12 — de Red Hat XML xu ly Go to Definition mac dinh.
 */
class EntityDefinitionProvider {
    /**
     * @param {string} extensionPath
     */
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
    }

    /**
     * @param {import('vscode').TextDocument} document
     * @param {import('vscode').Position} position
     * @returns {Promise<vscode.Location | null>}
     */
    async resolveLocation(document, position) {
        const entityInfo = ReadXMLRunner.resolveEntityAtPosition(document, position);
        if (!entityInfo) {
            return null;
        }

        const entityName = entityInfo.entityName;
        const filePath = document.uri.fsPath;
        let pathInfo = ReadXMLRunner.readPathJson(filePath, entityName, this.extensionPath);

        if (!pathInfo || !pathInfo.SourceFile || !(pathInfo.Line > 0)) {
            try {
                await ReadXMLRunner.runPath(this.extensionPath, filePath, entityName, false);
            } catch (err) {
                console.error("[FBO EntityDefinitionProvider] Mode 1 failed:", err && err.message ? err.message : err);
                return null;
            }
            pathInfo = ReadXMLRunner.readPathJson(filePath, entityName, this.extensionPath);
        }

        if (!pathInfo || !pathInfo.SourceFile || !(pathInfo.Line > 0)) {
            return null;
        }

        const targetUri = vscode.Uri.file(pathInfo.SourceFile);
        const line = Math.max(0, pathInfo.Line - 1);
        return new vscode.Location(targetUri, new vscode.Position(line, 0));
    }

    /**
     * Command: peek definition entity tai vi tri con tro (khong dung F12).
     */
    async peekEntityDefinition() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("Không có editor đang mở.");
            return;
        }

        const document = editor.document;
        const fileName = (document.fileName || "").toLowerCase();
        if (document.uri.scheme !== "file" || !fileName.endsWith(".xml")) {
            vscode.window.showInformationMessage("Peek Definition Entity chỉ dùng cho file XML.");
            return;
        }

        const position = editor.selection.active;
        const entityInfo = ReadXMLRunner.resolveEntityAtPosition(document, position);
        if (!entityInfo) {
            vscode.window.showInformationMessage("Đặt con trỏ lên &EntityName; để peek definition.");
            return;
        }

        const location = await this.resolveLocation(document, position);
        if (!location) {
            vscode.window.showInformationMessage("Không tìm thấy khai báo entity: " + entityInfo.entityName);
            return;
        }

        await vscode.commands.executeCommand(
            "editor.action.peekLocations",
            document.uri,
            position,
            [location],
            "peek"
        );
    }
}

module.exports = EntityDefinitionProvider;
