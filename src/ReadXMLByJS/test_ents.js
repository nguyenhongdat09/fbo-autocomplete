const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return { workspace: { workspaceFolders: [] } };
    }
    return originalRequire.apply(this, arguments);
};

const { getEntitiesForFile } = require('./entityResolver');
const file = '\\\\172.168.5.14\\CustomerPro\\FBI\\AMERICAN\\FBISP2422\\App_Data\\Controllers\\Dir\\SVTran.xml';
console.log("Checking entity...");
try {
    const ents = getEntitiesForFile(file);
    if (!ents) {
        console.log("No entities returned!");
    } else {
        const target = 'ExtraFields.Master.Checking'; 
        if (ents[target]) {
            console.log(`Found ${target} ->`, ents[target]);
        } else {
            console.log(`Not found: ${target}`);
        }

        const target2 = 'ExtraFields.Master';
        if (ents[target2]) {
            console.log(`Found ${target2} ->`, ents[target2]);
        } else {
            console.log(`Not found: ${target2}`);
        }
    }
} catch (e) {
    console.error(e);
}
