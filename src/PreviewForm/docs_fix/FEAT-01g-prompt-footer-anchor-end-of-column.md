# Prompt Gemini — FEAT-01g: Footer sọc Anchor = CUỐI cột (chỉ category -1)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`).

---

## Prompt

```
Fix Preview Form — CHỈ sửa vị trí kẻ sọc **Anchor trên Footer** (`category index="-1"` / `categoryIndex="-1"`).

### Không đụng

- Không sửa layout HTML/CSS footer (đã đúng).
- Không sửa FormRow / width / margin / input.
- Không sửa sọc Anchor trên **General** hay **Tab** (giữ FEAT-01d: sọc ở **ĐẦU** cột).
- Không sửa Split guide.
- Không đổi parser.

### Bug

XML:
```xml
<category index="-1" columns="100, 100, 100, 37, 200, 8, 58, 42, 8, 100, 0" anchor="7">
```

Cột 7 (1-based) = width **58** (cột label «Số lượng / Tiền linh kiện»).

**Hiện tại (sai với footer):** sọc `A:7` ở **ĐẦU** width 58 (= đầu chữ label) vì dùng:
```js
anchor_x = sum(rendered_widths.slice(0, anchor - 1))  // FEAT-01d — đúng General/Tab, SAI Footer
```
→ x ≈ 100+100+100+37+200+8 = **545** (trước cột 58).

**Đúng với footer (user):** sọc phải ở **CUỐI** width cột anchor (= cuối 58) → đường cam **đè lên chữ** «Tiền linh kiện» / «Số lượng linh kiện»:
```js
anchor_x = sum(rendered_widths.slice(0, anchor))  // gồm cả cột anchor
```
→ x ≈ 545+58 = **603** (+ LABEL pad nếu cột label có pad trong `rendered_widths`, giữ cùng hệ FormRow).

### Fix (phạm vi hẹp)

Trong `CategoryPanel` / chỗ vẽ `.guide-line.guide-anchor`:

1. Phân biệt zone footer vs không footer. Gợi ý prop từ `PreviewFormApp`:
```js
// Footer only:
<CategoryPanel … is_footer=${true} … />
// General / Tab: không truyền hoặc is_footer={false}
```

2. Công thức:
```js
if (is_footer) {
  // CUỐI cột anchor
  anchor_x = rendered_widths.slice(0, anchor).reduce((a, b) => a + b, 0);
} else {
  // ĐẦU cột anchor — giữ nguyên FEAT-01d
  anchor_x = rendered_widths.slice(0, anchor - 1).reduce((a, b) => a + b, 0);
}
```

3. Footer TNTran thường **không** split → chỉ sửa nhánh `else` (không có split) đang `slice(0, anchor - 1)`. Nếu footer có split sau này: cùng rule `is_footer` → cuối cột.

4. `rendered_widths` / hệ tọa độ `left:` giữ như hiện tại (đã khớp chữ label trên ảnh). Chỉ đổi điểm cắt đầu→cuối cột.

### Done

- [ ] Footer `anchor="7"`: sọc cam đè lên chữ label (cuối cột 58), không còn sát mép trái chữ
- [ ] General / Tab Anchor: vẫn ở **đầu** cột như trước (không đổi)
- [ ] Chỉ đổi code vẽ guide; rebuild bundle

### Files

- `media/src/main.js` — chỉ nhánh tính `anchor_x` khi footer (+ prop `is_footer` nếu cần)
- Rebuild: `npm run build:preview-form`
```

---

## Công thức nhớ

```
columns: … 200, 8, 58, 42, …
anchor=7 → cột width 58

General/Tab:  slice(0, 6) → đầu 58   ✅ giữ
Footer (-1):  slice(0, 7) → cuối 58  ✅ sửa (đè chữ label)
```
