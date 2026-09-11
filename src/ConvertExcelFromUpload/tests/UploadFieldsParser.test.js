const assert = require('assert');
const { parseUploadFields } = require('../parser/UploadFieldsParser');

function run_test() {
    console.log('--- Test UploadFieldsParser ---');

    // Case 1: ARTran snippet
    const xml_text = `
<Upload id="ARTran">
    <fields identity="true" name="stt">
        <field name="ma_dvcs" column="A" allowNulls="false" maxLength="8" upperCase="true" />
        <field name="ma_kh" column="B" allowNulls="false" maxLength="8" upperCase="true" />
        <field name="ngay_ct" column="d" allowNulls="false" type="DateTime" />
        <field name="dien_giai" column="G" allowNulls="true" />
        <field name="stt_rec" hidden="true" />
    </fields>
</Upload>
`;

    const { fields, warnings } = parseUploadFields(xml_text);

    assert.strictEqual(fields.length, 4, 'Chỉ 4 trường có column được parse');
    assert.strictEqual(warnings.length, 1, 'Trường không có column phải có warning');

    assert.deepStrictEqual(fields[0], {
        name: 'ma_dvcs',
        column: 'A',
        required: true,
        type: null,
        max_length: '8'
    });

    assert.strictEqual(fields[1].name, 'ma_kh');
    assert.strictEqual(fields[1].column, 'B');
    assert.strictEqual(fields[1].required, true);

    // column 'd' được chuẩn hóa thành 'D'
    assert.strictEqual(fields[2].name, 'ngay_ct');
    assert.strictEqual(fields[2].column, 'D');
    assert.strictEqual(fields[2].required, true);

    // dien_giai không bắt buộc
    assert.strictEqual(fields[3].name, 'dien_giai');
    assert.strictEqual(fields[3].column, 'G');
    assert.strictEqual(fields[3].required, false);

    console.log('✓ UploadFieldsParser passed');
}

module.exports = { run_test };

if (require.main === module) {
    run_test();
}
