# Prompt Gemini — FEAT-01e: Footer Anchor + popup sticky sát sọc

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`, `previewForm.css`).

---

## Prompt

```
Fix Preview Form — 2 việc trong cùng PR.

═══════════════════════════════════════
### A) Kẻ sọc Anchor trên Footer (category -1)
═══════════════════════════════════════

Sọc **Anchor** (và Split nếu có) phải vẽ được trên **Footer** khi category `index="-1"` khai báo `anchor` / `split`.

### XML (TNTran) — đang có anchor nhưng Preview không kẻ

```xml
<category index="-1" columns="100, 100, 100, 37, 200, 8, 58, 42, 8, 100, 0" anchor="5">
  <header v="" e=""/>
</category>
```

→ Bật nút Anchor → phải có sọc cam trên khối footer (Số lượng linh kiện / Tiền linh kiện), vị trí = **đầu cột 5** (1-based) theo `columns` footer (FEAT-01d: `slice(0, anchor-1)`).

### Bug hiện tại

Trong `PreviewFormApp` render footer đang **tắt cứng** guide:

```js
<CategoryPanel
  rows={view.rows_by_category['-1']}
  …
  show_anchor={false}   // ← SAI
  show_split={false}    // ← SAI nếu footer có split
/>
```

Hoặc không truyền `anchor={view.footer_category.anchor}`.

### Fix footer guide

1. Footer CategoryPanel:
```js
show_anchor={show_anchor}
show_split={show_split}
anchor={view.footer_category?.anchor ?? null}   // chỉ từ category -1, KHÔNG lấy view.anchor
split={view.footer_category?.split ?? null}     // thường null; có thì mới vẽ
```

2. Vẫn tuân FEAT-01d: footer **không** kế thừa `view.anchor` / `view.split`. Chỉ dùng attribute trên `<category index="-1">`.

3. Footer **không** dùng `view.split` cho layout row (đã fix trước); guide Split chỉ khi footer category tự khai `split`.

4. Vị trí sọc Anchor trên footer: dùng `column_widths` của rows footer / `footer_category.columns` (+ LABEL pad nếu FormRow pad), công thức đầu cột:
```js
anchor_x = sum(rendered_widths.slice(0, anchor - 1))
```
TNTran `anchor="5"`, columns `100,100,100,37,200,…` → x = 100+100+100+37 = **337** = đầu cột width **200**.

═══════════════════════════════════════
### B) Popup giải thích phải sticky sát thanh guide (không neo góc panel)
═══════════════════════════════════════

**Bug UX hiện tại:** `.guide-tooltip` đang `position: absolute; top: 10px; right: 10px;` → popup nằm **góc phải trên** của `.category-panel`, **xa** sọc cam `A:N` / sọc cyan `S:N`. User phải nhìn từ đường kẻ sang tận góc phải mới đọc được.

**Đúng:** popup **dính (sticky) ngay cạnh** thanh guide đang hover — sát badge `A:N` / `S:N` hoặc ngay bên phải/trái đường kẻ.

Yêu cầu:
1. Tooltip là **con của `.guide-line`** đang hover (hoặc absolute theo cùng `left`/`right` của sọc đó), **không** đặt `right: 10px` trên toàn panel.
2. Vị trí gợi ý: cạnh badge phía trên sọc, lệch phải ~8–12px (nếu thiếu chỗ mép phải → flip sang trái sọc).
3. Hover leave sọc → ẩn (giữ như FEAT-02). Khi hover tooltip vẫn giữ hiện nếu cần `pointer-events` trên tooltip (optional).
4. Áp dụng **cả Anchor và Split**, trên **general / tab / footer** (mọi CategoryPanel).

CSS **sai** (bỏ):
```css
.guide-tooltip { position: absolute; top: 10px; right: 10px; } /* neo góc panel */
```

CSS / DOM **đúng** (gợi ý):
```html
<div class="guide-line guide-anchor" style="left: …">
  <span>A:6</span>
  <!-- chỉ render khi hover_guide === 'anchor' -->
  <div class="guide-tooltip">Khi đường này cắt qua…</div>
</div>
```
```css
.guide-line { position: absolute; /* đã có */ }
.guide-tooltip {
  position: absolute;
  top: 0;           /* ngang badge */
  left: 100%;       /* sát bên phải đường/hit-area */
  margin-left: 8px;
  /* bỏ right: 10px trên panel */
  white-space: normal;
  max-width: 280px;
  z-index: 20;
}
```

Nội dung text popup giữ FEAT-02 (không đổi nghĩa).

═══════════════════════════════════════
### Files / Done
═══════════════════════════════════════

- `media/src/main.js` — bật show_anchor/show_split footer; tooltip **bên trong** `.guide-line`
- `media/src/previewForm.css` — bỏ `right: 10px` panel; sticky cạnh sọc
- Rebuild bundle, Reload Window

Done:
- [ ] category -1 có `anchor="5"` → kẻ được sọc Anchor trên footer
- [ ] Không khai anchor trên -1 → không sọc footer dù nút bật
- [ ] Hover sọc → popup **sát** thanh A:/S: (không còn góc phải panel) — general/tab/footer
```

---

## Nhắc

| Zone | Nguồn anchor/split guide |
|------|---------------------------|
| General | `view.@anchor` / `view.@split` |
| Tab | chỉ `category.@…` nếu có |
| **Footer (-1)** | chỉ `category index="-1" @anchor/@split` |

```
tooltip: con của .guide-line, left:100%  ✅ sát sọc
tooltip: right:10px trên panel           ❌ xa góc phải
```
