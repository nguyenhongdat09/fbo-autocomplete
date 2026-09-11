const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const {
    exportUploadExcel,
    columnLetterToNumber,
    columnNumberToLetter
} = require('../excel/UploadExcelExporter');

async function run_test() {
    console.log('--- Test UploadExcelExporter ---');

    // 1. Test convert column letter <-> number
    assert.strictEqual(columnLetterToNumber('A'), 1);
    assert.strictEqual(columnLetterToNumber('B'), 2);
    assert.strictEqual(columnLetterToNumber('Z'), 26);
    assert.strictEqual(columnLetterToNumber('AA'), 27);
    assert.strictEqual(columnLetterToNumber('AB'), 28);
    assert.strictEqual(columnLetterToNumber('AZ'), 52);
    assert.strictEqual(columnLetterToNumber('BA'), 53);

    assert.strictEqual(columnNumberToLetter(1), 'A');
    assert.strictEqual(columnNumberToLetter(2), 'B');
    assert.strictEqual(columnNumberToLetter(26), 'Z');
    assert.strictEqual(columnNumberToLetter(27), 'AA');
    assert.strictEqual(columnNumberToLetter(28), 'AB');
    assert.strictEqual(columnNumberToLetter(52), 'AZ');
    assert.strictEqual(columnNumberToLetter(53), 'BA');

    // 2. Test export file Excel thực tế
    const temp_dir = os.tmpdir();
    const temp_out = path.join(temp_dir, `test_upload_export_${Date.now()}.xlsx`);

    const sample_cells = [
        { name: 'ma_dvcs', column: 'A', header: 'Mã ĐVCS', required: true },
        { name: 'ma_kh', column: 'B', header: 'Mã khách', required: true },
        { name: 'ngay_ct', column: 'D', header: 'Ngày chứng từ', required: true },
        { name: 'dien_giai', column: 'G', header: 'Diễn giải', required: false }
    ];

    try {
        await exportUploadExcel(sample_cells, temp_out);
        assert.strictEqual(fs.existsSync(temp_out), true, 'File xuất phải tồn tại');

        // Đọc lại file để kiểm tra cấu trúc
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(temp_out);
        const ws = wb.worksheets[0];

        // Kiểm tra cell A5 (required): dấu * size 6, không bold
        const a5 = ws.getCell('A5');
        assert.ok(a5.value && a5.value.richText, 'A5 phải có richText');
        assert.strictEqual(a5.value.richText[0].text, '*');
        assert.strictEqual(a5.value.richText[0].font.size, 9);
        assert.strictEqual(a5.value.richText[0].font.bold, undefined);

        // Kiểm tra cột C dòng 5 phải trống (không dồn cột)
        const c5 = ws.getCell('C5');
        assert.strictEqual(c5.value, null, 'Cột C dòng 5 phải để trống');

        // Kiểm tra cột G dòng 5 (không required): không bold
        const g5 = ws.getCell('G5');
        assert.strictEqual(g5.value, 'Diễn giải');
        assert.strictEqual(g5.font.bold, undefined);

        console.log('✓ UploadExcelExporter passed');
    } finally {
        if (fs.existsSync(temp_out)) {
            try {
                fs.unlinkSync(temp_out);
            } catch {
                // ignore
            }
        }
    }
}

module.exports = { run_test };

if (require.main === module) {
    run_test();
}
