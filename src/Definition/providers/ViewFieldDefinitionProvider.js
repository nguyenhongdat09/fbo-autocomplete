const vscode = require('vscode');

/**
 * Handles navigation between field definitions and usage:
 * - GRID: <field name="x"> in <fields> <=> <field name="x"> in <view>
 * - DIR/FILTER: <field name="x"> <=> <item value="...[x]...">
 */
class ViewFieldDefinitionProvider {
    provideDefinition(document, word, position) {
        const rawWord = word.replace(/[\[\]]/g, '');
        const fieldName = rawWord.split('.')[0];
        const currentLine = position.line;
        const currentLineText = document.lineAt(currentLine).text;
        const filePath = document.uri.fsPath.toLowerCase();

        const isInGrid = filePath.includes('\\grid\\');
        const isInFilterOrDir = filePath.includes('\\filter\\') || filePath.includes('\\dir\\');

        if (isInGrid) {
            return this.handleGridNavigation(document, fieldName, currentLine, currentLineText);
        }

        if (isInFilterOrDir) {
            return this.handleDirFilterNavigation(document, fieldName, currentLine, currentLineText);
        }

        return null;
    }

    /**
     * GRID: Navigate between <fields> and <view>
     */
    handleGridNavigation(document, fieldName, currentLine, currentLineText) {
        const fieldPattern = new RegExp(`<field\\b[^>]*\\bname=["']${fieldName}["']`, 'i');
        const isFieldLine = fieldPattern.test(currentLineText);

        if (!isFieldLine) return null;

        // Find the other occurrence
        for (let i = 0; i < document.lineCount; i++) {
            if (i === currentLine) continue;

            const lineText = document.lineAt(i).text;
            if (fieldPattern.test(lineText)) {
                const index = lineText.indexOf(fieldName);
                return new vscode.Location(
                    document.uri,
                    new vscode.Position(i, index)
                );
            }
        }

        return null;
    }

    /**
     * DIR/FILTER: Navigate between <field> and <item value="[field]">
     */
    handleDirFilterNavigation(document, fieldName, currentLine, currentLineText) {
        const isFieldLine = new RegExp(
            `<field\\b[^>]*\\bname=["']${fieldName}["']`,
            'i'
        ).test(currentLineText);

        const isItemUsageLine = 
            new RegExp(`\\[${fieldName}(?:\\.\\w+)?\\]`, 'g').test(currentLineText) &&
            /<item\b[^>]*>/.test(currentLineText);

        // From <field name="x"> => <item ... [x]>
        if (isFieldLine) {
            for (let i = 0; i < document.lineCount; i++) {
                if (i === currentLine) continue;

                const lineText = document.lineAt(i).text;
                const pattern = new RegExp(
                    `<item\\b[^>]*\\[${fieldName}(?:\\.\\w+)?\\]`,
                    'i'
                );

                if (pattern.test(lineText)) {
                    const index = lineText.indexOf(`[${fieldName}`);
                    return new vscode.Location(
                        document.uri,
                        new vscode.Position(i, index)
                    );
                }
            }
        }

        // From <item ... [x]> => <field name="x">
        if (isItemUsageLine) {
            for (let i = 0; i < document.lineCount; i++) {
                const lineText = document.lineAt(i).text;
                const pattern = new RegExp(
                    `<field\\b[^>]*\\bname=["']${fieldName}["']`,
                    'i'
                );

                if (pattern.test(lineText)) {
                    const index = lineText.indexOf(fieldName);
                    return new vscode.Location(
                        document.uri,
                        new vscode.Position(i, index)
                    );
                }
            }
        }

        return null;
    }
}

module.exports = ViewFieldDefinitionProvider;