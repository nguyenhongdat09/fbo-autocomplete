# 02 — Domain Rules: XML Form Layout FBO

Tài liệu này là **nguồn sự thật** cho parser và UI. Bám sát skill `fbo-design-view-field` và quy ước Preview Form.

> **Preview phải render đúng các quy tắc dưới đây** — kể cả khi XML khai báo “xấu”. Mục đích: Developer nhìn preview biết chỗ sai rồi sửa item/columns/categoryIndex. Không được che lỗi bằng auto-layout.

---

## 1. Cấu trúc tổng thể form Dir

```
┌─────────────────────────────────────────┐
│  THÔNG TIN CHUNG (header)               │  ← field KHÔNG có categoryIndex
│  rows theo <item> trong view            │
├─────────────────────────────────────────┤
│  [Tab1] [Tab2] [Tab3] ...               │  ← <category> theo thứ tự khai báo
│  ┌───────────────────────────────────┐  │
│  │  Nội dung tab (height = view/@height)│
│  │  fields có categoryIndex = index   │  │
│  │  hoặc Grid thuộc category đó       │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  STICKY FOOTER                          │  ← categoryIndex = "-1"
│  (luôn hiện, không đổi theo tab)        │
└─────────────────────────────────────────┘
```

### `view/@height`

- Là **chiều cao vùng tab** (pixel), **không** phải chiều cao thông tin chung.
- Nếu số dòng field trong tab làm nội dung cao hơn `height` → UI vẫn render (overflow) **và** hiện banner cảnh báo để developer tự canh.

### `view/@anchor` và `category/@anchor`

- `anchor` = chỉ số cột **1-based** sẽ **co giãn** khi kéo rộng form.
- Preview MVP: có thể ghi nhận trong FormModel; **không bắt buộc** simulate resize — optional CSS `1fr` trên cột anchor nếu dễ.

### `view/@split` và `category/@split`

- Cắt danh sách `columns` thành cột cha (ảnh hưởng thứ tự Tab focus runtime FBO).
- Preview MVP: lưu vào model; **không bắt buộc** mô phỏng Tab order focus — ghi chú trong UI optional.

---

## 2. Phân loại field (`<fields>` / `<field>`)

Phát hiện theo thứ tự ưu tiên (first match wins):

| Ưu tiên | Điều kiện | `kind` | Render preview |
|---------|-----------|--------|----------------|
| 1 | Có con `<items style="Grid" ...>` | `grid` | Placeholder text `{name}_Grid` (vd `zcdtndgsc_Grid`) |
| 2 | Có `<items style="DropDownList">` | `dropdown` | Dropdown + options từ từng `<item value>` + `<text v="...">` |
| 3 | `type="Boolean"` | `checkbox` | Checkbox |
| 4 | `type="DateTime"` (hoặc Date nếu gặp) | `date` | Date / text field ngày |
| 5 | Còn lại (gồm `style="Mask"`, `style="Numeric"`, `style="AutoComplete"`, không có items…) | `input` | Text field |

> **Lưu ý `style="Mask"` và `style="Numeric"`:** Đây là input thường trong FBO. Preview render như `input` (`vscode-text-field`). Không xử lý mask/format runtime.

### Thuộc tính quan trọng

| Attribute | Ý nghĩa trong preview |
|-----------|------------------------|
| `name` | Khóa field |
| `categoryIndex` | Zone: thiếu → `general`; `"-1"` → `footer`; số khác → tab có `category/@index` khớp |
| `readOnly="true"` | **Không** dùng control input; plain text (`<span class="readonly-value">`) |
| `disabled="true"` | Preview: render như readOnly nhưng thêm CSS `opacity: 0.55` để phân biệt (field bị khoá theo nghiệp vụ). Không bỏ qua — vẫn hiện field. |
| `header/@v` | Nhãn tiếng Việt (Label) — xem quy tắc lấy label bên dưới |
| `footer/@v` | Mô tả / Description |
| `inactivate`, `external`, … | Bỏ qua logic runtime; có thể gắn metadata nếu cần debug |

### `<label>` vs `<header>` — Grid field đặc biệt

Các Grid field trong FBO thường dùng **`<label>`** (thay vì `<header>`) để hiển thị tên hiển thị:

