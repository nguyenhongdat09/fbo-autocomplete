// @ts-nocheck
// Mô phỏng vòng expand entity của CheckLegacyCode.run() trên FATran.xml
// Chạy 2 lượt như 2 lần save — lượt 2 phải dùng cache doctype, không gọi getEntitiesForFile lại
const Module = require('module');
const origLoad = Module._load;

const filePath = '\\\\172.168.5.14\\CustomerPro\\FBO\\AIH\\SP228\\App_Data\\Controllers\\Dir\\FATran.xml';
const fs = require('fs');
const realContent = fs.readFileSync(filePath, 'utf8');

const vscodeStub = {
    Range: class {},
    Diagnostic: class {},
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    languages: { createDiagnosticCollection: () => ({ set() {}, clear() {}, dispose() {} }) },
    window: {
        createStatusBarItem: () => ({ show() {}, hide() {}, text: '', tooltip: '' }),
        activeTextEditor: { document: { getText: () => realContent, uri: { fsPath: filePath } } },
        showErrorMessage: (m) => console.log('ERR:', m),
    },
    workspace: { getConfiguration: () => ({ get: () => undefined }) },
    Uri: { file: (p) => ({ fsPath: p }) },
};

Module._load = function (request, ...args) {
    if (request === 'vscode') return vscodeStub;
    return origLoad.apply(this, [request, ...args]);
};

const { replaceEntity, getEntityContentsForDoc } = require('../src/CheckLegacy/CheckLegacyEntity');
const { escapeRegExp } = require('../src/CheckLegacy/CheckLegacyUtils');

const fieldsBlockRegex = /<fields>[\s\S]*?<\/fields>/gi;
const viewsBlockRegex = /<views>[\s\S]*?<\/views>/gi;

async function expandOnce(label) {
    const t0 = Date.now();
    const doctypeMatch = realContent.match(/<!DOCTYPE\s+\w+[\s\S]*?\[[\s\S]*?\]\s*>/i);
    const doctype = doctypeMatch ? doctypeMatch[0] : '';
    const tEnt0 = Date.now();
    const entityContents = await getEntityContentsForDoc(filePath, doctype);
    const entMs = Date.now() - tEnt0;

    let content = realContent;
    let iterations = 0, hasReplaced = true;
    while (hasReplaced && iterations < 5) {
        hasReplaced = false;
        iterations++;
        let targetSections = "";
        let match;
        fieldsBlockRegex.lastIndex = 0;
        while ((match = fieldsBlockRegex.exec(content)) !== null) targetSections += match[0] + "\n";
        viewsBlockRegex.lastIndex = 0;
        while ((match = viewsBlockRegex.exec(content)) !== null) targetSections += match[0] + "\n";
        if (!targetSections) break;

        const ent_content = replaceEntity(targetSections, entityContents);
        if (ent_content.length === 0) break;

        const entityMap = new Map();
        for (const ent of ent_content) {
            if (ent.content !== '') entityMap.set(ent.entity, ent.content.replace(/\r?\n/g, ' '));
        }
        if (entityMap.size === 0) break;
        const entityRegex = new RegExp([...entityMap.keys()].map(k => escapeRegExp(k)).join('|'), 'g');
        const nextContent = content.replace(entityRegex, m => entityMap.get(m) || m);
        if (nextContent !== content) { content = nextContent; hasReplaced = true; }
    }

    const catIdx = [...content.matchAll(/<category\b[^>]*?\bindex\s*=\s*"([^"]+)"/g)].map(m => m[1]);
    const catsBlock = (content.match(/<categories>[\s\S]*?<\/categories>/gi) || []).join('\n');
    const leftover = [...catsBlock.matchAll(/&[\w.]+;/g)].map(m => m[0]);
    console.log(`\n===== ${label} =====`);
    console.log(`entity resolve: ${entMs}ms | total: ${Date.now() - t0}ms | iters: ${iterations}`);
    console.log('category indexes:', catIdx, '| entities left in <categories>:', leftover);
    return content;
}

(async () => {
    await expandOnce('SAVE 1 (fresh)');
    // Giả lập save lần 2: file body đổi (mtime đổi) nhưng DOCTYPE giữ nguyên
    // -> phải hit cache, chỉ statSync song song validate dep
    await new Promise(r => setTimeout(r, 1100)); // qua debounce 1s của resolver cache
    await expandOnce('SAVE 2 (doctype cache)');
})();
