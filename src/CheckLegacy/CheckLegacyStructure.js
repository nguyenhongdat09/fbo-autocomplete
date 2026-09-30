const vscode = require('vscode');
const { setDiag, makeLineIndex, getFieldTags } = require('./CheckLegacyUtils');

/**
 * Check cấu trúc: khóa chính + categoryIndex + anchor/split + pattern view.
 * includeViewRules=false khi gọi cho Grid (grid không dùng item pattern)
 * @param {vscode.TextEditor} editor
 * @param {string} content nội dung đã expand entity trong <fields>/<views>
 * @param {vscode.Diagnostic[]} diagnostics
 * @param {boolean} includeViewRules
 */
function checkStructureRules(editor, content, diagnostics, includeViewRules) {
    const document = editor.document;
    const lineAt = makeLineIndex(content);
    const fields = getFieldTags(content);

    // ---- Khóa chính: isPrimaryKey phải khớp code="..." ----
    const pkFields = fields.filter(f => /\bisPrimaryKey\s*=\s*"true"/i.test(f.tag));
    const rootM = content.match(/<(dir|grid|filter)\b[^>]*>/i);
    const codeM = rootM ? rootM[0].match(/\bcode\s*=\s*"([^"]*)"/i) : null;
    if (codeM && !/[&;]/.test(String(codeM[1]))) {
        const codeCols = String(codeM[1]).split(',').map(s => s.trim()).filter(Boolean);
        const fieldNames = new Set(fields.map(f => f.name));
        const pkNames = new Set(pkFields.map(f => f.name));
        for (const c of codeCols) {
            if (!pkNames.has(c) && fieldNames.has(c)) {
                const f = fields.find(x => x.name === c);
                if (!f) continue;
                diagnostics.push(setDiag(lineAt(f.index), `Cột "${c}" nằm trong code="${codeM[1]}" nhưng field chưa khai báo isPrimaryKey="true"`, document));
            }
        }
    } else if (pkFields.length && !codeM) {
        diagnostics.push(setDiag(1, `Có ${pkFields.length} field isPrimaryKey="true" nhưng thẻ gốc thiếu code="..."`, document, vscode.DiagnosticSeverity.Warning));
    }

    // ---- categoryIndex phải khớp <category index="N"> ----
    // <categories> còn entity chưa expand (&ListCategory; &PostCategory;...) → không đủ dữ kiện → bỏ qua
    const catBlocks = content.match(/<categories>[\s\S]*?<\/categories>/gi) || [];
    const hasUnresolvedCatEntity = catBlocks.some(b => /&(?!(gt|lt|amp|quot|apos);)[\w.]+;/.test(b));
    const catIndexes = new Set();
    const catIdxRe = /<category\b[^>]*?\bindex\s*=\s*"(-?\d+)"/gi;
    let cm;
    while ((cm = catIdxRe.exec(content)) !== null) catIndexes.add(String(cm[1]));
    for (const f of hasUnresolvedCatEntity ? [] : fields) {
        const ci = f.tag.match(/\bcategoryIndex\s*=\s*"(-?\d+)"/i);
        if (ci && !catIndexes.has(String(ci[1]))) {
            diagnostics.push(setDiag(lineAt(f.index), `Field "${f.name}" categoryIndex="${String(ci[1])}" không khớp <category index> nào trong view`, document));
        }
    }

    if (!includeViewRules) return;

    // ---- anchor / split trên <view> và pattern từng <item> ----
    const viewRe = /<view\b[^>]*>[\s\S]*?<\/view>/gi;
    let vm;
    while ((vm = viewRe.exec(content)) !== null) {
        const body = vm[0];
        const viewTag = (body.match(/^<view\b[^>]*>/) || [''])[0];
        const viewLine = lineAt(vm.index);

        // Dòng master: item chỉ chứa số + phẩy, không có ':'
        const itemRe = /<item\b[^>]*?\bvalue\s*=\s*"([^"]*)"[^>]*>/g;
        const itemVals = [];
        let im;
        while ((im = itemRe.exec(body)) !== null) {
            itemVals.push({ v: String(im[1]), index: vm.index + im.index });
        }
        let masterCols = 0;
        for (const it of itemVals) {
            if (!it.v.includes(':') && /^[\d,\s]+$/.test(it.v.trim())) {
                masterCols = it.v.split(',').filter(s => s.trim() !== '').length;
                break;
            }
        }

        if (masterCols > 0) {
            const anchorM = viewTag.match(/\banchor\s*=\s*"(-?\d+)"/);
            if (anchorM) {
                const a = parseInt(String(anchorM[1]), 10);
                if (a < 1 || a > masterCols) {
                    diagnostics.push(setDiag(viewLine, `<view> anchor="${a}" vượt số cột master (${masterCols})`, document));
                }
            }
            const splitM = viewTag.match(/\bsplit\s*=\s*"(-?\d+)"/);
            if (splitM) {
                const s = parseInt(String(splitM[1]), 10);
                if (s < 1 || s > masterCols) {
                    diagnostics.push(setDiag(viewLine, `<view> split="${s}" vượt số cột master (${masterCols})`, document));
                }
            }
        }

        for (const it of itemVals) {
            if (!it.v.includes(':')) continue;
            const pattern = it.v.split(':')[0].trim();
            if (!/^[01-]+$/.test(pattern)) continue;
            const itemLine = lineAt(it.index);
            if (masterCols > 0 && pattern.length > masterCols) {
                diagnostics.push(setDiag(itemLine, `Pattern "${pattern}" dài ${pattern.length} vượt số cột master (${masterCols})`, document));
            }
            // >=3 cột "0" liền giữa 2 nhóm field = gap ngụy trang (input giãn quá mức) → nên dùng "-"
            // 1-2 cột "0" là span cố ý làm input rộng (vd 11110011-11111, 101------110011) → bỏ qua
            if (/110{3,}11/.test(pattern)) {
                diagnostics.push(setDiag(itemLine, `Pattern "${pattern}" dùng chuỗi "0" dài làm gap giữa 2 nhóm field — nên dùng "-"`, document, vscode.DiagnosticSeverity.Warning));
            }
        }
    }

    // ---- anchor / split trên <category columns="..."> ----
    const catRe = /<category\b[^>]*>/gi;
    while ((cm = catRe.exec(content)) !== null) {
        const tag = cm[0];
        const colsM = tag.match(/\bcolumns\s*=\s*"([^"]*)"/);
        if (!colsM || !/^[\d,\s]+$/.test(String(colsM[1]).trim())) continue;
        const n = String(colsM[1]).split(',').filter(s => s.trim() !== '').length;
        const aM = tag.match(/\banchor\s*=\s*"(-?\d+)"/);
        if (aM) {
            const a = parseInt(String(aM[1]), 10);
            if (a < 1 || a > n) {
                diagnostics.push(setDiag(lineAt(cm.index), `<category> anchor="${a}" vượt số cột (${n})`, document));
            }
        }
        const sM = tag.match(/\bsplit\s*=\s*"(-?\d+)"/);
        if (sM) {
            const s = parseInt(String(sM[1]), 10);
            if (s < 1 || s > n) {
                diagnostics.push(setDiag(lineAt(cm.index), `<category> split="${s}" vượt số cột (${n})`, document));
            }
        }
    }
}

module.exports = { checkStructureRules };
