// @ts-nocheck

const vscode = require("vscode");
const DocumentParser = require("../utils/DocumentParser");

/**
 * Hover trên dòng <form reportFile="..."> — hiện link mở template.
 */
class ReportTemplateHoverProvider {
    /**
     * @param {import('./ReportTemplateCommandProvider')} commandProvider
     */
    constructor(commandProvider) {
        this.commandProvider = commandProvider;
    }

    /**
     * @param {import('vscode').TextDocument} document
     * @param {import('vscode').Position} position
     */
    provideHover(document, position) {
        if (!document || document.languageId !== "xml") {
            return null;
        }

        const form = ReportTemplateHoverProvider._getFormAtLine(document, position.line);
        if (!form) {
            return null;
        }

        const cmdArg = form.commandArgument || "pdf";
        const appName = String(cmdArg).toLowerCase() === "excel" ? "Excel" : "Crystal Reports";
        const attrLabel = form.fileType === "templateFile" ? "templateFile" : "reportFile";

        const payload = encodeURIComponent(JSON.stringify([
            document.uri.fsPath,
            form.fileName,
            cmdArg,
        ]));

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;
        md.appendMarkdown(`**${attrLabel}:** \`${form.fileName}\`  \n`);
        md.appendMarkdown(`**commandArgument:** \`${cmdArg}\` → ${appName}  \n\n`);
        md.appendMarkdown(
            `[$(file-symlink-file) Open template](command:fbo-autocomplete.openReportTemplate?${payload})&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;[$(folder-opened) Reveal in Explorer](command:fbo-autocomplete.revealReportTemplate?${payload})`
        );

        return new vscode.Hover(md);
    }

    /**
     * @param {import('vscode').TextDocument} document
     * @param {number} line
     */
    static _getFormAtLine(document, line) {
        const lineText = document.lineAt(line).text;
        if (!/<form\b/i.test(lineText)) {
            return null;
        }

        const forms = DocumentParser.parseReportFormTags(document);
        const onLine = forms.filter((f) => f.line === line);
        if (!onLine.length) {
            return null;
        }

        // Ưu tiên reportFile nếu có cả hai trên cùng dòng
        return onLine.find((f) => f.fileType === "reportFile") || onLine[0];
    }
}

module.exports = ReportTemplateHoverProvider;
