const assert = require('assert');
const { autoTranslateFormTitles } = require('../generator/translateHelper');

async function run() {
    console.log('Running translateHelper tests...');

    // Test form with missing EN fields
    const form = {
        src_taken_header_v: 'Số lượng đã lấy',
        trace_fields: [
            { name: 'stt_rec_dxa', header_v: '' },
            { name: 'dxa_so', header_v: 'Đơn hàng' }
        ],
        titles: {
            filter_v: 'Chọn đơn hàng bán',
            multiform_v: 'Phiếu đơn hàng bán'
        },
        filter_none_message_v: 'Không có dữ liệu.'
    };

    const translated = await autoTranslateFormTitles(form);
    assert.ok(translated, 'Form must be returned');
    // Even if offline, fields should be gracefully handled without throwing
    assert.strictEqual(translated.trace_fields[0].header_v, '');

    console.log('  ✓ translateHelper tests passed!');
}

if (require.main === module) {
    run();
}

module.exports = { run };
