const assert = require('assert');
const FormulaAstParser = require('../parser/FormulaAstParser');

function run() {
    console.log('🧪 Testing FormulaAstParser...');

    // 1. Test binary multiplication: [so_luong]*[gia_nt]
    const ast1 = FormulaAstParser.parse('[so_luong]*[gia_nt]');
    assert.ok(ast1, 'ast1 should not be null');
    assert.strictEqual(ast1.type, 'binary');
    assert.strictEqual(ast1.op, '*');
    assert.strictEqual(ast1.left.name, 'so_luong');
    assert.strictEqual(ast1.right.name, 'gia_nt');

    const refs1 = FormulaAstParser.collectRefs(ast1);
    assert.deepStrictEqual(refs1, ['so_luong', 'gia_nt']);

    const plain1 = FormulaAstParser.toPlainVi(ast1, {
        so_luong: { header_v: 'Số lượng' },
        gia_nt: { header_v: 'Giá nt' }
    });
    assert.strictEqual(plain1, 'Số lượng × Giá nt');

    // 2. Test master exchange rate: [tien_nt2]*[$ty_gia]
    const ast2 = FormulaAstParser.parse('[tien_nt2]*[$ty_gia]');
    assert.ok(ast2);
    assert.strictEqual(ast2.right.name, 'ty_gia'); // Stripped $

    // 3. Test discount rate with division: [tien_nt2]*[tl_ck]/100
    const ast3 = FormulaAstParser.parse('[tien_nt2]*[tl_ck]/100');
    assert.ok(ast3);
    assert.strictEqual(ast3.type, 'binary');
    assert.strictEqual(ast3.op, '/');
    assert.strictEqual(ast3.right.value, 100);

    // 4. Test tax on amount after discount: ([tien_nt2] - [ck_nt])*[thue_suat]/100
    const ast4 = FormulaAstParser.parse('([tien_nt2] - [ck_nt])*[thue_suat]/100');
    assert.ok(ast4);
    const plain4 = FormulaAstParser.toPlainVi(ast4, {
        tien_nt2: { header_v: 'Tiền hàng nt' },
        ck_nt: { header_v: 'Chiết khấu nt' },
        thue_suat: { header_v: 'Thuế suất' }
    });
    assert.strictEqual(plain4, '(Tiền hàng nt − Chiết khấu nt) × Thuế suất / 100');

    // 5. Test ternary boolean: ([phi_dvtn_yn] == 0 ? [tien_nt2] : 0)
    const ast5 = FormulaAstParser.parse('([phi_dvtn_yn] == 0 ? [tien_nt2] : 0)');
    assert.ok(ast5);
    assert.strictEqual(ast5.type, 'ternary');
    const plain5 = FormulaAstParser.toPlainVi(ast5, {
        phi_dvtn_yn: { header_v: 'Phí DV-TN', type: 'boolean' },
        tien_nt2: { header_v: 'Tiền hàng nt' }
    });
    assert.strictEqual(plain5, 'Nếu không tick Phí DV-TN: lấy Tiền hàng nt, ngược lại lấy 0');

    // 6. Test nested ternary: ([gia_nt] == 0 ? ([so_luong] != 0 ? ([tien_nt2]/[so_luong]) : 0) : [gia_nt])
    const ast6 = FormulaAstParser.parse('([gia_nt] == 0 ? ([so_luong] != 0 ? ([tien_nt2]/[so_luong]) : 0) : [gia_nt])');
    assert.ok(ast6);
    assert.strictEqual(ast6.type, 'ternary');
    assert.strictEqual(ast6.then.type, 'ternary');
    const plain6 = FormulaAstParser.toPlainVi(ast6, {
        gia_nt: { header_v: 'Giá nt' },
        so_luong: { header_v: 'Số lượng' },
        tien_nt2: { header_v: 'Tiền hàng nt' }
    });
    assert.strictEqual(plain6, 'Nếu Giá nt = 0 (chưa nhập) và Số lượng ≠ 0: tự tính Tiền hàng nt / Số lượng, ngược lại giữ nguyên Giá nt');

    // 7. Test round function: round([gia_vat_nt] * (1 - [tl_ck]/100) / (1 + [thue_suat]/100), 4) (FIX-16)
    const ast7 = FormulaAstParser.parse('round([gia_vat_nt] * (1 - [tl_ck]/100) / (1 + [thue_suat]/100), 4)');
    assert.ok(ast7, 'ast7 should not be null');
    assert.strictEqual(ast7.type, 'call');
    assert.strictEqual(ast7.name, 'round');
    assert.strictEqual(ast7.args.length, 2);
    assert.strictEqual(ast7.args[1].value, 4);

    const refs7 = FormulaAstParser.collectRefs(ast7);
    assert.deepStrictEqual(refs7, ['gia_vat_nt', 'tl_ck', 'thue_suat']);

    const plain7 = FormulaAstParser.toPlainVi(ast7, {
        gia_vat_nt: { header_v: 'Giá gồm VAT nt' },
        tl_ck: { header_v: 'Tỷ lệ CK' },
        thue_suat: { header_v: 'Thuế suất' }
    });
    assert.ok(plain7.includes('Làm tròn('));
    assert.ok(plain7.includes('4 chữ số'));

    // 8. Test 1-arg round
    const ast8 = FormulaAstParser.parse('round([tien_nt])');
    assert.ok(ast8);
    assert.strictEqual(ast8.type, 'call');
    assert.strictEqual(ast8.args.length, 1);
    const refs8 = FormulaAstParser.collectRefs(ast8);
    assert.deepStrictEqual(refs8, ['tien_nt']);

    console.log('✅ FormulaAstParser tests passed successfully!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
