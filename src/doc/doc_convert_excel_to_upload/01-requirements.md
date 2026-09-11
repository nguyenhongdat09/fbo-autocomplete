# 01 — Requirements: Convert Excel From Upload

## Mục tiêu

Dev / BA FBO cần **tải mẫu Excel upload** từ file `Templates/Upload/*.xml` **phiên bản cũ** (fields khai báo thẳng + `column`), trong khi Upload XML **không chứa header tiếng Việt**. Header nằm ở file Dir/Grid tương ứng — phải lookup + chọn file nguồn rồi gộp.

**Sản phẩm:** Command palette trên editor Upload XML → chọn 1+ file Dir/Grid → xuất `.xlsx` theo mẫu `upload_chuan.xlsx` (header dòng 5, dấu `*` đỏ cho field bắt buộc).

## User stories

1. **Mở Upload cũ:** User mở `...\Templates\Upload\ARTran.xml` → chạy `FBO: Convert Excel From Upload` → được phép chạy tiếp.
2. **Chặn Upload mới:** User mở `SVTran.xml` có `<template>` → toast lỗi, không mở dialog / không ghi Excel.
3. **Lookup Dir/Grid:** Hệ thống tự suy prefix từ tên file (`ARTran` → `AR*`) → search SearchFile → chỉ hiện file trong `Dir` / `Grid`.
4. **Chọn nhiều file:** QuickPick multi-check (vd `Dir/ARTran.xml` + `Grid/ARDetail.xml`) để gom đủ header.
5. **Xuất Excel:** SaveDialog → file `.xlsx` có header đúng cột Upload (`column`), `*` đỏ nếu `allowNulls="false"`, legend dòng 3.
6. **Danh mục không phải Tran:** Upload `zcamdm.xml` → search theo tên đầy đủ `zcamdm`, không cắt 2 ký tự.

## Phạm vi MVP (in-scope)

| Hạng mục | Chi tiết |
|----------|----------|
| Input | Active editor = Upload XML legacy |
| Guard | Folder `Upload` + không có `<template>` |
| Parse | `<fields>` → `<field name column allowNulls …>` |
| Search | `GroupFileIndexService` + filter Dir/Grid |
| UI | QuickPick `canPickMany` |
| Header | Flatten Dir/Grid → `header/@v` |
| Output | ExcelJS + `upload_chuan.xlsx` dòng 5 |
| Command | `fbo-autocomplete.ConvertExcelFromUpload` |

## Kiến trúc

- Code trong **`src/ConvertExcelFromUpload/`** — `extension.js` chỉ register.
- Tái dùng SearchFile index, `AppDataPathHelper`, flatten entity (`XmlEntityExpander`), ExcelJS (giống pattern ConvertToExcel nhưng template/row khác).

## Non-goals (out-of-scope MVP)

- Không hỗ trợ / generate từ Upload **phiên bản mới** có `<template>` (SVTran-style đã tự khai báo header trong template).
- Không sửa / refactor [`src/ConvertToExcel/`](../../ConvertToExcel/) (`ConvertToExcel`, Pivot).
- Không webview wizard (chỉ QuickPick + SaveDialog).
- Không query SQL app / MCP database để lấy metadata field.
- Không điền dữ liệu mẫu dòng 6+ (chỉ header + legend).
- Không tự động chọn Dir/Grid (user phải check chọn).
- Không dịch header `e` (English) — chỉ `v`.
- Không expand entity trong **Upload** XML (legacy thường field inline; entity comment). Chỉ flatten **Dir/Grid** đã chọn.

## Tiêu chí Done (tóm tắt)

Chi tiết: [08-acceptance-checklist.md](./08-acceptance-checklist.md).

1. `ARTran.xml` (legacy) → chọn Dir+Grid → Excel header khớp `column` + `*` đỏ đúng field `allowNulls="false"`.
2. `SVTran.xml` (có `<template>`) → bị chặn.
3. `zcamdm` → prefix = full name.
4. Unit test parser/prefix/catalog pass qua `tests/run-all.js`.
5. Pack VSIX: `upload_chuan.xlsx` có trong bundle (whitelist `.vscodeignore`).

## Command & UX

- **Command id:** `fbo-autocomplete.ConvertExcelFromUpload`
- **Title:** `FBO: Convert Excel From Upload`
- **Kích hoạt:** Command Palette (có thể thêm `editor/title` khi path chứa `Upload` — optional, không bắt buộc MVP).
- **Toast lỗi mẫu:**
  - Không phải Upload: `Chức năng này chỉ chạy trên file trong Templates/Upload.`
  - Có `<template>`: `Upload phiên bản mới (có thẻ <template>) không dùng Convert Excel From Upload.`
  - Không tìm thấy Dir/Grid: `Không tìm thấy file Dir/Grid khớp với "{prefix}".`
  - User hủy QuickPick / SaveDialog: warning ngắn, không crash.
