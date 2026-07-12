const vscode = require("vscode");
const fs = require("fs");
const ReadXMLRunner = require("./ReadXMLRunner");
const entityResolver = require("../ReadXMLByJS/entityResolver");

/**
 * Peek Definition cho &EntityName; (Sử dụng entityResolver thuần JS).
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

        const generalEntities = entityResolver.getEntitiesForFile(filePath);
        const entityDecl = generalEntities ? generalEntities[entityName] : null;

        if (!entityDecl) {
            return null;
        }

        // Nếu là thực thể liên kết ngoài (SYSTEM) và tệp tin liên kết tồn tại, nhảy thẳng vào tệp đó (ví dụ: ListView.xml)
        if (entityDecl.systemUrl && entityDecl.sourceFile && fs.existsSync(entityDecl.sourceFile)) {
            const targetUri = vscode.Uri.file(entityDecl.sourceFile);
            return new vscode.Location(targetUri, new vscode.Position(0, 0));
        }

        // Ngược lại (thực thể nội bộ), nhảy tới dòng khai báo trong file DTD
        if (!entityDecl.declaredInFile || !(entityDecl.line > 0)) {
            return null;
        }

        const targetUri = vscode.Uri.file(entityDecl.declaredInFile);
        const line = Math.max(0, entityDecl.line - 1);
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

        // Mở tệp tin và nhảy trực tiếp tới dòng khai báo (Ctrl+Click / Go to Definition style)
        try {
            const targetDoc = await vscode.workspace.openTextDocument(location.uri);
            const targetEditor = await vscode.window.showTextDocument(targetDoc);
            targetEditor.selection = new vscode.Selection(location.range.start, location.range.start);
            targetEditor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
        } catch (err) {
            console.error("[FBO peekEntityDefinition] Jump failed:", err);
            vscode.window.showErrorMessage("Không thể nhảy tới file đích: " + (err && err.message));
        }
    }
}

module.exports = EntityDefinitionProvider;