```xml
<field name="zcdtndgscSPTN" external="true" categoryIndex="1">
  <header v="" e=""/>                         <!-- header rỗng -->
  <label v="Sản phẩm tiếp nhận" e="Detail"/>  <!-- label mang tên thật -->
  <items style="Grid" controller="TNDetailSPTN" row="1">...</items>
</field>
```

**Quy tắc lấy label text (áp dụng cho mọi field, không chỉ Grid):**

1. Dùng `header/@v` nếu không rỗng.
2. Nếu `header/@v` rỗng **và** có `<label v="...">` → dùng `label/@v` (fallback `label/@e`).
3. Fallback cuối: `header/@e` rồi `name`.

`FieldDef` lưu thêm `label_v` / `label_e` từ `<label>` node để parser và UI có thể thực hiện fallback đúng.

### Grid example

```xml
<field name="zcdtndgsc" ... categoryIndex="2">
  <items style="Grid" controller="TNDetail" row="1">...</items>
</field>
```

→ Placeholder: **`zcdtndgsc_Grid`**. Không render bảng.

### Dropdown example

```xml
<field name="status" ...>
  <items style="DropDownList">
    <item value="4"><text v="4. Đã báo giá" e="..."/></item>
  </items>
</field>
```

→ `kind: dropdown`, options `[{ value, label_v, label_e }]`.

---

## 3. Label và Description trong view item

Trong `<item value="PATTERN: [refs...]">`:

| Token trong list | Nguồn text | Slot UI |
|------------------|------------|---------|
| `[field].Label` | `field.header.v` (fallback `header.e`, rồi `field` name) | Label cột |
| `[field].Description` | `field.footer.v` (fallback `footer.e`) | Plain text (không input) |
| `[field]` | Control theo `kind` (+ readOnly) | Control / readonly value |
| `[field%l]` | Tên tham chiếu lookup — **không** có field riêng; render plain text cạnh control (suffix `%l`) | Text phụ |

Ví dụ:

```xml
<field name="k_dong_y_yn" type="Boolean" categoryIndex="15">
  <header v="Không đồng ý" e="No Agree"/>
  <footer v="Ý kiến khách hàng" e="Customer reviews"/>
</field>
```

- `[k_dong_y_yn].Label` → “Không đồng ý”
- `[k_dong_y_yn].Description` → “Ý kiến khách hàng” (plain text)

---

## 4. Categories và thứ tự Tab

```xml
<categories>
  <category index="1" columns="809" anchor="1">
    <header v="1.1 Sản phẩm tiếp nhận" e="..."/>
  </category>
  <category index="2" columns="809" anchor="1">
    <header v="1.2 Chi tiết tiếp nhận" e="..."/>
  </category>
  ...
  <category index="-1" columns="..." anchor="5">
    <header v="" e=""/>
  </category>
</categories>
```

### Quy tắc bắt buộc

1. **Thứ tự tab UI** = thứ tự phần tử `<category>` trong XML **sau flatten**, **bỏ** `index="-1"` khỏi tab bar (footer riêng).
2. **Không** sort theo giá trị `index` số.
3. `index` dùng để **khớp** `field/@categoryIndex` và để biết field/grid thuộc tab nào.
4. `columns` trên category: độ rộng từng cột (px), cách nhau dấu phẩy. Tổng px **nên** bằng master columns (dòng item đầu view). Lệch → warning.
5. Category chỉ chứa Grid (pattern `1: [gridField]`): vẫn hiện tab + placeholder grid.

---

## 5. View items — pattern layout

### Dòng master columns (item đầu tiên)

```xml
<item value="100, 110, 100, 90, 30, 147, 8, 58, 42, 8, 100, 0, 0, 0, 0"/>
```

- Không có dấu `:` → đây là **định nghĩa độ rộng cột master**.
- Số phần tử = số cột layout general (và baseline tổng px).
- **Giá trị `0` trong danh sách columns = cột ẩn** — field/pattern `1` nằm trên cột đó **không render**. (Khác ký tự pattern `0` = span/giãn.) Developer cố ý để `0` để giấu field kỹ thuật (`stt_rec`, `ma_nk`, …).

### Dòng pattern

