// @ts-nocheck

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
        // Need: .../App_Data/Controllers/Templates/{Frx|Rpt|Excel}/{fileName}.{frx|rpt|xlsx|xls}

        const controllersPath = this.getControllersFolder(documentPath);
        if (!controllersPath) return null;

        const templatesPath = path.join(controllersPath, 'Templates');

        // Determine subfolders and extensions based on commandArgument
        const config = this.getReportConfig(commandArgument);

        // Try each candidate folder in priority order
        for (const candidate of config.folders) {
            const templateFolder = path.join(templatesPath, candidate.folder);

            for (const ext of candidate.extensions) {
                const fullPath = path.join(templateFolder, `${fileName}${ext}`);

                if (this.fileExists(fullPath)) {
                    return fullPath;
                }
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
                // Ưu tiên FastReport (Frx/External → Frx), fallback Crystal Reports (Rpt/External → Rpt)
                folders: [
                    { folder: path.join('Frx', 'External'), extensions: ['.frx'] },
                    { folder: 'Frx', extensions: ['.frx'] },
                    { folder: path.join('Rpt', 'External'), extensions: ['.rpt'] },
                    { folder: 'Rpt', extensions: ['.rpt'] }
                ]
            },
            'excel': {
                folders: [
                    { folder: 'Excel', extensions: ['.xlsx', '.xls'] }
                ]
            }
        };

        return configs[arg] || configs['pdf'];
    }

    /**
     * Get display app name for a template file
     * @param {string} filePath - Template file path
     * @param {string} [fallbackArg] - commandArgument fallback ('pdf'|'excel')
     */
    static getTemplateAppName(filePath, fallbackArg) {
        const ext = path.extname(filePath || '').toLowerCase();
        if (ext === '.frx') return 'FastReport';
        if (ext === '.rpt') return 'Crystal Reports';
        if (ext === '.xlsx' || ext === '.xls') return 'Excel';
        return (fallbackArg || '').toLowerCase() === 'excel' ? 'Excel' : 'Crystal Reports';
    }

    /**
     * Get search description for "template not found" error message
     */
    static getReportSearchDescription(commandArgument) {
        const arg = (commandArgument || 'pdf').toLowerCase();
        if (arg === 'excel') {
            return '.xlsx/.xls trong folder Templates/Excel';
        }
        return '.frx/.rpt trong Templates/Frx/External → Frx → Rpt/External → Rpt';
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

        // Check FastReport templates (ưu tiên cho PDF): Frx/External → Frx
        for (const sub of ['External', '']) {
            const frxPath = path.join(templatesPath, 'Frx', sub, `${fileName}.frx`);
            if (this.fileExists(frxPath)) {
                results.push({ path: frxPath, type: 'FastReport' });
            }
        }

        // Check Crystal Reports templates: Rpt/External → Rpt
        for (const sub of ['External', '']) {
            const rptPath = path.join(templatesPath, 'Rpt', sub, `${fileName}.rpt`);
            if (this.fileExists(rptPath)) {
                results.push({ path: rptPath, type: 'Crystal Reports' });
            }
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