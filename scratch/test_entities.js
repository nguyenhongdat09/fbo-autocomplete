// @ts-nocheck
// Debug: xem entityResolver của extension resolve ListCategory/ListIndex thế nào
const Module = require('module');
const origLoad = Module._load;

const vscodeStub = {
    window: { activeTextEditor: null, showErrorMessage: (m) => console.log('ERR:', m) },
    workspace: { getConfiguration: () => ({ get: () => undefined }) },
    Uri: { file: (p) => ({ fsPath: p }) },
};

Module._load = function (request, ...args) {
    if (request === 'vscode') return vscodeStub;
    return origLoad.apply(this, [request, ...args]);
};

const entityResolver = require('../src/ReadXMLByJS/entityResolver');
const filePath = '\\\\172.168.5.14\\CustomerPro\\FBO\\AIH\\SP228\\App_Data\\Controllers\\Dir\\FATran.xml';

const ents = entityResolver.getEntitiesForFile(filePath);
console.log('total entities:', Object.keys(ents || {}).length);
for (const name of ['ListCategory', 'PostCategory', 'ListIndex', 'PostIndex', 'ListField', 'PostField', 'ListView', 'PostView', 'ListShowing']) {
    const e = ents ? ents[name] : undefined;
    if (!e) { console.log(`${name}: NOT FOUND`); continue; }
    console.log(`${name}:`, JSON.stringify({ systemUrl: e.systemUrl, sourceFile: e.sourceFile, declaredInFile: e.declaredInFile, value: (e.value || '').substring(0, 120) }));
}
