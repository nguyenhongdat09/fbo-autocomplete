# Prompt Gemini — FEAT-03: Co giãn thật theo `anchor` khi kéo rộng Preview

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`, `previewForm.css`).

Skill tham chiếu: `fbo-design-view-field` — `anchor` = cột (1-based) **hút thêm chiều ngang** khi form/modal rộng ra.

---

## Prompt

```
Tính năng Preview Form: khi Developer **kéo rộng / thu hẹp** panel Preview (webview VS Code/Cursor), layout phải **co giãn thật** theo `anchor` — khớp ý popup guide:

> Khi đường này cắt qua field nào thì khi Co giãn Form thì trường đó sẽ neo co giãn theo

Hiện trạng:
- Sọc Anchor (cam) **kẻ đúng** vị trí (FEAT-01*).
- Nhưng kéo rộng panel Preview → **field không giãn** (vẫn fixed px). Preview chưa simulate hành vi FBO.

═══════════════════════════════════════
### A) Semantics (bắt buộc đúng)
═══════════════════════════════════════

1. `anchor` = chỉ số cột **1-based** trong `column_widths` / `columns` XML.
2. Khi bề ngang container **> tổng px các cột** (non-zero):
   - Cột `anchor` nhận phần dư → CSS track `minmax(${W}px, 1fr)` (W = width XML + LABEL pad nếu có).
   - Các cột khác giữ `minmax(${W}px, ${W}px)` (không giãn).
   - Cột width `0` vẫn `0px`.
3. Field / cell nào **nằm trên cột anchor** (grid-column span cắt cột đó) sẽ rộng thêm theo cột — input/`readonly-value`/`vscode-*` phải `width: 100%` trong cell.
4. Thu hẹp về ≤ tổng px → cột anchor về min = W px (không nhỏ hơn XML).
5. Nguồn `anchor`:
   - General: `view.anchor`
   - Tab: chỉ `category.anchor` nếu có (không inherit view — FEAT-01d)
   - Footer `-1`: `footer_category.anchor` nếu có
6. **Không** đổi vị trí kẻ sọc guide (FEAT-01d/g). Guide vẫn vẽ; resize chỉ làm **layout** giãn. Khi panel rộng, sọc vẫn khớp mép cột anchor (đầu hoặc cuối cột theo rule zone hiện tại).

═══════════════════════════════════════
### B) Root cause hiện tại (phải sửa)
═══════════════════════════════════════

Trong `FormRow`, `getTemplateCols` **đã** gán `minmax(Wpx, 1fr)` cho cột anchor — nhưng với **split** (TNTran `split="7"`):

```js
// SAI cho co giãn — panel không hút free space → 1fr bên trong không có chỗ giãn
<div class="form-row-split" style="width: 100%; display: flex; justify-content: space-between;">
  <div class="panel-left"  style="flex: 0 0 auto; min-width: …">  <!-- cố định -->
  <div class="panel-right" style="flex: 0 0 auto; margin-left: auto">
```

Grid con dù có `1fr` nhưng parent `flex: 0 0 auto` → bề ngang panel = tổng cột cố định → **không giãn khi kéo webview**.

═══════════════════════════════════════
### C) Fix layout (ưu tiên)
═══════════════════════════════════════

#### C1) Row **có split**

- `form-row-split`: `display: flex; width: 100%; align-items: start;` (có thể bỏ `space-between` nếu dùng flex-grow).
- Xác định panel chứa cột anchor:
  - `anchor <= split` → **panel-left** giãn
  - `anchor > split` → **panel-right** giãn
- Panel **có** anchor:
  ```js
  flex: 1 1 auto;
  min-width: ${panel_min_px}px;  // tổng width cột panel (+ pad label)
  width: auto; // hoặc flex-grow chiếm phần dư
  // grid bên trong:
  display: grid;
  grid-template-columns: …; // có minmax(W,1fr) ở cột anchor (global index)
  width: 100%;
  ```
- Panel **không** có anchor:
  ```js
  flex: 0 0 auto;
  min-width: ${panel_min_px}px;
  // grid fixed tracks, không cần 1fr
  ```
- Panel phải (thường không anchor trên TNTran general): giữ `margin-left: auto` nếu cần đẩy phải, nhưng **không** chặn panel trái giãn.

Gợi ý:
```js
const anchor_in_left = anchor != null && anchor > 0 && anchor <= split;
const left_style = anchor_in_left
  ? `flex: 1 1 auto; min-width: ${left_min_px}px; width: 100%; …`
  : `flex: 0 0 auto; min-width: ${left_min_px}px; …`;
const right_style = (!anchor_in_left && anchor > split)
  ? `flex: 1 1 auto; min-width: ${right_min_px}px; …`
  : `flex: 0 0 auto; margin-left: auto; min-width: ${right_min_px}px; …`;
```

