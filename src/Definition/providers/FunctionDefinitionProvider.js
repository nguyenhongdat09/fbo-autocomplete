const vscode = require('vscode');
const DocumentParser = require('../utils/DocumentParser');

/**
 * Handles navigation from function call to function definition
 * Example: functionName() => function functionName()
 */
class FunctionDefinitionProvider {
    provideDefinition(document, word, position) {
        const currentLineText = document.lineAt(position.line).text;
        const fullWord = DocumentParser.getFullWordAtPosition(document, position);
        
        // Check if this is a function call
        const functionCalls = [...currentLineText.matchAll(/\b([a-zA-Z0-9_$]+)\s*\(/g)];
        const isFunctionCall = functionCalls.some(match => match[1] === fullWord);

        if (!isFunctionCall) return null;

        // Find function definition
        const definitionPos = DocumentParser.findFunctionDefinition(document, fullWord);

        if (definitionPos) {
            return new vscode.Location(document.uri, definitionPos);
        }

        return null;
    }
}

module.exports = FunctionDefinitionProvider;