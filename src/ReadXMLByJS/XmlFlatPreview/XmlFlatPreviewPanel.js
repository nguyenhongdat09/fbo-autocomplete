const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const XmlEntityExpander = require('./XmlEntityExpander');
const entityColorPalette = require('./entityColorPalette');
const entityResolver = require('../entityResolver');

const panels = new Map(); // filePath -> XmlFlatPreviewPanel

const entityHighlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 200, 0, 0.4)', // Vàng cam rõ nét
    isWholeLine: true
});

class XmlFlatPreviewPanel {
    /**
     * Tạo mới hoặc hiển thị panel cũ cho file XML tương ứng
     * @param {vscode.ExtensionContext} context
     * @param {string} file_path
     * @returns {XmlFlatPreviewPanel}
     */
    static createOrShow(context, file_path) {
        const normalized_path = path.normalize(file_path).toLowerCase();
        if (panels.has(normalized_path)) {
            const existing_panel = panels.get(normalized_path);
            existing_panel.reveal();
            existing_panel.refresh();
            return existing_panel;
        }

        const panel = new XmlFlatPreviewPanel(context, file_path);
        panels.set(normalized_path, panel);
        return panel;
    }
    
    constructor(context, file_path) {
        this.context = context;
        this.file_path = file_path;
        this.disposables = [];
        this.highlightTimeouts = [];
        
        this.settings = {
            word_wrap: true,
            show_line_numbers: true,
            highlight_entities: true
        };

        const file_name = path.basename(file_path);
        this.panel = vscode.window.createWebviewPanel(
            'xmlFlatPreview',
            `Preview: ${file_name}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'ReadXMLByJS', 'XmlFlatPreview', 'media')),
                    vscode.Uri.file(path.dirname(file_path))
                ]
            }
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(message => this.handleMessage(message), null, this.disposables);
        
        // Tự động reload khi người dùng lưu file nguồn hoặc DTD
        const save_listener = vscode.workspace.onDidSaveTextDocument(doc => {
            const saved_path = path.normalize(doc.fileName).toLowerCase();
            const current_norm = path.normalize(this.file_path).toLowerCase();
            
            if (saved_path === current_norm || saved_path.includes(path.sep + 'controllers' + path.sep)) {
                entityResolver.invalidateCache(this.file_path);
                this.refresh();
            }
        });
        this.disposables.push(save_listener);

        this.refresh();
    }

    reveal() {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    refresh() {
        try {
            if (!fs.existsSync(this.file_path)) {
                this.panel.webview.html = `<h3>Lỗi: File không tồn tại ${this.file_path}</h3>`;
                return;
            }
            
            // Ưu tiên đọc từ file đang mở (kể cả chưa lưu) để đồng bộ số dòng
            let raw_text = '';
            const open_doc = vscode.workspace.textDocuments.find(d => path.normalize(d.fileName).toLowerCase() === path.normalize(this.file_path).toLowerCase());
            if (open_doc) {
                raw_text = open_doc.getText();
            } else {
                raw_text = entityResolver.readFileContent(this.file_path);
            }

            const source_text = raw_text.replace(/\r\n/g, '\n');
            const model = XmlEntityExpander.expandXmlEntities(this.file_path, source_text);

            model.spans = model.spans.map(span => {
                const color_info = entityColorPalette.getEntityColor(span.entity_name);
                return Object.assign({}, span, {
                    color_hue: color_info.hue,
                    color_light: color_info.hsla_light,
                    color_dark: color_info.hsla_dark
                });
            });

            this.panel.webview.html = this.getHtmlContent(model);
        } catch (err) {
            console.error('[FBO XmlFlatPreview] Refresh panel failed:', err);
            this.panel.webview.html = `<h3>Lỗi phân tích cú pháp: ${err.message}</h3><pre>${err.stack}</pre>`;
        }
    }

    getHtmlContent(model) {
        const media_dir = path.join(this.context.extensionPath, 'src', 'ReadXMLByJS', 'XmlFlatPreview', 'media');
        
        let html = fs.readFileSync(path.join(media_dir, 'preview.html'), 'utf8');
        const css = fs.readFileSync(path.join(media_dir, 'preview.css'), 'utf8');
        const js = fs.readFileSync(path.join(media_dir, 'preview.js'), 'utf8');

        html = html.replace('{{STYLE}}', () => css);
        html = html.replace('{{SCRIPT}}', () => js);

        const csp_source = this.panel.webview.cspSource;
        html = html.replace('{{CSP_META}}', 
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp_source} 'unsafe-inline'; script-src ${csp_source} 'unsafe-inline'; font-src ${csp_source} data:; img-src ${csp_source} https: data:;">`
        );

        const theme_kind = vscode.window.activeColorTheme.kind;
        const theme_type = (theme_kind === vscode.ColorThemeKind.Dark || theme_kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
        
        const data_payload = {
            theme: theme_type,
            settings: this.settings,
            model: {
                source_file: model.source_file,
                flat_text: model.flat_text,
                spans: model.spans,
                warnings: model.warnings,
                stats: model.stats
            }
        };

        const safe_json = JSON.stringify(data_payload)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');

        const data_script = `
            <script>
                window.flatPreviewData = ${safe_json};
                window.vscode = acquireVsCodeApi();
            </script>
        `;
        html = html.replace('{{DATA}}', () => data_script);

        return html;
    }

    async handleMessage(message) {
        switch (message.type) {
            case 'copyToClipboard':
                if (message.text) {
                    await vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('Đã copy vào clipboard.');
                }
                break;
            case 'goToEntity':
                if (message.entity_name) {
                    this.goToEntityDeclaration(message.entity_name);
                }
                break;
            case 'goToSourceLine':
                if (message.file_path && message.line) {
                    this.goToSourceLine(message.file_path, message.line, message.entity_name);
                }
                break;
            case 'updateSettings':
                if (message.settings) {
                    this.settings = Object.assign({}, this.settings, message.settings);
                    this.refresh();
                }
                break;
            case 'showError':
                vscode.window.showErrorMessage(`[FBO XmlFlatPreview] ${message.message}`);
                break;
            case 'showWarning':
                vscode.window.showWarningMessage(`[FBO XmlFlatPreview] ${message.message}`);
                break;
        }
    }

    async goToEntityDeclaration(entity_name) {
        try {
            const general_entities = entityResolver.getEntitiesForFile(this.file_path);
            const ent_decl = general_entities ? general_entities[entity_name] : null;
            if (!ent_decl) {
                vscode.window.showWarningMessage(`Không tìm thấy khai báo cho thực thể: &${entity_name};`);
                return;
            }

            const target_file = ent_decl.sourceFile || this.file_path;
            if (!fs.existsSync(target_file)) {
                vscode.window.showErrorMessage(`File khai báo không tồn tại: ${target_file}`);
                return;
            }

            let doc = vscode.workspace.textDocuments.find(d => path.normalize(d.fileName).toLowerCase() === path.normalize(target_file).toLowerCase());
            if (!doc) {
                doc = await vscode.workspace.openTextDocument(target_file);
            }

            let editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
            if (!editor) {
                editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, true);
            } else {
                await vscode.window.showTextDocument(doc, editor.viewColumn, true);
            }

            const target_line = Math.max(0, (ent_decl.line || 1) - 1);
            const lineText = doc.lineAt(target_line).text;

            let startPos = new vscode.Position(target_line, 0);
            let endPos = new vscode.Position(target_line, lineText.length);

            if (ent_decl.text) {
                const declLines = ent_decl.text.split('\n');
                const firstLineOfDecl = declLines[0];
                const colStart = lineText.indexOf(firstLineOfDecl);
                if (colStart !== -1) {
                    const lastLineText = declLines[declLines.length - 1];
                    const endLine = target_line + declLines.length - 1;
                    const endCol = declLines.length === 1 ? colStart + lastLineText.length : lastLineText.length;
                    
                    startPos = new vscode.Position(target_line, colStart);
                    endPos = new vscode.Position(endLine, endCol);
                } else {
                    const nameIndex = lineText.indexOf(entity_name);
                    if (nameIndex !== -1) {
                        startPos = new vscode.Position(target_line, nameIndex);
                        endPos = new vscode.Position(target_line, nameIndex + entity_name.length);
                    }
                }
            }

            const range = new vscode.Range(startPos, endPos);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

            this.clearHighlightTimeouts();
            editor.setDecorations(entityHighlightDecorationType, []);
        } catch (err) {
            vscode.window.showErrorMessage(`Không thể điều hướng tới khai báo thực thể: ${err.message}`);
        }
    }

