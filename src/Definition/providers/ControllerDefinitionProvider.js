const vscode = require('vscode');
const path = require('path');
const DocumentParser = require('../utils/DocumentParser');
const PathResolver = require('../utils/PathResolver');

/**
 * Handles Ctrl+Click on controller="..." in <items>
 * Navigate to Lookup/Grid XML file
 */
class ControllerDefinitionProvider {
    provideDocumentLinks(document, token) {
        const items = DocumentParser.parseItemsController(document);
        const links = [];

        for (const item of items) {
            const basePath = PathResolver.getBasePath(item.style);
            if (!basePath) continue;

            let targetFile = path.join(basePath, `${item.controller}.xml`);

            if (!PathResolver.fileExists(targetFile) && item.style === 'Grid') {
                targetFile = path.join(basePath, `${item.controller}.f`);
            }

            if (PathResolver.fileExists(targetFile)) {
                const start = item.position;
                const end = new vscode.Position(start.line, start.character + item.controller.length);
                const range = new vscode.Range(start, end);
                
                // Mở file không dùng preview mode qua command
                const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify([targetFile]))}`);
                const link = new vscode.DocumentLink(range, uri);
                link.tooltip = "Ctrl+Click to open file in new tab (non-preview)";
                links.push(link);
            }
        }
        return links;
    }

    async provideDefinition(document, word, position) {
        // Chúng ta đã chuyển sang dùng DocumentLink để mở tab cố định (không preview)
        // Nên trả về null ở Definition để tránh đụng độ và tự nhảy khi hover.
        return null;
    }
}

module.exports = ControllerDefinitionProvider;