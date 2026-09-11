const assert = require('assert');
const path = require('path');
const { XmlTemplateRenderer } = require('../generator/XmlTemplateRenderer');
const { YCNDXA, ZCWIMO } = require('../generator/Presets');

function run() {
    console.log('Running XmlTemplateRenderer tests...');
    const extension_path = path.resolve(__dirname, '../../..');
    const renderer = new XmlTemplateRenderer(extension_path);

    // Test 1: Partitioned mode (YCNDXA fixture)
    const xml_ycn = renderer.render(YCNDXA);
    assert.ok(xml_ycn.Filter, 'Filter XML must be generated');
    assert.ok(xml_ycn.MultiForm, 'MultiForm XML must be generated');
    assert.ok(xml_ycn.MultiGrid, 'MultiGrid XML must be generated');
    assert.ok(xml_ycn.Lookup, 'Lookup XML must be generated');

    // Verify Filter YCNDXA (FIX-17 & FIX-23)
    assert.ok(xml_ycn.Filter.includes('<!ENTITY XMLFlowFilterViews SYSTEM "..\\Include\\XML\\FlowFilterViews.txt">'), 'Filter must include XMLFlowFilterViews');
    assert.ok(xml_ycn.Filter.includes('<!ENTITY XMLFlowFilterCommand SYSTEM "..\\Include\\XML\\FlowFilterCommand.txt">'), 'Filter must include XMLFlowFilterCommand');
    assert.ok(xml_ycn.Filter.includes('<!ENTITY ScriptFlowFilterCss SYSTEM "..\\Include\\Javascript\\FlowFilterCss.txt">'), 'Filter must include ScriptFlowFilterCss');
    assert.ok(xml_ycn.Filter.includes('<!ENTITY ScriptFlowFilterFunction SYSTEM "..\\Include\\Javascript\\FlowFilterFunction.txt">'), 'Filter must include ScriptFlowFilterFunction');
    assert.ok(xml_ycn.Filter.includes('<!ENTITY CheckRelativeQuery "'), 'Filter must include CheckRelativeQuery entity');
    assert.ok(xml_ycn.Filter.includes('table="m64$000000"'), 'Filter must use m64$000000');
    assert.ok(xml_ycn.Filter.includes('id="DXA"'), 'Filter must have id DXA');
    assert.ok(xml_ycn.Filter.includes('<field name="ngay_ct1" type="DateTime" dataFormatString="@datetimeFormat"'), 'Filter must declare ngay_ct1');
    assert.ok(xml_ycn.Filter.includes('<field name="so_ct" align="right" maxLength="-100" filterSource="voucherNumber"'), 'Filter must declare so_ct');
    assert.ok(xml_ycn.Filter.includes('<field name="ma_kh" readOnly="true" defaultValue="\'\'" hidden="true">'), 'Filter must declare ma_kh');
    assert.ok(xml_ycn.Filter.includes('<view id="Dir" height="88">'), 'Filter must define Dir view');
    assert.ok(xml_ycn.Filter.includes('&XMLFlowFilterCommand;'), 'Filter must include &XMLFlowFilterCommand;');
    assert.ok(xml_ycn.Filter.includes('<command event="Checking">'), 'Filter must include Checking command');
    assert.ok(xml_ycn.Filter.includes("select @keyFlow = 'status in (''2'')'"), 'Filter must derive keyFlow from finding_status_list');
    assert.ok(xml_ycn.Filter.includes("while (month(@c) + year(@c)*12) <= (month(@ngay_ct2) + year(@ngay_ct2)*12)"), 'Filter must loop partition months');
    assert.ok(xml_ycn.Filter.includes("i]]>&ext;<![CDATA[$"), 'Filter must reference i]]>&ext;<![CDATA[$');
    assert.ok(xml_ycn.Filter.includes("goto Retrieve"), 'Filter must have goto Retrieve');
    assert.ok(xml_ycn.Filter.includes("&CheckRelativeProcess;"), 'Filter must contain CheckRelativeProcess');
    assert.ok(xml_ycn.Filter.includes("&ScriptFlowFilterFunction;"), 'Filter must include &ScriptFlowFilterFunction;');
    assert.ok(xml_ycn.Filter.includes("function init$]]>&Identity;<![CDATA[Filter$(f)"), 'Filter must define init$');
    assert.ok(xml_ycn.Filter.includes("f.setItemValues('ngay_ct2, ma_kh, ma_dvcs', [d, c, u])"), 'Filter active$ must set ngay_ct2, ma_kh, ma_dvcs');
    assert.ok(xml_ycn.Filter.includes("on$]]>&Identity;<![CDATA[Filter$Retrieve$QueryComplete"), 'Filter must call Retrieve QueryComplete');
    assert.ok(xml_ycn.Filter.includes("&ScriptFlowFilterCss;"), 'Filter must include &ScriptFlowFilterCss;');
    assert.ok(!xml_ycn.Filter.includes('-- PARTITIONED: loop'), 'Filter must not contain stub comments');

    // Verify Lookup YCNDXA
    // Verify Lookup YCNDXA (FIX-22)
    assert.ok(xml_ycn.Lookup.includes('<!ENTITY % Control.Filter SYSTEM "..\\Include\\Filter.Lookup.ent">'), 'Lookup must include Filter.Lookup.ent');
    assert.ok(xml_ycn.Lookup.includes('<!ENTITY Controller "\'YCNDXALookup\'">'), 'Lookup Controller must be YCNDXALookup');
    assert.ok(xml_ycn.Lookup.includes('<!ENTITY CheckRelativeQuery "set @$primeFilter = \'1 = 0\'">'), 'Lookup CheckRelativeQuery must be set @$primeFilter');
    assert.ok(xml_ycn.Lookup.includes('<lookup table="m64$000000" code="so_ct" name="stt_rec" order="ngay_ct, so_ct, stt_rec"'), 'Lookup must have order ngay_ct, so_ct, stt_rec');
    assert.ok(xml_ycn.Lookup.includes('<field name="so_ct" align="right"'), 'Lookup must declare so_ct field');
    assert.ok(xml_ycn.Lookup.includes('<field name="t_tien_nt2" type="Decimal"'), 'Lookup must declare t_tien_nt2 field');
    assert.ok(xml_ycn.Lookup.includes('<field name="u0%l" allowFilter="true"'), 'Lookup must declare u0%l field');
    assert.ok(xml_ycn.Lookup.includes('&DeclareCommandFilter;'), 'Lookup must declare &DeclareCommandFilter;');
    assert.ok(xml_ycn.Lookup.includes('declare @unit varchar(128), @custID varchar(32)'), 'Lookup preamble must declare @unit and @custID');
    assert.ok(xml_ycn.Lookup.includes("'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,status'"), 'Lookup must pass default lookup_output_fields');
    assert.ok(xml_ycn.Lookup.includes("'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,a.status,b.statusname%l u0%l'"), 'Lookup must pass default lookup_select_fields');
    assert.ok(xml_ycn.Lookup.includes("'a left join dmttct b on a.status = b.status where b.ma_ct = ''DXA'''"), 'Lookup must pass default lookup_from_clause with src_ma_ct');
    assert.ok(xml_ycn.Lookup.includes("exec FastBusiness$App$Voucher$Finding 'DXA', 'c64$000000', 'm64$', 'i64$'"), 'Lookup must call Finding with partitioned args');
    assert.ok(xml_ycn.Lookup.includes('convert(char(6)'), 'Lookup must format date with convert(char(6)');
    assert.ok(xml_ycn.Lookup.includes("select @$primeJoin += ''"), 'Lookup primeJoin must default to empty string');
    assert.ok(!xml_ycn.Lookup.includes('select sum(sl_ycn)'), 'Lookup must not contain sum join in @$primeJoin');
    assert.ok(xml_ycn.Lookup.includes("@ngay_ct1, @ngay_ct2, '', '', '2', '0', @unit"), 'Lookup must pass finding_status_arg');
    assert.ok(xml_ycn.Lookup.includes("default, @$primeJoin, @$primeFilter,\n  '', '', ''"), 'Lookup must render empty detail args when not provided');
    assert.ok(!xml_ycn.Lookup.includes("'d64$%Partition'"), 'Lookup must not auto-fill d64$%Partition when empty');

    // Verify MultiGrid YCNDXA (FIX-21)
    assert.ok(xml_ycn.MultiGrid.includes('<!ENTITY % GridInitialize SYSTEM "..\\Include\\Grid.ent">'), 'MultiGrid must include Grid.ent');
    assert.ok(xml_ycn.MultiGrid.includes('<!ENTITY % Control.Filter SYSTEM "..\\Include\\Filter.Voucher.ent">'), 'MultiGrid must include Filter.Voucher.ent');
    assert.ok(xml_ycn.MultiGrid.includes('<!ENTITY Controller "\'YCNDXAFlowMultiGrid\'">'), 'MultiGrid Controller must be YCNDXAFlowMultiGrid');
    assert.ok(xml_ycn.MultiGrid.includes('<!ENTITY CheckRelativeQuery "'), 'MultiGrid must contain CheckRelativeQuery entity');
    assert.ok(xml_ycn.MultiGrid.includes('<grid order="ngay_ct, so_ct, stt_rec, line_nbr" type="Inquiry"'), 'MultiGrid must have order attribute');
    assert.ok(xml_ycn.MultiGrid.includes('<subTitle v="Từ ngày %d1 đến ngày %d2" e="Date from %d1 to %d2">'), 'MultiGrid must declare subTitle');
    assert.ok(xml_ycn.MultiGrid.includes('<field name="chon" type="Boolean" external="true"'), 'MultiGrid must declare chon checkbox field');
    assert.ok(xml_ycn.MultiGrid.includes('<field name="so_luong0" type="Decimal"'), 'MultiGrid must declare so_luong0 field');
    assert.ok(xml_ycn.MultiGrid.includes('&FlowMultiGridCommand;'), 'MultiGrid must include &FlowMultiGridCommand;');
    assert.ok(xml_ycn.MultiGrid.includes('&FlowMultiGridFinding;'), 'MultiGrid must include &FlowMultiGridFinding;');
    assert.ok(xml_ycn.MultiGrid.includes('&FlowMultiGridScript;'), 'MultiGrid must include &FlowMultiGridScript;');
    assert.ok(xml_ycn.MultiGrid.includes('function init$FlowMulti$GridQuery$'), 'MultiGrid script must define init$');
    assert.ok(xml_ycn.MultiGrid.includes('function toggle$FlowMulti$GridQuery$'), 'MultiGrid script must define toggle$');
    assert.ok(xml_ycn.MultiGrid.includes('function onChange$FlowMulti$GridQuery$'), 'MultiGrid script must define onChange$');
    assert.ok(xml_ycn.MultiGrid.includes('&FlowMultiGridToolbar;'), 'MultiGrid must include &FlowMultiGridToolbar;');
    assert.ok(xml_ycn.MultiGrid.includes('m]]>&Table;<![CDATA[$%Partition m with(nolock) join d]]>&Table;<![CDATA[$%Partition a with(nolock)'), 'MultiGrid must join partitioned tables with nolock');
    assert.ok(xml_ycn.MultiGrid.includes("m.ma_dvcs = ''' + replace(rtrim(@ma_dvcs), '''', '''''') + ''' and m.status in (''2'') and a.sl_ycn < a.so_luong and trang_thai_giao_hang in (''5'')"), 'MultiGrid where clause must have ma_dvcs, status, qty, extra filter');
    assert.ok(xml_ycn.MultiGrid.includes("field name=\"sl_ycn\""), 'MultiGrid must declare sl_ycn field');
    assert.ok(xml_ycn.MultiGrid.includes("field name=\"ma_nt\""), 'MultiGrid must declare ma_nt field when include_ma_nt=true');
    assert.ok(xml_ycn.MultiGrid.includes("<field name=\"ma_nt\"/>"), 'MultiGrid view must include ma_nt when include_ma_nt=true');

    // Verify MultiForm YCNDXA (FIX-18, 19, 20)
    assert.ok(xml_ycn.MultiForm.includes('<!ENTITY FlowMultiGeneralTable "c64$000000">'), 'MultiForm general table must be c64$000000');
    assert.ok(xml_ycn.MultiForm.includes('stt_rec_dxa'), 'MultiForm f2 must contain stt_rec_dxa');
    assert.ok(xml_ycn.MultiForm.includes('<!ENTITY OtherCopyField "nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn">'), 'MultiForm OtherCopyField must match FIX-07');
    assert.ok(xml_ycn.MultiForm.includes("<fields>\n    &FlowMultiFormField;\n  </fields>"), 'MultiForm fields must be multi-line formatted per FIX-20');
    assert.ok(xml_ycn.MultiForm.includes("<views>\n    &FlowMultiFormView;\n  </views>"), 'MultiForm views must be multi-line formatted per FIX-20');
    assert.ok(xml_ycn.MultiForm.includes("<command event=\"Showing\">\n      <text>\n        <![CDATA[\nselect 'show$]]>&Identity;<![CDATA[$(this);' as message\nreturn"), 'MultiForm Showing must be multi-line formatted per FIX-18');
    assert.ok(xml_ycn.MultiForm.includes("<command event=\"Loading\">\n      <text>\n        <![CDATA[\nselect 'active$]]>&Identity;<![CDATA[$(this);' as message\nreturn"), 'MultiForm Loading must be multi-line formatted per FIX-18');
    assert.ok(xml_ycn.MultiForm.includes("<command event=\"Closing\">\n      <text>\n        <![CDATA[\nselect 'close$]]>&Identity;<![CDATA[$(this);' as message\nreturn"), 'MultiForm Closing must be multi-line formatted per FIX-18');
    assert.ok(xml_ycn.MultiForm.includes("h.getItemValue('ma_dvcs')"), 'MultiForm show$ must read ma_dvcs');
    assert.ok(xml_ycn.MultiForm.includes("h.getItemValue('ngay_lct').z"), 'MultiForm show$ must read ngay_lct date');
    assert.ok(xml_ycn.MultiForm.includes("show$FlowMulti$Form(f, queryFilterString,"), 'MultiForm show$ must call show$FlowMulti$Form');
    assert.ok(xml_ycn.MultiForm.includes("f.add_onResponseComplete(on]]>&Identity;<![CDATA[Form$ResponseComplete)"), 'MultiForm active$ must register ResponseComplete');
    assert.ok(xml_ycn.MultiForm.includes("f.remove_onResponseComplete(on]]>&Identity;<![CDATA[Form$ResponseComplete)"), 'MultiForm close$ must unregister ResponseComplete');
    assert.ok(xml_ycn.MultiForm.includes("['date', 'String', d.format('yyyyMMdd')]"), 'MultiForm Checking must include date in request');
    assert.ok(xml_ycn.MultiForm.includes("if (z.blankMemvar(row)) { ins = false; first = false; }"), 'MultiForm TransferData must reuse blank row');
    assert.ok(xml_ycn.MultiForm.includes("if (ins) z._appendRow(null, true);"), 'MultiForm TransferData must append row when not blank');
    assert.ok(xml_ycn.MultiForm.includes("insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);"), 'MultiForm TransferData must call insert$RetrieveTagRow$Items');
    assert.ok(xml_ycn.MultiForm.includes("$func.setObjectWhen(z._getItem(row, l1), a[r][l2]);"), 'MultiForm TransferData must setObjectWhen');
    assert.ok(xml_ycn.MultiForm.includes("z._focusWhenTabChanged();"), 'MultiForm TransferData must focus tab');
    assert.ok(xml_ycn.MultiForm.includes("f.cancelDialog();"), 'MultiForm TransferData must cancel dialog');
    assert.ok(!xml_ycn.MultiForm.includes('_customerIdentity'), 'MultiForm must not contain _customerIdentity per FIX-12');
    assert.ok(!xml_ycn.MultiForm.includes('w.setItemValues('), 'MultiForm must not contain master setItemValues per FIX-12');
    assert.ok(!xml_ycn.MultiForm.includes('w.setReferenceKeyFilter('), 'MultiForm must not contain setReferenceKeyFilter per FIX-12');
    assert.ok(!xml_ycn.MultiForm.includes('z.executeAggregate('), 'MultiForm must not contain executeAggregate per FIX-12');

    // Verify MultiForm GetOtherField YCNDXA (FIX-19)
    assert.ok(xml_ycn.MultiForm.includes('&FlowMultiTagRowRequest;<![CDATA['), 'MultiForm GetOtherField must start with &FlowMultiTagRowRequest;');
    assert.ok(xml_ycn.MultiForm.includes('select top 0 tr.id, cast(b.nhieu_dvt as tinyint) as nhieu_dvt, a.he_so, rtrim(a.ma_vt) as ma_vt, rtrim(a.dvt) as dvt, a.ngay_ct, a.ma_lo as ma_lo_ban, b.lo_yn'), 'MultiForm GetOtherField must declare #d on a single line');
    assert.ok(xml_ycn.MultiForm.includes('where p = \'\'%Partition\'\''), 'MultiForm GetOtherField must loop %Partition');
    assert.ok(!xml_ycn.MultiForm.includes('declare @s nvarchar(128)'), 'MultiForm GetOtherField must not contain inline tagRow parser');
    assert.ok(!xml_ycn.MultiForm.includes('hang_sx_sp'), 'MultiForm GetOtherField must not contain hang_sx_sp');
    assert.ok(!xml_ycn.MultiForm.includes('gia_nt2'), 'MultiForm GetOtherField must not contain gia_nt2');

    // Test 2: Single mode (zcWIMO fixture)
    const xml_wi = renderer.render(ZCWIMO);
    // Verify Filter zcWIMO (FIX-23)
    assert.ok(xml_wi.Filter.includes('<!ENTITY XMLFlowFilterViews SYSTEM "..\\Include\\XML\\FlowFilterViews.txt">'), 'Single Filter must include XMLFlowFilterViews');
    assert.ok(xml_wi.Filter.includes('<!ENTITY XMLFlowFilterCommand SYSTEM "..\\Include\\XML\\FlowFilterCommand.txt">'), 'Single Filter must include XMLFlowFilterCommand');
    assert.ok(xml_wi.Filter.includes('table="phsx"'), 'Filter must use phsx table');
    assert.ok(xml_wi.Filter.includes('id="SX1"'), 'Filter must have id SX1');
    assert.ok(xml_wi.Filter.includes('<field name="ngay_ct1" type="DateTime"'), 'Single Filter must declare ngay_ct1');
    assert.ok(xml_wi.Filter.includes('<field name="ma_kh" readOnly="true" defaultValue="\'\'" hidden="true">'), 'Single Filter must declare ma_kh');
    assert.ok(xml_wi.Filter.includes('<view id="Dir" height="88">'), 'Single Filter must define Dir view');
    assert.ok(xml_wi.Filter.includes('&XMLFlowFilterCommand;'), 'Single Filter must include &XMLFlowFilterCommand;');
    assert.ok(xml_wi.Filter.includes('&ScriptFlowFilterFunction;'), 'Single Filter must include &ScriptFlowFilterFunction;');
    assert.ok(xml_wi.Filter.includes('&ScriptFlowFilterCss;'), 'Single Filter must include &ScriptFlowFilterCss;');
    assert.ok(xml_wi.Filter.includes("select @keyFlow = 'status in (''1'', ''2'')'"), 'Filter must derive keyFlow for multiple statuses');
    assert.ok(xml_wi.Filter.includes('select top 0 stt_rec into #t from isx'), 'Single Filter must select top 0 from inquiry table without month loop');
    assert.ok(!xml_wi.Filter.includes('while (month(@c)'), 'Single Filter must not contain month loop');

    // Verify Lookup zcWIMO (FIX-22)
    assert.ok(xml_wi.Lookup.includes('<!ENTITY % Control.Filter SYSTEM "..\\Include\\Filter.Lookup.ent">'), 'Single Lookup must include Filter.Lookup.ent');
    assert.ok(xml_wi.Lookup.includes('<lookup table="phsx" code="so_ct" name="stt_rec" order="ngay_ct, so_ct, stt_rec"'), 'Single Lookup must have order ngay_ct, so_ct, stt_rec');
    assert.ok(xml_wi.Lookup.includes('<field name="so_ct" align="right"'), 'Single Lookup must declare so_ct field');
    assert.ok(xml_wi.Lookup.includes("'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,status'"), 'Single Lookup must pass default lookup_output_fields');
    assert.ok(xml_wi.Lookup.includes("'a left join dmttct b on a.status = b.status where b.ma_ct = ''SX1'''"), 'Single Lookup must pass default lookup_from_clause with src_ma_ct SX1');
    assert.ok(xml_wi.Lookup.includes("exec FastBusiness$App$Voucher$Finding 'SX1', 'isx', 'phsx', 'isx'"), 'Lookup must call Finding with single args');
    assert.ok(xml_wi.Lookup.includes("@ngay_ct1, @ngay_ct2, '', '', '1, 2', '0', @unit"), 'Lookup must pass formatted finding_status_arg');
    assert.ok(xml_wi.Lookup.includes("'ctsx', 'z3', 'z3.sl_pxh < z3.so_luong'"), 'Lookup must include 3 detail args for remaining qty');

    // Verify MultiGrid zcWIMO (FIX-21)
    assert.ok(xml_wi.MultiGrid.includes('<!ENTITY % GridInitialize SYSTEM "..\\Include\\Grid.ent">'), 'Single MultiGrid must include Grid.ent');
    assert.ok(xml_wi.MultiGrid.includes('<!ENTITY Controller "\'zcWIMOFlowMultiGrid\'">'), 'Single MultiGrid Controller must be zcWIMOFlowMultiGrid');
    assert.ok(xml_wi.MultiGrid.includes('<grid order="ngay_ct, so_ct, stt_rec, line_nbr" type="Inquiry"'), 'Single MultiGrid must have order attribute');
    assert.ok(xml_wi.MultiGrid.includes('<subTitle v="Từ ngày %d1 đến ngày %d2" e="Date from %d1 to %d2">'), 'Single MultiGrid must declare subTitle');
    assert.ok(xml_wi.MultiGrid.includes('<field name="chon" type="Boolean" external="true"'), 'Single MultiGrid must declare chon checkbox field');
    assert.ok(xml_wi.MultiGrid.includes('&FlowMultiGridCommand;'), 'Single MultiGrid must include &FlowMultiGridCommand;');
    assert.ok(xml_wi.MultiGrid.includes('&FlowMultiGridToolbar;'), 'Single MultiGrid must include &FlowMultiGridToolbar;');
    assert.ok(xml_wi.MultiGrid.includes('phsx m with(nolock) join ctsx a with(nolock)'), 'MultiGrid must join phsx and ctsx with nolock');
    assert.ok(xml_wi.MultiGrid.includes("field name=\"sl_pnd\""), 'MultiGrid must declare sl_pnd field');
    assert.ok(xml_wi.MultiGrid.includes("m.ma_dvcs = ''' + replace(rtrim(@ma_dvcs), '''', '''''') + ''' and m.status in (''1'', ''2'') and a.sl_pnd < a.so_luong"), 'MultiGrid where clause must derive ma_dvcs, status, qty');

    // Verify MultiForm zcWIMO
    assert.ok(xml_wi.MultiForm.includes('<!ENTITY FlowMultiGeneralTable "phsx">'), 'MultiForm general table must be phsx');
    assert.ok(xml_wi.MultiForm.includes('stt_rec_sx1'), 'MultiForm f2 must contain stt_rec_sx1');
    assert.ok(xml_wi.MultiForm.includes("<command event=\"Showing\">\n      <text>\n        <![CDATA[\nselect 'show$]]>&Identity;<![CDATA[$(this);' as message\nreturn"), 'Single MultiForm Showing must be multi-line');
    assert.ok(xml_wi.MultiForm.includes("<command event=\"Loading\">\n      <text>\n        <![CDATA[\nselect 'active$]]>&Identity;<![CDATA[$(this);' as message\nreturn"), 'Single MultiForm Loading must be multi-line');
    assert.ok(xml_wi.MultiForm.includes("<command event=\"Closing\">\n      <text>\n        <![CDATA[\nselect 'close$]]>&Identity;<![CDATA[$(this);' as message\nreturn"), 'Single MultiForm Closing must be multi-line');
    assert.ok(xml_wi.MultiForm.includes("if (z.blankMemvar(row)) { ins = false; first = false; }"), 'Single MultiForm TransferData must reuse blank row');
    assert.ok(xml_wi.MultiForm.includes("insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);"), 'Single MultiForm TransferData must call insert$RetrieveTagRow$Items');
    assert.ok(xml_wi.MultiForm.includes("f.cancelDialog();"), 'Single MultiForm TransferData must cancel dialog');
    assert.ok(xml_wi.MultiForm.includes('&FlowMultiTagRowRequest;<![CDATA['), 'Single MultiForm GetOtherField must start with &FlowMultiTagRowRequest;');
    assert.ok(!xml_wi.MultiForm.includes('where p = \'\'%Partition\'\''), 'Single MultiForm must not loop partition');

    console.log('  ✓ XmlTemplateRenderer tests passed!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
