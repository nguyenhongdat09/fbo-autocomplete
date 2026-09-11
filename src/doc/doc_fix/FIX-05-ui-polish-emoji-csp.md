# FIX-05 — UI polish: emoji + CSP `unsafe-eval`

## Mức: Medium (làm sau 3 blocker)

## Vấn đề A — Emoji trên toolbar / tab

`App.jsx` dùng emoji (🔄 ⏳ ⚠️ 📑 📖 📝 🌐) — trái spec [`../formula-preview/05-ui-playground.md`](../formula-preview/05-ui-playground.md) § Không làm: *Không emoji trang trí*.

### Sửa

- Toolbar / tab: text thuần hoặc icon VS Code Codicon qua class/`span` nếu đã có pattern trong Flat Preview — **không** emoji.
- Loading state: “Đang phân tích…” không cần ⏳.
- Warnings: chữ “Cảnh báo” đủ.

## Vấn đề B — CSP `unsafe-eval`

`FormulaPreviewPanel.getHtmlContent`:

```js
script-src ${cspSource} 'unsafe-eval'
```

Preview Form / Flat Preview cố tránh eval. React Flow thường **không** cần `unsafe-eval` nếu bundle webpack thuần.

### Sửa

1. Bỏ `'unsafe-eval'` khỏi CSP.
2. `npm run build:formula-preview` → F5 mở panel DHN.
3. Nếu DevTools webview báo CSP block → chỉ thêm lại khi có stack chứng minh (ghi chú trong comment Panel). Mặc định: **không** có unsafe-eval.

## Playground đông field (optional cùng PR)

Hero đang liệt kê gần **mọi** field grid (NT/HT) → DHN rất dài.

Optional (không blocker): chỉ hiện:

- seed / trigger fields,
- targets của scenario active,
- vài master `t_tt*`, `t_ck*`, `t_thue*`, `ty_gia`,

+ toggle “Hiện tất cả cột”.

Nếu không làm trong FIX-05: ghi TODO, không chặn merge blocker.

## Done

- [ ] Không còn emoji trên toolbar/tabs chính
- [ ] CSP không có `unsafe-eval` (hoặc có comment + lý do nếu buộc giữ)
- [ ] Rebuild bundle; panel vẫn mở và tính số được

## Không làm

- Không đổi React Flow / Dagre stack
- Không redesign toàn bộ CSS
