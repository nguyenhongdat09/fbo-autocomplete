const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') return { workspace: {}, window: {} };
    return origRequire.apply(this, arguments);
};

const path = require('path');
const fs = require('fs');
const entityResolver = require('../src/ReadXMLByJS/entityResolver');

async function testRealtimeHover() {
    const mainXml = path.join(__dirname, 'mock_main.xml');
    const incEnt = path.join(__dirname, 'mock_inc.ent');
    
    // Create initial files
    fs.writeFileSync(incEnt, '<!ENTITY TestEntity "Initial Value">');
    fs.writeFileSync(mainXml, `<!DOCTYPE dir SYSTEM "FBO.dtd" [\n<!ENTITY % INC SYSTEM "mock_inc.ent">\n%INC;\n]>`);

    // First resolution (should cache)
    console.log('--- FIRST HOVER ---');
    const entities1 = entityResolver.getEntitiesForFile(mainXml);
    console.log('TestEntity:', entities1['TestEntity'] ? entities1['TestEntity'].value : 'NOT_FOUND');

    // Wait 1.1s to bypass the 1s debounce
    console.log('\nWaiting 1.5s...');
    await new Promise(r => setTimeout(r, 1500));
    
    // Modify the included file (simulating external editor or other IDE)
    console.log('\n--- MODIFYING FILE EXTERNALLY (NO VSCODE EVENT) ---');
    fs.writeFileSync(incEnt, '<!ENTITY TestEntity "Modified Value!">');
    
    // Second resolution (hover in IDE 2)
    console.log('--- SECOND HOVER ---');
    const entities2 = entityResolver.getEntitiesForFile(mainXml);
    console.log('TestEntity:', entities2['TestEntity'] ? entities2['TestEntity'].value : 'NOT_FOUND');

    // Cleanup
    fs.unlinkSync(mainXml);
    fs.unlinkSync(incEnt);
}

testRealtimeHover().catch(console.error);
