const assert = require('assert');
const { buildFormulaMap } = require('../../ReadXMLByJS/FormulaHover/GaFormulaMapBuilder');

function run() {
    console.log('🧪 Testing GaFormulaMapBuilder Aggregate Extension...');

    const gaBlock = `g.$a = {
        tien_nt2_sl: '[tien_nt2]:=[so_luong]*[gia_nt]',
        t_ck_nt: ['t_ck_nt', 'ck_nt'],
        t_tien_giam_nt: ['t_tien_giam_nt', '[tien_nt2]', '[loai] == "90"'],
        t_tien_hang_nt: ['t_tien_hang_nt', 'tien_mthang_nt']
    };`;

    const map = buildFormulaMap(gaBlock);
    assert.strictEqual(map.size, 4);

    const f1 = map.get('tien_nt2_sl');
    assert.strictEqual(f1.kind, 'formula');
    assert.strictEqual(f1.target, 'tien_nt2');
    assert.strictEqual(f1.formula, '[so_luong]*[gia_nt]');

    const agg2 = map.get('t_ck_nt');
    assert.strictEqual(agg2.kind, 'aggregate');
    assert.strictEqual(agg2.master, 't_ck_nt');
    assert.strictEqual(agg2.grid_col, 'ck_nt');

    const agg3 = map.get('t_tien_giam_nt');
    assert.strictEqual(agg3.kind, 'aggregate_filter');
    assert.strictEqual(agg3.master, 't_tien_giam_nt');
    assert.strictEqual(agg3.grid_col, 'tien_nt2');
    assert.strictEqual(agg3.filter, '[loai] == "90"');

    // Test Case 2: Khối g.$a bị nhiễm ]]> và <![CDATA[ do entity xen giữa CDATA
    const pollutedGaBlock = `g.$a = {
        tienmt_ty_le: '[tienmt]:=[tien2]',
        ]]>t_tien_giam_nt: ['t_tien_giam_nt', '[tien_nt2]', '[loai] == "90"'],
        <![CDATA[t_ck_nt: ['t_ck_nt', 'ck_nt']
    };`;

    const mapPolluted = buildFormulaMap(pollutedGaBlock);
    assert.ok(mapPolluted.has('t_tien_giam_nt'), 'Should parse clean alias t_tien_giam_nt');
    assert.ok(!mapPolluted.has(']]>t_tien_giam_nt'), 'Should not contain polluted alias ]]>t_tien_giam_nt');
    assert.ok(mapPolluted.has('t_ck_nt'), 'Should parse clean alias t_ck_nt');
    // Test Case 3: Aggregate grid_col dạng biểu thức không bị cắt mất dấu ] cuối (FIX-14)
    const exprGaBlock = `g.$a = {
        t_tien2: ['t_tien2', '(([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck]', '[km_yn] == 0']
    };`;
    const mapExpr = buildFormulaMap(exprGaBlock);
    const aggExpr = mapExpr.get('t_tien2');
    assert.ok(aggExpr);
    assert.strictEqual(aggExpr.kind, 'aggregate_filter');
    assert.strictEqual(aggExpr.master, 't_tien2');
    assert.strictEqual(aggExpr.grid_col, '(([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck]');
    assert.ok(aggExpr.grid_col.endsWith('[ck]'), 'grid_col should end with [ck]');
    assert.ok(!aggExpr.grid_col.endsWith('[ck'), 'grid_col should not end with truncated [ck');

    console.log('✅ GaFormulaMapBuilder Aggregate tests passed successfully!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
