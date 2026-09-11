const assert = require('assert');
const {
    deriveSearchPrefix,
    filterDirGridPaths,
    filterExactBaseName,
    isUploadFolderPath
} = require('../parser/SearchPrefixDeriver');

function run_test() {
    console.log('--- Test SearchPrefixDeriver ---');

    // 1. deriveSearchPrefix
    const p1 = deriveSearchPrefix('ARTran.xml');
    assert.strictEqual(p1.mode, 'prefix');
    assert.strictEqual(p1.prefix, 'AR');
    assert.strictEqual(p1.keyword, 'AR*.xml');

    const p2 = deriveSearchPrefix('ardetail');
    assert.strictEqual(p2.mode, 'prefix');
    assert.strictEqual(p2.prefix, 'ar');
    assert.strictEqual(p2.keyword, 'ar*.xml');

    const p3 = deriveSearchPrefix('XXMaster.xml');
    assert.strictEqual(p3.mode, 'prefix');
    assert.strictEqual(p3.prefix, 'XX');

    const p4 = deriveSearchPrefix('zcamdm.xml');
    assert.strictEqual(p4.mode, 'exact');
    assert.strictEqual(p4.prefix, 'zcamdm');
    assert.strictEqual(p4.keyword, 'zcamdm.xml');

    const p5 = deriveSearchPrefix('Customer');
    assert.strictEqual(p5.mode, 'exact');
    assert.strictEqual(p5.prefix, 'Customer');
    assert.strictEqual(p5.keyword, 'Customer.xml');

    // 2. filterDirGridPaths
    const test_paths = [
        'App_Data/Controllers/Dir/ARTran.xml',
        'App_Data\\Controllers\\Grid\\ARDetail.xml',
        'App_Data/Controllers/Filter/ARFilter.xml',
        'App_Data/Controllers/Templates/Upload/ARTran.xml',
        'App_Data/Controllers/Lookup/Customer.xml'
    ];
    const filtered = filterDirGridPaths(test_paths);
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered[0], test_paths[0]);
    assert.strictEqual(filtered[1], test_paths[1]);

    // 3. filterExactBaseName
    const exact_paths = [
        'Controllers/Dir/zcamdm.xml',
        'Controllers/Grid/zcamdm.xml',
        'Controllers/Dir/zcamdm_other.xml'
    ];
    const exact_filtered = filterExactBaseName(exact_paths, 'zcamdm');
    assert.strictEqual(exact_filtered.length, 2);

    // 4. isUploadFolderPath
    assert.strictEqual(isUploadFolderPath('e:/App_Data/Controllers/Templates/Upload/ARTran.xml'), true);
    assert.strictEqual(isUploadFolderPath('e:\\CustomerPro\\Controllers\\Templates\\Upload\\ARTran.xml'), true);
    assert.strictEqual(isUploadFolderPath('e:/App_Data/Controllers/Dir/ARTran.xml'), false);

    console.log('✓ SearchPrefixDeriver passed');
}

module.exports = { run_test };

if (require.main === module) {
    run_test();
}
