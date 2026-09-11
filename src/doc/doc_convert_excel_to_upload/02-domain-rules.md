# 02 — Domain Rules

## 1. Guard: chỉ Upload legacy

### 1.1 Folder

Active document path (normalize `/` và `\`) phải chứa segment folder **`Upload`** sau `Templates` (thực tế: path chứa `\Upload\` hoặc `/Upload/` hoặc kết thúc bằng `\Upload\file.xml`).

Khuyến nghị check chắc:

```text
path includes Controllers/Templates/Upload  (hoặc Controllers\Templates\Upload)
```

Nếu không đạt → error toast, dừng.

### 1.2 Phiên bản

| Dấu hiệu | Version | Hành vi |
|----------|---------|---------|
| XML có thẻ mở `<template` (case-insensitive) | `template` (mới) | **Chặn** |
| Không có `<template` | `legacy` (cũ) | Cho chạy |

Không dựa vào project FBO vs FBI — chỉ dựa nội dung XML.

**Fixture:**

- Legacy: `...\Gate-FBOR2\...\Templates\Upload\ARTran.xml`
- Template: `...\SHOWA\FBISP242\...\Templates\Upload\SVTran.xml`

---

## 2. Parse Upload fields (legacy)

Trong block `<fields …>…</fields>` (thường `identity="true" name="stt"`), lấy mọi `<field … />` hoặc `<field …></field>`.

### Thuộc tính bắt buộc cho Excel

| Attr | Ý nghĩa | Bắt buộc |
|------|---------|----------|
| `name` | Tên field FBO | Có |
| `column` | Cột Excel (`A`, `B`, `AA`…) | Có — thiếu thì skip field + warning |
| `allowNulls` | `"false"` = bắt buộc | Không — default cho phép null |

Các attr khác (`maxLength`, `type`, `upperCase`, `defaultValue`) **không** cần để ghi header MVP (có thể parse giữ lại cho debug).

### Ví dụ (ARTran)

```xml
<field name="ma_dvcs" column="A" allowNulls="false" maxLength="8" upperCase="true" />
<field name="ma_kh" column="B" allowNulls="false" maxLength="8" upperCase="true" />
<field name="ngay_ct" column="D" allowNulls="false" type="DateTime" />
```

→ Cột `C` **trống** (không có field) — Excel phải **giữ trống** cột C, không dồn `ngay_ct` sang C.

### Entity trong Upload

Legacy thường comment `&ARTranFields;` và khai báo field inline. MVP: **chỉ parse thẻ `<field` literal** trong file Upload đang mở — không expand DTD entity Upload.

---

## 3. Derive search prefix từ tên file

Input: basename không extension, ví dụ `ARTran`, `ARDetail`, `zcamdm`, `CustomerMaster`.

### Thuật toán

```
base = basename without .xml
lower = base.toLowerCase()

if lower ends with "tran" OR "detail" OR "master":
    prefix = base.substring(0, 2)   // giữ nguyên casing 2 ký tự đầu của base gốc
    mode = "prefix"
else:
    prefix = base
    mode = "exact"
```

| File Upload | base | mode | prefix / keyword gợi ý |
|-------------|------|------|-------------------------|
| `ARTran.xml` | ARTran | prefix | `AR` → search `AR*.xml` |
| `ARDetail.xml` | ARDetail | prefix | `AR` |
| `XXMaster.xml` | XXMaster | prefix | `XX` |
| `zcamdm.xml` | zcamdm | exact | `zcamdm` (hoặc `zcamdm.xml`) |
| `Customer.xml` | Customer | exact | `Customer` |

> User ghi “Maser” trong yêu cầu gốc → chuẩn hóa thành **`Master`**.

### Sau search: filter folder

Chỉ giữ relative path có segment:

- `...\Controllers\Dir\...` hoặc `.../Controllers/Dir/...`
- `...\Controllers\Grid\...` hoặc `.../Controllers/Grid/...`

Loại Filter, Lookup, Report, Upload, Templates, v.v.

### Exact mode

Sau filter Dir/Grid, **lọc thêm** `path.basename(rel).toLowerCase() === (prefix + '.xml').toLowerCase()`  
hoặc basename without ext === prefix (case-insensitive). Tránh khớp substring nhiễu.

### Prefix mode

Giữ mọi Dir/Grid khớp glob `AR*.xml` (matcher SearchFile). Không bắt buộc tên bắt đầu bằng đúng 2 ký tự nếu matcher đã áp `AR*.xml` trên full relative path — keyword nên là `{prefix}*.xml`.

---

## 4. Resolve header từ Dir / Grid

### 4.1 Flatten

Với mỗi file user chọn:

1. Đọc nội dung qua `entityResolver.readFileContent(absPath)` (đúng encoding FBO).
2. Flatten entity bằng `expandXmlEntities(absPath, sourceText)` → `model.flat_text`.
3. Trên `flat_text`, extract mọi `<field …>` (cả self-closing và có body).

### 4.2 Lấy header

Trong mỗi field:

- `name` từ attr `name="..."`.
- Header VN từ `<header … v="..."` (regex / parse đơn giản).
- Bỏ qua field `hidden="true"` khi build catalog (không ghi đè header hữu ích) — nếu chỉ có bản hidden, vẫn có thể không có entry.

### 4.3 Merge catalog nhiều file

```
catalog = Map<string, string>  // fieldName → headerV

for file in userSelectionOrder:
  for each field in file:
    if catalog.has(name): continue          // first wins
    if headerV non-empty: catalog.set(name, headerV)
```

### 4.4 Merge với Upload fields

Với mỗi Upload field theo thứ tự trong XML:

```
displayHeader = catalog.get(name) || name
required = (allowNulls === "false")
excelColumn = column   // "A", "B", "AA"...
```

Output row cho exporter:

```js
{
  name: "ma_kh",
  column: "B",
  header: "Mã khách",   // hoặc fallback name
  required: true
}
```

---

## 5. Quy tắc Excel (nhìn từ domain)

| Hạng mục | Rule |
|----------|------|
| Template | `src/Database/upload_chuan.xlsx` |
| Sheet | Sheet đầu tiên (`worksheets[0]`) |
| Header row | **5** |
| Data start | 6 (không ghi data MVP) |
| Legend | Dòng **3**, text `* Tên trường bắt buộc nhập`, màu đỏ, italic |
| Required visual | Cell header: rich text `*` (đỏ) + phần còn lại (đen hoặc mặc định) + text header |
| Cột trống | Không có Upload field → **không** ghi gì vào cột đó |
| Alignment header | Center (khớp mẫu) |

Chi tiết ExcelJS: [05-excel-export.md](./05-excel-export.md).

---

## 6. Resolve project root cho Search

Từ path file Upload đang mở:

```js
const helper = new AppDataPathHelper(uploadFilePath);
const groupRoot = helper.getProjectPath(); // đã qua ProjectMappingHelper
```

Truyền `groupRoot` vào `GroupFileIndexService.search(groupRoot, keyword)`.

Nếu không resolve được root → error toast rõ ràng.
