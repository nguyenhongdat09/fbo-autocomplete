// File: Definition/providers/RequestActionDefinitionProvider.js

const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles Ctrl+Click on action name and context name in f.request() or g.request()
 * Navigation:
 * 1. Action Name (1st string param) ->
 *    - <action id="ActionName"> - If found, jump here
 *    - <response> - If no action found, jump to response tag
 * 
 * 2. Context Name (2nd string param) ->
 *    - case 'ContextName': - In ResponseComplete handler
 *    - function ResponseComplete - If no case found, jump to ResponseComplete
 * 
 * Examples:
 * - f.request('Item', 'Item', [''], o)
 * - f.request(o, 'Item', 'ItemSite', [''], [''], true)
 * - o.grid.request(o, 'Item', 'ItemSite', ['ma_vt', ...], o.grid.$h, true)
 * - g.request('GetData', 'GetData', ['ma_kh'], o)
 */
class RequestActionDefinitionProvider {
    provideDocumentLinks(document, token) {
        const requestCalls = DocumentParser.parseRequestCalls(document);
        const links = [];

        for (const call of requestCalls) {
            // 1. Target cho Action Name (Vị trí chuỗi thứ 1) -> Nhảy tới <action id="..."> hoặc <response>
            if (call.actionName && call.actionPosition) {
                const targetLoc = this.resolveRequestTarget(document, call.actionName);
                
                if (targetLoc) {
                    const start = call.actionPosition;
                    const end = new vscode.Position(start.line, start.character + call.actionLength);
                    const range = new vscode.Range(start, end);

                    const targetPos = targetLoc.range.start;
                    const args = [document.uri.fsPath, targetPos.line, targetPos.character];
                    
                    const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify(args))}`);
                    const link = new vscode.DocumentLink(range, uri);
                    link.tooltip = `Ctrl+Click to jump to <action id="${call.actionName}">`;
                    links.push(link);
                }
            }

            // 2. Target cho Context Name (Vị trí chuỗi thứ 2) -> Nhảy tới case 'ContextName': ở ResponseComplete
            if (call.contextName && call.contextPosition) {
                const targetLoc = this.resolveContextTarget(document, call.contextName);
                
                if (targetLoc) {
                    const start = call.contextPosition;
                    const end = new vscode.Position(start.line, start.character + call.contextLength);
                    const range = new vscode.Range(start, end);

                    const targetPos = targetLoc.range.start;
                    const args = [document.uri.fsPath, targetPos.line, targetPos.character];
                    
                    const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify(args))}`);
                    const link = new vscode.DocumentLink(range, uri);
                    link.tooltip = `Ctrl+Click to jump to case '${call.contextName}' in ResponseComplete`;
                    links.push(link);
                }
            }
        }

        return links;
    }

    provideDefinition(document, word, position) {
        // Trả về null để tránh nhảy đúp hoặc nhảy tự động khi hover
        return null;
    }

    /**
     * Find target location for request action (1st string)
     * Priority: <action id="xxx"> > <response>
     */
    resolveRequestTarget(document, actionName) {
        // Priority 1: Try to find <action id="actionName">
        const actionPos = DocumentParser.findActionTag(document, actionName);
        
        if (actionPos) {
            return new vscode.Location(document.uri, actionPos);
        }

        // Priority 2: If no action found, jump to <response> tag
        const responsePos = DocumentParser.findResponseTag(document);
        
        if (responsePos) {
            return new vscode.Location(document.uri, responsePos);
        }

        // Priority 3: Nothing found
        return null;
    }

    /**
     * Find target location for request context (2nd string)
     * Priority: case 'contextName': > function ResponseComplete
     */
    resolveContextTarget(document, contextName) {
        // Priority 1: Try to find case 'contextName':
        const cases = DocumentParser.parseCaseStatements(document);
        const targetCase = cases.find(c => c.caseName === contextName);
        
        if (targetCase) {
            return new vscode.Location(document.uri, targetCase.position);
        }

        // Priority 2: If no case found, jump to ResponseComplete handler
        const handlerPos = DocumentParser.findPattern(
            document,
            /ResponseComplete\s*\(\s*sender\s*,\s*e\s*\)/i
        ) || DocumentParser.findPattern(
            document,
            /function\s+ResponseComplete\b/i
        ) || DocumentParser.findPattern(
            document,
            /\bResponseComplete\b/i
        );

        if (handlerPos) {
            return new vscode.Location(document.uri, handlerPos);
        }

        return null;
    }
}

module.exports = RequestActionDefinitionProvider;