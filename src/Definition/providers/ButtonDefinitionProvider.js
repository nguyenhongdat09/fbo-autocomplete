const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles bidirectional navigation:
 * - <button command="xxx"> <=> case 'xxx':
 * - If no case found, jump to ExecuteCommand handler
 */
class ButtonDefinitionProvider {
    provideDefinition(document, word, position) {
        const buttons = DocumentParser.parseButtonCommand(document);
        const cases = DocumentParser.parseCaseStatements(document);
        const currentLine = position.line;

        // From case 'xxx' => <button command="xxx">
        const caseMatch = cases.find(
            c => c.caseName === word && c.line === currentLine
        );
        
        if (caseMatch) {
            const targetButton = buttons.find(b => b.id === word);
            if (targetButton) {
                return new vscode.Location(document.uri, targetButton.position);
            }
        }

        // From <button command="xxx"> => case 'xxx'
        const buttonMatch = buttons.find(
            b => b.id === word && b.line === currentLine
        );
        
        if (buttonMatch) {
            const targetCase = cases.find(c => c.caseName === word);
            
            if (targetCase) {
                return new vscode.Location(document.uri, targetCase.position);
            }

            // No case found, jump to ExecuteCommand handler
            const handlerPos = DocumentParser.findPattern(
                document,
                /ExecuteCommand\s*\(\s*sender\s*,\s*e\s*\)/
            );

            if (handlerPos) {
                return new vscode.Location(document.uri, handlerPos);
            }
        }

        return null;
    }
}

module.exports = ButtonDefinitionProvider;