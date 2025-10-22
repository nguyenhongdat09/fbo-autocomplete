const vscode = require('vscode');

class DocumentParser {
    /**
     * Parse <items style="..." controller="...">
     */
    static parseItemsController(document) {
        const results = [];
        const pattern = /<items[^>]*style=["'](Lookup|AutoComplete|Grid)["'][^>]*controller=["']([^"']+)["']/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            
            if (match) {
                const style = match[1];
                const controllerName = match[2];
                const controllerIndex = lineText.indexOf(`controller="${controllerName}"`);

                if (controllerIndex >= 0) {
                    results.push({
                        style,
                        controller: controllerName,
                        line: i,
                        position: new vscode.Position(i, controllerIndex + 'controller="'.length),
                        text: lineText.trim()
                    });
                }
            }
        }

        return results;
    }

    /**
     * Parse showForm('FormName')
     */
    static parseShowForm(document) {
        const results = [];
        const pattern = /\b\w+\.showForm\s*\(\s*['"]([^'"]+)['"]\s*\)/;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            
            if (match) {
                const formName = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(formName);
                
                results.push({
                    formName,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    /**
     * Parse <action id="...">
     */
    static parseActionId(document) {
        const results = [];
        const pattern = /<action\b[^>]*\bid\s*=\s*["']([^"']+)["']/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            
            if (match) {
                const actionId = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(actionId);
                
                results.push({
                    id: actionId,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    /**
     * Parse <button command="...">
     */
    static parseButtonCommand(document) {
        const results = [];
        const pattern = /<button\b[^>]*\bcommand\s*=\s*["']([^"']+)["']/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            
            if (match) {
                const commandId = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(commandId);
                
                results.push({
                    id: commandId,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    /**
     * Parse case 'xxx': statements
     */
    static parseCaseStatements(document) {
        const results = [];
        const pattern = /case\s*['"]\s*([^'"]+)\s*['"]/;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(pattern);
            
            if (match) {
                const caseName = match[1];
                const index = lineText.indexOf(match[0]) + match[0].indexOf(caseName);
                
                results.push({
                    caseName,
                    line: i,
                    position: new vscode.Position(i, index),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    /**
     * Find function definition pattern: function xxx(
     */
    static findFunctionDefinition(document, functionName) {
        const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const funcPattern = new RegExp(`function\\s+${escapedName}\\s*\\(`);

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            if (funcPattern.test(lineText)) {
                const index = lineText.indexOf(functionName);
                return new vscode.Position(i, index);
            }
        }

        return null;
    }

    /**
     * Find specific pattern in document
     */
    static findPattern(document, pattern, excludeLine = -1) {
        for (let i = 0; i < document.lineCount; i++) {
            if (i === excludeLine) continue;
            
            const lineText = document.lineAt(i).text;
            if (pattern.test(lineText)) {
                return new vscode.Position(i, 0);
            }
        }
        return null;
    }

    /**
     * Get full word at position (supports $ and _)
     */
    static getFullWordAtPosition(document, position) {
        const lineText = document.lineAt(position.line).text;
        const cursor = position.character;
        const regex = /[a-zA-Z0-9_$]+/g;
        
        let match;
        while ((match = regex.exec(lineText)) !== null) {
            const start = match.index;
            const end = regex.lastIndex;

            if (start <= cursor && cursor <= end) {
                return match[0];
            }
        }

        return '';
    }

    /**
     * Check if position is in specific range
     */
    static isPositionInRange(position, startLine, startChar, endChar) {
        if (position.line !== startLine) return false;
        return position.character >= startChar && position.character <= endChar;
    }


      /**
     * Parse f.request() or g.request() calls
     * Patterns:
     * - f.request('ActionName', 'Context', ['params'], o)
     * - f.request(o, 'ActionName', 'Context', [''], [''], true)
     */
    static parseRequestCalls(document) {
        const results = [];
        // Pattern matches: f.request('xxx', ... ) or g.request('xxx', ...)
        const pattern = /[\w.]+\.request\s*\(\s*(?:[\w.]+\s*,\s*)?['"]([^'"]+)['"]/g



        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            let match;

            // Reset regex lastIndex for each line
            pattern.lastIndex = 0;

            while ((match = pattern.exec(lineText)) !== null) {
                const actionName = match[1];
                const startIndex = match.index + match[0].indexOf(actionName);

                results.push({
                    actionName,
                    line: i,
                    position: new vscode.Position(i, startIndex),
                    text: lineText.trim(),
                    fullMatch: match[0]
                });
            }
        }

        return results;
    }

    /**
     * Find <action id="xxx"> tag
     */
    static findActionTag(document, actionId) {
        const pattern = new RegExp(`<action\\b[^>]*\\bid\\s*=\\s*["']${actionId}["']`, 'i');

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            if (pattern.test(lineText)) {
                // Find the position of action id value
                const match = lineText.match(new RegExp(`id\\s*=\\s*["']${actionId}["']`, 'i'));
                if (match) {
                    const idIndex = lineText.indexOf(match[0]);
                    const actionIdIndex = idIndex + match[0].indexOf(actionId);
                    return new vscode.Position(i, actionIdIndex);
                }
            }
        }

        return null;
    }

    /**
     * Find <response> opening tag
     */
    static findResponseTag(document) {
        const pattern = /<response\b[^>]*>/i;

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            if (pattern.test(lineText)) {
                const index = lineText.indexOf('<response');
                return new vscode.Position(i, index);
            }
        }

        return null;
    }

    /**
     * Check if position is within a specific text match
     */
    static isPositionInMatch(position, line, matchText, fullLineText) {
        if (position.line !== line) return false;

        const startIndex = fullLineText.indexOf(matchText);
        if (startIndex === -1) return false;

        const endIndex = startIndex + matchText.length;
        return position.character >= startIndex && position.character <= endIndex;
    }
     /**
     * Parse <form> tags with reportFile/templateFile attributes
     * Returns: { fileName, fileType: 'reportFile'|'templateFile', commandArgument, line, position }
     */
    static parseReportFormTags(document) {
        const results = [];

        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;

            // Check for reportFile attribute
            const reportFileMatch = lineText.match(/reportFile\s*=\s*["']([^"']+)["']/i);
            if (reportFileMatch && reportFileMatch[1]) {
                const fileName = reportFileMatch[1];
                const startIndex = lineText.indexOf(reportFileMatch[0]) + 
                                   reportFileMatch[0].indexOf(fileName);

                // Find commandArgument on same or nearby lines
                const commandArg = this.findCommandArgumentNearLine(document, i);

                results.push({
                    fileName,
                    fileType: 'reportFile',
                    commandArgument: commandArg,
                    line: i,
                    position: new vscode.Position(i, startIndex),
                    text: lineText.trim()
                });
            }

            // Check for templateFile attribute
            const templateFileMatch = lineText.match(/templateFile\s*=\s*["']([^"']+)["']/i);
            if (templateFileMatch && templateFileMatch[1]) {
                const fileName = templateFileMatch[1];
                const startIndex = lineText.indexOf(templateFileMatch[0]) + 
                                   templateFileMatch[0].indexOf(fileName);

                // Find commandArgument on same or nearby lines
                const commandArg = this.findCommandArgumentNearLine(document, i);

                results.push({
                    fileName,
                    fileType: 'templateFile',
                    commandArgument: commandArg,
                    line: i,
                    position: new vscode.Position(i, startIndex),
                    text: lineText.trim()
                });
            }
        }

        return results;
    }

    /**
     * Find commandArgument attribute near specified line
     * Searches current line and up to 5 lines before/after
     */
    static findCommandArgumentNearLine(document, startLine, searchRange = 5) {
        const minLine = Math.max(0, startLine - searchRange);
        const maxLine = Math.min(document.lineCount - 1, startLine + searchRange);

        for (let i = minLine; i <= maxLine; i++) {
            const lineText = document.lineAt(i).text;
            const match = lineText.match(/commandArgument\s*=\s*["']([^"']+)["']/i);
            
            if (match && match[1]) {
                return match[1].toLowerCase(); // Return 'pdf' or 'excel'
            }
        }

        return 'pdf'; // Default to PDF if not found
    }

    /**
     * Check if position is within reportFile or templateFile attribute value
     */
    static isPositionInReportAttribute(position, line, fileName, fullLineText) {
        if (position.line !== line) return false;

        // Find all occurrences of the fileName in the line
        const pattern = new RegExp(`(?:reportFile|templateFile)\\s*=\\s*["']${fileName}["']`, 'gi');
        let match;

        while ((match = pattern.exec(fullLineText)) !== null) {
            const fileNameIndex = match.index + match[0].indexOf(fileName);
            const startIndex = fileNameIndex;
            const endIndex = fileNameIndex + fileName.length;

            if (position.character >= startIndex && position.character <= endIndex) {
                return true;
            }
        }

        return false;
    }
}

module.exports = DocumentParser;