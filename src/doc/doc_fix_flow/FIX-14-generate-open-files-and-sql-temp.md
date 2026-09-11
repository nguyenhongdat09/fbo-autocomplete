# FIX-14 — Generate: mở 4 XML + tạo/mở `.sql` giống NewSqlTemp

## Mức: Medium (post-Generate UX)

## Hiện trạng code (`RetrieveFlowPanel.handleGenerate`)

| Việc | Code hiện tại | User thấy |
|------|----------------|-----------|
| Ghi 4 XML Controllers | Có `writeFileSync` | Thành công |
| **Mở 4 XML** sau ghi | **Không** — không gọi `openTextDocument` / `showTextDocument` cho XML | Phải tự tìm file trong Explorer |
| Tạo `.sql` temp | Chỉ khi `sqlTempFolder` **có** và `fs.existsSync(folder)` | Thường **không thấy** `.sql` |
| Mở `.sql` | Có — nhưng chỉ chạy **sau** khi tạo SQL thành công | Không chạy nếu skip SQL |
| Thiếu `sqlTempFolder` | `showWarningMessage` rồi vẫn toast “tạo thành công” | Dễ bỏ qua; tưởng Generate xong đủ bộ |

So với **Create .sql Temp** (`ContextMenu.newSqlTemp`):

```js
// Bắt buộc folder — Error rồi dừng, không skip thầm
if (!folderPath) showErrorMessage(...); return;
if (!fs.existsSync(folderPath)) showErrorMessage(...); return;
createSqlTempFile(...);
openTextDocument + showTextDocument;  // luôn mở
```

Retrieve Flow **đúng hướng** (reuse `createSqlTempFile`) nhưng:

1. Không mở XML.
2. SQL bị **skip mềm** khi chưa config folder → lệch UX NewSqlTemp.
3. Doc `05-ui-webview` từng cho phép “vẫn ghi 4 XML; skip SQL” — **đổi lại** cho khớp NewSqlTemp + kỳ vọng user.

---

## Quyết định (đã chốt)

### 1. Sau Generate thành công → **mở mọi file vừa ghi**

Thứ tự mở (tabs editor):

1. 4 XML vừa `paths_written` (Filter → MultiForm → MultiGrid → Lookup), mỗi file:

```js
const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full_path));
await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
```

2. Cuối cùng mở `.sql` (focus tab SQL) — giống NewSqlTemp.

- Chỉ mở file **vừa ghi trong lần Generate này** (không mở file `skipped`).
- `viewColumn`: ưu tiên cạnh webview — `ViewColumn.One` hoặc cột active editor; **không** bắt buộc Beside webview nếu gây rối.
- Nếu mở 5 tab nặng: vẫn mở đủ theo yêu cầu user (có thể `preserveFocus: true` cho 3 XML đầu, `false` cho file cuối).

### 2. `.sql` temp — **bắt buộc** giống NewSqlTemp

| Bước | Hành vi |
|------|---------|
| Đọc config | `fbo-autocomplete.sqlTempFolder` (và `this.sql_temp_folder` từ command nếu có) |
| Folder trống / không tồn tại | **`showErrorMessage`** giống NewSqlTemp; **vẫn giữ 4 XML đã ghi** (không rollback); `errors[]` ghi rõ thiếu SQL; toast **không** nói “thành công đủ bộ” |
| Folder OK | `createSqlTempFile(folder, `${identity}_retrieve`, sql_content)` → tên kiểu `ycndxa_retrieve.sql` / `(2)` nếu trùng (helper lower-case — giữ nguyên hành vi helper) |
| Sau tạo | **Luôn** `openTextDocument` + `showTextDocument` file SQL |

**Không** còn nhánh “skip SQL im lặng + Warning nhẹ rồi Information success”.

### 3. Sửa doc cũ

`05-ui-webview.md` / `06-extension-integration.md`:

- Đổi: `sqlTempFolder` thiếu → **Error + liệt kê thiếu SQL**, không “skip OK”.
- Thêm: Generate xong **mở 4 XML + 1 SQL**.

---

## Pseudo-code sau Generate (thay §6–7 hiện tại)

```js
// Sau vòng ghi XML → paths_written[]

const sql_folder = this.sql_temp_folder || config.get('sqlTempFolder');
if (!sql_folder || !fs.existsSync(sql_folder)) {
  const msg = `Chưa cấu hình đường dẫn thư mục tạo file .sql. Vui lòng cấu hình 'fbo-autocomplete.sqlTempFolder' trong Settings.`;
  vscode.window.showErrorMessage(msg); // giống NewSqlTemp
  errors.push(msg);
} else {
  const { filePath } = createSqlTempFile(sql_folder, `${identity}_retrieve`, sql_content);
  paths_written.push(filePath);
}

// Mở tất cả file vừa ghi (XML rồi SQL)
for (const p of paths_written) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
  await vscode.window.showTextDocument(doc, { preview: false });
}

postMessage({ type: 'generated', paths: paths_written, errors, skipped });
if (errors.length === 0) {
  showInformationMessage(`Đã tạo ${paths_written.length} file FlowMulti cho ${identity}.`);
} else {
  showWarningMessage(`XML đã ghi; SQL chưa tạo: ${errors.join('; ')}`);
}
```

---

## Kiểm tra nhanh cho user (trước/sau fix)

1. Settings → `fbo-autocomplete.sqlTempFolder` trỏ thư mục **có thật** trên máy (cùng chỗ NewSqlTemp đang dùng).
2. Generate lại → phải thấy tab XML + tab `.sql`.
3. Nếu chưa config folder: Error đỏ rõ; 4 XML vẫn trên disk và **vẫn được mở**.

---

## Việc phải làm

1. `RetrieveFlowPanel.handleGenerate`: mở mọi `paths_written`; siết SQL như NewSqlTemp (Error khi thiếu folder).
2. Cập nhật `05` / `06` / acceptance: mở file + SQL bắt buộc khi folder OK.
3. (Optional) Test smoke manual — không bắt buộc unit test VS Code API.

## Done

- [ ] Generate OK → editor mở đủ Filter / MultiForm / MultiGrid / Lookup vừa tạo.
- [ ] Có `sqlTempFolder` hợp lệ → có file `{identity}_retrieve….sql` + tab mở (cùng helper NewSqlTemp).
- [ ] Thiếu / sai folder → `showErrorMessage` giống Create .sql Temp; không pretend full success.
- [ ] File `skipped` (Bỏ qua có sẵn) không bị mở lại.

## Không làm

- Không deploy SQL / không MCP.
- Không đổi thuật toán tên file trong `createSqlTempFile`.
- Không rollback 4 XML nếu SQL fail config.