    async goToSourceLine(file_path, line_num, entity_name) {
        try {
            if (!fs.existsSync(file_path)) {
                vscode.window.showErrorMessage(`File không tồn tại: ${file_path}`);
                return;
            }

            let doc = vscode.workspace.textDocuments.find(d => path.normalize(d.fileName).toLowerCase() === path.normalize(file_path).toLowerCase());
            if (!doc) {
                doc = await vscode.workspace.openTextDocument(file_path);
            }

            let editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
            if (!editor) {
                editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, true);
            } else {
                await vscode.window.showTextDocument(doc, editor.viewColumn, true);
            }

            const target_line = Math.max(0, line_num - 1);
            const lineText = doc.lineAt(target_line).text;

            let startPos = new vscode.Position(target_line, 0);
            let endPos = new vscode.Position(target_line, lineText.length);

            // Thử tìm ref &entity_name; trong dòng
            const refStr = `&${entity_name};`;
            const refIndex = lineText.indexOf(refStr);
            if (refIndex !== -1) {
                startPos = new vscode.Position(target_line, refIndex);
                endPos = new vscode.Position(target_line, refIndex + refStr.length);
            } else {
                const nameIndex = lineText.indexOf(entity_name);
                if (nameIndex !== -1) {
                    startPos = new vscode.Position(target_line, nameIndex);
                    endPos = new vscode.Position(target_line, nameIndex + entity_name.length);
                }
            }

            const range = new vscode.Range(startPos, endPos);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

            this.clearHighlightTimeouts();
            editor.setDecorations(entityHighlightDecorationType, []);
        } catch (err) {
            vscode.window.showErrorMessage(`Không thể điều hướng tới dòng nguồn: ${err.message}`);
        }
    }

    clearHighlightTimeouts() {
        if (this.highlightTimeouts) {
            this.highlightTimeouts.forEach(t => clearTimeout(t));
        }
        this.highlightTimeouts = [];
    }

    dispose() {
        const normalized_path = path.normalize(this.file_path).toLowerCase();
        panels.delete(normalized_path);

        this.clearHighlightTimeouts();

        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

module.exports = XmlFlatPreviewPanel;
