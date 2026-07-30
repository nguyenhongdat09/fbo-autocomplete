# 04 — Parser Spec: flat XML → FormModel

## Entry API

```js
// src/PreviewForm/parser/FormXmlParser.js
/**
 * @param {string} flat_text - XML đã flatten entities
 * @param {{ source_path: string, file_name?: string, expand_warnings?: Warning[] }} meta
 * @returns {FormModel}
 */
function parse_form_xml(flat_text, meta) { ... }

module.exports = { parse_form_xml, classify_field /* optional export for tests */ };
```

**Không** gọi expander bên trong parser. Host panel gọi:

```js
const expand = require('../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');
const { parse_form_xml } = require('./parser/FormXmlParser');

const expanded = expand.expandXmlEntities(file_path, source_text);
const form_model = parse_form_xml(expanded.flat_text, {
  source_path: file_path,
  file_name: path.basename(file_path),
  expand_warnings: map_expand_errors(expanded) // nếu có
});
```

---

## Dependency

- **`fast-xml-parser`** (thêm vào `package.json` dependencies khi implement).
- Cấu hình gợi ý:

```js
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  preserveOrder: false,
  trimValues: false,
  // text node: giữ CDATA nếu cần; fields/views thường không cần script
});
```

> Lưu ý: cấu trúc FBO có thể có nhiều node trùng tên (`item`, `field`). Dùng helper “always array”:

```js
function as_array(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}
```

---

## Thuật toán tổng

```
1. Parse XML → object
2. Tìm controller root (thường <dir> hoặc root có <fields> + <views>)
3. Parse tất cả <field> → fields map (classify)
4. Tìm <view id="Dir"> (so khớp @_id hoặc id)
5. Parse master columns từ item đầu (value chỉ toàn số + dấu phẩy)
6. Parse <categories>/<category> theo thứ tự declaration
7. Parse các <item> còn lại (pattern:refs) → ViewRow, gán zone
8. Validate widths / pattern lengths → warnings
9. Return FormModel
```

Nếu không tìm thấy view Dir → `warnings` + `view` stub rỗng + UI hiện NO_VIEW_DIR.

---

## classify_field(field_node) → FieldDef

Pseudo:

```
name = field['@_name']
read_only = String(field['@_readOnly']).toLowerCase() === 'true'
disabled  = String(field['@_disabled']).toLowerCase() === 'true'
category_index = field['@_categoryIndex'] != null ? String(field['@_categoryIndex']) : null
type_attr = field['@_type'] || ''

items = as_array(field.items)  // hoặc field.item wrapper tùy parser output
// fast-xml-parser: <items> thành object; kiểm tra @_style

style = (field.items && field.items['@_style']) || ''

// Ưu tiên: Grid > DropDownList > Boolean > DateTime > mọi thứ còn lại (kể cả Mask/Numeric/AutoComplete)
if (style === 'Grid')         kind = 'grid'
else if (style === 'DropDownList') kind = 'dropdown'
else if (type_attr === 'Boolean')  kind = 'checkbox'
else if (type_attr === 'DateTime' || type_attr === 'Date') kind = 'date'
else kind = 'input'  // gồm cả style="Mask", "Numeric", "AutoComplete", không có items…

// --- Label text: header → label fallback ---
header_v = field.header?.['@_v'] || field.header?.v || ''
header_e = field.header?.['@_e'] || field.header?.e || ''
label_v  = field.label?.['@_v']  || field.label?.v  || ''
label_e  = field.label?.['@_e']  || field.label?.e  || ''
// UI dùng: header_v || label_v || header_e || label_e || name

options = []
if kind === 'dropdown':
  for each item in as_array(field.items.item):
    options.push({
      value: String(item['@_value'] ?? ''),
      label_v: item.text?.['@_v'] ?? '',
      label_e: item.text?.['@_e'] ?? ''
    })

grid_controller = field.items?.['@_controller']
grid_placeholder = kind === 'grid' ? `${name}_Grid` : ''
```

