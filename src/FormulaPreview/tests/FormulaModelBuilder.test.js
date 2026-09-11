const assert = require('assert');
const fs = require('fs');
const path = require('path');
const FormulaModelBuilder = require('../parser/FormulaModelBuilder');

function run() {
    console.log('🧪 Testing FormulaModelBuilder...');

    const fixturePath = path.join(__dirname, 'fixtures', 'mini-ga-grid.xml');
    const xmlContent = fs.readFileSync(fixturePath, 'utf8');

    const model = FormulaModelBuilder.build(fixturePath, xmlContent);

    assert.strictEqual(model.version, 1);
    assert.strictEqual(model.file_name, 'mini-ga-grid.xml');
    assert.ok(model.entries.length >= 8, `Expected at least 8 entries, got ${model.entries.length}`);

    // Check fields
    assert.ok(model.fields.so_luong);
    assert.strictEqual(model.fields.so_luong.header_v, 'Số lượng');
    assert.strictEqual(model.fields.phi_dvtn_yn.type, 'boolean');

    // Check entries
    const fTienNt2 = model.entries.find(e => e.alias === 'tien_nt2_sl');
    assert.ok(fTienNt2);
    assert.strictEqual(fTienNt2.kind, 'formula');
    assert.strictEqual(fTienNt2.target, 'tien_nt2');
    assert.ok(fTienNt2.plain_vi.includes('Số lượng × Giá nt'));

    // Check aggregate
    const fAgg = model.entries.find(e => e.alias === 't_ck_nt');
    assert.ok(fAgg);
    assert.strictEqual(fAgg.kind, 'aggregate');
    assert.strictEqual(fAgg.master, 't_ck_nt');
    assert.strictEqual(fAgg.grid_col, 'ck_nt');

    // Check aggregate_filter (FIX-09)
    const fAggFilter = model.entries.find(e => e.alias === 't_thue_dvtn_nt');
    assert.ok(fAggFilter);
    assert.strictEqual(fAggFilter.kind, 'aggregate_filter');
    assert.strictEqual(fAggFilter.master, 't_thue_dvtn_nt');
    assert.strictEqual(fAggFilter.grid_col, 'thue_nt');
    assert.ok(fAggFilter.refs.includes('phi_dvtn_yn'), 'refs must include filter field phi_dvtn_yn');
    assert.ok(!fAggFilter.plain_vi.includes('[phi_dvtn_yn]'), 'plain_vi should translate filter');
    assert.ok(fAggFilter.plain_vi.includes('tick Phí DV-TN'), 'plain_vi should include friendly filter text');

    // Check scenarios
    assert.ok(model.scenarios.length >= 3);
    const scenSoLuong = model.scenarios.find(s => s.id === 'so_luong');
    assert.ok(scenSoLuong);
    assert.ok(scenSoLuong.formula_aliases.includes('tien_nt2_sl'));
    assert.ok(scenSoLuong.formula_aliases.includes('tien2'));

    // Check default_demo_chain (FEAT-06)
    assert.ok(Array.isArray(model.default_demo_chain), 'default_demo_chain should be an array');
    assert.ok(model.default_demo_chain.includes('tien_nt2_sl'));
    assert.ok(model.default_demo_chain.includes('t_ck_nt'));
    assert.ok(model.default_demo_chain.includes('t_tt_nt'));

    // Check playground seed
    assert.strictEqual(model.playground.default_scenario_id, 'so_luong');
    assert.strictEqual(model.playground.values.so_luong, 10);
    assert.strictEqual(model.playground.values.gia_nt, 100000);

    // Check dynamic groups (FIX-11)
    assert.ok(Array.isArray(model.groups));
    assert.ok(model.groups.includes('amount'));
    assert.ok(model.groups.includes('discount'));
    assert.ok(model.groups.includes('tax'));
    assert.ok(model.groups.includes('fee'));
    assert.ok(model.groups.includes('master'));
    assert.strictEqual(model.groups.includes('qty_price'), false, 'qty_price should not be in groups since no entry writes to qty_price in mini-ga-grid');

    // Test generic buildDefaultDemoChain with BIPO-like entries (FIX-15, FIX-16)
    const bipoEntries = [
        { alias: 'gia_nt', kind: 'formula', target: 'gia_nt', ast: { type: 'binary', op: '/', left: { type: 'field', name: 'tien_nt' }, right: { type: 'field', name: 'so_luong' } }, refs: ['tien_nt', 'so_luong'] },
        { alias: 'gia_nt_sl', kind: 'formula', target: 'gia_nt', ast: { type: 'field', name: 'gia_nt' }, refs: ['gia_nt', 'so_luong'] },
        { alias: 'gia_nt_vat', kind: 'formula', target: 'gia_nt', ast: { type: 'call', name: 'round', args: [] }, refs: ['gia_vat_nt', 'tl_ck', 'thue_suat'] },
        { alias: 'tien_nt', kind: 'formula', target: 'tien_nt', ast: { type: 'binary', op: '*', left: { type: 'field', name: 'so_luong' }, right: { type: 'field', name: 'gia_nt' } }, refs: ['so_luong', 'gia_nt'] },
        { alias: 't_so_luong', kind: 'aggregate', master: 't_so_luong', grid_col: 'so_luong' },
        { alias: 't_tien_nt', kind: 'aggregate', master: 't_tien_nt', grid_col: 'tien_nt' },
        { alias: 't_tt_nt', kind: 'formula', target: 't_tt_nt', ast: { type: 'binary', op: '+', left: { type: 'field', name: 't_tien_nt' }, right: { type: 'field', name: 't_thue_nt' } }, refs: ['t_tien_nt', 't_thue_nt'] }
    ];

    const bipoChain = FormulaModelBuilder.buildDefaultDemoChain(bipoEntries);
    assert.ok(bipoChain.includes('gia_nt'), 'bipoChain should include representative alias gia_nt');
    assert.ok(bipoChain.includes('tien_nt'), 'bipoChain should include representative alias tien_nt');
    assert.ok(!bipoChain.includes('gia_nt_vat'), 'bipoChain should not include secondary branch gia_nt_vat');
    assert.ok(bipoChain.includes('t_so_luong'), 'bipoChain should include aggregate t_so_luong');
    assert.ok(bipoChain.includes('t_tt_nt'), 'bipoChain should include master formula t_tt_nt');

    console.log('✅ FormulaModelBuilder tests passed successfully!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
