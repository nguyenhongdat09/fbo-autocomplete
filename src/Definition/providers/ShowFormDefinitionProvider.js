const vscode = require('vscode');
const path = require('path');
const DocumentParser = require('../utils/DocumentParser');
const PathResolver = require('../utils/PathResolver');

/**
 * Handles Ctrl+Click on showForm('FormName')
 * Navigate to Filter/Form XML file
 */
class ShowFormDefinitionProvider {
    constructor() {
        // Relative paths for Filter files
        this.relativeFilter = [
            ['Filter', 'MultiForm'],
            ['Filter', 'Form'],
            ['Filter', 'Filter'],
            ['Grid', 'MultiGrid'],
            ['Grid', 'Grid'],
            ['Lookup', 'Lookup']
        ];
    }

    provideDocumentLinks(document, token) {
        const showForms = DocumentParser.parseShowForm(document);
        const links = [];

        for (const show of showForms) {
            const projectRoot = PathResolver.getProjectRoot(document.uri.fsPath);
            const possiblePaths = this.findShowFormRelative(show.formName);
            
            for (const [folder, fileName] of possiblePaths) {
                const filePath = path.join(projectRoot, folder, `${fileName}.xml`);

                if (PathResolver.fileExists(filePath)) {
                    const start = show.position;
                    const end = new vscode.Position(start.line, start.character + show.formName.length);
                    const range = new vscode.Range(start, end);

                    const uri = vscode.Uri.parse(`command:fbo-autocomplete.openNonPreview?${encodeURIComponent(JSON.stringify([filePath]))}`);
                    const link = new vscode.DocumentLink(range, uri);
                    link.tooltip = "Ctrl+Click to open form in new tab (non-preview)";
                    links.push(link);
                    break; // Ưu tiên tìm thấy file đầu tiên
                }
            }
        }

        return links;
    }

    async provideDefinition(document, word, position) {
        // Trả về null để tránh nhảy đúp hoặc nhảy tự động khi hover
        return null;
    }

    findShowFormRelative(formName) {
        const isFilter = /Filter$/.test(formName);
        const result = [['Filter', formName]];

        if (!isFilter) return result;

        // If ends with "Filter", try other variants
        const baseName = formName.slice(0, -6); // Remove "Filter"
        
        for (const [folder, suffix] of this.relativeFilter) {
            result.push([folder, baseName + suffix]);
        }

        return result;
    }
}

module.exports = ShowFormDefinitionProvider;