**Boolean attributes:** một số XML viết `readOnly="true"`, `disabled="true"`; luôn so sánh string sau `.toLowerCase()`.

---

## Parse view items

### Master columns

Item `value` match `/^\s*[\d.\s,]+\s*$/` (chỉ số và phẩy) →

```js
master_columns = value.split(',').map(s => Number(String(s).trim())).filter(n => !Number.isNaN(n))
```

### Pattern item

```
raw = item['@_value'] || item.value
split at first ':' 
pattern = left.trim()
refs_str = right
refs = refs_str.split(',').map(s => s.trim()).filter(Boolean)
```

Parse từng ref:

```
/^\[([^\]]+)\]$/
inner = name | name.Label | name.Description | name%l

if ends with %l → role lookup_name, field = name without %l
else if .Label → label
else if .Description → description
else → control
```

Gán refs lần lượt vào các vị trí pattern `1` (bỏ qua `-` và `0` khi tiêu thụ ref).

Nếu số `1` ≠ số refs → warning `PATTERN_COLUMN_MISMATCH` / soft parse (gán bao nhiêu được).

### Build cells + col_span

Xem [03-form-model.md](./03-form-model.md).

### Zone assignment

```
field_names_in_row = unique fields from slots
pick primary = first control field if any, else first field

cat = fields[primary]?.category_index ?? null

if cat == null → push rows_general
else → push rows_by_category[cat]
```

`columns_ref` / `column_widths`:

- general → master_columns
- else → category.columns (fallback master nếu category thiếu columns)

Validate `pattern.length === column_widths.length` → else warning.

---

## Categories

```
for (cat, order) of as_array(view.categories.category):
  index = String(cat['@_index'])
  columns = parse_columns(cat['@_columns'])
  ...
  if index === '-1': footer_category = def (vẫn lưu declaration_order)
  else: categories.push(def)  // giữ thứ tự khai báo; KHÔNG sort
```

So sánh `columns_total_px` vs `master_total_px` → `CATEGORY_WIDTH_MISMATCH` (trừ category 1 cột full như `809` — vẫn warning nếu khác tổng master; có thể soft).

---

## Edge cases

| Case | Xử lý |
|------|--------|
| Comment XML `<!-- ... -->` | Parser bỏ; OK |
| Item trong comment | Không có trong flat nếu vẫn comment; OK |
| `&Entity;` còn sót | Warning MISSING_ENTITY; parse phần còn lại |
| Nhiều `<view>` | Chỉ lấy `id="Dir"` |
| Field trùng name | Field sau ghi đè + warning PARSE_SOFT |
| Empty pattern list | Bỏ qua item |

---

## Unit tests (bắt buộc)

File: `src/PreviewForm/tests/FormXmlParser.test.js`

Dùng runner hiện có của repo (nếu chưa có test runner riêng cho PreviewForm, dùng `node --test` hoặc mocha/jest nếu project đã có — kiểm `package.json` scripts; XmlFlatPreview có tests dạng tự viết — **bám pattern** `src/ReadXMLByJS/XmlFlatPreview/tests/`).

### Cases tối thiểu

1. **classify:** Grid / DropDownList / Boolean / DateTime / input / readOnly.
2. **Label vs Description** text lấy header/footer.
3. **categories order:** index 3 khai báo trước index 1 → tabs array giữ declaration order.
4. **footer:** categoryIndex -1 → `rows_by_category["-1"]`, không vào `categories` tabs.
5. **general:** field không categoryIndex → `rows_general`.
6. **pattern span:** `11000` → cell[0] span phù hợp.
7. **snippet TNTran-like** XML string nhỏ inline trong test (không phụ thuộc UNC path).

---

## Output lỗi cứng

Chỉ `throw` khi `flat_text` rỗng hoặc XML hoàn toàn không parse được. Các lỗi domain khác → `warnings` + model partial.
