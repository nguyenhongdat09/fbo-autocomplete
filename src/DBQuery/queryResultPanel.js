// File: src/DBQuery/QueryResultPanel.js
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
class QueryResultPanel {
    // Add static property to track panel
    static currentPanel = null;

    constructor(context) {
        this.rootMedia = 'src/DBQuery/media';
        this.context = context;
        this.panel = null;
        this.currentResults = null;
    }

    show(queryResults) {
        console.log('QueryResultPanel.show() called');
        console.log('Query results:', queryResults);

        this.currentResults = queryResults;

        try {
            // ✅ Close existing panel if exists
            if (QueryResultPanel.currentPanel && QueryResultPanel.currentPanel !== this) {
                console.log('Disposing old panel...');
                QueryResultPanel.currentPanel.dispose();
            }

            // Create or reveal panel
            if (!this.panel) {
                console.log('Creating new panel...');
                this.createPanel();
                QueryResultPanel.currentPanel = this;
            } else {
                console.log('Revealing existing panel...');
                this.panel.reveal(vscode.ViewColumn.Beside);
            }

            // Update content
            console.log('Updating content...');
            this.updateContent();
            console.log('Panel shown successfully');

        } catch (error) {
            console.error('Error showing panel:', error);
            vscode.window.showErrorMessage('Error showing results: ' + error.message);
        }
    }

    createPanel() {
        console.log('Creating webview panel...');

        this.panel = vscode.window.createWebviewPanel(
            'queryResult',
            '📊 Query Results',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, this.rootMedia))
                ]
            }
        );

        console.log('Panel created:', !!this.panel);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => this.handleWebviewMessage(message),
            undefined,
            this.context.subscriptions
        );

        // Cleanup on close
        this.panel.onDidDispose(
            () => {
                console.log('Panel disposed');
                this.panel = null;
                this.currentResults = null;

                if (QueryResultPanel.currentPanel === this) {
                    QueryResultPanel.currentPanel = null;
                }
            },
            null,
            this.context.subscriptions
        );
    }

    // ✅ Add dispose method
    dispose() {
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
            this.currentResults = null;
        }
    }

    updateContent() {
        if (!this.panel) {
            console.error('Cannot update content: panel is null');
            return;
        }

        console.log('Getting HTML content...');
        const html = this.getHtmlContent();
        console.log('HTML length:', html.length);

        console.log('Setting webview HTML...');
        this.panel.webview.html = html;
        console.log('Webview HTML set');
    }

    // File: src/DBQuery/QueryResultPanel.js

    getHtmlContent() {
        console.log('Building HTML content...');

        const htmlPath = path.join(
            this.context.extensionPath,
            `${this.rootMedia}/html/ssms-table.html`
        );

        console.log('HTML path:', htmlPath);

        if (!fs.existsSync(htmlPath)) {
            const error = `HTML template not found: ${htmlPath}`;
            console.error(error);
            throw new Error(error);
        }

        let html = fs.readFileSync(htmlPath, 'utf8');
        console.log('HTML template loaded, length:', html.length);

        try {
            // Inline CSS
            const cssPath = path.join(this.context.extensionPath, `${this.rootMedia}/css/ssms-table.css`);
            console.log('CSS path:', cssPath);

            if (!fs.existsSync(cssPath)) {
                throw new Error(`CSS file not found: ${cssPath}`);
            }

            const cssContent = fs.readFileSync(cssPath, 'utf8');
            console.log('CSS loaded, length:', cssContent.length);
            html = html.replace('{{CSS_URI}}', `<style>${cssContent}</style>`);

            // Inline JS files
            const jsFiles = ['config.js', 'ContextMenu.js', 'TabManager.js', 'SSMSTable.js'];
            let scriptsContent = '';

            jsFiles.forEach(file => {
                const jsPath = path.join(this.context.extensionPath, `${this.rootMedia}/js/${file}`);
                console.log('Loading JS:', file, 'exists:', fs.existsSync(jsPath));

                if (!fs.existsSync(jsPath)) {
                    throw new Error(`JS file not found: ${jsPath}`);
                }

                const jsContent = fs.readFileSync(jsPath, 'utf8');
                scriptsContent += `<script>\n// ${file}\n${jsContent}\n</script>\n`;
            });

            console.log('Scripts loaded, total length:', scriptsContent.length);
            html = html.replace('{{SCRIPTS}}', scriptsContent);

            // Inject data
            console.log('Injecting data...');
            const dataScript = `
            <script>
                console.log('Data script executing...');
                window.queryResults = ${JSON.stringify(this.currentResults)};
                window.vscode = acquireVsCodeApi();
                console.log('Query results injected:', window.queryResults);
            </script>
        `;
            html = html.replace('{{DATA}}', dataScript);

            console.log('Final HTML length:', html.length);
            return html;

        } catch (error) {
            console.error('Error building HTML:', error);
            // ✅ Don't use vscode.window here
            // ✅ Don't use vscode.window here - just throw the error
            throw error;
        }
    }

    handleWebviewMessage(message) {
        switch (message.command) {
            case 'refresh':
                this.refreshQuery();
                break;
            case 'error':
                console.error('[WebView Error]', message.message);
                // ✅ This is OK - we're in extension context
                vscode.window.showErrorMessage(message.message);
                break;
            case 'info':
                console.log('[WebView Info]', message.message);
                vscode.window.showInformationMessage(message.message);
                break;
            case 'log':
                console.log('[WebView]', message.message);
                break;
        }
    }


    
    refreshQuery() {
        if (!this.currentResults) return;
        vscode.window.showInformationMessage('Re-running query...');
    }
}

module.exports = QueryResultPanel;