# Prompt Gemini — FEAT-01d: Tab không kế thừa guide + sọc Anchor ở ĐẦU cột

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`).

---

## Prompt

```
Fix Preview Form guide Anchor/Split — 2 việc trong cùng PR.

═══════════════════════════════════════
### A) Tab không khai anchor/split → không kẻ sọc
═══════════════════════════════════════

- `<view anchor/split>` → chỉ áp **Thông tin chung (general)**.
- Từng `<category>`: chỉ vẽ sọc nếu XML **có** attribute tương ứng trên category đó.
- **Cấm** fallback `tab.anchor ?? view.anchor` / `tab.split ?? view.split`.

Ví dụ:
```xml
<category index="15" columns="…" split="11">  <!-- không có anchor -->
```
→ Bật Split: kẻ theo `split="11"`. Bật Anchor: **không** kẻ (đừng lấy view.anchor=6).

General: vẫn `view.anchor` / `view.split`.

Parser: category.anchor/split chỉ khi có trên XML.

═══════════════════════════════════════
### B) Sọc Anchor kẻ ở ĐẦU cột anchor (không phải cuối cột)
═══════════════════════════════════════

**Sai hiện tại (sau FEAT-01b):** dùng mép phải cột anchor:
```js
// SAI — tổng gồm cả cột anchor → kẻ ở CUỐI width đó
anchor_x = sum(rendered_widths.slice(0, anchor))  // vd anchor=2, widths 100,200 → x=300
```

**Đúng (user):** sọc tại **mép trái** cột `anchor` = **cuối các cột trước** = **đầu** width cột anchor.

Ví dụ `columns="100, 200"` và `anchor="2"` (cột thứ 2 = 200):
- SAI: x = 100+200 = **300** (cuối 200)
- ĐÚNG: x = **100** (cuối 100 = đầu 200)

Công thức:
```js
// anchor 1-based; mép TRÁI cột anchor
anchor_x = rendered_widths.slice(0, anchor - 1).reduce((a, b) => a + b, 0);
// style left: anchor_x
// anchor=1 → x=0 (đầu form / đầu cột 1)
```

TNTran `anchor="6"`, columns `100,110,100,90,30,147,…`:
→ x = sum(100+110+100+90+30) = **430** = đầu cột width **147** (không phải 430+147).

Giữ pad label (`LABEL_COL_PAD_PX`) trong `rendered_widths` giống FormRow.

Hệ tọa độ: cùng panel với cột đó (general / panel-left nếu anchor ≤ split). Không dùng `%` full webview.

**Ghi đè FEAT-01b:** không còn kẻ mép phải cột anchor; chuẩn là **đầu cột anchor**.

Split (FEAT-01c): vẫn mép trái panel phải / đầu Ngày LCT — không đổi trong task này trừ khi đụng chung code.

═══════════════════════════════════════
### Files / Done
═══════════════════════════════════════

- `media/src/main.js` — bỏ fallback view trên tab; `slice(0, anchor - 1)` cho anchor_x
- Rebuild bundle, Reload Window

Done:
- [ ] Tab 2.5 (chỉ split): có sọc Split, không sọc Anchor
- [ ] Tab không khai gì: không sọc
- [ ] General + nút Anchor: sọc cam ở **đầu** cột anchor (vd 100|200 → tại 100, không tại 300)
```

---

## Công thức nhớ

```
widths:     [100, 200]
anchor=2 →  sọc tại x=100  (đầu cột 200)
            không tại x=300 (cuối cột 200)
```

```
slice(0, anchor - 1)  ✅ đầu cột
slice(0, anchor)      ❌ cuối cột (bỏ)
```
