const assert = require('assert');
const path = require('path');
const { SqlTemplateRenderer } = require('../generator/SqlTemplateRenderer');
const { YCNDXA, ZCWIMO } = require('../generator/Presets');

function run() {
    console.log('Running SqlTemplateRenderer tests...');
    const extension_path = path.resolve(__dirname, '../../..');
    const renderer = new SqlTemplateRenderer(extension_path);

    // Test 1: Partitioned mode (YCNDXA fixture)
    const sql_ycn = renderer.render(YCNDXA);
    assert.ok(sql_ycn, 'SQL output must be non-empty');
    assert.ok(sql_ycn.includes("exec fsd_addFields 'd64$','sl_ycn','numeric(19,4)'"), 'Must contain fsd_addFields for source taken column d64$');
    assert.ok(sql_ycn.includes("exec fsd_addFields 'dycn$','stt_rec_dxa','char(13)'"), 'Must contain fsd_addFields for trace field stt_rec_dxa');
    assert.ok(sql_ycn.includes("CREATE PROCEDURE fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran"), 'Must contain proc creation');
    assert.ok(sql_ycn.includes("DELETE FROM sysfilterdeclares WHERE controller = 'YCNDXAMultiGrid'"), 'Must contain sysfilter DELETE');

    // 6 dòng sysfilter chuẩn
    assert.ok(sql_ycn.includes("VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.CurrencyCode', N'ma_nt', N'þm.ma_nt'"), 'Must contain sysfilter INSERT for CurrencyCode');
    assert.ok(sql_ycn.includes("VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.ItemCode', N'ma_vt', N'þa.ma_vt'"), 'Must contain sysfilter INSERT for ItemCode');
    assert.ok(sql_ycn.includes("VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.ItemName', N'ten_vt%2', N'þb.ten_vt%2'"), 'Must contain sysfilter INSERT for ItemName');
    assert.ok(sql_ycn.includes("VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.UOM', N'dvt', N'þa.dvt'"), 'Must contain sysfilter INSERT for UOM');
    assert.ok(sql_ycn.includes("VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.VoucherDate', N'ngay_ct', N'þa.ngay_ct'"), 'Must contain sysfilter INSERT for VoucherDate');
    assert.ok(sql_ycn.includes("VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.VoucherNumber', N'so_ct', N'þa.so_ct'"), 'Must contain sysfilter INSERT for VoucherNumber');

    assert.ok(sql_ycn.includes("<!ENTITY VoucherBeforeUpdate \""), 'Must contain entity snippet VoucherBeforeUpdate');
    assert.ok(sql_ycn.includes("Dir/YCNTran.xml"), 'Must reference destination tran');

    // FIX-05: Detail XML snippets
    assert.ok(sql_ycn.includes("Grid/YCNDetail.xml"), 'Must reference Grid/YCNDetail.xml');
    assert.ok(sql_ycn.includes("<!-- BEGIN Detail.fields -->"), 'Must have BEGIN Detail.fields');
    assert.ok(sql_ycn.includes('<field name="stt_rec_dxa" width="0" hidden="true" readOnly="true">'), 'Must declare hidden trace field');
    assert.ok(sql_ycn.includes('<field name="dxa_so" width="100" readOnly="true">'), 'Must declare visible text trace field');
    assert.ok(sql_ycn.includes('<field name="dxa_ln" type="Int32" width="70" align="right" readOnly="true">'), 'Must declare visible int trace field');
    assert.ok(sql_ycn.includes("<!-- END Detail.fields -->"), 'Must have END Detail.fields');

    assert.ok(sql_ycn.includes("<!-- BEGIN Detail.view.Grid -->"), 'Must have BEGIN Detail.view.Grid');
    assert.ok(sql_ycn.includes('<field name="stt_rec_dxa"/>'), 'Must have view ref for stt_rec_dxa');
    assert.ok(sql_ycn.includes('<field name="dxa_ln"/>'), 'Must have view ref for dxa_ln');
    assert.ok(sql_ycn.includes("<!-- END Detail.view.Grid -->"), 'Must have END Detail.view.Grid');

    // FIX-16: ENTITY UpdatefsdSttRecRef & DeletefsdSttRecRef đầy đủ
    assert.ok(sql_ycn.includes("insert into fsdSttRecRef (stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_pre, stt_rec0pre)"), 'Must have full column list for fsdSttRecRef');
    assert.ok(sql_ycn.includes("select stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_dxa, stt_rec0dxa"), 'Must select trace columns for fsdSttRecRef');
    assert.ok(sql_ycn.includes("from dycn$$partition$current"), 'Must query from dycn$$partition$current');
    assert.ok(sql_ycn.includes("where stt_rec_dxa &lt;&gt; '' and stt_rec = @stt_rec"), 'Must have escaped &lt;&gt; in where clause');
    assert.ok(sql_ycn.includes("delete a from fsdSttRecRef a join dycn$$partition$current b on a.stt_rec = b.stt_rec where a.stt_rec = @stt_rec"), 'Must have full DeletefsdSttRecRef');
    assert.ok(!sql_ycn.includes("insert into fsdSttRecRef (...)"), 'Must not have stub dots');
    assert.ok(!sql_ycn.includes("join dycn$$partition$current b ..."), 'Must not have stub delete dots');

    // FIX-15: Body proc đầy đủ cho Partitioned mode
    assert.ok(sql_ycn.includes("IF OBJECT_ID(N'dbo.fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran', N'P') IS NOT NULL"), 'Must drop existing proc');
    assert.ok(sql_ycn.includes("DROP PROCEDURE dbo.fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran"), 'Must contain DROP PROCEDURE');
    assert.ok(sql_ycn.includes("INTO #YCNDXA_1"), 'Must create #identity_1 temp table');
    assert.ok(sql_ycn.includes("FROM dycn$000000 a"), 'Must select top 0 from dycn$000000');
    assert.ok(sql_ycn.includes("JOIN c64$000000 b ON a.stt_rec_dxa = b.stt_rec"), 'Must join c64$000000');
    assert.ok(sql_ycn.includes("INTO #stt_rec_YCNDXA"), 'Must create #stt_rec_identity temp table');
    assert.ok(sql_ycn.includes("ROUND(b.so_luong * (b.he_so / a.he_so), 3) END as sl_ycn"), 'Must calculate sl_ycn using ROUND with he_so conversion');
    assert.ok(sql_ycn.includes("from d64$'+parti+' a"), 'Must join d64$ + parti');
    assert.ok(sql_ycn.includes("update a set sl_ycn = a.sl_ycn ' + CASE WHEN @Type = '1' THEN '-' ELSE ' + ' END + ' b.sl_ycn"), 'Must update sl_ycn in loop');
    assert.ok(!sql_ycn.includes('-- Template tu YCNTranFromSOTran: temp # lay field vet'), 'Must not contain old stub comment');

    // Test 2: Single mode (zcWIMO fixture)
    const sql_wi = renderer.render(ZCWIMO);
    assert.ok(sql_wi.includes("exec fsd_addFields 'ctsx','sl_pnd','numeric(19,4)'"), 'Must contain fsd_addFields for source detail ctsx');
    assert.ok(sql_wi.includes("IF OBJECT_ID(N'dbo.fsd_FastBusiness$Voucher$BeforeAfterUpdate$WITranFromSX1Tran', N'P') IS NOT NULL"), 'Must drop single proc if exists');
    assert.ok(sql_wi.includes("CREATE PROCEDURE fsd_FastBusiness$Voucher$BeforeAfterUpdate$WITranFromSX1Tran"), 'Must contain proc for WITran');
    assert.ok(sql_wi.includes("INTO #zcWIMO_1"), 'Must create #zcWIMO_1 temp table');
    assert.ok(sql_wi.includes("FROM d04$000000 a"), 'Must select from d04$000000');
    assert.ok(sql_wi.includes("b.so_luong as sl_pnd"), 'Single mode use_he_so_convert=false must directly use so_luong');
    assert.ok(sql_wi.includes("from ctsx a"), 'Must join ctsx in single mode');
    assert.ok(sql_wi.includes("update a set sl_pnd = a.sl_pnd + CASE WHEN @Type = '1' THEN -b.sl_pnd ELSE b.sl_pnd END"), 'Must update sl_pnd in single mode');

    // Test 3: Partitioned mode with use_he_so_convert = false
    const sql_no_heso = renderer.render({ ...YCNDXA, use_he_so_convert: false });
    assert.ok(sql_no_heso.includes("b.so_luong as sl_ycn"), 'Must not use ROUND he_so when use_he_so_convert is false');
    assert.ok(!sql_no_heso.includes("ROUND(b.so_luong"), 'Must not contain ROUND when use_he_so_convert is false');

    console.log('  ✓ SqlTemplateRenderer tests passed!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