```xml
Format: `{pattern}:{comma-separated refs}`

| Ký tự pattern | Ý nghĩa |
|---------------|---------|
| `1` | Một ô hiển thị — tiêu thụ **một** ref trong list (trái → phải) |
| `0` | Cột giữ width; control ở `1` trước **span/giãn** qua. `0` chỉ là continuation khi đứng **sau** `1`. `0` đứng trước `1` (hoặc sau `-`) không tạo slot mới. |
| `-` | Khoảng trống — không gán field |

#### Ví dụ tường minh — Pattern `------10-11`

Pattern từ TNTran (footer `-1`): `"------10-11: [t_so_luong].Label, [t_so_luong],[da_tt_nt]"`

```
Col:  0    1    2    3    4    5    6    7    8    9    10
Pat:  -    -    -    -    -    -    1    0    -    1    1
Ref:                               Lbl →span      Ctrl Ctrl
```

- Vị trí 6 (`1`) → slot `[t_so_luong].Label`; vị trí 7 (`0`) ngay sau → `col_span = 2`.
- Vị trí 7 (`0`) → `{ type: 'span' }` (gộp vào slot trước).
- Vị trí 8 (`-`) → `{ type: 'empty' }`.
- Vị trí 9 (`1`) → slot `[t_so_luong]` control, `col_span = 1` (không có `0` liên tiếp sau).
- Vị trí 10 (`1`) → slot `[da_tt_nt]` control, `col_span = 1`.

> Số ký tự `1` = 3 → tiêu thụ đúng 3 refs: `[t_so_luong].Label`, `[t_so_luong]`, `[da_tt_nt]`.

**Độ dài pattern** phải bằng số phần tử `columns` của zone đang dùng:

- Item thuộc general (trước khi vào logic tab / field không category): dùng **master columns**.
- Item gắn field có `categoryIndex`: dùng `category.columns` của index đó (nếu category có columns; nếu `columns="809"` một số → coi như 1 cột full width).


### Gán item → zone

Với mỗi pattern item (không phải dòng master columns):

1. Parse danh sách refs; lấy các `fieldName` xuất hiện (bỏ `.Label` / `.Description` / `%l`).
2. Xác định `categoryIndex` từ **field đầu tiên có định nghĩa** trong list (ưu tiên field control, không phải chỉ Label nếu conflict — thực tế cùng category).
3. Nếu mọi field không có `categoryIndex` → zone `general`.
4. Nếu `categoryIndex === "-1"` → zone `footer`.
5. Ngược lại → zone `tab:{index}`.
6. Nếu list chỉ có grid field → zone theo `categoryIndex` của grid.

**Lưu ý:** Thứ tự **rows** trong mỗi zone = thứ tự xuất hiện `<item>` trong view (không reorder).

---

## 6. Thông tin chung vs Tab vs Footer

| Zone | Điều kiện field | UI |
|------|-----------------|-----|
| `general` | Không có `categoryIndex` | Section trên cùng, dùng master columns |
| `tab:{n}` | `categoryIndex="{n}"` và tồn tại category `index="{n}"` (n ≠ -1) | Trong panel tab tương ứng |
| `footer` | `categoryIndex="-1"` | Sticky dưới tabs, luôn visible |

Field có `categoryIndex` nhưng **không** có `<category index>` tương ứng → warning + có thể nhét vào tab “Orphan” hoặc bỏ qua row (chốt implement: warning + vẫn render trong section “Unmapped”).

---

## 7. Checklist map field → pattern (từ skill)

Với pattern 14 cột `11-----11-----: [a].Label, [a], [b].Label, [b]`:

```
Cột:  1   2   3 4 5 6 7   8   9  10...
Pat:  1   1   - - - - -   1   1   - ...
Fld:  Lbl a   (gap)       Lbl b   (gap)
```

Số ký tự `1` = số mục trong list sau `:`.

### Anti-pattern (parser phải warning)

| Sai | Hậu quả |
|-----|---------|
| Pattern length ≠ số cột | Lệch layout |
| Tổng px category ≠ master | Tab lệch header |
| Dùng `0` làm gap 2 cột | Input giãn quá dài |
| Thiếu `.Label` trước field | Label/input lệch |
| Quên `categoryIndex` | Field vào general thay vì tab |

---

## 8. Entity flatten

Trước khi apply mọi quy tắc trên:

1. Đọc XML (ưu tiên buffer editor chưa save).
2. Gọi `XmlEntityExpander.expandXmlEntities(file_path, source_text)`.
3. Dùng `model.flat_text` làm input parser.
4. Đưa `model.errors` / missing entities vào `FormModel.warnings` nếu API có.

`&ListView;`, `&PostView;`, `&ListCategory;`, `&PostCategory;`… phải được expand trước khi parse categories/items.
