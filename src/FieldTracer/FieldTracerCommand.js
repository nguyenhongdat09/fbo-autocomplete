// @ts-nocheck
// Command: FBO: Trace Field — lấy field tại con trỏ (hoặc nhập tay) → trace → panel.

const vscode = require("vscode");
const { detectSymbol } = require("../References/SymbolDetector");
const { traceField, SECTION_DEFS } = require("./FieldTracerService");
const { FieldTracerPanel } = require("./FieldTracerPanel");

/**
 * Chọn section cần trace — dạng toggle list, mặc định bật hết.
 * Click mục để bật/tắt (picker mở lại), chọn "Chạy trace" để chạy.
 * Không dùng canPickMany — một số IDE/fork không render checkbox,
 * click row sẽ accept luôn thay vì toggle.
 */
async function pickSections() {
    const state = new Map(SECTION_DEFS.map(s => [s.key, true]));
    // tránh Enter của InputBox phía trước leak sang accept picker này
    await new Promise(r => setTimeout(r, 150));
    while (true) {
        const nOn = [...state.values()].filter(Boolean).length;
        const items = [
            {
                label: "$(run-all) Chạy trace",
                description: `${nOn}/${state.size} mục`,
                detail: "Bấm để trace với các mục đang bật bên dưới",
                key: "__run__",
                alwaysShow: true,
            },
            { label: "Mục trace — click để bật/tắt", kind: vscode.QuickPickItemKind.Separator },
            ...SECTION_DEFS.map(s => ({
                label: `${state.get(s.key) ? "$(check)" : "$(circle-slash)"} ${s.title}`,
                key: s.key,
            })),
        ];
        const pick = await vscode.window.showQuickPick(items, {
            title: "Trace field — chọn mục cần trace",
            placeHolder: "Click mục để bật/tắt • chọn 'Chạy trace' khi xong",
            ignoreFocusOut: true,
        });
        if (!pick) return null; // Esc
        if (pick.key === "__run__") {
            return new Set([...state].filter(([, v]) => v).map(([k]) => k));
        }
        state.set(pick.key, !state.get(pick.key));
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {{
 *   getGroupRoots: () => {name:string, root:string}[],
 *   symbolIndex?: any,
 *   getIndexService?: () => any,
 * }} deps
 */
async function runTraceField(context, deps) {
    const editor = vscode.window.activeTextEditor;
    let preset = "";
    if (editor) {
        const sym = detectSymbol(editor.document, editor.selection.active);
        if (sym && sym.text) preset = sym.text;
    }
    const field = await vscode.window.showInputBox({
        title: "FBO: Trace Field",
        prompt: "Tên field/column cần trace",
        value: preset,
        ignoreFocusOut: true,
    });
    if (!field || !field.trim()) return;

    const roots = deps.getGroupRoots();
    if (!roots.length) {
        vscode.window.showWarningMessage("Chưa có group/project nào trên FBO File tree.");
        return;
    }

    const sections = await pickSections();
    if (sections === null) return; // user cancel
    if (!sections.size) {
        vscode.window.showInformationMessage("Chưa chọn mục nào để trace.");
        return;
    }

    const model = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Tracing "${field.trim()}"...`,
        cancellable: true,
    }, (progress, token) => traceField(field.trim(), {
        roots,
        symbolIndex: deps.symbolIndex,
        getIndexService: deps.getIndexService,
        sections,
        token,
    }));

    if (!model) {
        vscode.window.showInformationMessage(`Đã hủy trace "${field.trim()}".`);
        return;
    }
    FieldTracerPanel.createOrShow(context, model);
}

module.exports = { runTraceField };
