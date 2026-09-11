# 02 — Migration checklist (Gemini cắt từng region)

Làm **tuần tự**. Mỗi bước: cắt code → gắn `module.exports` → assign prototype → smoke nhanh → commit logic sang bước sau. Không đổi hành vi.

## 0. Chuẩn bị

- [x] Đọc hết [01-architecture.md](./01-architecture.md).
- [x] Tạo folder `src/TreeFile/ContextMenuActions/`.
- [x] Backup mental: danh sách `commandMap` hiện tại trong ctor `ContextMenu.js` (đủ `fboFile.*`).

## 1. Skeleton wire (chưa cắt feature)

- [x] Tạo `selectionHelpers.js`: chuyển `getPathsSelect` + `getSelectedTargets` nguyên văn; `module.exports = { getPathsSelect, getSelectedTargets }`.
- [x] Tạo `registerCommands.js`: chuyển nguyên `commandMap` + vòng register; gọi `registerCommands(this)` từ ctor.
- [x] `ContextMenu.js`: `Object.assign(prototype, selectionHelpers)` top-level; ctor chỉ còn field + `registerCommands` + selection listener.
- [x] Smoke: extension load, chuột phải tree vẫn hiện menu (không cần chạy hết lệnh).

## 2. Cắt từng feature (một file / bước)

Với mỗi file dưới đây: **cut-paste body**, thêm `require` cần thiết trong file action, xóa region khỏi `ContextMenu.js`, thêm vào `Object.assign`.

| Thứ tự | File | Smoke tối thiểu |
|--------|------|-----------------|
| 2.1 | `CopyPath.js` | Chọn file → Copy Path → clipboard có path |
| 2.2 | `CopyNameOfFile.js` | Copy name / NoEx theo setting `ExtFileNameCopy` |
| 2.3 | `CopyFile.js` | Copy file → clipboard FileDrop (Windows) |
| 2.4 | `OpenRevealFolder.js` | Reveal folder / select file trong Explorer OS |
| 2.5 | `RenameFile.js` | Rename từ tree / editor |
| 2.6 | `DeleteFile.js` | Xóa file (confirm Yes) + đóng tab |
| 2.7 | `PasteFilesToGroup.js` | Copy file OS → Paste vào group App_Data |
| 2.8 | `GenerateCopyFile.js` | Generate copy + cú pháp `rl(...)` |
| 2.9 | `OpenWebConfig.js` | Mở `Web.config` group |
| 2.10 | `FixWebConfig.js` | Fix Web.config (touch) |
| 2.11 | `ConfigProjectRoot.js` | Config Project Root → reload tree |
| 2.12 | `ExpandAll.js` | Expand All group |
| 2.13 | `DeleteStruct.js` | Xóa file trong Structure/* (cẩn thận môi trường dev) |
| 2.14 | `NewSqlTemp.js` | New SQL temp (setting folder) + On Workspace (`Scripts/`) |
| 2.15 | `ConvertXmlFromF.js` | Convert `.f` → `.xml` (decrypt / no-Encrypted / chặn ghi đè) |

Sau mỗi bước: `ContextMenu.js` không còn `#region` tương ứng.

## 3. Lưu ý kỹ thuật khi cắt

### 3.1. Binding `this`

- Method trong action file **phải** là `function` thường (hoặc method shorthand trong object) để `this` = instance khi gọi qua prototype.
- **Không** export arrow function `() => { this.... }` ở top-level method (mất `this`).
- `registerCommands` giữ đúng kiểu gọi như cũ (`bind` / wrapper `() => this.xxx()`).

### 3.2. Windows clipboard / PowerShell

- `CopyFile` / `PasteFilesToGroup` phụ thuộc PowerShell — **không** “refactor sang API khác” trong task này.
- Giữ temp `fbo_copy.ps1`, `Get-Clipboard -Format FileDropList` như cũ.

### 3.3. SQL temp / Antigravity

- `NewSqlTemp` tiếp tục dùng `createSqlTempFile`, `resolveSqlTempFolder`, `isAntigravityIde` từ `../Utils/sqlTempFile`.
- Không đổi rule folder Antigravity vs tồn tại path.

### 3.4. Convert XML

- Chỉ di chuyển `convertXmlFromF` sang `ConvertXmlFromF.js`.
- Vẫn `require("../ConvertXml/FboEncryptedDecryptor").decryptFContent`.
- **Không** sửa thuật toán / fail-closed / settings keys `convertXml.*`.
- Test decrypt hiện có (`ConvertXml/tests`) phải vẫn chạy.

### 3.5. Expand All / `file_f`

- Trong `_expandTreeNodeRecursive`, code cũ skip `contextValue === "file"`.  
  Khi cắt: **giữ nguyên** điều kiện như file đang có (không “sửa bug” `file_f` trong task refactor trừ khi đã là bug blocker expand — nếu sửa, ghi rõ trong PR/note; mặc định **không đổi**).

## 4. Dọn dẹp cuối

- [x] Xóa `require` thừa ở `ContextMenu.js` (không còn `decryptFContent`, `exec`, `os`, … nếu chỉ action dùng).
- [x] Không còn `#region` nghiệp vụ trong `ContextMenu.js`.
- [x] `grep fboFile.` trong `registerCommands.js` khớp đủ command đã register trước refactor.
- [x] So khớp nhanh: số method public trên prototype ≥ danh sách handler trong `commandMap`.

## 5. Regression nhanh (sau khi cắt hết)

- [x] Load extension / reload window.
- [x] Tree `fbo_file`: context menu file + group hiện đủ mục.
- [x] Explorer: `Convert XML` trên `.f` (nếu menu explorer còn).
- [x] `npm` / script test ConvertXml nếu repo có (`ConvertXml/tests/run-all.js`).

