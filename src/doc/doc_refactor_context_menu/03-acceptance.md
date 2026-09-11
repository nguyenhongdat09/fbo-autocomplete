# 03 — Acceptance (tiêu chí chấp nhận refactor)

## Pass khi

### A. Cấu trúc

- [x] Tồn tại `src/TreeFile/ContextMenuActions/` với đủ file map ở [01-architecture.md](./01-architecture.md) §2.
- [x] [`src/TreeFile/ContextMenu.js`](../../TreeFile/ContextMenu.js) mỏng: ctor + `registerCommands` + selection listener + `Object.assign` prototype + export — **mục tiêu &lt; ~120 dòng**.
- [x] Không còn body dài của GenerateCopy / Paste / ConvertXml / NewSqlTemp / … trong `ContextMenu.js`.
- [x] `src/TreeFile/ConvertXml/` (decrypt + tests) **không** bị di chuyển vào `ContextMenuActions/`.

### B. Wire / API public

- [x] `extension.js` vẫn `require("./TreeFile/ContextMenu")` — path không đổi.
- [x] `module.exports` vẫn là class/handler tương thích `new ContextMenuHandler(context, treeDataProvider)`.
- [x] Mọi command trong `commandMap` cũ vẫn được `registerCommand` với **cùng** `name` (`fboFile.*`).

### C. Hành vi (không regress)

| Lệnh / flow | Kỳ vọng |
|-------------|---------|
| Copy Path / Copy Name / Copy File | Clipboard đúng như trước |
| Rename / Delete | Đổi tên / xóa + UX confirm như trước |
| Paste to group | Paste từ OS clipboard vào group |
| Generate Copy File | Input + `rl(...)` như trước |
| Open / Fix Web.config | Mở file / touch restore |
| Config Project Root | Ghi mapping + reload tree |
| Expand All | Expand group |
| Delete Struct | Xóa file trong Structure subfolders như trước |
| New SQL Temp / On Workspace | Tạo file + mở editor |
| Convert XML | Decrypt / no-Encrypted / chặn ghi đè / message — **giống** bản trước refactor |

### D. Doc / menu

- [x] **Không** bắt buộc sửa `package.json` menus / `when` / `contextValue`.
- [x] Nếu có sửa `package.json` chỉ vì nhầm path — phải hoàn nguyên; refactor này không cần contribute mới.

### E. Tests

- [x] `src/TreeFile/ConvertXml/tests` vẫn pass (decrypt không bị đụng).
- [x] Không yêu cầu unit test mới cho mỗi action one-liner; smoke tay theo [02-migration-checklist.md](./02-migration-checklist.md) §5 là đủ.


## Fail khi

- `ContextMenu.js` vẫn giữ nguyên gần hết logic region (chỉ “đổi tên folder” giả).
- Đổi tên command / bỏ command / đổi signature handler làm menu chết.
- Convert XML lại thành copy `.f` không decrypt, hoặc nuốt lỗi decrypt.
- `Object.assign` trong **mọi** lần `constructor` (gán prototype lặp) thay vì một lần top-level.
- Action export arrow function làm mất `this` → runtime `undefined`.
- Circular require `ContextMenuActions` ↔ `ContextMenu.js`.

## Sau khi Done

Cập nhật ngắn (optional) comment đầu `ContextMenu.js`:

```js
/**
 * Thin entry: đăng ký command + gắn handlers từ ./ContextMenuActions.
 * Logic từng lệnh nằm trong ContextMenuActions/*.js
 */
```

Không bắt buộc viết thêm doc feature mới — bộ này (`doc_refactor_context_menu`) là đủ cho agent.
