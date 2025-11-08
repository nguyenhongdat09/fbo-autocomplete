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

    provideDefinition(document, word, position) {
        const showForms = DocumentParser.parseShowForm(document);

        for (const show of showForms) {
            if (show.formName !== word) continue;

            return this.resolveShowFormFiles(document, word);
        }

        return null;
    }

    resolveShowFormFiles(document, formName) {
        const projectRoot = PathResolver.getProjectRoot(document.uri.fsPath);
        const possiblePaths = this.findShowFormRelative(formName);
        const locations = [];

        for (const [folder, fileName] of possiblePaths) {
            const filePath = path.join(projectRoot, folder, `${fileName}.xml`);

            if (PathResolver.fileExists(filePath)) {
                locations.push(
                    new vscode.Location(
                        vscode.Uri.file(filePath),
                        new vscode.Position(0, 0)
                    )
                );
            }
        }

        return locations.length > 0 ? locations : null;
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