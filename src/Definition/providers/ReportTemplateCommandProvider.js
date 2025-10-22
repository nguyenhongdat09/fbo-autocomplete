// File: Definition/providers/ReportTemplateCommandProvider.js

const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const DocumentParser = require('../utils/DocumentParser');
const PathResolver = require('../utils/PathResolver');

/**
 * Provides commands to open report templates
 * User must explicitly click or use command palette
 */
class ReportTemplateCommandProvider {
    constructor() {
        this.statusBarItem = null;
    }

    /**
     * Register commands and event listeners
     */
    register(context) {
        // Register command to open report template
        const openCommand = vscode.commands.registerCommand(
            'fbo-autocomplete.openReportTemplate',
            this.openReportTemplate.bind(this)
        );

        // Register selection change listener to show status bar
        const selectionListener = vscode.window.onDidChangeTextEditorSelection(
            this.onSelectionChange.bind(this)
        );

        context.subscriptions.push(openCommand, selectionListener);
    }

    /**
     * Handle selection change - show hint in status bar
     */
    onSelectionChange(event) {
        const editor = event.textEditor;
        if (!editor || editor.document.languageId !== 'xml') {
            this.hideStatusBar();
            return;
        }

        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        
        if (!wordRange) {
            this.hideStatusBar();
            return;
        }

        const word = editor.document.getText(wordRange);
        const reportInfo = this.getReportAtPosition(editor.document, word, position);

        if (reportInfo) {
            this.showStatusBar(reportInfo);
        } else {
            this.hideStatusBar();
        }
    }

    /**
     * Check if cursor is on a report file name
     */
    getReportAtPosition(document, word, position) {
        const reportForms = DocumentParser.parseReportFormTags(document);
        const currentLine = position.line;
        const currentLineText = document.lineAt(currentLine).text;

        for (const form of reportForms) {
            if (form.line !== currentLine) continue;
            if (form.fileName !== word) continue;

            if (DocumentParser.isPositionInReportAttribute(
                position, 
                currentLine, 
                form.fileName, 
                currentLineText
            )) {
                return {
                    fileName: form.fileName,
                    commandArgument: form.commandArgument,
                    documentPath: document.uri.fsPath
                };
            }
        }

        return null;
    }

    /**
     * Show hint in status bar
     */
    showStatusBar(reportInfo) {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right,
                100
            );
        }

        const fileType = (reportInfo.commandArgument || 'pdf').toLowerCase();
        const icon = fileType === 'excel' ? '📊' : '📄';
        const appName = fileType === 'excel' ? 'Excel' : 'Crystal Reports';

        this.statusBarItem.text = `${icon} Click để mở ${reportInfo.fileName} bằng ${appName}`;
        this.statusBarItem.tooltip = 'Nhấn Ctrl+Shift+O hoặc click vào đây';
        this.statusBarItem.command = 'fbo-autocomplete.openReportTemplate';
        this.statusBarItem.show();
    }

    /**
     * Hide status bar
     */
    hideStatusBar() {
        if (this.statusBarItem) {
            this.statusBarItem.hide();
        }
    }

    /**
     * Command handler - open report template
     */
    async openReportTemplate() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'xml') {
            return;
        }

        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
        
        if (!wordRange) {
            return;
        }

        const word = editor.document.getText(wordRange);
        const reportInfo = this.getReportAtPosition(editor.document, word, position);

        if (!reportInfo) {
            vscode.window.showWarningMessage('Không tìm thấy report template tại vị trí này');
            return;
        }

        this.openReportTemplateFile(
            reportInfo.documentPath,
            reportInfo.fileName,
            reportInfo.commandArgument
        );
    }

    /**
     * Open report template file with default application
     */
    openReportTemplateFile(documentPath, fileName, commandArgument) {
        const templatePath = PathResolver.resolveReportTemplatePath(
            documentPath,
            fileName,
            commandArgument
        );

        if (templatePath) {
            this.openFileWithDefaultApp(templatePath, commandArgument);
            return;
        }

        // Try to find any template
        const allTemplates = PathResolver.findAllReportTemplates(documentPath, fileName);

        if (allTemplates.length > 0) {
            if (allTemplates.length === 1) {
                this.openFileWithDefaultApp(allTemplates[0].path, allTemplates[0].type.toLowerCase());
            } else {
                this.showQuickPickAndOpen(allTemplates);
            }
            return;
        }

        // Show error
        const expectedType = (commandArgument || 'pdf').toLowerCase();
        const expectedFolder = expectedType === 'excel' ? 'Excel' : 'Rpt';
        const expectedExt = expectedType === 'excel' ? '.xlsx/.xls' : '.rpt';

        vscode.window.showErrorMessage(
            `Không tìm thấy template: ${fileName}${expectedExt} trong folder Templates/${expectedFolder}`
        );
    }

    /**
     * Open file with default application
     */
    openFileWithDefaultApp(filePath, fileType) {
        const platform = process.platform;
        let command;

        if (platform === 'win32') {
            command = `start "" "${filePath}"`;
        } else if (platform === 'darwin') {
            command = `open "${filePath}"`;
        } else {
            command = `xdg-open "${filePath}"`;
        }

        exec(command, (error) => {
            if (error) {
                vscode.window.showErrorMessage(
                    `Không thể mở file: ${path.basename(filePath)}\nError: ${error.message}`
                );
                return;
            }

            const fileTypeDisplay = fileType === 'excel' ? 'Excel' : 'Crystal Reports';
            vscode.window.setStatusBarMessage(
                `✓ Đã mở ${fileTypeDisplay}: ${path.basename(filePath)}`,
                3000
            );
        });
    }

    /**
     * Show quick pick and open selected template
     */
    async showQuickPickAndOpen(templates) {
        const items = templates.map(t => ({
            label: `${t.type}: ${path.basename(t.path)}`,
            description: t.path,
            detail: `Mở bằng ${t.type === 'PDF' ? 'Crystal Reports' : 'Excel'}`,
            path: t.path,
            type: t.type.toLowerCase()
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Chọn template để mở'
        });

        if (selected) {
            this.openFileWithDefaultApp(selected.path, selected.type);
        }
    }
}

module.exports = ReportTemplateCommandProvider;