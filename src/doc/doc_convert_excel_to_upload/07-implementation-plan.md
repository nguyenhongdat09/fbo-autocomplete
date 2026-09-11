# 07 — Implementation Plan (TDD cho Gemini)

Làm **tuần tự**. Mỗi task xong: test xanh (nếu có) rồi mới task sau. Không nhảy lên Excel trước khi parser ổn.

---

## Phase A — Parser thuần (không VS Code UI)

### A1. Skeleton folder

- [ ] Tạo `src/ConvertExcelFromUpload/` đúng cây [06-extension-integration.md](./06-extension-integration.md)
- [ ] `tests/run-all.js` chạy được (có thể empty pass)

### A2. `UploadVersionDetector`

- [ ] Implement `detectUploadVersion`
- [ ] Test: legacy snippet (không template) → `legacy`
- [ ] Test: có `<template>` / `<template row=` → `template`

### A3. `UploadFieldsParser`

- [ ] Implement `parseUploadFields`
- [ ] Fixture inline từ ARTran fields (ma_dvcs A required, ngay_ct D, dien_giai G not required)
- [ ] Test skip field thiếu `column`
- [ ] Test normalize column uppercase

### A4. `SearchPrefixDeriver`

- [ ] `deriveSearchPrefix`: ARTran / ARDetail / XXMaster / zcamdm / Customer
- [ ] `filterDirGridPaths`: giữ Dir+Grid, loại Filter/Upload
- [ ] `filterExactBaseName`
- [ ] `isUploadFolderPath`

### A5. `DirGridHeaderCatalog`

- [ ] `buildHeaderCatalog` first-wins + skip hidden
- [ ] `mergeUploadWithHeaders` fallback name
- [ ] Test trùng field 2 nguồn

**Checkpoint A:** `node src/ConvertExcelFromUpload/tests/run-all.js` → exit 0.

---

## Phase B — Excel exporter (file I/O, có thể không cần VS Code window)

### B1. `UploadExcelExporter`

- [ ] Load `upload_chuan.xlsx` qua `resolveBundledDatabaseRoot`
- [ ] Clear + ghi row 5 theo `column`
- [ ] Legend D3 rich text đỏ italic
- [ ] Required: rich text `*` đỏ + header
- [ ] Test nhẹ: export temp file → đọc lại bằng ExcelJS, assert cell `A5` / `B5` / `D3` (optional nhưng khuyến nghị)

### B2. Packing

- [ ] Thêm `!src/Database/upload_chuan.xlsx` vào `.vscodeignore`
- [ ] Xác nhận file tồn tại tại `src/Database/upload_chuan.xlsx`

---

## Phase C — Command + Search + UI

### C1. Tree getter

- [ ] Thêm `getGroupFileIndexService()` trên TreeFileProvider / OneLevel / Dynamic

### C2. `ConvertExcelFromUploadCommand.run`

- [ ] Guard folder + version
- [ ] Parse + prefix
- [ ] Inject index → search → filter → QuickPick
- [ ] Flatten selected via `expandXmlEntities`
- [ ] Merge + SaveDialog + export + openExternal
- [ ] Toast lỗi/cảnh báo đúng [01](./01-requirements.md) / [04](./04-search-and-ui.md)

### C3. Register

- [ ] `index.js` + `registerConvertExcelFromUpload`
- [ ] `extension.js` ~2 dòng + truyền `deps.getIndexService`
- [ ] `package.json` command entry

---

## Phase D — Nghiệm thu tay

- [ ] Chạy hết checklist [08-acceptance-checklist.md](./08-acceptance-checklist.md)
- [ ] Không regress `ConvertToExcel` / Pivot (smoke mở command cũ nếu có Grid sẵn)

---

## Thứ tự file nên tạo

1. `parser/*.js` + tests  
2. `excel/UploadExcelExporter.js` + test optional  
3. `ConvertExcelFromUploadCommand.js`  
4. `index.js`  
5. Wire `extension.js` + `package.json` + `.vscodeignore`  
6. Getter TreeFileProvider\*  

---

## Definition of Done (implement)

- Parser tests xanh.
- Command chạy trên ARTran legacy (mạng Gate hoặc bản copy local).
- SVTran bị chặn.
- VSIX pack chứa `upload_chuan.xlsx`.
- Không sửa logic nghiệp vụ trong `ConvertToExcel/`.
