const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const entityResolver = require('../ReadXMLByJS/entityResolver');

const panels = new Map(); // normalizedPath -> FormulaPreviewPanel

class FormulaPreviewPanel {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {string} file_path
     * @returns {FormulaPreviewPanel}
     */
    static createOrShow(context, file_path) {
        const normalized_path = path.normalize(file_path).toLowerCase();
        if (panels.has(normalized_path)) {
            const existing_panel = panels.get(normalized_path);
            existing_panel.reveal();
            existing_panel.refresh();
            return existing_panel;
        }

        const panel = new FormulaPreviewPanel(context, file_path);
        panels.set(normalized_path, panel);
        return panel;
    }

    constructor(context, file_path) {
        this.context = context;
        this.file_path = file_path;
        this.disposables = [];
        this.change_debounce_timer = null;
        this.is_ready = false;

        const file_name = path.basename(file_path);
        this.panel = vscode.window.createWebviewPanel(
            'formulaPreview',
            `Công thức: ${file_name}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'FormulaPreview', 'media')),
                    vscode.Uri.file(path.dirname(file_path))
                ]
            }
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(message => this.handleMessage(message), null, this.disposables);

        // Lắng nghe sự kiện lưu file
        const save_listener = vscode.workspace.onDidSaveTextDocument(doc => {
            const saved_path = path.normalize(doc.fileName).toLowerCase();
            const current_norm = path.normalize(this.file_path).toLowerCase();

            if (saved_path === current_norm || saved_path.includes(path.sep + 'controllers' + path.sep)) {
                entityResolver.invalidateCache(this.file_path);
                this.refresh();
            }
        });
        this.disposables.push(save_listener);

        // Lắng nghe thay đổi buffer (debounce 400ms)
        const change_listener = vscode.workspace.onDidChangeTextDocument(e => {
            if (path.normalize(e.document.fileName).toLowerCase() === path.normalize(this.file_path).toLowerCase()) {
                if (this.change_debounce_timer) {
                    clearTimeout(this.change_debounce_timer);
                }
                this.change_debounce_timer = setTimeout(() => {
                    this.refresh();
                }, 400);
            }
        });
        this.disposables.push(change_listener);

        // Khởi tạo nội dung HTML
        this.panel.webview.html = this.getHtmlContent();
    }

    reveal() {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    refresh() {
        try {
            if (!fs.existsSync(this.file_path)) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: `File không tồn tại: ${this.file_path}`
                });
                return;
            }

            let raw_text = '';
            const open_doc = vscode.workspace.textDocuments.find(
                d => path.normalize(d.fileName).toLowerCase() === path.normalize(this.file_path).toLowerCase()
            );
            if (open_doc) {
                raw_text = open_doc.getText();
            } else {
                raw_text = entityResolver.readFileContent(this.file_path);
            }

            // Gọi ModelBuilder (sẽ nạp từ parser ở Task 3)
            let model = null;
            try {
                const FormulaModelBuilder = require('./parser/FormulaModelBuilder');
                model = FormulaModelBuilder.build(this.file_path, raw_text);
            } catch (err) {
                // Fallback nếu ModelBuilder chưa implement đầy đủ
                model = {
                    version: 1,
                    source_path: this.file_path,
                    file_name: path.basename(this.file_path),
                    generated_at: new Date().toISOString(),
                    companion_dir_path: null,
                    warnings: [{ code: 'PARSE_SOFT', message: err.message }],
                    fields: {},
                    entries: [],
                    scenarios: [],
                    groups: ['qty_price', 'amount', 'discount', 'tax', 'fee', 'master', 'other'],
                    playground: { default_scenario_id: '', values: {} }
                };
            }

            if (this.is_ready) {
                this.panel.webview.postMessage({
                    type: 'formulaModel',
                    payload: model
                });
            } else {
                this.cached_model = model;
            }
        } catch (err) {
            console.error('[FormulaPreviewPanel] Refresh failed:', err);
        }
    }

    handleMessage(message) {
        if (!message) return;
        switch (message.type) {
            case 'ready':
                this.is_ready = true;
                if (this.cached_model) {
                    this.panel.webview.postMessage({
                        type: 'formulaModel',
                        payload: this.cached_model
                    });
                } else {
                    this.refresh();
                }
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'copy':
                if (message.text) {
                    vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('[Formula Preview] Đã sao chép vào clipboard.');
                }
                break;
            case 'error':
                vscode.window.showErrorMessage(`[Formula Preview] ${message.message}`);
                break;
        }
    }

    getHtmlContent() {
        const media_dir = path.join(this.context.extensionPath, 'src', 'FormulaPreview', 'media');
        const html_path = path.join(media_dir, 'preview.html');
        let html = fs.existsSync(html_path) ? fs.readFileSync(html_path, 'utf8') : '<html><body><div id="root"></div></body></html>';

        const bundle_on_disk = vscode.Uri.file(path.join(media_dir, 'bundle.js'));
        const bundle_uri = this.panel.webview.asWebviewUri(bundle_on_disk);

        const csp_source = this.panel.webview.cspSource;
        const csp_meta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp_source} 'unsafe-inline'; script-src ${csp_source}; font-src ${csp_source} data:; img-src ${csp_source} https: data:;">`;

        html = html.replace('{{CSP_META}}', csp_meta);
        html = html.replace('{{BUNDLE_URI}}', bundle_uri.toString());

        return html;
    }

    dispose() {
        const normalized_path = path.normalize(this.file_path).toLowerCase();
        panels.delete(normalized_path);

        if (this.change_debounce_timer) {
            clearTimeout(this.change_debounce_timer);
        }

        while (this.disposables.length) {
            const item = this.disposables.pop();
            if (item) item.dispose();
        }
    }
}

module.exports = FormulaPreviewPanel;
