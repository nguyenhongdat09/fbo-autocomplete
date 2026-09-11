# Refactor ContextMenu — tách logic ra `ContextMenuActions/`

## Mục tiêu

[`src/TreeFile/ContextMenu.js`](../../TreeFile/ContextMenu.js) (~664 dòng) đang trộn:

- Đăng ký command `fboFile.*`
- Selection helpers
- Nhiều feature (copy / rename / paste / Web.config / SQL temp / Convert XML / …)

**Yêu cầu:** tách **theo `#region` hiện có** sang folder `src/TreeFile/ContextMenuActions/`.  
`ContextMenu.js` chỉ còn entry mỏng: gán dependency, gắn prototype, đăng ký command, listener selection, `module.exports`.

**Không đổi** tên command, menu `package.json`, hay hành vi runtime.

## Thứ tự đọc / làm (bắt buộc)

| # | File | Nội dung |
|---|------|----------|
| 0 | [README.md](./README.md) | File này |
| 1 | [01-architecture.md](./01-architecture.md) | Folder map, pattern `this` + `Object.assign`, quan hệ `ConvertXml/` |
| 2 | [02-migration-checklist.md](./02-migration-checklist.md) | Cắt từng region, smoke từng command |
| 3 | [03-acceptance.md](./03-acceptance.md) | Done checklist / tiêu chí chấp nhận |

## Việc Gemini phải làm

1. Tạo `src/TreeFile/ContextMenuActions/` đúng bảng map trong **01**.
2. Di chuyển body method nguyên logic (không “cải thiện” hành vi).
3. Thu gọn `ContextMenu.js` theo pattern attach trong **01**.
4. Chạy checklist **02** + Done **03**.
5. Giữ `require("./TreeFile/ContextMenu")` trong `extension.js` — **không** đổi path public.

## Done (tóm tắt)

- [x] `ContextMenu.js` mỏng (mục tiêu &lt; ~120 dòng) — chỉ wire + ctor.
- [x] Mọi `fboFile.*` trong `commandMap` cũ vẫn register, cùng handler semantics.
- [x] `ConvertXml/` (decrypt + tests) **không** bị dời / đổi logic.
- [x] Smoke copy / rename / paste / sql temp / convert xml / expand / webconfig OK.
- [x] Không sửa menu `when` / `contextValue` trừ khi bắt buộc vì path require.

## Không làm

- Đổi hành vi feature (kể cả FIX decrypt Convert XML — đã có [`../doc_fix_convert_xml/`](../doc_fix_convert_xml/README.md)).
- Đổi `contextValue` (`file` / `file_f`) hay điều kiện menu.
- Gộp lại thành một mega-file trong `ContextMenuActions/`.
- Refactor `TreeFileProvider.js` / `TreeFileProviderOneLevel.js`.
- Tạo `ContextMenu/index.js` (tránh đụng tên với `ContextMenu.js`).
