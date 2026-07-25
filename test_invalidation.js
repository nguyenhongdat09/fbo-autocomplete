const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if(path === 'vscode') return { workspace: { getConfiguration: () => ({ get: () => true }) } };
    return originalRequire.apply(this, arguments);
};
const r = require('./src/ReadXMLByJS/entityResolver.js');
const ls = require('./src/ReadXMLByJS/EntityLevelStore.js');
const ewe = require('./src/ReadXMLByJS/EntityWatcherEngine.js');

async function test() {
    const e = ewe;
    const xml = '\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Dir\\SVTran.xml';
    const ent = '\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Include\\Extender.ent';
    
    console.log('1. Parsing XML to generate cache and dependencies in LevelDB...');
    r.resolveFboXmlEntities(xml);
    r.getEntitiesForFile(xml);
    
    // Wait for LevelDB upsert to finish
    await new Promise(res => setTimeout(res, 2000));
    
    console.log('2. Testing invalidateByDependency...');
    const projectId = e.extractProjectId(ent);
    console.log('Project ID:', projectId);
    
    const affected = await ls.invalidateByDependency(projectId, ent);
    console.log('Affected XMLs:', affected);
    
    if (affected && affected.length > 0) {
        console.log('Invalidating RAM cache...');
        for (const xmlPath of affected) {
            r.invalidateCache(xmlPath);
        }
        // Test if it's cleared from RAM cache:
        const normalized = require('path').normalize(xml).toLowerCase();
        // Since we can't inspect the cache map easily, we'll try `getEntitiesForFile` and measure time.
    }
}
test();
