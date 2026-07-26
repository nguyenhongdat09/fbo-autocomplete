const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { checkEntityErrors } = require('./entityResolverChecking');
const { is_valid_project_root, normalize_to_project_root } = require('./SourcePathHelper');
const { generate_missing_files } = require('./LinkGenerateService');

let current_panel = null;

class CheckingErrorPanel {
    static create_or_show(context, treeDataProvider, checked_files, sources) {
        if (current_panel) {
            current_panel.reveal();
            current_panel.checked_files = checked_files;
            current_panel.sources = normalize_sources(sources);
            current_panel.run_check_and_render('Đã mở lại Checking Error');
            return current_panel;
        }
        current_panel = new CheckingErrorPanel(context, treeDataProvider, checked_files, sources);
        return current_panel;
    }

    constructor(context, treeDataProvider, checked_files, sources) {
        this.context = context;
        this.treeDataProvider = treeDataProvider;
        this.checked_files = checked_files || [];
        this.sources = normalize_sources(sources);
        this.last_result = null;
        this.webview_ready = false;
        this.pending_status_text = '';
        this.disposables = [];

        this.panel = vscode.window.createWebviewPanel(
            'fboCheckingError',
            'Checking Error',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'ReadXMLByJS', 'CheckingError', 'media'))
                ]
            }
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(msg => this.on_message(msg), null, this.disposables);
        this.panel.webview.html = this.get_html();
        // Không postMessage ngay — đợi webview gửi { type: 'ready' }
        this.pending_status_text = '';
    }

    reveal() {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    dispose() {
        current_panel = null;
        while (this.disposables.length) {
            try { this.disposables.pop().dispose(); } catch (e) {}
        }
    }

    get_html() {
        const media_root = path.join(this.context.extensionPath, 'src', 'ReadXMLByJS', 'CheckingError', 'media');
        let html = fs.readFileSync(path.join(media_root, 'checkingError.html'), 'utf8');
        const style_uri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(media_root, 'checkingError.css')));
        const script_uri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(media_root, 'checkingError.js')));
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src ${this.panel.webview.cspSource};">`;
        return html
            .replace('{{CSP_META}}', csp)
            .replace('{{STYLE_URI}}', String(style_uri))
            .replace('{{SCRIPT_URI}}', String(script_uri));
    }

    async run_check_and_render(status_text) {
        if (!this.webview_ready) {
            this.pending_status_text = status_text || '';
            return;
        }

        this.panel.webview.postMessage({ type: 'loading', status_text: 'Đang xử lý...' });

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Checking Error...",
            cancellable: false
        }, async (progress) => {
            await new Promise(r => setTimeout(r, 50));
            this.last_result = checkEntityErrors(this.checked_files, this.sources);
        });

        const generate_enabled = !!(
            this.last_result.summary.missing_count > 0 &&
            this.last_result.summary.all_missing_have_source
        );

        this.panel.webview.postMessage({
            type: 'state',
            payload: {
                sources: this.sources,
                result: this.last_result,
                generate_enabled,
                status_text: status_text || ''
            }
        });
    }

    async on_message(msg) {
        if (!msg || !msg.type) return;
        switch (msg.type) {
            case 'ready': {
                this.webview_ready = true;
                this.run_check_and_render(this.pending_status_text || '');
                this.pending_status_text = '';
                break;
            }
            case 'pick_source': {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: `Chọn Nguồn ${(msg.source_index || 0) + 1}`
                });
                if (!picked || !picked[0]) return;
                const folder = normalize_to_project_root(picked[0].fsPath) || picked[0].fsPath;
                const sample = this.checked_files[0];
                if (!is_valid_project_root(folder, sample)) {
                    vscode.window.showErrorMessage('Path nguồn không hợp lệ (không map được kiểu group CustomerPro như TreeFile).');
                    this.run_check_and_render('Nguồn không hợp lệ — giữ nguồn cũ.');
                    return;
                }
                this.sources[msg.source_index] = folder;
                this.run_check_and_render(`Đã cập nhật Nguồn ${msg.source_index + 1}: ${folder}`);
                break;
            }
            case 'set_source': {
                const raw_folder = (msg.path || '').trim();
                if (!raw_folder) {
                    this.sources[msg.source_index] = '';
                    this.run_check_and_render();
                    return;
                }
                const folder = normalize_to_project_root(raw_folder) || raw_folder;
                const sample = this.checked_files[0];
                if (!is_valid_project_root(folder, sample)) {
                    vscode.window.showErrorMessage('Path nguồn không hợp lệ.');
                    // Đẩy lại state để input sync về nguồn đang giữ
                    this.run_check_and_render('Path nguồn không hợp lệ — đã khôi phục.');
                    return;
                }
                this.sources[msg.source_index] = folder;
                this.run_check_and_render();
                break;
            }
            case 'add_source': {
                this.sources.push('');
                this.run_check_and_render('Đã thêm nguồn mới');
                break;
            }
            case 'run_check': {
                this.run_check_and_render('Đã chạy lại Checking Error');
                break;
            }
            case 'generate': {
                if (
                    !this.last_result ||
                    !(this.last_result.summary.missing_count > 0) ||
                    !this.last_result.summary.all_missing_have_source
                ) {
                    vscode.window.showWarningMessage('Chưa đủ nguồn cho mọi file thiếu — không thể Generate.');
                    return;
                }
                this.panel.webview.postMessage({ type: 'loading', status_text: 'Đang copy file...' });
                
                let gen;
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating Files...",
                    cancellable: false
                }, async (progress) => {
                    await new Promise(r => setTimeout(r, 50));
                    gen = await generate_missing_files(this.last_result.table1_missing, this.treeDataProvider);
                });

                await this.run_check_and_render(`Generate xong: copy ${gen.copied}, lỗi ${gen.failed}. Đã check lại.`);
                break;
            }
            case 'open_entity_decl': {
                const row = this.last_result && this.last_result.table2_entities
                    ? this.last_result.table2_entities[msg.row_index]
                    : null;
                if (!row || row.status !== 'ok' || !row.decl_file) {
                    vscode.window.showWarningMessage('Không có vị trí khai báo bên nguồn.');
                    return;
                }
                const doc = await vscode.workspace.openTextDocument(row.decl_file);
                const editor = await vscode.window.showTextDocument(doc, { preview: false });
                const line = Math.max(0, (row.decl_line || 1) - 1);
                const pos = new vscode.Position(line, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                break;
            }
            default:
                break;
        }
    }
}

function normalize_sources(sources) {
    const list = Array.isArray(sources) ? sources.slice() : [];
    while (list.length < 2) list.push('');
    return list;
}

module.exports = { CheckingErrorPanel };
