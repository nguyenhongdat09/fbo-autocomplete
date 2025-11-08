const vscode = require('vscode');
const path = require('path');
const DocumentParser = require('../utils/DocumentParser');
const PathResolver = require('../utils/PathResolver');

/**
 * Handles Ctrl+Click on controller="..." in <items>
 * Navigate to Lookup/Grid XML file
 */
class ControllerDefinitionProvider {
    provideDefinition(document, word, position) {
        const items = DocumentParser.parseItemsController(document);

        for (const item of items) {
            if (item.controller !== word) continue;

            // Check if cursor is on controller attribute
            const start = item.position;
            const end = new vscode.Position(start.line, start.character + word.length);
            const range = new vscode.Range(start, end);

            if (!range.contains(position)) continue;

            return this.resolveControllerFile(item);
        }

        return null;
    }

    resolveControllerFile(item) {
        const basePath = PathResolver.getBasePath(item.style);
        if (!basePath) return null;

        let targetFile = path.join(basePath, `${item.controller}.xml`);

        // Grid có thể có extension .f
        if (!PathResolver.fileExists(targetFile) && item.style === 'Grid') {
            targetFile = path.join(basePath, `${item.controller}.f`);
        }

        if (PathResolver.fileExists(targetFile)) {
            return new vscode.Location(
                vscode.Uri.file(targetFile),
                new vscode.Position(0, 0)
            );
        }

        vscode.window.showWarningMessage(`Không tìm thấy file: ${targetFile}`);
        return null;
    }
}

module.exports = ControllerDefinitionProvider;