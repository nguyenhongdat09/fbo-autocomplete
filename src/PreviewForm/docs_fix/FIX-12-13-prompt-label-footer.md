# Prompt Gemini — FIX-12 + FIX-13 (label giống web + footer cách xa)

Copy **cả khối Prompt** dưới cho Gemini (`@src/PreviewForm`).

---

## Prompt

```
Fix Preview Form — 2 lỗi UI. Tuân thủ design fidelity: giống form FBO web, không “làm đẹp” sai quy tắc.

═══════════════════════════════════════
### A) Label «Ghi chú công việc» — phải y chang form web
═══════════════════════════════════════

Ý user (quan trọng):
- Form web: label 1 dòng, hiện đủ «Ghi chú công việc» → nghĩa là **width cột XML đủ**.
- Nếu width XML **không đủ**, web sẽ **che** chữ (clip), **không wrap** xuống 2 dòng.
- Preview hiện tại wrap «Ghi chú» / «công việc» 2 dòng → SAI (không giống web).
- Không được chọn giải pháp “overflow visible tràn sang cột khác” hay “wrap cho đọc đủ” nếu web không làm vậy.

Yêu cầu:
1. Label: `white-space: nowrap` (1 dòng). Khi vượt width cột → `overflow: hidden` **clip** (che), giống web. Có thể dùng hoặc không dùng ellipsis — ưu tiên hành vi clip giống FBO; quan trọng là **không wrap**.
2. `grid-template-columns` phải dùng đúng **px** từ `row.column_widths` / master / category XML — không để cột label bị co nhỏ hơn số khai báo (min-width: 0 / flex shrink / width 100% toolkit làm hẹp ô label là nghi phạm).
3. Kiểm tra dòng `110000000000: [ghi_chu_cv].Label, [ghi_chu_cv]`: cột label = đúng width phần tử columns tương ứng; nếu XML đủ rộng thì Preview phải hiện đủ 1 dòng như web.
4. Không tăng width trong parser để “cho vừa chữ”.

Files: `media/src/previewForm.css`, `media/src/main.js` (class cell label nếu cần). Rebuild bundle.

Done A:
- [ ] «Ghi chú công việc» 1 dòng, đủ chữ (vì web đủ → Preview đủ).
- [ ] Không wrap 2 dòng.
- [ ] Thu hẹp giả lập cột (hoặc test pattern hẹp) → chữ bị che, không xuống dòng.

═══════════════════════════════════════
### B) Footer — label và input cách xa nhau quá (hình 2)
═══════════════════════════════════════

Hiện trạng:
- Label «Số lượng linh kiện» / «Tiền linh kiện» và input `t_so_luong` / `t_tien_nt2` lệch xa theo chiều ngang (label giữa/trái, input mép phải).

Nguyên nhân còn trong code (`main.js`):
```js
// Footer vẫn đang:
<CategoryPanel rows={...['-1']} split={view.split} />
```
TNTran `view.split="7"` → footer bị chia 2 panel + `justify-content: space-between` → khoảng trống khổng lồ giữa label và input.

Pattern footer: `------10-11: [t_so_luong].Label, [t_so_luong], ...`
Columns category `-1` (không dùng split của view).

Fix bắt buộc:
1. Footer (`rows_by_category["-1"]`): truyền `split={null}` / `undefined` — **cấm** `split={view.split}`.
2. Một CSS grid duy nhất theo `row.column_widths` của footer category.
3. Khoảng cách label↔input chỉ do các cột `-` / `0` trong pattern + px columns footer — không space-between full webview.
4. Optional: cả khối footer `margin-left: auto` dạt phải form (như FBO), nhưng **bên trong** row label vẫn sát input theo grid.

Files: `media/src/main.js` (dòng footer CategoryPanel), `previewForm.css` nếu cần. Rebuild bundle.

Done B:
- [ ] Footer: label và input gần nhau hợp lý (theo columns XML), không cách 2 mép màn hình.
- [ ] General/header vẫn giữ split L/R bình thường.

═══════════════════════════════════════
### Không làm
═══════════════════════════════════════
- Không đổi zone rule categoryIndex mix (đã đúng).
- Không wrap label để “cho dễ đọc”.
- Không tự sửa width XML trong parser.
```

---

## Tóm tắt cho user

| Vấn đề | Đúng như web |
|--------|----------------|
| Label | 1 dòng; width đủ → hiện đủ; width thiếu → **che**, không wrap |
| Footer | Không áp `view.split`; grid theo columns `-1` → label sát input |
