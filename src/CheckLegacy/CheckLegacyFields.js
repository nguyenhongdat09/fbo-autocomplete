const vscode = require('vscode');
const { setDiag, checkNumericItemsStyle } = require('./CheckLegacyUtils');

/**
 * @param {vscode.TextEditor} editor
 * @param {{key: string, fields: string[], line: number}[]} field_item
 * @param {{key: string, value: string, line: number}[]} fields_declare
 * @param {vscode.Diagnostic[]} diagnostics
 * @param {boolean} [hasUnresolvedViewEntities] true khi <views> còn entity chưa expand (&ListView;...) → bỏ qua check "field chưa xuống view"
 * @param {boolean} [hasUnresolvedFieldsEntities] true khi <fields> còn entity chưa expand (&XxxField;...) → bỏ qua check "field chưa khai báo"
 * @param {{fieldNotOnView?:boolean}} [options] fieldNotOnView=true (mode full) → check cả "field đã khai báo nhưng chưa xuống view"
 */
function checkLegacyItem(editor, field_item, fields_declare, diagnostics, hasUnresolvedViewEntities, hasUnresolvedFieldsEntities, options) {
    const error_item = field_item.filter((item) => item.key.length !== item.fields.length);
    const document = editor.document;
    /** @type {vscode.Diagnostic} */
    let diagnostic;
    /** @param {vscode.Diagnostic[]} diagnostics */
    function thua_thieu(diagnostics) {
        error_item.forEach((item) => {
            let line = item.line || 0;
            if (item.key.length > item.fields.length) {
                diagnostic = setDiag(line, `Lỗi "thừa" phần tử 1: \n - Số phần tử 1 là "${item.key.length}" \n - Số field là "${item.fields.length}" `, document);
            } else {
                diagnostic = setDiag(line, `Lỗi "thiếu" phần tử 1: \n - Số phần tử 1 là "${item.key.length}" \n - Số field là "${item.fields.length}"`, document);
            }
            diagnostics.push(diagnostic);
        });
    }

    const field_distinct = field_item.map(item => ({
        fields: [...new Set(item.fields)],
        line: item.line
    }));

    /** @param {vscode.Diagnostic[]} diagnostics */
    function chua_khai_bao_Field(diagnostics) {
        const fieldDeclSet = new Set(fields_declare.map(item => item.key));
        field_distinct.forEach(item_distinct => {
            const fields = item_distinct.fields, line = item_distinct.line || 0;
            fields.forEach(field => {
                if (!fieldDeclSet.has(field)) {
                    diagnostic = setDiag(line, `Field: ${field} chưa khai báo ở Fields.`, document);
                    diagnostics.push(diagnostic);
                }
            });
        });
    }

    /** @param {vscode.Diagnostic[]} diagnostics */
    function chua_khai_bao_Field_xuong_view(diagnostics) {
        // Build Set tất cả field đã khai báo trên view → tra cứu O(1)
        const allViewFields = new Set();
        for (const item of field_distinct) {
            for (const f of item.fields) allViewFields.add(f);
        }
        fields_declare.forEach(item_field => {
            const field = item_field.key, line = item_field.line || 0;
            if (!allViewFields.has(field)) {
                diagnostic = setDiag(line, `Chưa khai báo Field: ${field} xuống thẻ view`, document);
                diagnostics.push(diagnostic);
            }
        });
    }

    // Gọi các hàm xử lý
    thua_thieu(diagnostics);
    checkNumericItemsStyle(
        fields_declare.map(f => ({ name: f.key, block: f.value, line: f.line })),
        document,
        diagnostics
    );
    if (!hasUnresolvedFieldsEntities) chua_khai_bao_Field(diagnostics);
    if (!hasUnresolvedViewEntities && options && options.fieldNotOnView) chua_khai_bao_Field_xuong_view(diagnostics);
}

/** @param {string} content */
function getFieldOnFields(content) {
    try {
        const fieldsRegex = /<fields>([\s\S]*?)<\/fields>/g;
        const fieldsMatch = fieldsRegex.exec(content);
        if (!fieldsMatch) {
            return [];
        }
        var xmlFields = fieldsMatch[0];
        const xmlFieldsStart = fieldsMatch.index;
        const fieldRegex = /<field[^>]*name="([^"]+)"[^>]*>[\s\S]*?<\/field>/g;
        const result = [];

        // Đếm số newline trước xmlFieldsStart 1 lần O(N)
        let baseLineNumber = 1;
        for (let k = 0; k < xmlFieldsStart; k++) {
            if (content[k] === '\n') baseLineNumber++;
        }

        // Duyệt tuần tự: đếm newline tăng dần O(1) trung bình thay vì findIndex O(L) mỗi lần
        let lastMatchIdx = 0;
        let currentLine = baseLineNumber;

        let match;
        while ((match = fieldRegex.exec(xmlFields)) !== null) {
            var key_t = String(match[1]);
            var value_t = match[0];
            // **Bỏ qua field có filterSource="Vacant"**
            if (/filterSource="Vacant"/.test(value_t)) continue;

            // Đếm newline từ lastMatchIdx đến match.index (tăng dần)
            for (let k = lastMatchIdx; k < match.index; k++) {
                if (xmlFields[k] === '\n') currentLine++;
            }
            lastMatchIdx = match.index;

            result.push({ key: key_t, value: value_t, line: currentLine });
        }
        return result;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Error parsing XML`);
        return [];
    }
}

/** @param {string} content */
function getFieldOnView(content) {
    try {
        const regex = /<item value="([^"]+):\s*([^"]+)"/g;
        let match;
        const results = [];
        // Đếm dòng tăng dần theo match.index thay vì findIndex O(L) mỗi lần
        let lastMatchIdx = 0;
        let currentLine = 1;

        while ((match = regex.exec(content)) !== null) {
            var key = String(match[1]).trim().replace(/[0-]/g, '');
            // Tìm các field nằm trong ngoặc vuông []
            const fieldMatches = String(match[2]).match(/\[([^\]]+)\]/g) || [];
            var fields = fieldMatches.map(field => field.replace(/\[|\]/g, "").trim());

            // Đếm newline từ lastMatchIdx đến match.index (tăng dần)
            for (let k = lastMatchIdx; k < match.index; k++) {
                if (content[k] === '\n') currentLine++;
            }
            lastMatchIdx = match.index;

            results.push({ key, fields, line: currentLine });
        }
        return results;
    } catch (error) {
        vscode.window.showErrorMessage(`Error parsing XML`);
        return [];
    }
}

module.exports = { checkLegacyItem, getFieldOnFields, getFieldOnView };
