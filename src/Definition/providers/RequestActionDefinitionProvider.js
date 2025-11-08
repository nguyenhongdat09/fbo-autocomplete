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
    provideDefinition(document, word, position) {
        const requestCalls = DocumentParser.parseRequestCalls(document);
        const currentLine = position.line;
        const currentLineText = document.lineAt(currentLine).text;

        // Check if cursor is on an action name in request call
        for (const call of requestCalls) {
            if (call.line !== currentLine) continue;
            if (call.actionName !== word) continue;

            // Verify cursor is actually on this specific action name occurrence
            if (!DocumentParser.isPositionInMatch(position, currentLine, call.actionName, currentLineText)) {
                continue;
            }

            return this.resolveRequestTarget(document, word);
        }

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