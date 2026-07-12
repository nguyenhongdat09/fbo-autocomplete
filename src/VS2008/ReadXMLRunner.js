const vscode = require('vscode');

class ReadXMLRunner {
    /**
     * Tìm entity &Name; tại vị trí con trỏ (kể cả khi đứng giữa tên).
     * @returns {{ entityName: string, line: number, start: number, end: number } | null}
     */
    static resolveEntityAtPosition(document, position) {
        const line = document.lineAt(position.line);
        const text = line.text;
        const regex = /&[\w.]+;/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return {
                    entityName: match[0].slice(1, -1),
                    line: position.line,
                    start: start,
                    end: end,
                };
            }
        }

        const wordRange = document.getWordRangeAtPosition(position, /&[\w.]+;/);
        if (!wordRange) {
            return null;
        }

        const entityRef = document.getText(wordRange);
        return {
            entityName: entityRef.slice(1, -1),
            line: wordRange.start.line,
            start: wordRange.start.character,
            end: wordRange.end.character,
        };
    }
}

module.exports = ReadXMLRunner;
