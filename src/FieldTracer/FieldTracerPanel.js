// @ts-nocheck
// Webview panel hiển thị kết quả Field Tracer — section collapsible, click mở file:line.

const vscode = require("vscode");

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

class FieldTracerPanel {
    static createOrShow(context, model) {
        if (FieldTracerPanel.current) {
            FieldTracerPanel.current._panel.reveal(vscode.ViewColumn.Beside);
            FieldTracerPanel.current._render(model);
            return FieldTracerPanel.current;
        }
        const panel = vscode.window.createWebviewPanel(
            "fboFieldTracer",
            `Trace: ${model.field}`,
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        FieldTracerPanel.current = new FieldTracerPanel(panel);
        FieldTracerPanel.current._render(model);
        return FieldTracerPanel.current;
    }

    constructor(panel) {
        this._panel = panel;
        this._panel.onDidDispose(() => { FieldTracerPanel.current = null; });
        this._panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg && msg.cmd === "open" && msg.file) {
                try {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.file));
                    // Mở ở Group 1 (editor chính) — không đè lên webview Trace
                    const editor = await vscode.window.showTextDocument(doc, {
                        preview: true,
                        viewColumn: vscode.ViewColumn.One,
                    });
                    const pos = new vscode.Position(
                        Math.max(0, Number(msg.line0) || 0),
                        Math.max(0, Number(msg.col0) || 0)
                    );
                    editor.selection = new vscode.Selection(pos, pos);
                    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                } catch (err) {
                    vscode.window.showErrorMessage(`Không mở được file: ${err && err.message}`);
                }
            }
        });
    }

    _render(model) {
        // Rút gọn path: \\server\...\HAOHOA\root\Dir\X.xml → "HAOHOA - FBSP241B • Dir\X.xml"
        const roots = (model.roots || []).map(r => ({
            name: r.name,
            root: String(r.root || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase(),
        }));
        const shorten = (file) => {
            const fl = String(file || "").replace(/\//g, "\\").toLowerCase();
            for (const r of roots) {
                if (fl.startsWith(r.root + "\\")) {
                    // Bỏ App_Data\Controllers\ — lúc nào cũng có, chỉ làm dài
                    let rel = String(file).slice(r.root.length + 1);
                    rel = rel.replace(/^app_data[\\/]controllers[\\/]/i, "");
                    // Ellipsis giữa — giữ tên file (phần quan trọng nhất) ở cuối
                    if (rel.length > 42) rel = rel.slice(0, 14) + "…" + rel.slice(-26);
                    return `${r.name} • ${rel}`;
                }
            }
            const s = String(file || "");
            return s.length > 42 ? s.slice(0, 14) + "…" + s.slice(-26) : s;
        };

        const sections = (model.sections || [])
            .filter(sec => sec.items && sec.items.length) // ẩn mục 0 kết quả
            .map(sec => {
            const rows = sec.items.map(it => {
                const loc = it.isDbObject ? esc(it.file) : `${esc(shorten(it.file))}:${it.line0 + 1}`;
                const openAttr = it.isDbObject || !it.file
                    ? ""
                    : `data-file="${esc(it.file)}" data-line="${it.line0}" data-col="${it.col0}"`;
                return `<tr class="row" ${openAttr}>
                    <td class="loc" title="${esc(it.isDbObject ? "" : it.file)}">${loc}</td>
                    <td class="prev">${esc((it.preview || "").slice(0, 300))}</td>
                </tr>`;
            }).join("");
            return `<details ${sec.items.length ? "open" : ""}>
                <summary>${esc(sec.title)} <span class="count">${sec.items.length}</span></summary>
                <table>${rows || '<tr><td class="empty">—</td></tr>'}</table>
            </details>`;
        }).join("");

        this._panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:8px}
h2{font-size:14px;margin:4px 0 12px}
details{margin-bottom:8px;border:1px solid var(--vscode-panel-border);border-radius:4px}
summary{cursor:pointer;padding:6px 10px;font-weight:600;user-select:none}
.count{opacity:.6;font-weight:400}
table{width:100%;border-collapse:collapse;font-size:12px}
td{padding:3px 10px;vertical-align:top;border-top:1px solid var(--vscode-panel-border)}
tr.row{cursor:pointer}
tr.row:hover{background:var(--vscode-list-hoverBackground)}
.loc{white-space:nowrap;color:var(--vscode-textLink-foreground)}
.prev{opacity:.85;word-break:break-all;font-family:var(--vscode-editor-font-family)}
.empty{opacity:.5}
</style></head><body>
<h2>Field: <code>${esc(model.field)}</code></h2>
${sections}
<script>
const vscode = acquireVsCodeApi();
document.querySelectorAll('tr.row[data-file]').forEach(r=>{
  r.addEventListener('click',()=>{
    vscode.postMessage({cmd:'open',file:r.dataset.file,line0:+r.dataset.line,col0:+r.dataset.col});
  });
});
</script></body></html>`;
    }
}

module.exports = { FieldTracerPanel };
