const assert = require('assert');
const { detectUploadVersion } = require('../parser/UploadVersionDetector');

function run_test() {
    console.log('--- Test UploadVersionDetector ---');

    // Case 1: Legacy Upload (không có thẻ template)
    const legacy_xml = `
<Upload id="ARTran">
    <fields identity="true" name="stt">
        <field name="ma_dvcs" column="A" allowNulls="false" />
        <field name="ma_kh" column="B" allowNulls="false" />
    </fields>
</Upload>
`;
    assert.strictEqual(detectUploadVersion(legacy_xml), 'legacy', 'Phải nhận diện là legacy');

    // Case 2: Template Upload (có thẻ template)
    const template_xml = `
<Upload id="SVTran">
    <template row="5">
        <cell column="A" field="ma_dvcs" />
    </template>
    <fields>
        <field name="ma_dvcs" />
    </fields>
</Upload>
`;
    assert.strictEqual(detectUploadVersion(template_xml), 'template', 'Phải nhận diện là template');

    // Case 3: Empty / Null
    assert.strictEqual(detectUploadVersion(''), 'legacy');
    assert.strictEqual(detectUploadVersion(null), 'legacy');

    console.log('✓ UploadVersionDetector passed');
}

module.exports = { run_test };

if (require.main === module) {
    run_test();
}
