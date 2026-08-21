const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles bidirectional navigation:
 * - <action id="xxx"> <=> case 'xxx':
 * - If no case found, jump to ResponseComplete handler
 */
class ActionCaseDefinitionProvider {
    provideDocumentLinks(document, token) {
        const actions = DocumentParser.parseActionId(document);
        const cases = DocumentParser.parseCaseStatements(document);
        const links = [];

        // 1. Từ case 'xxx' => nhảy đến <action id="xxx"> hoặc request(...)
        const requests = DocumentParser.parseRequestCalls(document);
        for (const c of cases) {
            let targetPos = null;
            let tooltip = "";

            const targetAction = actions.find(a => a.id === c.caseName);
            if (targetAction) {
                targetPos = targetAction.position;
                tooltip = `Ctrl+Click to jump to <action id="${c.caseName}">`;
            } else {
                const targetReq = requests.find(r => r.contextName === c.caseName);
                if (targetReq && targetReq.contextPosition) {
                    targetPos = targetReq.contextPosition;
                    tooltip = `Ctrl+Click to jump to request('${targetReq.actionName}', '${c.caseName}')`;
                }
            }

            if (targetPos) {
                const start = c.position;
                const end = new vscode.Position(start.line, start.character + c.caseName.length);
                const range = new vscode.Range(start, end);

                const args = [document.uri.fsPath, targetPos.line, targetPos.character];
                const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify(args))}`);
                
                const link = new vscode.DocumentLink(range, uri);
                link.tooltip = tooltip;
                links.push(link);
            }
        }

        // 2. Từ <action id="xxx"> => nhảy đến case 'xxx'
        for (const a of actions) {
            let targetPos = null;
            let tooltip = "";

            const targetCase = cases.find(c => c.caseName === a.id);
            if (targetCase) {
                targetPos = targetCase.position;
                tooltip = `Ctrl+Click to jump to case '${a.id}'`;
            } else {
                // Không tìm thấy case thì nhảy đến ResponseComplete
                const handlerPos = DocumentParser.findPattern(
                    document,
                    /ResponseComplete\s*\(\s*sender\s*,\s*e\s*\)/
                );
                if (handlerPos) {
                    targetPos = handlerPos;
                    tooltip = `Ctrl+Click to jump to ResponseComplete handler`;
                }
            }

            if (targetPos) {
                const start = a.position;
                const end = new vscode.Position(start.line, start.character + a.id.length);
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

module.exports = ActionCaseDefinitionProvider;