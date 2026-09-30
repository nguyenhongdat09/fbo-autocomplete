const vscode = require('vscode');
const { setDiag, makeLineIndex, getFieldTags, checkNumericItemsStyle } = require('./CheckLegacyUtils');
const { checkStructureRules } = require('./CheckLegacyStructure');

/**
 * Check Grid: allowFilter phải đi kèm query lọc + Declare + Filter.ent
 * @param {vscode.TextEditor} editor
 * @param {string} content nội dung đã expand entity trong <fields>/<views>
 * @param {string} rawContent nội dung gốc (check <queries>/DOCTYPE)
 * @param {vscode.Diagnostic[]} diagnostics
 */
function checkGridRules(editor, content, rawContent, diagnostics) {
    const document = editor.document;
    const lineAt = makeLineIndex(content);
    const lineAtRaw = makeLineIndex(rawContent);

    checkStructureRules(editor, content, diagnostics, false); // Grid chỉ check khóa chính

    const fields = getFieldTags(content);
    checkNumericItemsStyle(
        fields.map(f => ({ name: f.name, block: f.block, line: lineAt(f.index) })),
        document,
        diagnostics
    );
    let hasAllowFilter = false;
    for (const f of fields) {
        const af = f.tag.match(/\ballowFilter\s*=\s*"([^"]*)"/i);
        if (!af) continue;
        const v = String(af[1]).trim().toLowerCase();
        if (v === '' || v === 'false' || v === '0') continue;
        hasAllowFilter = true;
        const qm = f.block.match(/<query\b[^>]*>([\s\S]*?)<\/query>/);
        if (!qm || String(qm[1]).trim() === '') {
            diagnostics.push(setDiag(lineAt(f.index), `Field "${f.name}" bật allowFilter nhưng thiếu <query>&InsertCommandFilter;</query>`, document));
        }
        if (f.name === 'tag' || /\bhidden\s*=\s*"true"/i.test(f.tag)) {
            diagnostics.push(setDiag(lineAt(f.index), `Field "${f.name}" là cột tag/hidden — không nên gắn allowFilter`, document, vscode.DiagnosticSeverity.Warning));
        }
    }

    if (hasAllowFilter) {
        // <queries> nằm ngoài vùng expand entity → check trên nội dung gốc
        const dq = rawContent.match(/<query\b[^>]*?\bevent\s*=\s*"Declare"[^>]*>[\s\S]*?<\/query>/i);
        if (!dq) {
            diagnostics.push(setDiag(1, `Grid dùng allowFilter nhưng thiếu <query event="Declare">&DeclareCommandFilter;</query> (tạo #filter)`, document));
        } else if (!/DeclareCommandFilter/i.test(dq[0])) {
            diagnostics.push(setDiag(lineAtRaw(dq.index || 0), `<query event="Declare"> không gọi &DeclareCommandFilter; — dòng lọc sẽ không hoạt động`, document, vscode.DiagnosticSeverity.Warning));
        }
        const doctype = (rawContent.match(/<!DOCTYPE[\s\S]*?\]>/i) || [''])[0];
        if (!/Filter\.\w*ent/i.test(doctype)) {
            diagnostics.push(setDiag(1, `Grid dùng allowFilter nhưng DOCTYPE chưa include Filter.ent (entity &GridVoucherAllowFilter;)`, document, vscode.DiagnosticSeverity.Warning));
        }
    }
}

module.exports = { checkGridRules };
