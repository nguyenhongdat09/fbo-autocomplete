const assert = require('assert');
const { buildHeaderCatalog, mergeUploadWithHeaders } = require('../parser/DirGridHeaderCatalog');

function run_test() {
    console.log('--- Test DirGridHeaderCatalog ---');

    // Case 1: Build catalog từ 2 nguồn (Dir và Grid)
    const dir_flat = `
<fields>
    <field name="ma_dvcs">
        <header v="Mã ĐVCS" e="Unit" />
    </field>
    <field name="ma_kh">
        <header v="Mã khách" e="Customer" />
    </field>
    <field name="ghi_chu" hidden="true">
        <header v="Ghi chú ẩn" e="Hidden Note" />
    </field>
</fields>
`;

    const grid_flat = `
<fields>
    <field name="ma_kh">
        <header v="Mã khách hàng ghi đè" e="Customer" />
    </field>
    <field name="ngay_ct">
        <header v="Ngày chứng từ" e="Voucher Date" />
    </field>
</fields>
`;

    const sources = [
        { fileLabel: 'Dir/ARTran.xml', flatText: dir_flat },
        { fileLabel: 'Grid/ARDetail.xml', flatText: grid_flat }
    ];

    const { catalog } = buildHeaderCatalog(sources);

    // ma_dvcs từ Dir
    assert.strictEqual(catalog['ma_dvcs'], 'Mã ĐVCS');
    // ma_kh first-wins: phải lấy từ Dir/ARTran.xml, không bị Grid ghi đè
    assert.strictEqual(catalog['ma_kh'], 'Mã khách');
    // ngay_ct từ Grid
    assert.strictEqual(catalog['ngay_ct'], 'Ngày chứng từ');
    // ghi_chu bị hidden="true" -> không có trong catalog
    assert.strictEqual(catalog.hasOwnProperty('ghi_chu'), false);

    // Case 2: Merge với Upload fields
    const upload_fields = [
        { name: 'ma_dvcs', column: 'A', required: true },
        { name: 'ma_kh', column: 'B', required: true },
        { name: 'ngay_ct', column: 'D', required: true },
        { name: 'dien_giai', column: 'G', required: false } // Không có trong catalog -> fallback tên field
    ];

    const cells = mergeUploadWithHeaders(upload_fields, catalog);

    assert.strictEqual(cells.length, 4);
    assert.deepStrictEqual(cells[0], {
        name: 'ma_dvcs',
        column: 'A',
        header: 'Mã ĐVCS',
        required: true
    });
    assert.strictEqual(cells[1].header, 'Mã khách');
    assert.strictEqual(cells[2].header, 'Ngày chứng từ');
    assert.strictEqual(cells[3].header, 'dien_giai'); // Fallback

    console.log('✓ DirGridHeaderCatalog passed');
}

module.exports = { run_test };

if (require.main === module) {
    run_test();
}
