# Prompt Gemini — FIX-17: Footer không có `<category index="-1">` → dùng master columns (dòng item đầu view)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/parser/FormXmlParser.js`, tests).

---

## Prompt

```
Fix Preview Form parser: field `categoryIndex="-1"` (footer) nhưng **view không khai** `<category index="-1" columns="…">` → layout footer phải dùng **cùng bộ columns** như dòng item master đầu tiên trong `<view>` (giống Thông tin chung).

### Ví dụ thực tế — Filter `SITran.xml`

**Fields footer (không có category -1 trong view):**
```xml
<field name="ma_dvcs" categoryIndex="-1">
  <header v="Đơn vị" e="Unit"></header>
  <items style="AutoComplete" controller="Unit" reference="ten_dvcs%l" …/>
</field>
<field name="ten_dvcs%l" readOnly="true" external="true" …>
```

**View — không có `<category index="-1">`, chỉ master + item pattern:**
```xml
<item value="120, 30, 70, 100, 230"/>
<item value="1101: [ngay_ct1].Description, [ngay_ct1], [ngay_ct2]"/>
…
<!-- item nào có field categoryIndex=-1 → rows_by_category["-1"] -->
```

→ `master_columns` = `[120, 30, 70, 100, 230]`.

**Đúng:** mọi `ViewRow` trong `rows_by_category["-1"]` có `column_widths = master_columns`, `columns_ref = 'master'` (hoặc `'-1'` nhưng widths = master — quan trọng là **mảng px giống dòng 120,30,70,100,230**).

**Sai hiện tại:** `footer_category.columns = []` vì không parse được category -1 → `r.column_widths = []` → footer không grid / field lệch / không hiện đúng.

### Quy tắc (đã ghi trong docs/04-parser-spec.md — chưa implement đủ)

Khi gán `column_widths` cho row thuộc zone `categoryIndex`:

- `general` (null) → `master_columns`
- tab `n` → `category.columns`; **nếu thiếu/rỗng** → fallback `master_columns` + warning (optional)
- **footer `-1`** → `footer_category.columns` **nếu có và length > 0**; **ngược lại** → fallback **`master_columns`** (mặc định như user yêu cầu)

Không nhầm với FEAT-01d: footer **guide** anchor/split vẫn chỉ từ `<category index="-1" @anchor/@split>` nếu có — không lấy `view.anchor`. Chỉ **columns layout** mới fallback master.

### Implement gợi ý (`FormXmlParser.js`)

Sau khi có `masterColumns` và `footerCategory`:

```js
function effective_columns(cat_conf, master_columns) {
  const cols = cat_conf?.columns;
  if (cols && cols.length > 0) return cols;
  return master_columns;
}

// footer metadata (để UI/width total nhất quán)
if (!footerCols.length && masterColumns.length) {
  footerCategory.columns = masterColumns;
  footerCategory.columns_total_px = masterColumns.reduce((a, b) => a + b, 0);
  footerCategory.columns_fallback_master = true; // optional flag cho warning UI
}

// trong processItems, catIdx === '-1':
const widths = catIdx === '-1'
  ? effective_columns(footerCategory, masterColumns)
  : effective_columns(catConf, masterColumns);
r.column_widths = widths;
if (catIdx == null) {
  r.columns_ref = 'master';
} else if (catIdx === '-1' && (!footerCols.length) && masterColumns.length) {
  r.columns_ref = 'master'; // hoặc '-1' + widths master — document trong model
} else {
  r.columns_ref = String(catIdx);
}
```

Hoặc gọn: luôn gọi `effective_columns` cho mọi zone không phải general.

### Test

Thêm fixture nhỏ (hoặc case trong `FormXmlParser.test.js`):

- View: item1 `100,200`, item2 pattern general, item3 pattern có field `categoryIndex="-1"`.
- **Không** khai `<category index="-1">`.
- Assert: `rows_by_category['-1'][0].column_widths` deepEqual `[100, 200]`.
- Fixture cũ `mini-dir.xml` (có category -1 riêng columns) vẫn pass — ưu tiên columns XML khi đã khai.

### Filter XML (nếu chặn parse)

Path `Filter/SITran.xml` đã được mở Preview (FIX-10). Nếu parser chỉ nhận `<dir>` và báo "Not a valid Dir XML" với `<filter>`:

- Chuẩn hóa root: `filter` → cùng pipeline `fields` + `views.view` (giống Dir), **trong scope task này** nếu cần để test SITran.

### Không làm

- Không đổi rule zone (row vẫn theo `category_index` field đầu item).
- Không fallback `footer.anchor` ← `view.anchor`.
- Không dùng `view.split` cho layout footer row.

### Files

- `parser/FormXmlParser.js`
- `tests/FormXmlParser.test.js` + fixture nếu cần
- (UI chỉ cần model đúng — `main.js` không đổi trừ khi đọc `columns_ref` đặc biệt)

### Done

- [ ] Footer field `categoryIndex="-1"` + **không** `<category index="-1">` → grid đúng `120,30,70,100,230` (SITran)
- [ ] Dir TNTran vẫn dùng `category -1` columns riêng khi đã khai
- [ ] General vẫn dùng master_columns như cũ
- [ ] Test parser mới pass
```

---

## Nhắc

| Tình huống | `column_widths` footer |
|------------|-------------------------|
| Có `<category index="-1" columns="…">` | columns từ XML |
| **Không** có category -1 | **master** (item đầu không có `:`) |
| General | master (không đổi) |

```
SITran item đầu:  120, 30, 70, 100, 230  →  footer dùng bộ này
```