#### C2) Row **không split** (general không split / footer / tab 1 cột)

- `.form-row`: `width: 100%` (full panel).
- `getTemplateCols`: cột anchor = `minmax(Wpx, 1fr)`; cột khác fixed.
- **Không** `width: fit-content` / `margin-left: auto` trên row nếu làm mất free space cho `1fr` (trừ khi FEAT/FIX footer cố ý pin-end — nếu footer cần vừa pin phải vừa giãn: dùng `width: 100%` + `1fr` trên cột anchor footer, **không** shrink-wrap).

#### C3) Control trong cell giãn

Đảm bảo (CSS đã có thì giữ):
```css
.form-cell { min-width: 0; } /* non-label */
vscode-text-field, vscode-dropdown, .readonly-value { width: 100%; max-width: 100%; }
```
Label cột thường **không** là cột anchor; nếu anchor trùng cột label thì vẫn cho cell giãn (hiếm).

═══════════════════════════════════════
### D) Guide line khi resize
═══════════════════════════════════════

- Layer guide `position: absolute` theo panel: khi cột `1fr` giãn, **mép cột đổi** → nếu guide chỉ tính `sum(px)` lúc render (không gồm phần `fr` dư) thì sọc sẽ **lệch** khi panel rộng.
- Fix gợi ý (chọn 1):
  1. **Đơn giản:** guide `left` = sum cố định các cột *trước* anchor (đầu cột) — đúng khi free space nằm *trong* cột anchor (1fr). Đầu cột không đổi → sọc đầu cột vẫn đúng khi giãn. (Cuối cột footer FEAT-01g: `sum(slice(0,anchor))` = hết phần min của cột; phần `fr` dư nằm *sau* điểm đó trong track — với `minmax(W,1fr)` điểm “đầu cột” ổn định; “cuối cột” visual khi giãn là mép phải track → nếu footer cần cuối cột động, đo DOM `getBoundingClientRect` của cell/track — optional MVP: giữ công thức px min cũng chấp nhận nếu user chỉ quan tâm general đầu cột.)
  2. Hoặc gắn guide vào pseudo-element trên cột grid (advanced).

Ưu tiên MVP: **giữ công thức guide hiện tại** (đầu/cuối theo zone) — với `1fr` trên đúng cột, sọc **đầu cột** vẫn khớp khi resize. Không regress FEAT-01*.

═══════════════════════════════════════
### E) Không làm
═══════════════════════════════════════

- Không đổi parser / XML.
- Không đổi nghĩa Split guide / popup text.
- Không bật lại `view.split` cho footer layout rows.
- Không giãn mọi cột (chỉ cột `anchor`).
- Không phụ thuộc nút toolbar Anchor bật/tắt — **co giãn luôn theo XML**; nút Anchor chỉ hiện/ẩn **sọc**.

═══════════════════════════════════════
### F) Files / Done
═══════════════════════════════════════

Files:
- `media/src/main.js` — FormRow split flex-grow + grid `width:100%` + `1fr` anchor
- `media/src/previewForm.css` — nếu cần `.panel-left` / `.form-row` / `min-width:0`
- Rebuild: `npm run build:preview-form`, Reload Window

Done:
- [ ] TNTran general `anchor="6"` + `split="7"`: kéo rộng Preview → cột/field bị sọc A:6 cắt (vd vùng ten_bp / cột 147) **rộng thêm**; cột khác giữ px
- [ ] Thu hẹp lại → về độ rộng min như XML
- [ ] Tab có `anchor` riêng: giãn theo category; tab không có anchor: không giãn
- [ ] Footer có `anchor`: giãn cột đó nếu row `width:100%` + 1fr (không bị shrink-wrap)
- [ ] Sọc guide vẫn đúng; nút Anchor chỉ toggle hiển thị sọc
```

---

## Nhắc nhanh (cho Gemini)

| Thành phần | Vai trò |
|------------|---------|
| Sọc cam | Chỉ **minh họa** cột anchor |
| `minmax(W, 1fr)` | Cột XML `anchor` nhận phần dư |
| Panel split `flex: 1` | **Bắt buộc** nếu không `1fr` không có chỗ giãn |
| Kéo webview | Container rộng hơn → thấy giãn |

```
Bug:  1fr trong panel flex:0 0 auto  → không giãn
Fix:  panel chứa anchor flex:1 + grid width 100% + 1fr
```
