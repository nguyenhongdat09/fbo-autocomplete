# FIX-15 — Label vẫn bị che («Ghi chú công việ») dù XML/web đủ rộng

## Root cause (đã xác định trong code)

1. **Cột px bị co:** panel split là flex child (`flex-shrink: 1` mặc định) + `.form-cell { min-width: 0 }` → grid track `100px` thực tế **hẹp hơn 100px** → clip sớm hơn form web.
2. **`anchor` → `1fr` thuần:** cột neo co giãn làm panel trái bị ép, kéo theo cột label.
3. **Cell label `overflow: hidden` inline** trong `main.js` cắt chữ dù CSS đã chỉnh.
4. Font VS Code webview **rộng hơn** font FBO → cùng 100px XML, Preview chật hơn web.

## Fix đã áp dụng / Gemini verify

| Thay đổi | File |
|----------|------|
| `minmax(Wpx, Wpx)` cho cột cố định; `minmax(Wpx, 1fr)` cho anchor | `media/src/main.js` |
| `flex: 0 0 auto` + `min-width: sum(px)` panel trái | `main.js` |
| Clamp `col_span` không vượt số cột panel (span xuyên split) | `main.js` |
| Label cell: `overflow: visible` / không `min-width: 0` | `main.js` + `previewForm.css` |
| `.field-label { font-size: 12px; text-overflow: clip; nowrap }` | `previewForm.css` |
| Rebuild `bundle.js` | `npm run build:preview-form` |

## Prompt ngắn nếu còn regress

```
Label «Ghi chú công việc» / «Phân loại giao dịch» bị che sớm hơn form web dù cùng columns XML 100px.

Bắt buộc:
1. grid-template-columns dùng minmax(Wpx,Wpx) — không để flex co cột.
2. panel-left flex-shrink:0; min-width = tổng px cột trái.
3. Không min-width:0 trên .form-cell--label; không overflow:hidden inline trên cell label.
4. Label nowrap + clip (không wrap 2 dòng); font ~11px gần FBO.
5. Cột có role label: cộng **LABEL_COL_PAD_PX = 14** (~80% mức 18) — cân giữa đủ chữ và không quá rộng.
6. Rebuild bundle, Reload Window, so TNTran với form web.
```

## Done

- [ ] «Ghi chú công việc» hiện đủ như web (không mất chữ `c`).
- [ ] «Phân loại giao dịch» tương tự.
- [ ] Hẹp giả (giảm columns XML) → vẫn clip 1 dòng, không wrap.
