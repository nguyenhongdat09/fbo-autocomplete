const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class PathResolver {
    static getBasePath(style) {
        const subfolder = {
            'Lookup': 'lookup',
            'AutoComplete': 'lookup',
            'Grid': 'grid'
        }[style];

        if (!subfolder) return null;

        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;

        return path.join(
            path.dirname(path.dirname(editor.document.uri.fsPath)),
            subfolder
        );
    }

    static getFolderName() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;

        return path.basename(
            path.dirname(editor.document.uri.fsPath)
        ).toLowerCase();
    }

    static checkFolderValid() {
        const folderName = this.getFolderName();
        return ['dir', 'grid', 'filter'].includes(folderName);
    }

    static fileExists(filePath) {
        return fs.existsSync(filePath);
    }

    static getProjectRoot(documentPath) {
        return path.dirname(path.dirname(documentPath));
    }
     /**
     * Resolve report template file path
     * @param {string} documentPath - Current XML file path
     * @param {string} fileName - Report file name (without extension)
     * @param {string} commandArgument - 'pdf' or 'excel'
     * @returns {string|null} - Full path to template file or null
     */
    static resolveReportTemplatePath(documentPath, fileName, commandArgument) {
        // Get Controllers folder
        // Path: .../App_Data/Controllers/Report/ZDUTran.xml
        // Need: .../App_Data/Controllers/Templates/{Rpt|Excel}/{fileName}.{rpt|xlsx|xls}

        const controllersPath = this.getControllersFolder(documentPath);
        if (!controllersPath) return null;

        const templatesPath = path.join(controllersPath, 'Templates');

        // Determine subfolder and extensions based on commandArgument
        const config = this.getReportConfig(commandArgument);
        const templateFolder = path.join(templatesPath, config.folder);

        // Try each possible extension
        for (const ext of config.extensions) {
            const fullPath = path.join(templateFolder, `${fileName}${ext}`);
            
            if (this.fileExists(fullPath)) {
                return fullPath;
            }
        }

        return null;
    }

    /**
     * Get configuration for report type
     */
    static getReportConfig(commandArgument) {
        const arg = (commandArgument || 'pdf').toLowerCase();

        const configs = {
            'pdf': {
                folder: 'Rpt',
                extensions: ['.rpt']
            },
            'excel': {
                folder: 'Excel',
                extensions: ['.xlsx', '.xls']
            }
        };

        return configs[arg] || configs['pdf'];
    }

    /**
     * Get Controllers folder from current file path
     * @param {string} filePath - Current file path
     * @returns {string|null} - Controllers folder path
     */
    static getControllersFolder(filePath) {
        // Split path and find Controllers folder
        const parts = filePath.split(path.sep);
        const controllersIndex = parts.findIndex(p => 
            p.toLowerCase() === 'controllers'
        );

        if (controllersIndex === -1) return null;

        // Reconstruct path up to Controllers
        return parts.slice(0, controllersIndex + 1).join(path.sep);
    }

    /**
     * Find all possible report template files for given name
     * Useful for showing multiple options
     */
    static findAllReportTemplates(documentPath, fileName) {
        const controllersPath = this.getControllersFolder(documentPath);
        if (!controllersPath) return [];

        const templatesPath = path.join(controllersPath, 'Templates');
        const results = [];

        // Check PDF templates
        const rptPath = path.join(templatesPath, 'Rpt', `${fileName}.rpt`);
        if (this.fileExists(rptPath)) {
            results.push({ path: rptPath, type: 'PDF' });
        }

        // Check Excel templates
        const excelFolder = path.join(templatesPath, 'Excel');
        for (const ext of ['.xlsx', '.xls']) {
            const excelPath = path.join(excelFolder, `${fileName}${ext}`);
            if (this.fileExists(excelPath)) {
                results.push({ path: excelPath, type: 'Excel' });
            }
        }

        return results;
    }
}

module.exports = PathResolver;