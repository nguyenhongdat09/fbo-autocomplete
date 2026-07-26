# Design: Checking Error (WebView) trên fbo_file

**Ngày:** 2026-07-26  
**Trạng thái:** Đã chốt với user — chỉ docs/plan, chưa implement trong phiên brainstorm

## Mục tiêu

Thêm **Checking Error** trên context menu tree `fbo_file` để kiểm tra lỗi Entity trên các file XML đang chọn (đi sâu theo graph SYSTEM / parameter entity). Chỉ khi **có lỗi** mới mở **WebView** để xử lý nghiệp vụ (copy file thiếu từ nguồn, đối chiếu entity thiếu khai báo).

## Hai loại lỗi

1. **Thiếu ref file:** `<!ENTITY ... SYSTEM "path">` (general hoặc parameter) resolve ra path nhưng `fs.existsSync` = false.
2. **Entity chưa khai báo:** xuất hiện `&name;` nhưng không có trong `generalEntities` (bỏ built-in: `amp`, `lt`, `gt`, `quot`, `apos`). **Không** coi entity khai báo với nội dung rỗng là lỗi.

## Quyết định đã chốt

| Chủ đề | Quyết định |
|--------|------------|
| Độ sâu check | Full graph qua `resolveFboXmlEntities` / `getEntitiesForFile` |
| UI | **WebView** (không dùng Problems; không dùng toast Link Update như bản cũ) |
| Khi nào mở WebView | Chỉ khi `summary.total > 0` |
| Menu | `fboFile.CheckingError` đặt **đầu** `view/item/context` (trên Rename/Copy…) |
| Nguồn | List mở rộng: UI sẵn **Nguồn 1 + Nguồn 2**, nút **+ Thêm nguồn** → 3, 4… |
| Lần đầu | Dialog nhập/chọn **Nguồn 1** → check → mở WebView, ô Nguồn 1 auto-fill |
| Validate nguồn | Path phải là project root hợp lệ kiểu TreeFile group (`AppDataPathHelper.getProjectPath()` có giá trị; không phải Other) |
| Lookup nguồn | Ưu tiên Nguồn 1 → 2 → 3…; có thì dừng |
| Generate / overwrite | Table 1 chỉ file **đang thiếu** → đích chưa tồn tại → **không hỏi ghi đè** |
| Generate enable | Disable nếu còn dòng Table 1 chưa tìm ra nguồn; enable khi mọi dòng đều có nguồn |
| Sau Generate | Copy + open file vừa copy + **tự re-run Checking Error** reload WebView |
| Entity path/line | **Tận dụng** `entityResolver.js` (giống Hover / Ctrl+click) — **không sửa** logic resolver |
| Module layout | **Toàn bộ** logic trong `src/ReadXMLByJS/CheckingError/`; `extension.js` chỉ `registerCheckingError(...)` nhẹ |
| ContextMenu / EntityHover / EntityDefinition | **Không đổi thuật toán**; tối đa wire menu/command nếu bắt buộc — ưu tiên đăng ký command trong folder CheckingError |

## Kiến trúc thư mục (bắt buộc)

```
src/ReadXMLByJS/CheckingError/
  index.js                    # registerCheckingError(context, treeDataProvider)
  entityResolverChecking.js   # chỉ check lỗi, trả data cho UI
  CheckingErrorCommand.js     # entry: lấy selection, hỏi Nguồn 1, quyết định mở panel
  CheckingErrorPanel.js       # WebviewPanel + postMessage
  SourcePathHelper.js         # validate nguồn + map relative (dùng AppDataPathHelper, không sửa nó)
  LinkGenerateService.js      # Generate: copy missing theo cột nguồn, open files
  media/
    checkingError.html
    checkingError.css
    checkingError.js          # UI webview
```

**Cấm:**
- Clone / sửa thuật toán trong `entityResolver.js`, `EntityHoverProvider.js`, `EntityDefinitionProvider.js`.
- Rải logic Checking Error sang nhiều folder khác.

**Cho phép đọc (require) từ CheckingError:**
- `../entityResolver` — `getEntitiesForFile`, `resolveFboXmlEntities`, `readFileContent` (read-only usage).
- `../../TreeFile/AppDataPathHelper` — `getProjectPath`, `getPathAfterProject`, `getGroupName`.

## Luồng nghiệp vụ

```
Chọn XML trên fbo_file
  → Checking Error (menu đầu)
  → Dialog Nguồn 1 (folder, validate project root)
  → entityResolverChecking.check(...)
  → Không lỗi? InformationMessage → dừng
  → Có lỗi? Mở WebView (sources = [nguồn1], tables từ kết quả)

Trong WebView:
  Nguồn 1 | Nguồn 2 | [+ Thêm nguồn] | [Checking Error]
  ┌─ Table 3: XML còn lỗi ─┐  ┌─ Table 1: ref thiếu + cột Nguồn ─┐
  └────────────────────────┘  └─ [Generate] (enable theo rule) ──┘
  ┌─ Table 2: entity lỗi | OK/X | [Check] ───────────────────────┐
  └──────────────────────────────────────────────────────────────┘

Generate → copy theo cột Nguồn → open files → auto re-check → refresh UI
Checking Error (trong WV) → re-scan với danh sách nguồn hiện tại → refresh UI
Check (Table 2) → mở file nguồn đúng dòng (data từ entityResolver)
```

## Bảng WebView

### Table 1 — Ref file thiếu
| Cột | Ý nghĩa |
|-----|---------|
| XML | Tên ngắn `Dir/A.xml`, `Grid/B.xml` (file đang check phát sinh thiếu) |
| File thiếu | Absolute hoặc relative trong project hiện tại |
| Nguồn | Text `Nguồn 1` / `Nguồn 2` / … hoặc `Không tìm thấy` |

### Table 3 — XML còn lỗi (cạnh Table 1)
Các file XML trong selection **còn** lỗi ent hoặc thiếu ref sau lần check hiện tại.

### Table 2 — Entity chưa khai báo
| Cột | Ý nghĩa |
|-----|---------|
| XML | `Dir/A.xml` |
| Entity | `&k;` |
| Trạng thái | **OK** + path/dòng bên nguồn nếu `getEntitiesForFile(file_nguồn)` có entity; ngược lại **X** |
| Check | Reveal declaration bên nguồn (cùng semantics `EntityDefinitionProvider`) |

## Wire `extension.js` (nhẹ)

Giống `registerXmlFlatPreview`:

```js
const { registerCheckingError } = require('./ReadXMLByJS/CheckingError');
// sau khi có treeDataProvider:
registerCheckingError(context, treeDataProvider);
```

`package.json`: command `fboFile.CheckingError` + menu `view/item/context` **group đầu / vị trí đầu** với `when: view == fbo_file && viewItem == file`.

## Ngoài phạm vi

- Auto-insert `<!ENTITY>` vào project hiện tại.
- Sửa logic parse/cache của `entityResolver.js`.
- Problems / Diagnostics panel.
- Hỏi ghi đè khi Generate (không áp dụng vì Table 1 = file chưa tồn tại).
