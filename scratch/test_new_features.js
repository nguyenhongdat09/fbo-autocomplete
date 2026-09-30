// Test nhanh SymbolScanner + SymbolDetector (không cần VS Code host)
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, ...args) {
    if (request === "vscode") {
        return {
            Range: class { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } },
            Position: class { constructor(l, c) { this.line = l; this.character = c; } },
            Uri: { file: (p) => ({ fsPath: p }) },
            workspace: { textDocuments: [] },
            languages: {},
            SymbolKind: { Field: 1, Property: 2, Interface: 3, Event: 4, Class: 5, Function: 6, Object: 7, Struct: 8, File: 9 },
        };
    }
    return origLoad.apply(this, arguments);
};

const { scanFile } = require("../src/WorkspaceSymbol/SymbolScanner");
const { detectSymbol, globsForKind } = require("../src/References/SymbolDetector");

// --- Test 1: scanFile trên fixture mini-dir.xml ---
const fs = require("fs");
const content = fs.readFileSync("src/PreviewForm/tests/fixtures/mini-dir.xml", "utf8");
const syms = scanFile("X:/p/App_Data/Controllers/Dir/mini-dir.xml", content);
console.log("== symbols ==");
syms.forEach(s => console.log(`  ${s.kind.padEnd(10)} ${s.name.padEnd(20)} line ${s.line}`));
console.assert(syms.some(s => s.name === "ma_kh" && s.kind === "field"), "FAIL: thiếu field ma_kh");
console.assert(syms.some(s => s.name === "zcdtndgsc_Grid"), "FAIL: thiếu field grid");

// --- Test 2: SQL file ---
const sql = `CREATE PROCEDURE dbo.zc_Test AS BEGIN SELECT 1 END\nGO\nexec dbo.zc_Test`;
const syms2 = scanFile("X:/p/a.sql", sql);
console.log("== sql symbols ==", syms2.map(s => `${s.kind}:${s.name}`));
console.assert(syms2.some(s => s.kind === "proc" && s.name === "dbo.zc_Test"), "FAIL: proc def");

// --- Test 3: detectSymbol ---
function fakeDoc(text) {
    const lines = text.split("\n");
    return {
        uri: { fsPath: "X:/p/App_Data/Controllers/Dir/x.xml" },
        languageId: "xml",
        lineAt: (l) => ({ text: lines[l] }),
        getText: (range) => range ? text.slice(0, range.end ? 0 : 0) || text : text, // simplify: full text
        offsetAt: (pos) => lines.slice(0, pos.line).reduce((a, l) => a + l.length + 1, 0) + pos.character,
        positionAt: (off) => { let acc = 0; for (let i = 0; i < lines.length; i++) { if (acc + lines[i].length >= off) return { line: i, character: off - acc }; acc += lines[i].length + 1; } return { line: 0, character: 0 }; },
    };
}

const doc = fakeDoc(content);
// cursor vào "ma_kh" trong name="ma_kh" (line 2, index of ma_kh)
const pos = { line: 2, character: content.split("\n")[2].indexOf("ma_kh") + 2 };
const d = detectSymbol(doc, pos);
console.log("== detect field ==", JSON.stringify(d));
console.assert(d && d.kind === "field" && d.text === "ma_kh", "FAIL: detect field");

// cursor vào [status] trong view item (line index 25: <item value="11: [status].Label, [status]"/>)
const pos2 = { line: 25, character: content.split("\n")[25].indexOf("status") + 2 };
const d2 = detectSymbol(doc, pos2);
console.log("== detect view ref ==", JSON.stringify(d2));
console.assert(d2 && d2.kind === "field" && d2.text === "status", "FAIL: detect [status]");

console.log("ALL TESTS PASSED");
