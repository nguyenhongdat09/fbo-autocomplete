// File: src/DBQuery/QueryResultPanel.js
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

/**
 * Ưu tiên vendor trong media (VSIX nhẹ); fallback node_modules (dev / bản cũ).
 * @param {string} extRoot extensionPath
 * @param {string} rootMedia vd. src/DBQuery/media
 */
function resolveAgGridAssetPaths(extRoot, rootMedia) {
    const vendorDir = path.join(extRoot, rootMedia, "vendor", "ag-grid");
    const vJs = path.join(vendorDir, "ag-grid-community.min.js");
    const vBase = path.join(vendorDir, "ag-grid.min.css");
    const vBalham = path.join(vendorDir, "ag-theme-balham.min.css");
    if (fs.existsSync(vJs) && fs.existsSync(vBase) && fs.existsSync(vBalham)) {
        return {
            agJs: vJs,
            agCssBase: vBase,
            agCssBalham: vBalham,
            fromNodeModules: false,
        };
    }
    const nm = path.join(extRoot, "node_modules", "ag-grid-community");
    const nJs = path.join(nm, "dist", "ag-grid-community.min.js");
    const nBase = path.join(nm, "styles", "ag-grid.min.css");
    const nBalham = path.join(nm, "styles", "ag-theme-balham.min.css");
    if (fs.existsSync(nJs) && fs.existsSync(nBase) && fs.existsSync(nBalham)) {
        return {
            agJs: nJs,
            agCssBase: nBase,
            agCssBalham: nBalham,
            fromNodeModules: true,
        };
    }
    throw new Error(
        "Không tìm thấy AG Grid (vendor hoặc node_modules). " +
            "Chạy `npm run vendor:ag-grid` rồi `npm run build` và đóng gói lại VSIX; " +
            "hoặc `npm install` để có ag-grid-community. " +
            "Kỳ vọng: src/DBQuery/media/vendor/ag-grid/*.min.* hoặc node_modules/ag-grid-community/."
    );
}

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

        const tk = vscode.ColorThemeKind;
        const kind = vscode.window.activeColorTheme.kind;
        const theme =
            kind === tk.Dark || kind === tk.HighContrast ? "dark" : "light";
        this.currentResults = Object.assign({}, queryResults, { theme });

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

        const extPath = this.context.extensionPath;
        const mediaRoot = path.join(extPath, this.rootMedia);
        const agDist = path.join(extPath, "node_modules", "ag-grid-community", "dist");
        const agStyles = path.join(extPath, "node_modules", "ag-grid-community", "styles");
        const localResourceRoots = [vscode.Uri.file(mediaRoot)];
        if (fs.existsSync(agDist)) {
            localResourceRoots.push(vscode.Uri.file(agDist));
        }
        if (fs.existsSync(agStyles)) {
            localResourceRoots.push(vscode.Uri.file(agStyles));
        }

        this.panel = vscode.window.createWebviewPanel(
            'queryResult',
            '📊 Query Results',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots,
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
        const html = this.getHtmlContent(this.panel.webview);
        console.log('HTML length:', html.length);

        console.log('Setting webview HTML...');
        this.panel.webview.html = html;
        console.log('Webview HTML set');
    }

    // File: src/DBQuery/QueryResultPanel.js

    /**
     * @param {vscode.Webview} webview
     */
    getHtmlContent(webview) {
        console.log('Building HTML content...');

        const extRoot = this.context.extensionPath;
        const { agJs, agCssBase, agCssBalham } = resolveAgGridAssetPaths(
            extRoot,
            this.rootMedia
        );

        const htmlPath = path.join(extRoot, `${this.rootMedia}/html/ssms-table.html`);

        if (!fs.existsSync(htmlPath)) {
            throw new Error(`HTML template not found: ${htmlPath}`);
        }

        let html = fs.readFileSync(htmlPath, "utf8");

        try {
            const csp = webview.cspSource;
            html = html.replace(
                "{{CSP_META}}",
                `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; script-src ${csp} 'unsafe-inline'; font-src ${csp} data:; img-src ${csp} https: data:;">`
            );

            const uriJs = webview.asWebviewUri(vscode.Uri.file(agJs));
            const uriCss0 = webview.asWebviewUri(vscode.Uri.file(agCssBase));
            if (!fs.existsSync(agCssBalham)) {
                throw new Error(`AG Grid theme CSS không tồn tại: ${agCssBalham}`);
            }
            const uriBalham = webview.asWebviewUri(vscode.Uri.file(agCssBalham));

            html = html.replace(
                "{{AG_GRID_STYLES}}",
                `<link rel="stylesheet" href="${uriCss0}">\n<link rel="stylesheet" href="${uriBalham}">`
            );

            html = html.replace("{{AG_GRID_SCRIPT}}", `<script src="${uriJs}"></script>`);

            const cssPath = path.join(extRoot, `${this.rootMedia}/css/ssms-table.css`);
            if (!fs.existsSync(cssPath)) {
                throw new Error(`CSS file not found: ${cssPath}`);
            }
            const cssContent = fs.readFileSync(cssPath, "utf8");
            html = html.replace("{{CSS_URI}}", `<style>${cssContent}</style>`);

            const generateProcessingPath = path.join(extRoot, "src", "DBQuery", "GenerateProcessing.js");
            if (!fs.existsSync(generateProcessingPath)) {
                throw new Error(`JS file not found: ${generateProcessingPath}`);
            }
            let scriptsContent =
                `<script>\n// GenerateProcessing.js (DBQuery)\n${fs.readFileSync(
                    generateProcessingPath,
                    "utf8"
                )}\n</script>\n`;

            const generateHeaderToReportPath = path.join(extRoot, "src", "DBQuery", "GenerateHeaderToReport.js");
            if (!fs.existsSync(generateHeaderToReportPath)) {
                throw new Error(`JS file not found: ${generateHeaderToReportPath}`);
            }
            scriptsContent += `<script>\n// GenerateHeaderToReport.js (DBQuery)\n${fs.readFileSync(
                generateHeaderToReportPath,
                "utf8"
            )}\n</script>\n`;

            const jsFiles = ["config.js", "TabManager.js", "QueryResultsAgGrid.js"];
            jsFiles.forEach((file) => {
                const jsPath = path.join(extRoot, `${this.rootMedia}/js/${file}`);
                if (!fs.existsSync(jsPath)) {
                    throw new Error(`JS file not found: ${jsPath}`);
                }
                const jsContent = fs.readFileSync(jsPath, "utf8");
                scriptsContent += `<script>\n// ${file}\n${jsContent}\n</script>\n`;
            });

            html = html.replace("{{SCRIPTS}}", scriptsContent);

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
            case "copyToClipboard":
                if (message && typeof message.text === "string") {
                    const hint =
                        message && typeof message.hint === "string" ? message.hint : "Đã copy";
                    vscode.env.clipboard.writeText(message.text).then(() => {
                        vscode.window.setStatusBarMessage(`$(clippy) ${hint}`, 1800);
                    });
                }
                break;
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
            case "generateHeaderToDir": {
                const cols = message && message.columns;
                const fvRaw = message && message.fieldVariant;
                const fieldVariant =
                    fvRaw === "autocomplete" || fvRaw === "lookup" ? fvRaw : "normal";
                if (!Array.isArray(cols) || !cols.length) {
                    vscode.window.showInformationMessage(
                        "Chọn ít nhất một ô để lấy cột (Header To Dir)."
                    );
                    break;
                }
                (async () => {
                    try {
                        const { buildHeaderToDirXml } = require("./GenerateFieldDir");
                        const text = await buildHeaderToDirXml(cols, fieldVariant);
                        if (!text || !String(text).trim()) {
                            vscode.window.showInformationMessage(
                                "Không có tên cột hợp lệ để sinh XML (Dir)."
                            );
                            return;
                        }
                        await vscode.env.clipboard.writeText(text);
                        const hint =
                            fieldVariant === "normal"
                                ? "Normal"
                                : fieldVariant === "autocomplete"
                                  ? "Autocomplete (at)"
                                  : "Lookup (lk)";
                        vscode.window.setStatusBarMessage(
                            "$(clippy) Đã copy XML field (Header To Dir — " +
                                hint +
                                ", DB + fallback)",
                            2200
                        );
                    } catch (e) {
                        vscode.window.showErrorMessage(
                            "Header To Dir: " + (e && e.message ? e.message : String(e))
                        );
                    }
                })();
                break;
            }
            case "generateHeaderToGridInput": {
                const colsGi = message && message.columns;
                const fvGi = message && message.fieldVariant;
                const fieldVariantGi =
                    fvGi === "autocomplete" || fvGi === "lookup" ? fvGi : "normal";
                if (!Array.isArray(colsGi) || !colsGi.length) {
                    vscode.window.showInformationMessage(
                        "Chọn ít nhất một ô để lấy cột (Header To Grid Input)."
                    );
                    break;
                }
                (async () => {
                    try {
                        const { buildHeaderToGridInputXml } = require("./GenerateFieldGridInput");
                        const textGi = await buildHeaderToGridInputXml(colsGi, fieldVariantGi);
                        if (!textGi || !String(textGi).trim()) {
                            vscode.window.showInformationMessage(
                                "Không có tên cột hợp lệ để sinh XML (Grid Input)."
                            );
                            return;
                        }
                        await vscode.env.clipboard.writeText(textGi);
                        const hintGi =
                            fieldVariantGi === "normal"
                                ? "Normal"
                                : fieldVariantGi === "autocomplete"
                                  ? "Autocomplete (at)"
                                  : "Lookup (lk)";
                        vscode.window.setStatusBarMessage(
                            "$(clippy) Đã copy XML field (Header To Grid Input — " +
                                hintGi +
                                ", DB + fallback)",
                            2200
                        );
                    } catch (e) {
                        vscode.window.showErrorMessage(
                            "Header To Grid Input: " +
                                (e && e.message ? e.message : String(e))
                        );
                    }
                })();
                break;
            }
        }
    }


    
    refreshQuery() {
        if (!this.currentResults) return;
        vscode.window.showInformationMessage('Re-running query...');
    }
}

module.exports = QueryResultPanel;