// File: Definition/providers/ReportTemplateDefinitionProvider.js

const vscode = require('vscode');
const { exec } = require('child_process');
const DocumentParser = require('../utils/DocumentParser');
const PathResolver = require('../utils/PathResolver');

/**
 * Handles Ctrl+Click on reportFile or templateFile attributes
 * Opens corresponding .rpt or .xlsx/.xls template file with default application
 * 
 * Navigation logic:
 * - reportFile="DCTran_01" + commandArgument="Pdf" 
 *   => Open with Crystal Reports: .../Controllers/Templates/Rpt/DCTran_01.rpt
 * 
 * - templateFile="DCTran_01BI" + commandArgument="Excel"
 *   => Open with Excel: .../Controllers/Templates/Excel/DCTran_01BI.xlsx
 */
class ReportTemplateDefinitionProvider {
    provideDefinition(document, word, position) {
        const reportForms = DocumentParser.parseReportFormTags(document);
        const currentLine = position.line;
        const currentLineText = document.lineAt(currentLine).text;

        // Check if cursor is on a report file name
        for (const form of reportForms) {
            if (form.line !== currentLine) continue;
            if (form.fileName !== word) continue;

            // Verify cursor is actually on this specific file name
            if (!DocumentParser.isPositionInReportAttribute(
                position, 
                currentLine, 
                form.fileName, 
                currentLineText
            )) {
                continue;
            }

            // Open file with default application instead of returning Location
            this.openReportTemplateWithDefaultApp(
                document, 
                form.fileName, 
                form.commandArgument
            );

            // Return null to prevent VSCode from opening in editor
            return null;
        }

        return null;
    }

    /**
     * Open report template file with default application (Crystal Reports or Excel)
     */
    openReportTemplateWithDefaultApp(document, fileName, commandArgument) {
        const documentPath = document.uri.fsPath;

        // Try to find the specific template based on commandArgument
        const templatePath = PathResolver.resolveReportTemplatePath(
            documentPath,
            fileName,
            commandArgument
        );

        if (templatePath) {
            this.openFileWithDefaultApp(templatePath, commandArgument);
            return;
        }

        // If not found, try to find any template with this name
        const allTemplates = PathResolver.findAllReportTemplates(
            documentPath,
            fileName
        );

        if (allTemplates.length > 0) {
            // If multiple templates found, show quick pick
            if (allTemplates.length === 1) {
                this.openFileWithDefaultApp(allTemplates[0].path, allTemplates[0].type.toLowerCase());
            } else {
                this.showQuickPickAndOpen(allTemplates);
            }
            return;
        }

        // Show helpful error message
        const expectedType = (commandArgument || 'pdf').toLowerCase();
        const expectedFolder = expectedType === 'excel' ? 'Excel' : 'Rpt';
        const expectedExt = expectedType === 'excel' ? '.xlsx/.xls' : '.rpt';

        vscode.window.showErrorMessage(
            `Không tìm thấy template: ${fileName}${expectedExt} trong folder Templates/${expectedFolder}`
        );
    }

    /**
     * Open file with default application (Windows/Mac/Linux compatible)
     */
    openFileWithDefaultApp(filePath, fileType) {
        const platform = process.platform;
        let command;

        if (platform === 'win32') {
            // Windows: Use 'start' command
            command = `start "" "${filePath}"`;
        } else if (platform === 'darwin') {
            // macOS: Use 'open' command
            command = `open "${filePath}"`;
        } else {
            // Linux: Use 'xdg-open' command
            command = `xdg-open "${filePath}"`;
        }

        exec(command, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(
                    `Không thể mở file: ${filePath}\nError: ${error.message}`
                );
                console.error('Error opening file:', error);
                return;
            }

            // Show success message in status bar
            const fileTypeDisplay = fileType === 'excel' ? 'Excel' : 'Crystal Reports';
            vscode.window.setStatusBarMessage(
                `✓ Đã mở ${fileTypeDisplay}: ${require('path').basename(filePath)}`,
                3000
            );
        });
    }

    /**
     * Show quick pick menu and open selected template
     */
    async showQuickPickAndOpen(templates) {
        const items = templates.map(t => ({
            label: `${t.type}: ${require('path').basename(t.path)}`,
            description: t.path,
            detail: `Mở bằng ${t.type === 'PDF' ? 'Crystal Reports' : 'Excel'}`,
            path: t.path,
            type: t.type.toLowerCase()
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Chọn template để mở (sẽ mở bằng ứng dụng mặc định)',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected) {
            this.openFileWithDefaultApp(selected.path, selected.type);
        }
    }

    /**
     * Alternative method: Use VSCode's openExternal API
     * This is more reliable but may not work with all file types
     */
    async openFileWithVSCodeAPI(filePath) {
        try {
            const uri = vscode.Uri.file(filePath);
            const success = await vscode.env.openExternal(uri);
            
            if (success) {
                vscode.window.setStatusBarMessage(
                    `✓ Đã mở: ${require('path').basename(filePath)}`,
                    3000
                );
            } else {
                throw new Error('Failed to open file');
            }
        } catch (error) {
            vscode.window.showErrorMessage(
                `Không thể mở file: ${filePath}\nError: ${error.message}`
            );
        }
    }
}

module.exports = ReportTemplateDefinitionProvider;