const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles bidirectional navigation:
 * - <action id="xxx"> <=> case 'xxx':
 * - If no case found, jump to ResponseComplete handler
 */
class ActionCaseDefinitionProvider {
    provideDefinition(document, word, position) {
        const actions = DocumentParser.parseActionId(document);
        const cases = DocumentParser.parseCaseStatements(document);
        const currentLine = position.line;

        // From case 'xxx' => <action id="xxx">
        const caseMatch = cases.find(
            c => c.caseName === word && c.line === currentLine
        );
        
        if (caseMatch) {
            const targetAction = actions.find(a => a.id === word);
            if (targetAction) {
                return new vscode.Location(document.uri, targetAction.position);
            }
        }

        // From <action id="xxx"> => case 'xxx'
        const actionMatch = actions.find(
            a => a.id === word && a.line === currentLine
        );
        
        if (actionMatch) {
            const targetCase = cases.find(c => c.caseName === word);
            
            if (targetCase) {
                return new vscode.Location(document.uri, targetCase.position);
            }

            // No case found, jump to ResponseComplete handler
            const handlerPos = DocumentParser.findPattern(
                document,
                /ResponseComplete\s*\(\s*sender\s*,\s*e\s*\)/
            );

            if (handlerPos) {
                return new vscode.Location(document.uri, handlerPos);
            }
        }

        return null;
    }
}

module.exports = ActionCaseDefinitionProvider;