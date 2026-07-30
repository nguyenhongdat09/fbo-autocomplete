const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles bidirectional navigation:
 * - <button command="xxx"> <=> case 'xxx':
 * - If no case found, jump to ExecuteCommand handler
 */
class ButtonDefinitionProvider {
    provideDocumentLinks(document, token) {
        const buttons = DocumentParser.parseButtonCommand(document);
        const cases = DocumentParser.parseCaseStatements(document);
        const links = [];

        // 1. Từ case 'xxx' => nhảy đến <button command="xxx">
        for (const c of cases) {
            const targetButton = buttons.find(b => b.id === c.caseName);
            if (targetButton) {
                const start = c.position;
                const end = new vscode.Position(start.line, start.character + c.caseName.length);
                const range = new vscode.Range(start, end);

                const targetPos = targetButton.position;
                const args = [document.uri.fsPath, targetPos.line, targetPos.character];
                const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify(args))}`);
                
                const link = new vscode.DocumentLink(range, uri);
                link.tooltip = `Ctrl+Click to jump to <button command="${c.caseName}">`;
                links.push(link);
            }
        }

        // 2. Từ <button command="xxx"> => nhảy đến case 'xxx'
        for (const b of buttons) {
            let targetPos = null;
            let tooltip = "";

            const targetCase = cases.find(c => c.caseName === b.id);
            if (targetCase) {
                targetPos = targetCase.position;
                tooltip = `Ctrl+Click to jump to case '${b.id}'`;
            } else {
                // Không tìm thấy case thì nhảy đến ExecuteCommand
                const handlerPos = DocumentParser.findPattern(
                    document,
                    /ExecuteCommand\s*\(\s*sender\s*,\s*e\s*\)/
                );
                if (handlerPos) {
                    targetPos = handlerPos;
                    tooltip = `Ctrl+Click to jump to ExecuteCommand handler`;
                }
            }

            if (targetPos) {
                const start = b.position;
                const end = new vscode.Position(start.line, start.character + b.id.length);
                const range = new vscode.Range(start, end);

                const args = [document.uri.fsPath, targetPos.line, targetPos.character];
                const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify(args))}`);
                
                const link = new vscode.DocumentLink(range, uri);
                link.tooltip = tooltip;
                links.push(link);
            }
        }

        return links;
    }

    provideDefinition(document, word, position) {
        // Đã chuyển sang DocumentLink
        return null;
    }
}

module.exports = ButtonDefinitionProvider;