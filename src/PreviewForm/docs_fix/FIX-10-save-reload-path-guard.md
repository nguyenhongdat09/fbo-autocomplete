# FIX-10 — Ctrl+S chỉ reload khi Preview đang mở + chỉ file `Dir/*.xml` / `Filter/*.xml`

## Câu trả lời nhanh

**Làm được, và không làm Ctrl+S “bung” Preview khi chưa mở.**

Cách đúng: **không** đăng ký keybinding `Ctrl+S` → `previewForm`.  
Chỉ lắng nghe `vscode.workspace.onDidSaveTextDocument` **bên trong panel đang sống**. Save vẫn là save mặc định của VS Code; nếu panel Preview **đã mở** và file save khớp file đang preview → `refresh()`. Panel không tồn tại → listener không chạy / không tạo panel.

---

## FIX-10a — Reload preview chỉ khi Ctrl+S (save) + panel đang mở

### Mong muốn user

- Đang **có** chế độ Preview (panel Form Preview đã mở) → bấm **Ctrl+S** → load lại preview.
- **Không** có Preview → Ctrl+S chỉ save file như bình thường, **không** tự mở Preview.

### Cấm

```json
// package.json — CẤM làm kiểu này
{
  "key": "ctrl+s",
  "command": "fbo-autocomplete.previewForm",
  "when": "..."
}
```

Vì sẽ cướp / chồng với save, hoặc kích hoạt command mở preview ngoài ý muốn.

### Đúng

Trong `PreviewFormPanel` (chỉ khi instance đang sống):

```js
// Đăng ký trong constructor panel; dispose khi đóng panel
vscode.workspace.onDidSaveTextDocument(doc => {
  if (!PreviewFormPanel.currentPanel) return; // hoặc this đã dispose
  if (doc.uri.toString() !== this._uri.toString()) return;
  // optional: chỉ refresh nếu path vẫn allowed
  this.refresh(this._uri);
}, null, this._disposables);
```

| Tình huống | Kết quả |
|------------|---------|
| Panel đóng, Ctrl+S | Save bình thường, **không** mở Preview |
| Panel mở, Ctrl+S file đang preview | Save + **refresh** preview |
| Panel mở, Ctrl+S file khác | Save file kia; **không** refresh (trừ khi sau này hỗ trợ multi — MVP: không) |

### Đổi so với FIX-06 / docs cũ (live debounce)

User **chốt lại**: không cần (hoặc không ưu tiên) reload mỗi lần gõ / `onDidChangeTextDocument` 400ms.

- **Bỏ** hoặc **tắt mặc định** debounce `onDidChangeTextDocument` → refresh.
- Nguồn cập nhật chính: **save (Ctrl+S)** khi panel đang mở.
- Nút Refresh trong webview (nếu có) vẫn gọi `refresh` thủ công — optional.

Ghi chú trong UI (optional): toolbar text “Đã lưu → cập nhật preview” để Developer biết cần Ctrl+S.

### Done

- Panel đóng + Ctrl+S trên bất kỳ XML → không tạo `PreviewFormPanel`.
- Panel mở + Ctrl+S file Dir đang gắn → preview cập nhật.
- Không có keybinding `ctrl+s` trỏ vào command Preview Form.

---

## FIX-10b — Chỉ cho phép file **trực tiếp** trong `Dir/` hoặc `Filter/`

### Quy tắc path (bắt buộc)

Cho phép **chỉ** khi file là con **một cấp** của thư mục tên `Dir` hoặc `Filter` (không phân biệt hoa thường), đuôi `.xml`.

| Path | Cho phép? |
|------|-----------|
| `.../Controllers/Dir/TNTran.xml` | **Có** |
| `.../Controllers/Dir/a.xml` | **Có** |
| `.../Controllers/Filter/SomeFilter.xml` | **Có** |
| `.../Controllers/Dir/A/a.xml` | **Không** (thư mục con) |
| `.../Controllers/Dir/Sub/x.xml` | **Không** |
| `.../Controllers/Grid/a.xml` | **Không** |
| `.../Controllers/Report/a.xml` | **Không** |
| `.../Dir/nested/b.xml` | **Không** |

### Helper (dùng chung Command + Panel)

```js
/**
 * @param {string} file_path
 * @returns {boolean}
 */
function is_preview_form_allowed_path(file_path) {
  const n = String(file_path || '').replace(/\\/g, '/');
  // .../Dir/file.xml hoặc .../Filter/file.xml — không có segment thêm giữa folder và file
  return /\/(Dir|Filter)\/[^/]+\.xml$/i.test(n);
}
```

> Dùng `Dir|Filter` trong regex với flag `i` để khớp `dir`, `DIR`, `Filter`, …

### Áp dụng

1. **`PreviewFormCommand.run`**: nếu `!is_preview_form_allowed_path` → `showErrorMessage` rõ (“chỉ hỗ trợ file XML nằm trực tiếp trong thư mục Dir hoặc Filter”) → **return**, không `createOrShow`.
2. **Menu / when clause** (nếu có): thu hẹp khi mở command từ title — best-effort; path check trong command vẫn là nguồn sự thật.
3. Bỏ warning “có thể render sai” rồi vẫn mở (code hiện tại `includes('/controllers/dir/')` quá rộng và không chặn) → **chặn cứng**.
4. MVP Filter: cùng pipeline Dir nếu có `<view id="Dir">` hoặc view Filter tương đương; nếu Filter chưa parse được → message “chưa hỗ trợ layout Filter” **sau** khi path đã hợp lệ (tuỳ parser). Path rule vẫn cho phép mở command trên Filter file.

### Sửa code hiện tại

[`PreviewFormCommand.js`](../PreviewFormCommand.js) đang:

```js
if (!filePath.toLowerCase().includes('/controllers/dir/')) {
  showWarningMessage(...); // vẫn mở — SAI theo yêu cầu mới
}
PreviewFormPanel.createOrShow(...);
```

→ thay bằng `is_preview_form_allowed_path` + **chặn** + hỗ trợ cả `Filter`.

### Done

- `Dir/TNTran.xml` → mở Preview được.
- `Dir/A/a.xml`, `Grid/a.xml` → không mở, có message.
- `Filter/foo.xml` → qua được cổng path (parser xử lý tiếp).

---

## File đụng

| File | Việc |
|------|------|
| `PreviewFormCommand.js` | Path guard cứng Dir/Filter một cấp |
| `PreviewFormPanel.js` | Save → refresh; bỏ/tắt change-debounce; không keybinding Ctrl+S |
| Helper mới (optional) `previewFormPath.js` | `is_preview_form_allowed_path` |
| `package.json` | **Không** thêm keybinding ctrl+s; when clause menu optional |

## Checklist nghiệm thu

- [ ] Không mở Preview: Ctrl+S không tạo panel Preview.
- [ ] Đang Preview `Dir/TNTran.xml`: Ctrl+S → preview reload.
- [ ] `Dir/Sub/x.xml` / `Grid/x.xml`: command báo lỗi, không mở.
- [ ] `Filter/y.xml`: path OK (không bị chặn vì không phải Dir).
- [ ] Không có entry keybindings `ctrl+s` → `previewForm`.
