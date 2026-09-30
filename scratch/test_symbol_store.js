// Test SymbolLevelStore: put/load/del per root
const path = require("path");
const fs = require("fs");
const os = require("os");

const SymbolLevelStore = require("../src/WorkspaceSymbol/SymbolLevelStore");

(async () => {
    const dir = path.join(os.tmpdir(), "fbo-symtest-" + Date.now());
    const store = new SymbolLevelStore(dir);
    const root = "c:\\proj\\aih";

    await store.putFiles(root, [
        { file: "c:\\proj\\aih\\a.xml", mtimeMs: 100, size: 50, syms: [{ name: "ma_kh", kind: "field", file: "c:\\proj\\aih\\a.xml", line: 1, col: 0 }] },
        { file: "c:\\proj\\aih\\b.xml", mtimeMs: 200, size: 60, syms: [{ name: "so_ct", kind: "field", file: "c:\\proj\\aih\\b.xml", line: 5, col: 3 }] },
    ]);

    const loaded = await store.loadRoot(root);
    console.log("loaded files:", loaded.size);
    console.assert(loaded.size === 2, "FAIL: expected 2 records");
    console.assert(loaded.get("c:\\proj\\aih\\a.xml").syms[0].name === "ma_kh", "FAIL: symbol data");

    // root khác không lẫn
    await store.putFile("c:\\proj\\other", "c:\\proj\\other\\x.xml", { mtimeMs: 1, size: 1 }, []);
    const loaded2 = await store.loadRoot(root);
    console.assert(loaded2.size === 2, "FAIL: cross-root leak");

    await store.delFile(root, "c:\\proj\\aih\\a.xml");
    const loaded3 = await store.loadRoot(root);
    console.assert(loaded3.size === 1 && loaded3.has("c:\\proj\\aih\\b.xml"), "FAIL: delFile");

    await store.delRoot(root);
    const loaded4 = await store.loadRoot(root);
    console.assert(loaded4.size === 0, "FAIL: delRoot");

    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("STORE TEST PASSED");
})();
