const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
function getBundledDatabaseRoot() {
    try {
        const { resolveBundledDatabaseRoot } = require('../../extensionDatabasePaths');
        return resolveBundledDatabaseRoot();
    } catch {
        return path.join(__dirname, '..', '..', 'Database');
    }
}

/**
 * Chuyển tên cột dạng chữ (A, B, ..., Z, AA, AB...) thành số (1, 2, ..., 26, 27, 28...)
 */
function columnLetterToNumber(col_letter) {
    let result = 0;
    const str = String(col_letter || '').trim().toUpperCase();
    for (let i = 0; i < str.length; i++) {
        result = result * 26 + (str.charCodeAt(i) - 64);
    }
    return result;
}

/**
 * Chuyển số cột (1, 2, ..., 26, 27, 28...) thành tên cột dạng chữ (A, B, ..., Z, AA, AB...)
 */
function columnNumberToLetter(col_num) {
    let num = col_num;
    let col_name = '';
    while (num > 0) {
        const rem = (num - 1) % 26;
        col_name = String.fromCharCode(65 + rem) + col_name;
        num = Math.floor((num - 1) / 26);
    }
    return col_name;
}

/**
 * Xuất file Excel upload từ danh sách các ô header đã resolved.
 * @param {Array<{ name: string, column: string, header: string, required: boolean }>} cells
 * @param {string} output_path
 */
async function exportUploadExcel(cells, output_path) {
    const db_root = getBundledDatabaseRoot();
    const template_path = path.join(db_root, 'upload_chuan.xlsx');

    if (!fs.existsSync(template_path)) {
        throw new Error(`Không tìm thấy file template upload_chuan.xlsx tại: ${template_path}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template_path);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('File template upload_chuan.xlsx không chứa worksheet hợp lệ.');
    }

    // Xác định cột lớn nhất cần clear (ít nhất tới cột Z hoặc cột lớn nhất của cells)
    let max_col_idx = 26; // Cột Z mặc định
    for (const item of cells) {
        const num = columnLetterToNumber(item.column);
        if (num > max_col_idx) {
            max_col_idx = num;
        }
    }

    // Quét clear toàn bộ hàng 5 (từ cột 1 tới max_col_idx) để không bị sót lại text của template mẫu
    for (let c = 1; c <= max_col_idx; c++) {
        const col_letter = columnNumberToLetter(c);
        worksheet.getCell(`${col_letter}5`).value = null;
    }

    // Ghi các header field lên dòng 5 theo đúng column (không in đậm, dấu * nhỏ 50%)
    for (const item of cells) {
        const col_letter = String(item.column || '').trim().toUpperCase();
        if (!col_letter) {
            continue;
        }

        const cell = worksheet.getCell(`${col_letter}5`);
        if (item.required) {
            cell.value = {
                richText: [
                    {
                        text: '*',
                        font: { color: { argb: 'FFFF0000' }, name: 'Calibri', size: 9 }
                    },
                    {
                        text: item.header,
                        font: { color: { argb: 'FF000000' }, name: 'Calibri', size: 11 }
                    }
                ]
            };
        } else {
            cell.value = item.header;
            cell.font = { name: 'Calibri', size: 11 };
        }

        cell.alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true };
    }

    await workbook.xlsx.writeFile(output_path);
}

module.exports = {
    exportUploadExcel,
    columnLetterToNumber,
    columnNumberToLetter
};
