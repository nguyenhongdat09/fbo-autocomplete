// File: Definition/providers/RequestActionDefinitionProvider.js

const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles Ctrl+Click on action name in f.request() or g.request()
 * Navigation priority:
 * 1. <action id="ActionName"> - If found, jump here
 * 2. <response> - If no action found, jump to response tag
 * 3. null - If neither found, no navigation
 * 
 * Examples:
 * - f.request('Item', 'Item', [''], o)
 * - f.request(o, 'Item', 'Item', [''], [''], true)
 * - g.request('GetData', 'GetData', ['ma_kh'], o)
 */
class RequestActionDefinitionProvider {
    provideDocumentLinks(document, token) {
        const requestCalls = DocumentParser.parseRequestCalls(document);
        const links = [];

        for (const call of requestCalls) {
            const targetLoc = this.resolveRequestTarget(document, call.actionName);
            
            if (targetLoc) {
                const start = call.position;
                const end = new vscode.Position(start.line, start.character + call.actionName.length);
                const range = new vscode.Range(start, end);

                const targetPos = targetLoc.range.start;
                const args = [document.uri.fsPath, targetPos.line, targetPos.character];
                
                const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify(args))}`);
                const link = new vscode.DocumentLink(range, uri);
                link.tooltip = "Ctrl+Click to jump to action/response";
                links.push(link);
            }
        }

        return links;
    }

    provideDefinition(document, word, position) {
        // Trả về null để tránh nhảy đúp hoặc nhảy tự động khi hover
        return null;
    }

    /**
     * Find target location for request action
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
}

module.exports = RequestActionDefinitionProvider;