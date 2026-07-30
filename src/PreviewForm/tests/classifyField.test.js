const assert = require('assert');
const { classifyField } = require('../parser/classifyField');

function run() {
  console.log('--- Testing classifyField ---');

  // Test 1: Normal input
  const field1 = {
    '@_name': 'ma_kh',
    header: { '@_v': 'Mã khách', '@_e': 'Customer' }
  };
  const res1 = classifyField(field1);
  assert.strictEqual(res1.kind, 'input');
  assert.strictEqual(res1.name, 'ma_kh');
  assert.strictEqual(res1.header_v, 'Mã khách');
  assert.strictEqual(res1.category_index, null);
  assert.strictEqual(res1.read_only, false);
  assert.strictEqual(res1.disabled, false);

  // Test 2: DropDownList
  const field2 = {
    '@_name': 'status',
    '@_categoryIndex': '1',
    items: {
      '@_style': 'DropDownList',
      item: [
        { '@_value': '0', text: { '@_v': 'Lập chứng từ' } },
        { '@_value': '1', text: { '@_v': 'Tiếp nhận' } }
      ]
    }
  };
  const res2 = classifyField(field2);
  assert.strictEqual(res2.kind, 'dropdown');
  assert.strictEqual(res2.category_index, '1');
  assert.strictEqual(res2.options.length, 2);
  assert.strictEqual(res2.options[0].value, '0');
  assert.strictEqual(res2.options[0].label_v, 'Lập chứng từ');

  // Test 3: Grid with label fallback
  const field3 = {
    '@_name': 'zcdtndgscSPTN',
    header: { '@_v': '' }, // Empty header
    label: { '@_v': 'Sản phẩm tiếp nhận', '@_e': 'Detail' },
    items: {
      '@_style': 'Grid',
      '@_controller': 'TNDetailSPTN'
    }
  };
  const res3 = classifyField(field3);
  assert.strictEqual(res3.kind, 'grid');
  assert.strictEqual(res3.header_v, '');
  assert.strictEqual(res3.label_v, 'Sản phẩm tiếp nhận');
  assert.strictEqual(res3.grid_placeholder, 'zcdtndgscSPTN_Grid');
  assert.strictEqual(res3.grid_controller, 'TNDetailSPTN');

  // Test 4: Boolean checkbox and disabled
  const field4 = {
    '@_name': 'k_dong_y_yn',
    '@_type': 'Boolean',
    '@_disabled': 'true'
  };
  const res4 = classifyField(field4);
  assert.strictEqual(res4.kind, 'checkbox');
  assert.strictEqual(res4.disabled, true);

  // Test 5: readOnly string
  const field5 = {
    '@_name': 'ghi_chu',
    '@_readOnly': 'True' // test case insensitive
  };
  const res5 = classifyField(field5);
  assert.strictEqual(res5.read_only, true);

  // Test 6: DateTime
  const field6 = {
    '@_name': 'ngay_ct',
    '@_type': 'DateTime'
  };
  const res6 = classifyField(field6);
  assert.strictEqual(res6.kind, 'date');

  console.log('✅ classifyField tests passed!');
}

if (require.main === module) {
  run();
}

module.exports = { run };
