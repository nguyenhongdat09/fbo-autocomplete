const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parseFormXml } = require('../parser/FormXmlParser');

function run() {
  console.log('--- Testing FormXmlParser (FIX-01..04) ---');

  const fixturePath = path.join(__dirname, 'fixtures', 'mini-dir.xml');
  const xmlContent = fs.readFileSync(fixturePath, 'utf8');

  const model = parseFormXml(xmlContent);

  // 1. Fields
  assert.strictEqual(Object.keys(model.fields).length, 4, 'Expected 4 fields');
  assert.strictEqual(model.fields['status'].kind, 'dropdown');
  assert.strictEqual(model.fields['zcdtndgsc_Grid'].kind, 'grid');

  // 2. View
  assert.strictEqual(model.view.id, 'Dir');
  assert.deepStrictEqual(model.view.master_columns, [100, 0], 'Master columns with 0');

  // 3. FIX-01: categories từ viewElement.categories.category (không phải dirNode.category)
  assert.strictEqual(model.view.categories.length, 1, 'Only non-footer categories');
  assert.strictEqual(model.view.categories[0].index, '2');
  assert.strictEqual(model.view.categories[0].header_v, '1.2 Chi tiết');
  assert.deepStrictEqual(model.view.categories[0].columns, [809], 'columns from @_columns');

  // 4. Footer category
  assert.strictEqual(model.view.footer_category.index, '-1');
  assert.deepStrictEqual(model.view.footer_category.columns, [100, 100]);

  // 5. Rows general (ma_kh không có categoryIndex)
  assert.strictEqual(model.view.rows_general.length, 1, 'ma_kh in general');
  assert.strictEqual(model.view.rows_general[0].cells[0].slot.field, 'ma_kh');

  // 6. Rows by category (status & grid ở cat 2)
  assert.ok(model.view.rows_by_category['2'], 'Category 2 has rows');
  assert.strictEqual(model.view.rows_by_category['2'].length, 2, 'status + grid in cat 2');

  // 7. Footer rows
  assert.strictEqual(model.view.rows_by_category['-1'].length, 1, 'footer_field in -1');

  // 8. FIX-02: hidden field
  const { classifyField } = require('../parser/classifyField');
  const hiddenField = classifyField({ '@_name': 'stt_rec', '@_hidden': 'true' });
  assert.strictEqual(hiddenField.hidden, true, 'hidden=true from @_hidden');
  const width0Field = classifyField({ '@_name': 'ma_nk', '@_width': '0' });
  assert.strictEqual(width0Field.hidden, true, 'hidden=true from @_width=0');

  // 9. FIX-03: cells có start_col
  const row = model.view.rows_general[0];
  assert.ok(row.cells[0].start_col !== undefined, 'cells have start_col');

  // 10. FIX-04: strip HTML in footer_v
  const descField = classifyField({ '@_name': 'ghi_chu', footer: { '@_v': '<div class=\"x\">Xem...</div>' } });
  assert.strictEqual(descField.footer_v, 'Xem...', 'strip HTML from footer_v');

  console.log('✅ FormXmlParser tests passed!');
}

if (require.main === module) {
  run();
}

module.exports = { run };
