const assert = require('assert');
const { validateFormInput } = require('../generator/FormInputValidator');
const { YCNDXA, ZCWIMO } = require('../generator/Presets');

function run() {
    console.log('Running FormInputValidator tests...');

    // Test 1: Presets must be valid
    const valid_ycn = validateFormInput(YCNDXA);
    assert.strictEqual(valid_ycn.valid, true, 'YCNDXA preset must be valid');
    assert.strictEqual(valid_ycn.errors.length, 0);

    const valid_wi = validateFormInput(ZCWIMO);
    assert.strictEqual(valid_wi.valid, true, 'ZCWIMO preset must be valid');
    assert.strictEqual(valid_wi.errors.length, 0);

    // Test 2: Missing required identity
    const invalid_identity = validateFormInput({ ...YCNDXA, identity: '' });
    assert.strictEqual(invalid_identity.valid, false);
    assert.ok(invalid_identity.errors.some(e => e.includes('Identity')));

    // Test 3: Partitioned mode - dest_d_table missing $
    const invalid_table = validateFormInput({ ...YCNDXA, dest_d_table: 'dycn' });
    assert.strictEqual(invalid_table.valid, false);
    assert.ok(invalid_table.errors.some(e => e.includes("'$'")));

    // Test 4: Single mode - warning if table contains $
    const warning_single = validateFormInput({ ...ZCWIMO, src_master_table: 'phsx$' });
    assert.strictEqual(warning_single.valid, true);
    assert.ok(warning_single.warnings.some(w => w.includes("'$'")));

    console.log('  ✓ FormInputValidator tests passed!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
