// @ts-nocheck
// Smoke test cho CheckLegacy modules — stub vscode
const Module = require('module');
const origLoad = Module._load;

class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }

const vscodeStub = {
    Range,
    Diagnostic,
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    languages: { createDiagnosticCollection: () => ({ set() {}, clear() {}, dispose() {} }) },
    window: {
        createStatusBarItem: () => ({ show() {}, hide() {}, text: '', tooltip: '' }),
        activeTextEditor: null,
        showErrorMessage: (m) => console.log('ERR_MSG:', m),
    },
};

Module._load = function (request, ...args) {
    if (request === 'vscode') return vscodeStub;
    return origLoad.apply(this, [request, ...args]);
};

const { checkStructureRules } = require('../src/CheckLegacy/CheckLegacyStructure');
const { checkGridRules } = require('../src/CheckLegacy/CheckLegacyGrid');
const { getFieldOnView, getFieldOnFields, checkLegacyItem } = require('../src/CheckLegacy/CheckLegacyFields');

function makeEditor(content, filePath) {
    const lines = content.split('\n');
    return { document: { getText: () => content, lineCount: lines.length, lineAt: (i) => ({ text: lines[i] }), uri: { fsPath: filePath } } };
}

function printDiags(title, diags) {
    console.log(`\n===== ${title} (${diags.length} diag) =====`);
    for (const d of diags) {
        console.log(`  L${d.range.start.line + 1} [${d.severity === 1 ? 'WARN' : 'ERR '}] ${d.message.split('\n')[0]}`);
    }
}

// ---------- Fixture DIR ----------
const dirXml = `<dir table="dmx" code="ma_x, ma_y, ma_w" order="ma_x">
<fields>
  <field name="ma_x" isPrimaryKey="true" allowNulls="false"><header v="x" e="x"/></field>
  <field name="ma_y" isPrimaryKey="true"><header v="y" e="y"/></field>
  <field name="ma_z" isPrimaryKey="true" allowNulls="false"><header v="z" e="z"/></field>
  <field name="ma_w"><header v="w" e="w"/></field>
  <field name="f_cat" categoryIndex="9"><header v="c" e="c"/></field>
  <field name="f_ok" categoryIndex="2"><header v="o" e="o"/></field>
  <field name="f_ft" categoryIndex="-1"><header v="f" e="f"/></field>
</fields>
<views>
  <view id="Dir" height="278" anchor="20" split="15">
    <item value="80, 50, 100, 129, 0, 100, 8, 70, 8, 58, 42, 8, 100, 0"/>
    <item value="11000001100000: [ma_x].Label, [ma_x], [ma_y].Label, [ma_y]"/>
    <item value="11-----11-----: [ma_w].Label, [ma_w], [f_ok].Label, [f_ok]"/>
    <item value="11--: [f_cat].Label, [f_cat]"/>
    <item value="11110011-11111: [a].Label, [a], [b].Label, [b], [c].Label, [c], [d], [e].Label, [e], [f], [g]"/>
    <categories>
      <category index="2" columns="130, 100, 0" anchor="5"><header v="Chi tiet" e="Detail"/></category>
      <category index="-1" columns="100,100" anchor="1"><header v="" e=""/></category>
    </categories>
  </view>
</views>
</dir>`;

const dirDiags = [];
checkStructureRules(makeEditor(dirXml, 'X:/p/App_Data/Controllers/Dir/Test.xml'), dirXml, dirDiags, true);
printDiags('DIR', dirDiags);

// ---------- Fixture GRID ----------
const gridXml = `<!DOCTYPE grid [
  <!ENTITY % GridInitialize SYSTEM "..\\Include\\Grid.ent">
  %GridInitialize;
]>
<grid code="ma_x" order="ma_x">
<fields>
  <field name="ma_x" isPrimaryKey="true"><header v="x" e="x"/></field>
  <field name="ngay_ct" allowFilter="&GridVoucherAllowFilter;"><header v="d" e="d"/></field>
  <field name="so_ct" allowFilter="&GridVoucherAllowFilter;"><header v="s" e="s"/><query>&InsertCommandFilter;</query></field>
  <field name="tag" allowFilter="true"><header v="t" e="t"/><query>x</query></field>
  <field name="hid" hidden="true" allowFilter="true"><header v="h" e="h"/><query>x</query></field>
  <field name="normal"><header v="n" e="n"/></field>
</fields>
<views><view id="Grid"><field name="ma_x"/><field name="ngay_ct"/></view></views>
</grid>`;

const gridDiags = [];
checkGridRules(makeEditor(gridXml, 'X:/p/App_Data/Controllers/Grid/Test.xml'), gridXml, gridXml, gridDiags);
printDiags('GRID', gridDiags);

// ---------- Fixture legacy check (item vs fields) ----------
const legacyXml = `<dir table="dmx" code="ma_x" order="ma_x">
<fields>
  <field name="ma_x"><header v="x" e="x"/></field>
  <field name="thua"><header v="t" e="t"/></field>
</fields>
<views>
  <view id="Dir">
    <item value="80, 50"/>
    <item value="11: [ma_x].Label, [ma_x], [khong_khai_bao]"/>
  </view>
</views>
</dir>`;

const legacyDiags = [];
const ed = makeEditor(legacyXml, 'X:/p/App_Data/Controllers/Dir/Test.xml');
checkLegacyItem(ed, getFieldOnView(legacyXml), getFieldOnFields(legacyXml), legacyDiags);
printDiags('LEGACY-FIELDS', legacyDiags);
