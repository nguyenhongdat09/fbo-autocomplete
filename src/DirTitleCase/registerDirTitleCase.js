let vscode;
try {
    vscode = require('vscode');
} catch (e) { }

const DEBOUNCE_MS = 500;
const FLAG_HOLD_MS = 150;

/**
 * Tìm <title> đầu tiên; nếu attr v có ký tự đầu viết hoa → trả vị trí sửa.
 * Pure function (không phụ thuộc vscode) → test được bằng node trực tiếp.
 * @param {string} text
 * @returns {{offset:number, oldChar:string, newChar:string}|null}
 */
function findTitleCaseFix(text) {
    const mTitle = /<title\b[^>]*>/i.exec(text);   // chỉ lấy <title> ĐẦU TIÊN (title của <dir>)
    if (!mTitle) return null;
    const mV = /\bv="([^"]*)"/.exec(mTitle[0]);    // v ở vị trí bất kỳ trong tag
    if (!mV || !mV[1]) return null;
    const c0 = mV[1][0];
    const low = c0.toLowerCase();                  // hỗ trợ Unicode: Đ→đ, Á→á...
    if (low === c0) return null;                   // đã thường / không phải chữ (v="&Entity;")
    return {
        offset: mTitle.index + mV.index + 3,       // +3 = qua `v="`, trỏ ký tự đầu value
        oldChar: c0,
        newChar: low
    };
}

/**
 * File thuộc Controllers\Dir\*.xml (hỗ trợ UNC path \\server\share\...).
 * @param {vscode.TextDocument} doc
 */
function isDirXmlDocument(doc) {
    if (!doc || doc.uri.scheme !== 'file') return false;
    const p = (doc.uri.fsPath || '').replace(/\\/g, '/').toLowerCase();
    return p.endsWith('.xml') && p.indexOf('/controllers/dir/') !== -1;
}

/**
 * @param {vscode.TextDocument} doc @param {number} offset
 * @returns {vscode.Range}
 */
function rangeAt(doc, offset) {
    return new vscode.Range(doc.positionAt(offset), doc.positionAt(offset + 1));
}

/**
 * Đăng ký auto-fix: chữ cái đầu của title v="..." trong Controllers\Dir\*.xml
 * phải viết thường (FastBusiness render "Cập nhật " + title).
 * 2 hướng: realtime (onDidChangeTextDocument, debounce + chống đệ quy)
 * và on-save (onWillSaveTextDocument + waitUntil — merge vào transaction save).
 * @param {vscode.ExtensionContext} context
 */
function registerDirTitleCase(context) {
    const pending = new Map();   // uri -> timeout (debounce realtime)
    const fixing = new Set();    // uri đang được CHÍNH extension edit

    const getCfg = (name, def) =>
        vscode.workspace.getConfiguration('fbo-autocomplete').get(name, def);

    // ===== Hướng 2: On Save — waitUntil merge edit vào save, không thể đệ quy =====
    const saveSub = vscode.workspace.onWillSaveTextDocument((e) => {
        if (!getCfg('fixDirTitleCaseOnSave', true)) return;
        if (!isDirXmlDocument(e.document)) return;
        const fix = findTitleCaseFix(e.document.getText());
        if (!fix) return;
        e.waitUntil(Promise.resolve([
            vscode.TextEdit.replace(rangeAt(e.document, fix.offset), fix.newChar)
        ]));
        console.log(`[DirTitleCase] onSave fixed: ${e.document.fileName}`);
    });

    // ===== Hướng 1: Realtime — 4 lớp chống đệ quy =====
    const scheduleFix = (doc) => {
        const key = doc.uri.toString();
        clearTimeout(pending.get(key));
        pending.set(key, setTimeout(() => {
            pending.delete(key);
            if (doc.isClosed) return;
            void applyRealtimeFix(doc);
        }, DEBOUNCE_MS));
    };

    const applyRealtimeFix = async (doc) => {
        // (4) IDEMPOTENT: quét lại trên nội dung MỚI NHẤT; không còn vi phạm → no-op.
        // Chốt an toàn cuối: dù event có chạy lại, không có gì để sửa → không loop.
        const fix = findTitleCaseFix(doc.getText());
        if (!fix) return;
        const key = doc.uri.toString();
        const we = new vscode.WorkspaceEdit();
        we.replace(doc.uri, rangeAt(doc, fix.offset), fix.newChar);
        fixing.add(key);                                    // (1) chặn event của chính edit này
        try {
            const ok = await vscode.workspace.applyEdit(we);
            if (ok) console.log(`[DirTitleCase] realtime fixed: ${doc.fileName}`);
        } finally {
            // Event của applyEdit bắn SYNC → flag đã chặn; giữ thêm 1 nhịp phòng event trễ.
            setTimeout(() => fixing.delete(key), FLAG_HOLD_MS);
        }
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
        if (!getCfg('fixDirTitleCaseRealtime', true)) return;
        const doc = e.document;
        if (!isDirXmlDocument(doc)) return;
        if (fixing.has(doc.uri.toString())) return;         // (1) edit do chính mình → bỏ qua
        // (2) Không đè Ctrl+Z / Ctrl+Y của user
        if (e.reason === vscode.TextDocumentChangeReason.Undo ||
            e.reason === vscode.TextDocumentChangeReason.Redo) return;
        // (3) Event không nội dung (reload, encoding...) → bỏ qua
        if (!e.contentChanges || e.contentChanges.length === 0) return;
        scheduleFix(doc);
    });

    context.subscriptions.push(saveSub, changeSub, new vscode.Disposable(() => {
        for (const t of pending.values()) clearTimeout(t);
        pending.clear();
        fixing.clear();
    }));
}

module.exports = { registerDirTitleCase, findTitleCaseFix, isDirXmlDocument };
