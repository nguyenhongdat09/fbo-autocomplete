const assert = require('assert');
const { deriveFormInput, buildDetailFieldXml, buildDetailViewXml } = require('../generator/deriveFormInput');
const { YCNDXA, ZCWIMO } = require('../generator/Presets');

function run() {
    console.log('Running deriveFormInput tests...');

    // Test 1: Partitioned mode (YCNDXA fixture)
    const derived_ycn = deriveFormInput(YCNDXA);
    assert.strictEqual(derived_ycn.src_d_table, 'd64$');
    assert.strictEqual(derived_ycn.src_m_prefix, 'm64$');
    assert.strictEqual(derived_ycn.src_i_prefix, 'i64$');
    assert.strictEqual(derived_ycn.src_m_table_general, 'm64$000000');
    assert.strictEqual(derived_ycn.flow_multi_general_table, 'c64$000000');
    assert.strictEqual(derived_ycn.src_c_table, 'c64$000000');
    assert.strictEqual(derived_ycn.dest_line_qty_col, 'so_luong');
    assert.strictEqual(derived_ycn.use_he_so_convert, true);
    assert.strictEqual(derived_ycn.dest_d_table_struct, 'dycn$000000');
    assert.strictEqual(derived_ycn.src_d_table_arg, 'd64$');
    assert.strictEqual(derived_ycn.stt_rec_src_col, 'stt_rec_dxa');
    assert.strictEqual(derived_ycn.stt_rec0_src_col, 'stt_rec0dxa');
    assert.strictEqual(derived_ycn.finding_status_arg, '2');
    assert.strictEqual(derived_ycn.filter_key_flow, "status in (''2'')");
    assert.strictEqual(derived_ycn.multigrid_status_clause, " and m.status in (''2'')");
    assert.strictEqual(derived_ycn.multigrid_filter_extra_sql, " and trang_thai_giao_hang in (''5'')");
    assert.strictEqual(derived_ycn.filter_retrieve_fields, 'ma_nt');
    assert.strictEqual(derived_ycn.lookup_detail_table, '');
    assert.strictEqual(derived_ycn.lookup_detail_alias, '');
    assert.strictEqual(derived_ycn.lookup_detail_remain_expr, '');
    assert.ok(derived_ycn.multiform_transfer_js.includes("var ma_nt = w.getItemValue('ma_nt')"));
    assert.ok(derived_ycn.multiform_transfer_js.includes("if (v) map += ''; //ex 'gia_nt, gia'"));
    assert.ok(derived_ycn.multiform_transfer_js.includes("if (z.blankMemvar(row))"));
    assert.ok(derived_ycn.multiform_transfer_js.includes("z._appendRow(null, true)"));
    assert.ok(derived_ycn.multiform_transfer_js.includes("insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2)"));
    assert.ok(derived_ycn.multiform_transfer_js.includes("$func.setObjectWhen(z._getItem(row, l1), a[r][l2]);"));
    assert.ok(derived_ycn.multiform_transfer_js.includes("fields = 'ma_vt, ten_vt%l, dvt, he_so, ma_lo_ban, lo_yn'"));
    assert.ok(!derived_ycn.multiform_transfer_js.includes('_customerIdentity'));
    assert.ok(!derived_ycn.multiform_transfer_js.includes('setItemValues'));
    assert.ok(!derived_ycn.multiform_transfer_js.includes('setReferenceKeyFilter'));
    assert.ok(!derived_ycn.multiform_transfer_js.includes('executeAggregate'));
    assert.ok(derived_ycn.multigrid_ma_nt_field.includes('name="ma_nt"'));
    assert.ok(derived_ycn.multigrid_ma_nt_view.includes('<field name="ma_nt"/>'));

    // Test custom lookup detail fields
    const derived_custom = deriveFormInput({
        ...YCNDXA,
        lookup_detail_table: 'd64$%Partition',
        lookup_detail_alias: 'z3',
        lookup_detail_remain_expr: 'z3.sl_ycn < z3.so_luong'
    });
    assert.strictEqual(derived_custom.lookup_detail_table, 'd64$%Partition');
    assert.strictEqual(derived_custom.lookup_detail_alias, 'z3');
    assert.strictEqual(derived_custom.lookup_detail_remain_expr, 'z3.sl_ycn < z3.so_luong');

    // Test Detail XML snippets
    assert.ok(derived_ycn.detail_fields_xml.includes('name="stt_rec_dxa" width="0" hidden="true" readOnly="true"'));
    assert.ok(derived_ycn.detail_fields_xml.includes('name="dxa_so" width="100" readOnly="true"'));
    assert.ok(derived_ycn.detail_fields_xml.includes('name="dxa_ln" type="Int32" width="70" align="right" readOnly="true"'));
    assert.ok(derived_ycn.detail_views_xml.includes('<field name="stt_rec_dxa"/>'));
    assert.ok(derived_ycn.detail_views_xml.includes('<field name="dxa_ln"/>'));

    // Test 2: Single mode (zcWIMO fixture)
    const derived_wi = deriveFormInput(ZCWIMO);
    assert.strictEqual(derived_wi.src_d_table, 'ctsx');
    assert.strictEqual(derived_wi.src_d_table_arg, 'ctsx');
    assert.strictEqual(derived_wi.flow_multi_general_table, 'phsx');
    assert.strictEqual(derived_wi.stt_rec_src_col, 'stt_rec_sx1');
    assert.strictEqual(derived_wi.stt_rec0_src_col, 'stt_rec0sx1');
    assert.strictEqual(derived_wi.finding_status_arg, '1, 2');
    assert.strictEqual(derived_wi.filter_key_flow, "status in (''1'', ''2'')");
    assert.strictEqual(derived_wi.multigrid_status_clause, " and m.status in (''1'', ''2'')");
    assert.strictEqual(derived_wi.multigrid_filter_extra_sql, "");
    assert.strictEqual(derived_wi.lookup_detail_table, 'ctsx');
    assert.strictEqual(derived_wi.lookup_detail_alias, 'z3');
    assert.strictEqual(derived_wi.lookup_detail_remain_expr, 'z3.sl_pxh < z3.so_luong');
    assert.ok(derived_wi.multiform_transfer_js.includes("if (z.blankMemvar(row))"));
    assert.ok(derived_wi.multiform_transfer_js.includes("fields = 'ma_vt, ten_vt%l, dvt, he_so, lo_yn'"));
    assert.ok(!derived_wi.multiform_transfer_js.includes('_customerIdentity'));
    assert.ok(!derived_wi.multiform_transfer_js.includes('setItemValues'));

    // Test 3: include_ma_nt = false
    const derived_no_nt = deriveFormInput({ ...YCNDXA, include_ma_nt: false });
    assert.strictEqual(derived_no_nt.include_ma_nt, false);
    assert.ok(!derived_no_nt.multiform_transfer_js.includes("w.getItemValue('ma_nt')"));
    assert.ok(!derived_no_nt.multiform_transfer_js.includes("l8 = getColumnOrderTagRow"));
    assert.ok(derived_no_nt.multiform_transfer_js.includes("if (z.blankMemvar(row))"));

    console.log('  ✓ deriveFormInput tests passed!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
