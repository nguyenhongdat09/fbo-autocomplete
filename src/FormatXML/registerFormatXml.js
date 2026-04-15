const vscode = require("vscode");
const { VKBeautify } = require("./vkXmlBeautify");

/**
 * @param {vscode.TextDocument} document
 * @returns {vscode.Range}
 */
function getFullDocumentRange(document) {
    const lastLine = document.lineCount - 1;
    return new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).range.end.character);
}

/**
 * Indent theo editor đang mở document hoặc workspace settings.
 * @param {vscode.TextDocument} document
 * @returns {number|string}
 */
function getIndentStep(document) {
    const ed = vscode.window.visibleTextEditors.find((e) => e.document === document);
    if (ed && ed.options) {
        if (ed.options.insertSpaces === false) {
            return "\t";
        }
        if (typeof ed.options.tabSize === "number") {
            return ed.options.tabSize;
        }
    }
    const cfg = vscode.workspace.getConfiguration("editor", document.uri);
    if (cfg.get("insertSpaces") === false) {
        return "\t";
    }
    return cfg.get("tabSize") || 4;
}

/**
 * Đăng ký format XML/XSL (vkBeautify) — thay thế extension mikeburgh.xml-format.
 * @param {vscode.ExtensionContext} context
 */
function registerFormatXml(context) {
    const beautify = new VKBeautify();

    const makeEdits = (document) => {
        const step = getIndentStep(document);
        const formatted = beautify.xml(document.getText(), step);
        return [vscode.TextEdit.replace(getFullDocumentRange(document), formatted)];
    };

    const xmlProvider = vscode.languages.registerDocumentFormattingEditProvider({ language: "xml" }, {
        provideDocumentFormattingEdits(document) {
            return makeEdits(document);
        },
    });

    const xslProvider = vscode.languages.registerDocumentFormattingEditProvider({ language: "xsl" }, {
        provideDocumentFormattingEdits(document) {
            return makeEdits(document);
        },
    });

    context.subscriptions.push(xmlProvider, xslProvider);
}

module.exports = { registerFormatXml, getIndentStep, getFullDocumentRange };
