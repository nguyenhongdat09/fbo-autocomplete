const assert = require('assert');
const ScenarioParser = require('../parser/ScenarioParser');
const { buildFormulaMap } = require('../../ReadXMLByJS/FormulaHover/GaFormulaMapBuilder');

function run() {
    console.log('🧪 Testing ScenarioParser...');

    const gaBlock = `g.$a = {
        tien_nt2_sl: '[tien_nt2]:=[so_luong]*[gia_nt]',
        tien2: '[tien2]:=[tien_nt2]*[$ty_gia]',
        ck_nt: '[ck_nt]:=[tien_nt2]*[tl_ck]/100',
        thue_nt: '[thue_nt]:=([tien_nt2] - [ck_nt])*[thue_suat]/100',
        tien_mthang_nt: '[tien_mthang_nt]:=([phi_dvtn_yn] == 0 ? [tien_nt2] : 0)',
        t_tien_hang_nt: ['t_tien_hang_nt', 'tien_mthang_nt'],
        t_ck_nt: ['t_ck_nt', 'ck_nt'],
        t_tt_nt: '[t_tt_nt]:=[t_tien_hang_nt]-[t_ck_nt]'
    };`;

    const formulaMap = buildFormulaMap(gaBlock);

    const script = `
        function getRowPhi$GridVoucherDetail$(g) {
            return [g.$a.tien_mthang_nt];
        }

        function onChange$GridVoucherDetail$(o) {
            var name = o.field.Name;
            var g = o.grid;
            switch (name) {
                case 'so_luong':
                    g.validExpression(o, [g.$a.tien_nt2_sl, g.$a.tien2, g.$a.ck_nt, g.$a.thue_nt].concat(getRowPhi$GridVoucherDetail$(g)), [g.$a.t_tien_hang_nt, g.$a.t_ck_nt], [g.$a.t_tt_nt]);
                    calcGiaDvtn$GridVoucherDetail$(o);
                    break;
                case 'gia_nt':
                    g.validExpression(o, [g.$a.tien_nt2_sl, g.$a.tien2, g.$a.ck_nt]);
                    break;
            }
        }
    `;

    const fieldLookup = {
        so_luong: { header_v: 'Số lượng' },
        gia_nt: { header_v: 'Giá nt' }
    };

    const scenarios = ScenarioParser.parse(script, formulaMap, fieldLookup);

    assert.strictEqual(scenarios.length, 2);

    const scenSoLuong = scenarios.find(s => s.id === 'so_luong');
    assert.ok(scenSoLuong);
    assert.strictEqual(scenSoLuong.title_vi, 'Khi sửa Số lượng');
    assert.ok(scenSoLuong.formula_aliases.includes('tien_nt2_sl'));
    assert.ok(scenSoLuong.formula_aliases.includes('tien2'));
    assert.ok(scenSoLuong.formula_aliases.includes('tien_mthang_nt')); // Concat resolved!
    assert.ok(scenSoLuong.aggregate_aliases.includes('t_tien_hang_nt'));
    assert.ok(scenSoLuong.master_aliases.includes('t_tt_nt'));
    // Test Case 2: Nhiều hàm onChange$ (hàm phụ GoodsType đứng trước không có switch)
    const multiOnChangeScript = `
        function onChange$GridVoucherDetail$GoodsType(o) { o.grid.request(o, 'GoodsType'); }
        function onChange$GridVoucherDetail$TaxCode(o) { o.grid.request(o, 'TaxCode'); }
        function onChange$GridVoucherDetail$(sender, eventArgs) {
            var name = eventArgs.get_object().field.Name;
            var o = sender;
            var g = o.grid;
            switch (name) {
                case 'so_luong':
                    g.validExpression(o, [g.$a.tien_nt2_sl, g.$a.tien2], [g.$a.t_ck_nt], [g.$a.t_tt_nt]);
                    calcGiaDvtn$GridVoucherDetail$All(g);
                    break;
                case 'gia':
                    g.validExpression(o, [g.$a.tien2_sl], [g.$a.t_ck_nt], [g.$a.t_tt_nt]);
                    break;
                case 'tl_ck':
                    g.validExpression(o, [g.$a.ck_nt], [g.$a.t_ck_nt], [g.$a.t_tt_nt]);
                    break;
            }
        }
    `;

    const multiScenarios = ScenarioParser.parse(multiOnChangeScript, formulaMap, {
        so_luong: { header_v: 'Số lượng' },
        gia: { header_v: 'Giá' },
        tl_ck: { header_v: 'Tỷ lệ CK' }
    });

    assert.strictEqual(multiScenarios.length, 3, 'Should parse 3 scenarios from main onChange$ function');
    const multiSoLuong = multiScenarios.find(s => s.id === 'so_luong');
    assert.ok(multiSoLuong);
    assert.ok(multiSoLuong.formula_aliases.includes('tien_nt2_sl'));
    assert.ok(!multiSoLuong.formula_aliases.includes('tien2_sl'));
    assert.strictEqual(multiSoLuong.extra_js, true);

    console.log('✅ ScenarioParser tests passed successfully!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
