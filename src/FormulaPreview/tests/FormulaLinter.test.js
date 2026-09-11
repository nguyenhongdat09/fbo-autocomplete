const assert = require('assert');
const FormulaLinter = require('../parser/FormulaLinter');
const FormulaAstParser = require('../parser/FormulaAstParser');

function run() {
    console.log('🧪 Testing FormulaLinter...');

    // 1. Test Divide by Zero detection (ungarded)
    const unguardedEntry = {
        alias: 'gia_nt_bad',
        kind: 'formula',
        target: 'gia_nt',
        formula: '[tien_nt] / [so_luong]',
        ast: FormulaAstParser.parse('[tien_nt] / [so_luong]'),
        refs: ['tien_nt', 'so_luong']
    };

    const fields = {
        so_luong: { header_v: 'Số lượng' },
        tien_nt: { header_v: 'Tiền nt' },
        gia_nt: { header_v: 'Giá nt' }
    };

    const diag1 = FormulaLinter.lint([unguardedEntry], fields);
    const div0Issue = diag1.find(d => d.code === 'POTENTIAL_DIVIDE_BY_ZERO');
    assert.ok(div0Issue, 'Should detect potential divide by zero');
    assert.strictEqual(div0Issue.field, 'so_luong');

    // 2. Test Guarded division (should NOT report divide by zero)
    const guardedEntry = {
        alias: 'gia_nt_good',
        kind: 'formula',
        target: 'gia_nt',
        formula: '([so_luong] == 0 ? 0 : [tien_nt] / [so_luong])',
        ast: FormulaAstParser.parse('([so_luong] == 0 ? 0 : [tien_nt] / [so_luong])'),
        refs: ['tien_nt', 'so_luong']
    };

    const diag2 = FormulaLinter.lint([guardedEntry], fields);
    const div0Issue2 = diag2.find(d => d.code === 'POTENTIAL_DIVIDE_BY_ZERO');
    assert.strictEqual(div0Issue2, undefined, 'Guarded division should not trigger divide by zero warning');

    // 3. Test Undefined field detection
    const undefEntry = {
        alias: 'tien_bad',
        kind: 'formula',
        target: 'tien_nt',
        formula: '[so_luong] * [gia_nt_not_exist]',
        ast: FormulaAstParser.parse('[so_luong] * [gia_nt_not_exist]'),
        refs: ['so_luong', 'gia_nt_not_exist']
    };

    const diag3 = FormulaLinter.lint([undefEntry], fields);
    const undefIssue = diag3.find(d => d.code === 'UNDEFINED_FIELD_REF');
    assert.ok(undefIssue, 'Should detect undefined field');
    assert.strictEqual(undefIssue.field, 'gia_nt_not_exist');

    // 4. Test Circular dependency detection (A -> B -> A)
    const cycleEntries = [
        {
            alias: 'gia_nt',
            kind: 'formula',
            target: 'gia_nt',
            formula: '[tien_nt] / [so_luong]',
            ast: FormulaAstParser.parse('[tien_nt] / [so_luong]'),
            refs: ['tien_nt', 'so_luong']
        },
        {
            alias: 'tien_nt',
            kind: 'formula',
            target: 'tien_nt',
            formula: '[so_luong] * [gia_nt]',
            ast: FormulaAstParser.parse('[so_luong] * [gia_nt]'),
            refs: ['so_luong', 'gia_nt']
        }
    ];

    const diag4 = FormulaLinter.lint(cycleEntries, fields);
    const cycleIssue = diag4.find(d => d.code === 'CIRCULAR_DEPENDENCY');
    assert.ok(cycleIssue, 'Should detect circular dependency between gia_nt and tien_nt');

    console.log('✅ FormulaLinter tests passed successfully!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
