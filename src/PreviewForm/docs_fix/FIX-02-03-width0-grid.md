# FIX-02 / FIX-03 — Width 0 ẩn cột + Grid placement

## Hai ý nghĩa khác nhau của số `0`

| Ngữ cảnh | Ý nghĩa |
|----------|---------|
| Trong **`columns` / master** `100, 110, ..., 0, 0` | Cột **ẩn** — field trên cột đó không hiện |
| Trong **pattern** `111000-100...` ký tự `0` | Cột vẫn có width (theo columns); control trước **span/giãn** qua |

Đừng map `columns===0` → CSS `auto` / `1fr`.

## Ví dụ TNTran dòng 655–656

Master (15 cột):

`100, 110, 100, 90, 30, 147, 8, 58, 42, 8, 100, 0, 0, 0, 0`

Pattern:

`111000-100111111`

| Col index | Pattern | Width | Hiện? |
|-----------|---------|-------|-------|
| 0–10 | 1/0/- | >0 | Có (theo pattern) |
| 11–14 | `1` | **0** | **Ẩn** → không render `stt_rec`, `ma_nk`, `ma_sp_tn`, `ma_lo_tn`, `ma_vt_tn` |

## Thuật toán ẩn

Với mỗi ký tự pattern tại index `i`:

1. Nếu `column_widths[i] === 0` và char là `1`: đánh dấu slot `hidden: true` (vẫn có thể giữ trong model để debug).
2. Nếu char `1` có `col_span > 1`: ẩn khi **tất cả** width trong span đều `0`; nếu một phần >0 thì span chỉ trên cột visible (tuỳ chọn đơn giản MVP: ẩn cả slot nếu start width === 0).
3. UI: `if (cell.hidden) return null` **nhưng** vẫn phải đặt `grid-column-start` đúng cho các slot **visible** (hoặc render empty 0px cho cột ẩn).

Khuyến nghị CSS:

```js
column_widths.map(w => (w === 0 ? '0px' : `${w}px`)).join(' ')
```

+ `overflow: hidden` trên row.

## Field-level hide

```xml
<field name="stt_rec_goc" readOnly="true" hidden="true" width="0" ...>
```

`classifyField`: `hidden = @_hidden === 'true' || @_width === '0'`.  
UI: control `hidden` → không render (kể cả cột > 0).

## Grid placement (FIX-03)

Không:

```js
cells.map(c => c.type === 'empty' ? null : slot) // auto-place dồn trái
```

Có — ví dụ:

```js
// Mỗi slot biết start_col (0-based)
html`<div style=${`grid-column: ${start_col + 1} / span ${col_span};`}>...</div>`
```

Hoặc render đủ `pattern.length` ô (empty giữ chỗ).
