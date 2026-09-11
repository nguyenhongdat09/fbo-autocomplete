const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { Presets } = require('./generator/Presets');
const { validateFormInput } = require('./generator/FormInputValidator');
const { XmlTemplateRenderer } = require('./generator/XmlTemplateRenderer');
const { SqlTemplateRenderer } = require('./generator/SqlTemplateRenderer');
const { createSqlTempFile } = require('../Utils/sqlTempFile');
const { autoTranslateFormTitles } = require('./generator/translateHelper');
const AppDataPathHelper = require('../TreeFile/AppDataPathHelper');

let current_panel = null;

class RetrieveFlowPanel {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {object} options
     */
    static createOrShow(context, options = {}) {
        if (current_panel) {
            current_panel.panel.reveal(vscode.ViewColumn.Beside);
            if (options.controllers_root) {
                current_panel.controllers_root = options.controllers_root;
            }
            if (options.sql_temp_folder) {
                current_panel.sql_temp_folder = options.sql_temp_folder;
            }
            return current_panel;
        }

        const panel = new RetrieveFlowPanel(context, options);
        current_panel = panel;
        return panel;
    }

    constructor(context, options) {
        this.context = context;
        this.controllers_root = options.controllers_root || '';
        this.sql_temp_folder = options.sql_temp_folder || '';
        this.active_file_path = options.active_file_path || '';
        this.disposables = [];

        this.xml_renderer = new XmlTemplateRenderer(context.extensionPath);
        this.sql_renderer = new SqlTemplateRenderer(context.extensionPath);

        this.panel = vscode.window.createWebviewPanel(
            'retrieveFlowDesigner',
            'Lấy dữ liệu: Mới',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'RetrieveFlow', 'media'))
                ]
            }
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(message => this.handleMessage(message), null, this.disposables);

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);
    }

    dispose() {
        current_panel = null;
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) d.dispose();
        }
    }

    getHtmlForWebview(webview) {
        const media_dir = path.join(this.context.extensionPath, 'src', 'RetrieveFlow', 'media');
        const html_path = path.join(media_dir, 'preview.html');
        let html = fs.readFileSync(html_path, 'utf8');

        const style_uri = webview.asWebviewUri(vscode.Uri.file(path.join(media_dir, 'retrieveFlow.css')));
        const script_uri = webview.asWebviewUri(vscode.Uri.file(path.join(media_dir, 'retrieveFlow.js')));

        html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
        html = html.replace(/\{\{styleUri\}\}/g, style_uri.toString());
        html = html.replace(/\{\{scriptUri\}\}/g, script_uri.toString());

        return html;
    }

    /**
     * Tự động xác định lại controllers_root nếu chưa có
     */
    resolveControllersRoot() {
        if (this.controllers_root && fs.existsSync(this.controllers_root)) {
            return this.controllers_root;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document && editor.document.uri.scheme === 'file') {
            const helper = new AppDataPathHelper(editor.document.fileName);
            const base_proj = helper.getBaseProjectPath();
            if (base_proj) {
                const candidate = path.join(base_proj, 'App_Data', 'Controllers');
                if (fs.existsSync(candidate)) {
                    this.controllers_root = candidate;
                    return candidate;
                }
            }
        }

        const config_root = vscode.workspace.getConfiguration('fbo-autocomplete').get('controllersRoot');
        if (config_root && fs.existsSync(config_root)) {
            this.controllers_root = config_root;
            return config_root;
        }

        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const candidate = path.join(folder.uri.fsPath, 'App_Data', 'Controllers');
                if (fs.existsSync(candidate)) {
                    this.controllers_root = candidate;
                    return candidate;
                }
            }
        }

        return '';
    }

    async handleMessage(message) {
        if (!message || !message.type) return;

        switch (message.type) {
            case 'ready': {
                const { YCNDXA, ZCWIMO } = require('./generator/Presets');
                this.panel.webview.postMessage({
                    type: 'init',
                    presets: {
                        ycndxa: YCNDXA,
                        zcwimo: ZCWIMO
                    }
                });
                break;
            }

            case 'preview': {
                try {
                    const form = message.form;
                    if (form && form.identity) {
                        this.panel.title = `Lấy dữ liệu: ${form.identity}`;
                    }

                    const validation = validateFormInput(form);
                    const xml = this.xml_renderer.render(form);
                    const sql = this.sql_renderer.render(form);

                    this.panel.webview.postMessage({
                        type: 'previewResult',
                        xml,
                        sql,
                        warnings: validation.warnings,
                        errors: validation.errors
                    });
                } catch (err) {
                    this.panel.webview.postMessage({
                        type: 'previewResult',
                        error: err.message
                    });
                }
                break;
            }

            case 'generate': {
                await this.handleGenerate(message.form);
                break;
            }
        }
    }

    async handleGenerate(form) {
        try {
            // 1. Validation
            const validation = validateFormInput(form);
            if (!validation.valid) {
                vscode.window.showErrorMessage(`Không thể generate: ${validation.errors.join('; ')}`);
                this.panel.webview.postMessage({
                    type: 'error',
                    message: validation.errors.join('; ')
                });
                return;
            }

            // 2. Resolve controllers_root
            const controllers_dir = this.resolveControllersRoot();
            if (!controllers_dir) {
                const msg = "Không tìm thấy thư mục Controllers. Vui lòng mở 1 file XML trong thư mục App_Data của dự án FBO hoặc cấu hình 'fbo-autocomplete.controllersRoot'.";
                vscode.window.showErrorMessage(msg);
                this.panel.webview.postMessage({ type: 'error', message: msg });
                return;
            }

            // 3. Auto translate titles to English if missing
            await autoTranslateFormTitles(form);

            // 4. Render contents
            const xml_map = this.xml_renderer.render(form);
            const sql_content = this.sql_renderer.render(form);

            const identity = form.identity;
            const target_files = [
                {
                    folder: path.join(controllers_dir, 'Filter'),
                    name: `${identity}Filter.xml`,
                    content: xml_map.Filter
                },
                {
                    folder: path.join(controllers_dir, 'Filter'),
                    name: `${identity}MultiForm.xml`,
                    content: xml_map.MultiForm
                },
                {
                    folder: path.join(controllers_dir, 'Grid'),
                    name: `${identity}MultiGrid.xml`,
                    content: xml_map.MultiGrid
                },
                {
                    folder: path.join(controllers_dir, 'Lookup'),
                    name: `${identity}Lookup.xml`,
                    content: xml_map.Lookup
                }
            ];

            // 4. Check existing files for overwrite prompt
            const existing_files = target_files.filter(f => fs.existsSync(path.join(f.folder, f.name)));
            let overwrite_mode = 'all'; // 'all' | 'skip'

            if (existing_files.length > 0) {
                const names = existing_files.map(f => f.name).join(', ');
                const choice = await vscode.window.showWarningMessage(
                    `Các file sau đã tồn tại trong Controllers: ${names}. Bạn muốn xử lý như thế nào?`,
                    { modal: true },
                    'Ghi đè tất cả',
                    'Bỏ qua file có sẵn',
                    'Hủy'
                );

                if (!choice || choice === 'Hủy') {
                    this.panel.webview.postMessage({ type: 'error', message: 'Người dùng đã hủy thao tác.' });
                    return;
                }

                if (choice === 'Bỏ qua file có sẵn') {
                    overwrite_mode = 'skip';
                }
            }

            // 5. Write XML files
            const paths_written = [];
            const errors = [];
            const skipped = [];

            for (const file of target_files) {
                const full_path = path.join(file.folder, file.name);
                const is_exist = fs.existsSync(full_path);

                if (is_exist && overwrite_mode === 'skip') {
                    skipped.push(full_path);
                    continue;
                }

                try {
                    if (!fs.existsSync(file.folder)) {
                        fs.mkdirSync(file.folder, { recursive: true });
                    }
                    fs.writeFileSync(full_path, file.content, 'utf8');
                    paths_written.push(full_path);
                } catch (err) {
                    errors.push(`Lỗi ghi file ${file.name}: ${err.message}`);
                }
            }

            // 6. Write SQL temp file (bắt buộc giống NewSqlTemp)
            const config = vscode.workspace.getConfiguration('fbo-autocomplete');
            const sql_folder = this.sql_temp_folder || config.get('sqlTempFolder');
            let created_sql_path = '';

            if (!sql_folder) {
                const msg = `Chưa cấu hình đường dẫn thư mục tạo file .sql. Vui lòng cấu hình 'fbo-autocomplete.sqlTempFolder' trong Settings.`;
                vscode.window.showErrorMessage(msg);
                errors.push(msg);
            } else if (!fs.existsSync(sql_folder)) {
                const msg = `Thư mục '${sql_folder}' không tồn tại. Vui lòng kiểm tra lại cấu hình 'fbo-autocomplete.sqlTempFolder'.`;
                vscode.window.showErrorMessage(msg);
                errors.push(msg);
            } else {
                try {
                    const res = createSqlTempFile(sql_folder, `${identity}_retrieve`, sql_content);
                    created_sql_path = res.filePath;
                    paths_written.push(created_sql_path);
                } catch (err) {
                    const msg = `Không thể tạo file SQL tạm: ${err.message}`;
                    vscode.window.showErrorMessage(msg);
                    errors.push(msg);
                }
            }

            // 7. Mở mọi file vừa ghi (XML theo thứ tự Filter, MultiForm, MultiGrid, Lookup và cuối cùng là SQL)
            for (let i = 0; i < paths_written.length; i++) {
                const p = paths_written[i];
                try {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
                    const preserveFocus = (i < paths_written.length - 1);
                    await vscode.window.showTextDocument(doc, { preview: false, preserveFocus });
                } catch (openErr) {
                    console.error('Không thể mở file vừa tạo:', p, openErr);
                }
            }

            // 8. Notify webview & toast
            this.panel.webview.postMessage({
                type: 'generated',
                paths: paths_written,
                errors,
                skipped
            });

            if (errors.length === 0) {
                vscode.window.showInformationMessage(`🎉 Đã tạo thành công ${paths_written.length} file FlowMulti cho ${identity}!`);
            } else {
                vscode.window.showWarningMessage(`XML đã ghi; SQL chưa tạo: ${errors.join('; ')}`);
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Lỗi trong quá trình generate: ${err.message}`);
            this.panel.webview.postMessage({
                type: 'error',
                message: err.message
            });
        }
    }
}

module.exports = RetrieveFlowPanel;
