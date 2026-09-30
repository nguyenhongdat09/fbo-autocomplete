const vscode = require('vscode');
const path = require('path');
const { Worker } = require('worker_threads');
const { escapeRegExp } = require('./CheckLegacyUtils');
const { replaceEntity, getEntityContentsForDoc } = require('./CheckLegacyEntity');
const { checkLegacyItem, getFieldOnFields, getFieldOnView } = require('./CheckLegacyFields');
const { checkStructureRules } = require('./CheckLegacyStructure');
const { checkGridRules } = require('./CheckLegacyGrid');

class CheckLegacyCode {
    /** @param {vscode.ExtensionContext} context */
    constructor(context) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("checkLegacyCode");
        // Status bar: toggle On/Off check legacy khi save + nút check full toàn bộ rule
        // (không tạo item spinner riêng — show/hide nó làm nút Check Legacy nhảy vị trí, gây click hụt;
        //  trạng thái đang check hiển thị ngay trên text của fullCheckItem)
        this.toggleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this.toggleItem.command = 'fbo-autocomplete.toggleCheckLegacy';
        this.fullCheckItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        this.fullCheckItem.command = 'fbo-autocomplete.CheckLegacyDirFilter';
        this.fullCheckItem.text = '$(search) Check Legacy';
        this.fullCheckItem.tooltip = 'Check toàn bộ rule legacy cho file Dir/Filter/Grid đang mở';
        this.fullCheckItem.show();
        context.subscriptions.push(this.toggleItem, this.fullCheckItem);
        this.refreshToggleItem();
        this.currentCheckId = 0;
        // Single-flight: đang check mà bấm/save tiếp → chỉ gom 1 lần chạy lại,
        // không xếp hàng N task worker (click nhanh trước đây nhân đôi thời gian chờ)
        this._checking = false;
        /** @type {string|undefined|null} mode của lần chạy lại đang chờ ('save'|'full') */
        this._rerunAfterCheck = null;
        // Worker thread: check entity/expand/rules ngoài main thread → Ctrl+S không bị block
        this._worker = null;
        this._workerDisabled = false;
        this._taskSeq = 0;
        /** @type {Map<number, {resolve:Function, reject:Function, type:string}>} */
        this._pendingTasks = new Map();
        // Spawn sớm: trả chi phí khởi tạo lúc activate, không phải lúc save đầu tiên
        this._ensureWorker();
    }

    _ensureWorker() {
        if (this._workerDisabled) return null;
        if (this._worker) return this._worker;
        try {
            const w = new Worker(path.join(__dirname, "CheckLegacyWorker.js"));
            w.on("message", (msg) => {
                const p = this._pendingTasks.get(msg && msg.id);
                if (!p) return;
                this._pendingTasks.delete(msg.id);
                p.resolve(msg);
            });
            w.on("error", (err) => {
                console.warn("[CheckLegacy] worker error:", err && err.message);
                this._killWorker();
            });
            w.on("exit", () => {
                // Worker chết dù exit code nào cũng phải clear ref — giữ lại sẽ postMessage
                // vào worker zombie, task pending mãi → nút Check "không ăn"
                this._killWorker();
            });
            w.unref();
            this._worker = w;
            return w;
        } catch (err) {
            console.warn("[CheckLegacy] worker spawn failed — fallback inline:", err && err.message);
            this._workerDisabled = true;
            return null;
        }
    }

    _killWorker() {
        const w = this._worker;
        this._worker = null;
        // Cho phép retry 1 lần — lần sau vẫn crash thì disable hẳn (inline path)
        if (this._workerRetried) this._workerDisabled = true;
        this._workerRetried = true;
        for (const p of this._pendingTasks.values()) p.reject(new Error("worker died"));
        this._pendingTasks.clear();
        if (w) { try { w.terminate(); } catch { /* ignore */ } }
    }

    /** Gửi task sang worker. null nếu worker không khả dụng → caller fallback inline. */
    _sendTask(msg) {
        const w = this._ensureWorker();
        if (!w) return null;
        const id = ++this._taskSeq;
        return new Promise((resolve, reject) => {
            this._pendingTasks.set(id, { resolve, reject, type: msg.type });
            try {
                w.postMessage({ ...msg, id });
            } catch (err) {
                this._pendingTasks.delete(id);
                reject(err);
            }
        });
    }

    /**
     * Warm entity cache khi mở/chuyển sang file — warm trong worker để lúc save
     * check chỉ tra Map (entitySessionCache của worker tách biệt main thread).
     * @param {vscode.TextEditor | undefined} editor
     */
    async warmEntities(editor) {
        try {
            if (!editor) return;
            const dirPath = path.dirname(editor.document.uri.fsPath).replace(/\\/g, '/').toLowerCase();
            if (!(dirPath.includes('controllers/dir') || dirPath.includes('controllers/filter') || dirPath.includes('controllers/grid'))) return;
            if ((editor.document.languageId || '').toLowerCase() !== 'xml') return;
            const filePath = editor.document.uri.fsPath;
            const content = editor.document.getText();
            const doctypeMatch = content.match(/<!DOCTYPE\s+\w+[\s\S]*?\[[\s\S]*?\]\s*>/i);
            const doctype = doctypeMatch ? doctypeMatch[0] : '';
            // Đang có check chạy/chờ trong worker → warm thừa (check tự resolve entity),
            // bỏ qua để không làm nút Check Legacy phải xếp sau warm
            for (const t of this._pendingTasks.values()) { if (t.type === 'check') return; }
            const p = this._sendTask({ type: "warm", filePath, doctype });
            if (p) { try { await p; } catch { /* ignore */ } return; }
            await getEntityContentsForDoc(filePath, doctype); // worker chết → warm cache inline
        } catch (err) { /* warm best-effort, không ảnh hưởng check */ }
    }

    /** Cập nhật text nút toggle theo setting checkLegacyWhenSave */
    refreshToggleItem() {
        const on = vscode.workspace.getConfiguration('fbo-autocomplete').get('checkLegacyWhenSave', true);
        this.toggleItem.text = on ? '$(pass) Legacy On' : '$(circle-slash) Legacy Off';
        this.toggleItem.tooltip = `Check legacy khi lưu (Ctrl+S): ${on ? 'ON' : 'OFF'} — click để ${on ? 'tắt' : 'bật'}`;
        this.toggleItem.show();
    }

    /**
     * @param {'save'|'full'} [mode] 'save' = chỉ Dir/Filter, chỉ check field chưa khai báo + thừa/thiếu phần tử.
     * 'full' = check toàn bộ rule (gồm Grid, structure, field chưa xuống view) — dùng cho nút Check Legacy.
     */
    async run(mode) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const full = mode === 'full';

        const dirPath = path.dirname(editor.document.uri.fsPath).replace(/\\/g, '/').toLowerCase(); // 👈 chỉ lấy thư mục chứa file
        const isGrid = dirPath.includes('controllers/grid');
        if (!(dirPath.includes('controllers/dir') || dirPath.includes('controllers/filter') || isGrid)) {
            // Nút bấm (full) trên file không hợp lệ → báo rõ thay vì "click không ăn"
            if (full) vscode.window.showInformationMessage('Check Legacy: file đang mở không phải Dir/Filter/Grid XML.');
            return;
        }
        if (isGrid && !full) return; // save: bỏ qua Grid — Grid chỉ check khi bấm nút Check Legacy

        // Đang check mà bấm/save tiếp → gom thành đúng 1 lần chạy lại sau khi xong
        // (tránh xếp hàng N task full-check trong worker — mỗi click cũ từng nhân thêm thời gian chờ)
        if (this._checking) {
            if (full || this._rerunAfterCheck !== 'full') this._rerunAfterCheck = full ? 'full' : 'save';
            return;
        }
        this._checking = true;

        // Sinh ID cho lần chạy này để hủy bỏ (abort) nếu user bấm Ctrl+S liên tục
        this.currentCheckId++;
        const checkId = this.currentCheckId;

        this.fullCheckItem.text = "$(sync~spin) Checking…";

        const tStart = Date.now();
        try {
            await this._runCheck(editor, checkId, isGrid, full, tStart);
        } finally {
            this.fullCheckItem.text = '$(search) Check Legacy';
            this._checking = false;
            const rerun = this._rerunAfterCheck;
            this._rerunAfterCheck = null;
            if (rerun) {
                this.run(rerun).catch(err => console.warn("[CheckLegacy] rerun failed:", err && err.message));
            }
        }
    }

    /**
     * @param {vscode.TextEditor} editor
     * @param {number} checkId
     * @param {boolean} isGrid
     * @param {boolean} full
     * @param {number} tStart
     */
    async _runCheck(editor, checkId, isGrid, full, tStart) {
        const filePath = editor.document.uri.fsPath;
        const docUri = editor.document.uri;
        console.log("[FBO_PERF_DEBUG] [CheckLegacy] Running check for:", filePath);
        var originalContent = editor.document.getText();

        const doctypeMatch = originalContent.match(/<!DOCTYPE\s+\w+[\s\S]*?\[[\s\S]*?\]\s*>/i);
        const doctype = doctypeMatch ? doctypeMatch[0] : '';

        // === Worker path: check ngoài main thread ===
        const task = this._sendTask({ type: "check", filePath, content: originalContent, isGrid, doctype, full });
        if (task) {
            try {
                const res = await task;
                if (this.currentCheckId !== checkId) return;
                if (res.error) throw new Error(res.error);
                const diagnostics = (res.diags || []).map(d => new vscode.Diagnostic(
                    new vscode.Range(d.sl, d.sc, d.el, d.ec),
                    d.message,
                    d.severity != null ? d.severity : vscode.DiagnosticSeverity.Error
                ));
                this.diagnosticCollection.set(docUri, diagnostics);
                const t = res.timings || {};
                console.log(`[FBO_PERF_DEBUG] [CheckLegacy] END (worker) took ${Date.now() - tStart}ms — resolve:${t.resolve}ms expand:${t.expand}ms(${t.iters}it) rules:${t.rules}ms`);
                for (const m of res.errors || []) vscode.window.showErrorMessage(m);
                return;
            } catch (err) {
                console.warn("[CheckLegacy] worker check failed → inline:", err && err.message);
                // rơi xuống inline path bên dưới
            }
        }

        // === Inline path (fallback khi worker không khả dụng) ===
        var content = originalContent;

        // 🎯 Tối ưu: entity chỉ đổi khi DOCTYPE hoặc file .ent/include đổi → resolve 1 lần,
        // cache theo doctype để các lần save sau chỉ tốn statSync song song validate dep
        const entityContents = await getEntityContentsForDoc(filePath, doctype);
        if (this.currentCheckId !== checkId) return;

        // 🎯 Tối ưu: Chỉ trích xuất & giải mã Entity trong khối <fields> và <views> (bao gồm <category>)
        // Giúp bỏ qua toàn bộ phần SQL <query>, <commands>, <clientScript>... nặng nề
        const fieldsBlockRegex = /<fields>([\s\S]*?)<\/fields>/gi;
        // Chỉ lấy <views>...</views> — KHÔNG match </category> làm ranh giới (category nằm lồng trong views,
        // nếu không &ListCategory;/&PostCategory; sau </category> đầu tiên sẽ không được expand)
        const viewsBlockRegex = /<views>[\s\S]*?<\/views>/gi;

        let iterations = 0;
        const maxIterations = 5;
        let hasReplaced = true;
        
        while (hasReplaced && iterations < maxIterations) {
            hasReplaced = false;
            iterations++;
            await new Promise(resolve => setTimeout(resolve, 2));
            if (this.currentCheckId !== checkId) return;

            // Tìm tất cả các entity chỉ nằm trong phạm vi <fields> hoặc <views>/<category>
            let targetSections = "";
            let match;
            fieldsBlockRegex.lastIndex = 0;
            while ((match = fieldsBlockRegex.exec(content)) !== null) {
                targetSections += match[0] + "\n";
            }
            viewsBlockRegex.lastIndex = 0;
            while ((match = viewsBlockRegex.exec(content)) !== null) {
                targetSections += match[0] + "\n";
            }

            if (!targetSections) break;

            var ent_content = replaceEntity(targetSections, entityContents);
            if (ent_content.length === 0) break;

            try {
                const entityMap = new Map();
                for (var ent of ent_content) {
                    if (ent.content !== '') {
                        entityMap.set(ent.entity, ent.content.replace(/\r?\n/g, ' '));
                    }
                }
                if (entityMap.size === 0) break;

                const entityRegex = new RegExp(
                    [...entityMap.keys()].map(k => escapeRegExp(k)).join('|'), 'g'
                );
                const nextContent = content.replace(
                    entityRegex, match => entityMap.get(match) || match
                );
                if (nextContent !== content) {
                    content = nextContent;
                    hasReplaced = true;
                }
            } catch (er) {
                console.error(er);
                break;
            }
        }

        if (this.currentCheckId !== checkId) return;

        /** @type {vscode.Diagnostic[]} */
        const diagnostics = [];
        if (isGrid) {
            // Grid: views dùng <field name="x"/> chứ không dùng <item value="pattern: [f]"> → bỏ qua check field/view cũ
            checkGridRules(editor, content, originalContent, diagnostics);
        } else {
            // Giữ nguyên 100% logic trích xuất field và so sánh
            var field_item = getFieldOnView(content);
            var fields_declare = getFieldOnFields(content);

            // <views>/<fields> còn entity chưa expand (&ListView; &XxxField;...) → không đủ dữ kiện đối chiếu
            const viewsContent = (content.match(/<views>[\s\S]*?<\/views>/gi) || []).join('\n');
            const fieldsContent = (content.match(/<fields>[\s\S]*?<\/fields>/gi) || []).join('\n');
            const entityLeftRe = /&(?!(gt|lt|amp|quot|apos);)[\w.]+;/;
            const hasUnresolvedViewEntities = entityLeftRe.test(viewsContent);
            const hasUnresolvedFieldsEntities = entityLeftRe.test(fieldsContent);

            checkLegacyItem(editor, field_item, fields_declare, diagnostics, hasUnresolvedViewEntities, hasUnresolvedFieldsEntities, { fieldNotOnView: full });
            if (full) checkStructureRules(editor, content, diagnostics, true);
        }
        this.diagnosticCollection.set(editor.document.uri, diagnostics);
        console.log(`[FBO_PERF_DEBUG] [CheckLegacy] END took ${Date.now() - tStart}ms`);
    }
}

module.exports = CheckLegacyCode;
