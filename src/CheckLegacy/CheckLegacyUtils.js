const vscode = require('vscode');

/** @param {string} string */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {number} line
 * @param {string} message
 * @param {vscode.TextDocument} document
 * @param {vscode.DiagnosticSeverity} [severity]
 */
function setDiag(line, message, document, severity) {
    let _line = Math.max(0, line - 1);
    if (_line >= document.lineCount) _line = document.lineCount - 1;
    let range = new vscode.Range(_line, 0, _line, document.lineAt(_line).text.length);
    return new vscode.Diagnostic(range, message, severity || vscode.DiagnosticSeverity.Error);
}

/**
 * Trả về hàm map index -> số dòng (1-based), đếm newline 1 lần O(N)
 * @param {string} content
 * @returns {(idx: number) => number}
 */
function makeLineIndex(content) {
    const starts = [0];
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') starts.push(i + 1);
    }
    return (idx) => {
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
        }
        return lo + 1;
    };
}

/**
 * Lấy tất cả <field> trong các block <fields> (kể cả self-closing <field .../>)
 * @param {string} content
 * @returns {{name: string, tag: string, block: string, index: number}[]}
 */
function getFieldTags(content) {
    const results = [];
    const fieldsBlockRe = /<fields>([\s\S]*?)<\/fields>/gi;
    const fieldRe = /<field\b[^>]*?(?:\/>|>[\s\S]*?<\/field>)/g;
    let bm;
    while ((bm = fieldsBlockRe.exec(content)) !== null) {
        const block = bm[0], base = bm.index;
        fieldRe.lastIndex = 0;
        let fm;
        while ((fm = fieldRe.exec(block)) !== null) {
            const openTag = (fm[0].match(/^<field\b[^>]*?(?:\/)?>/) || [fm[0]])[0];
            const nameM = openTag.match(/\bname\s*=\s*"([^"]+)"/);
            results.push({ name: nameM ? String(nameM[1]) : '', tag: openTag, block: fm[0], index: base + fm.index });
        }
    }
    return results;
}

const NUMERIC_FIELD_TYPES = /^(decimal|int|int16|int32|int64)$/i;

/**
 * Field type numeric (Decimal/Int/Int16/Int32/Int64) bắt buộc khai báo
 * <items style="Numeric"> bên trong <field> — thiếu thì FBO render sai control.
 * @param {{name: string, block: string, line: number}[]} fields block = text của cả <field ...>...</field>
 * @param {vscode.TextDocument} document
 * @param {vscode.Diagnostic[]} diagnostics
 */
function checkNumericItemsStyle(fields, document, diagnostics) {
    for (const f of fields) {
        const block = String(f.block || '');
        const openTag = (block.match(/^<field\b[^>]*>/) || [''])[0];
        const typeM = openTag.match(/\btype\s*=\s*["']([^"']+)["']/i);
        if (!typeM || !NUMERIC_FIELD_TYPES.test(String(typeM[1]).trim())) continue;

        if (!/\/>\s*$/.test(openTag)) {
            // Cắt tại </field> đầu tiên — value từ getFieldOnFields có thể span qua field kế
            const endIdx = block.indexOf('</field>');
            const body = endIdx === -1 ? block : block.slice(0, endIdx);
            if (/<items\b[^>]*\bstyle\s*=\s*["']\s*Numeric\s*["']/i.test(body)) continue;
            // Body còn entity chưa expand (&XxxItems;...) → không đủ dữ kiện, bỏ qua tránh báo oan
            if (/&(?!(gt|lt|amp|quot|apos);)[\w.]+;/.test(body)) continue;
        }
        // <field .../> self-closing hoặc không có <items style="Numeric"> → lỗi
        diagnostics.push(setDiag(f.line || 1, `Field "${f.name}" type="${typeM[1]}" là numeric nhưng thiếu <items style="Numeric"></items>`, document));
    }
}

module.exports = { escapeRegExp, setDiag, makeLineIndex, getFieldTags, checkNumericItemsStyle };
