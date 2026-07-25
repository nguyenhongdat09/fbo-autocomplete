const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') return { workspace: {}, window: {} };
    return origRequire.apply(this, arguments);
};

const entityResolver = require('../src/ReadXMLByJS/entityResolver');

console.log('--- TEST 1: Original (IGNORE) ---');
const res1 = entityResolver.resolveFboXmlEntities('\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Dir\\SVTran.xml');
console.log('Param SVTran:', res1.parameterEntities['Conditional.Extender.List.SVTran']);
console.log('ListField:', res1.generalEntities['ListField']);

// Clear caches
entityResolver.invalidateCache();

console.log('\n--- TEST 2: Replaced line 20 with INCLUDE ---');
const origReadFile = entityResolver.readFileContent;
entityResolver.readFileContent = function(filePath) {
    let content = origReadFile(filePath);
    if (filePath.toLowerCase().endsWith('extender.ent')) {
        content = content.replace('<!ENTITY % Conditional.Extender.List.SVTran "IGNORE">', '<!ENTITY % Conditional.Extender.List.SVTran "INCLUDE">');
    }
    return content;
};

const res2 = entityResolver.resolveFboXmlEntities('\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Dir\\SVTran.xml');
console.log('Param SVTran:', res2.parameterEntities['Conditional.Extender.List.SVTran']);
console.log('ListField:', res2.generalEntities['ListField']);
