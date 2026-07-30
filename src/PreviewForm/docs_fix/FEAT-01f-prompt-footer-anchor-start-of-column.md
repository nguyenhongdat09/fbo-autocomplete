# Prompt Gemini — FEAT-01f: Footer sọc Anchor phải ở ĐẦU cột (giống General)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`).

---

## Prompt

```
Fix Preview Form: sọc **Anchor trên Footer** đang kẻ sai vị trí.

### Đã OK (không đụng)

General / Tab (FEAT-01d): sọc Anchor ở **ĐẦU** cột `anchor` = cuối các cột trước.

Ví dụ `columns="100, 200"` + `anchor="2"`:
- ĐÚNG: x = **100** (cuối 100 = đầu 200)
- SAI: x = **300** (cuối 200)

General hiện đã đúng — **giữ nguyên**.

### Bug còn lại — chỉ Footer

Footer (`category index="-1"`) vẫn kẻ kiểu cũ: sọc nằm ở **CUỐI** width cột anchor.

XML TNTran:
```xml
<category index="-1" columns="100, 100, 100, 37, 200, 8, 58, 42, 8, 100, 0" anchor="5">
```

Cột 5 = width **200**.
- SAI hiện tại footer: sọc ở cuối 200 → x ≈ sum(100+100+100+37+**200**) = **537**
- ĐÚNG: sọc ở cuối 37 = **đầu 200** → x = sum(100+100+100+37) = **337**

Cùng quy tắc user đã nói với General: muốn kẻ ở cuối width trước, không phải cuối width cột anchor.

### Công thức bắt buộc (General và Footer phải GIỐNG NHAU)

```js
// anchor 1-based — mép TRÁI cột anchor = ĐẦU cột co giãn
anchor_x = rendered_widths.slice(0, anchor - 1).reduce((a, b) => a + b, 0);
// style left: anchor_x
```

**Cấm** trên footer (và mọi zone):
```js
// SAI — gồm cả cột anchor → kẻ ở CUỐI width đó
anchor_x = rendered_widths.slice(0, anchor).reduce(...)
```

### Nguyên nhân có thể (kiểm tra & sửa)

Trong `CategoryPanel` / chỗ vẽ guide footer:

1. Có nhánh riêng footer vẫn dùng `slice(0, anchor)` (FEAT-01b cũ) trong khi general đã đổi `slice(0, anchor - 1)`.
2. Hoặc truyền nhầm `split={view.split}` vào footer → rơi nhánh `anchor > split` dùng `right: sum(slice(anchor-1))` làm sọc lệch / trông như cuối cột. Footer chỉ được `split={footer_category.split}` (thường `null`).
3. Hoặc tính `left` từ tổng gồm cả cột `anchor` rồi trừ pad sai.

**Fix:** một công thức duy nhất `slice(0, anchor - 1)` + `left: anchor_x` khi footer **không** có split (case TNTran). Không tách công thức khác cho footer.

`rendered_widths` = `column_widths` footer (+ `LABEL_COL_PAD_PX` đúng cột label như FormRow) — cùng hệ tọa độ với grid footer.

### Không làm

- Không đổi vị trí sọc General/Tab (đã OK).
- Không fallback `footer.anchor ← view.anchor`.
- Không bật lại `view.split` cho layout footer rows.

### Files

- `media/src/main.js` — thống nhất công thức đầu cột cho footer guide
- Rebuild: `npm run build:preview-form`, Reload Window

### Done

- [ ] Footer TNTran `anchor="5"`: sọc cam tại **đầu** cột 200 (x≈337 + pad label nếu có), **không** tại cuối 200
- [ ] General `anchor="6"`: vẫn đúng đầu cột như hiện tại
- [ ] Ví dụ nhớ: 100|200 + anchor=2 → footer cũng tại 100, không tại 300
```

---

## Công thức nhớ

```
widths footer:  [100, 100, 100, 37, 200, …]
anchor=5     →  sọc tại sum(100+100+100+37) = 337  ✅ đầu 200
                không tại 337+200 = 537           ❌ cuối 200
```

```
slice(0, anchor - 1)  ✅ đầu cột (General đã OK — Footer phải giống)
slice(0, anchor)      ❌ cuối cột (bug Footer hiện tại)
```
