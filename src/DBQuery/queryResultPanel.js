const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class QueryResultPanel {
    constructor(context){
        this.rootMedia = 'src/DBQuery/media'
        this.context = context
        this.panel = vscode.window.createWebviewPanel(
            'queryResult',
            'Query Results (Preview)',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, this.rootMedia))]
            }
        );
    }

    show() {
        var htmlContent = this.loadHtml()
        htmlContent = this.invokeCss(htmlContent);
        this.panel.webview.html = htmlContent;
    }

    loadHtml() {
        const htmlPath = path.join(this.context.extensionPath, `${this.rootMedia}/html/table.html`);
        return fs.readFileSync(htmlPath, 'utf8');
    }

    invokeCss(htmlContent) {
        const cssPath = vscode.Uri.file(path.join(this.context.extensionPath, `${this.rootMedia}/css/table.css`));
        const cssUri = this.panel.webview.asWebviewUri(cssPath);
        return htmlContent.replace('../css/table.css', cssUri.toString());
    }

}

module.exports = QueryResultPanel;
