# Prompt Gemini — FEAT-02: Hover popup giải thích sọc Anchor & Split

Copy khối **Prompt** cho Gemini (`@src/PreviewForm`).

---

## Prompt

```
Thêm tính năng Preview Form: khi **hover** vào kẻ sọc guide Anchor / Split thì hiện **popup giải thích** cho Developer (tiếng Việt đúng nghĩa skill fbo-design-view-field).

### Nội dung popup (bắt buộc dùng đúng ý / có thể chỉnh nhẹ chính tả)

**Hover sọc Anchor (cam):**
> Khi đường này cắt qua field nào thì khi Co giãn Form thì trường đó sẽ neo co giãn theo

**Hover sọc Split (cyan):**
> Đây là đường chia cắt Form ra 2 phần. Khi bấm Tab sẽ Focus vào các Field Phần 1 sau đó mới tới các Field phần 2

### UX

1. Popup hiện khi hover **đường kẻ** (`.guide-line.guide-anchor` / `.guide-line.guide-split`) hoặc badge `A:N` / `S:N` trên sọc.
2. Ẩn khi mouse leave.
3. Style: tooltip/popover rõ trên dark theme (nền tương phản, chữ đọc được, max-width ~280–320px, có thể wrap nhiều dòng).
4. `pointer-events: auto` trên vùng sọc/badge đủ để hover (layer guide trước đó `pointer-events: none` — cần bật lại trên `.guide-line` hoặc hit-area rộng hơn 2px, vd padding hit zone ~6–8px để dễ hover).
5. Không chặn click field bên dưới ngoài vùng sọc (chỉ hit-area hẹp quanh đường).
6. Optional: `title` attribute tạm **không đủ** — nên dùng popup custom (div) để xuống dòng đẹp; nếu dùng native `title` thì chấp nhận 1 dòng nhưng ưu tiên custom.
7. **Sticky sát thanh guide (bắt buộc — xem FEAT-01d mục C):** popup phải **dính cạnh** sọc/`A:N`/`S:N` đang hover. **Cấm** `top/right` neo góc `.category-panel` (bug hiện tại: tooltip góc phải, xa đường cam). Đặt tooltip **bên trong** `.guide-line` với `left: 100%; margin-left: 8px; top: 0` (hoặc tương đương).

### Gợi ý implement (Preact)

```js
// state
hover_guide: null // 'anchor' | 'split' | null

// tooltip LÀ CON của .guide-line — không render riêng góc panel
html`<div class="guide-line guide-anchor" style="left: ${anchor_x}px"
          onMouseEnter=${() => this.setState({ hover_guide: 'anchor' })}
          onMouseLeave=${() => this.setState({ hover_guide: null })}>
  <span>A:${anchor}</span>
  ${hover_guide === 'anchor' && html`<div class="guide-tooltip">…</div>`}
</div>`
```

CSS: `.guide-tooltip { position: absolute; top: 0; left: 100%; margin-left: 8px; … }` — **bỏ** `right: 10px` trên panel.

### Files

- `media/src/main.js` — hover state + tooltip DOM
- `media/src/previewForm.css` — `.guide-line` hit-area, `.guide-tooltip`
- Rebuild: `npm run build:preview-form`

### Không làm

- Không đổi vị trí tính sọc (FEAT-01b/c/d).
- Không đổi logic kế thừa tab (FEAT-01d).
- Không bắt buộc i18n English MVP.

### Done

- [ ] Hover sọc cam → popup đúng nội dung Anchor
- [ ] Hover sọc cyan → popup đúng nội dung Split
- [ ] Leave → ẩn popup
- [ ] Dễ hover (hit-area đủ rộng)
- [ ] Popup **sát** thanh A:/S: (không góc phải panel)
```

---

## Copy nhanh (text popup)

| Guide | Popup |
|-------|--------|
| Anchor | Khi đường này cắt qua field nào thì khi Co giãn Form thì trường đó sẽ neo co giãn theo |
| Split | Đây là đường chia cắt Form ra 2 phần. Khi bấm Tab sẽ Focus vào các Field Phần 1 sau đó mới tới các Field phần 2 |
