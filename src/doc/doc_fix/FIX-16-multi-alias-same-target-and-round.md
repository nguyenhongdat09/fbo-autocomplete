# FIX-16 — Nhiều alias cùng target (`gia_nt`) + edge id trùng + `round()` chưa parse

## Mức: High (user báo BIPODetail — tab Tiền & Giá dây treo; 1 cột nhiều công thức)

## Hiện tượng

Trên `Grid/BIPODetail.xml`, `g.$a` khai báo hợp lệ FBO — **một cột, nhiều alias**, runtime chọn theo hoàn cảnh:

```js
gia_nt:     '[gia_nt]:= ([so_luong] == 0? 0: [tien_nt]/ [so_luong])',
gia_nt_sl:  '[gia_nt]:=([gia_nt] == 0 ? ([so_luong] != 0 ? ([tien_nt]/[so_luong]) : 0) : [gia_nt])',
gia_nt_vat: '[gia_nt]:= round([gia_vat_nt] * (1 - [tl_ck]/100) / (1 + [thue_suat]/100), 4)',
gia_vat:    '[gia]:= round([gia_vat] * (1 - [tl_ck]/100) / (1 + [thue_suat]/100), 4)',
// … tương tự gia_sl, tien_nt / tien_nt_sl / tien_nt_sl2, …
```

`onChange` gọi đúng alias (vd `g.$a.gia_nt_vat` khi sửa `gia_vat_nt` / `tl_ck`). **XML không sai.**

Preview hiện:

1. Tab **Tiền & Giá**: nhiều dây cong hội tụ chỗ trống / node biến mất (screenshot user khoanh).
2. Không rõ alias nào đang “chạy” trên playground khi cùng ghi `gia_nt`.
3. Formula có `round(...)` không giải thích / không nối đủ refs.

---

## Root cause (đã xác nhận)

### 1. Edge id trùng — React Flow lỗi render

[`FormulaFlowCanvas.jsx`](../../FormulaPreview/media/src/components/FormulaFlowCanvas.jsx):

```js
id: `edge-${refName}->${e.target}`
```

Nhiều alias cùng `(ref, target)` (vd `so_luong → gia_nt` từ `gia_nt` và `gia_nt_sl`) → **cùng edge id** → dây treo / mất node đích.

### 2. AST không hỗ trợ `round(...)`

[`FormulaAstParser`](../../FormulaPreview/parser/FormulaAstParser.js) `parsePrimary` chỉ: number | string | field | `(expr)`.

Token `round` → throw → `parse` trả `null` → `refs = []`, `plain_vi` kém, eval = 0.

Ảnh hưởng BIPO: `gia_nt_vat`, `gia_vat`, `tien_s_vat_nt`, `ck_mua_nt`, `tien_nt_sl`, …

### 3. Multi-alias: parser OK, UX/eval chưa nói rõ

`buildFormulaMap` / `entries` **đã giữ đủ** từng alias.  
Thiếu: ghi chú cùng-target trên Từ điển; playground chỉ eval 1 nhánh (`default_demo_chain` — FIX-15).

### 4. Self-edge / chu trình

`gia_nt_sl` refs gồm `[gia_nt]` và target `gia_nt` → cạnh `gia_nt → gia_nt`.  
BIPO còn chu trình nghiệp vụ `gia_nt ↔ tien_nt` (hai chiều qua alias khác). Edge id unique + bỏ self-edge giúp dagre ổn hơn.

---

## Rule (bắt buộc)

### A. Edge id unique theo alias

```js
id: `edge-${e.alias}-${refName}->${e.target}`
// aggregate:
id: `edge-${e.alias}-${e.grid_col}->${aggNodeId}`
id: `edge-${e.alias}-${aggNodeId}->${e.master}`
```

Node field vẫn **một** id = tên cột (`gia_nt`). Không tạo node riêng theo alias.

### B. Bỏ self-edge

Khi vẽ formula: nếu `refName === e.target` → **không** push edge (vẫn giữ field trong refs cho eval/từ điển nếu cần).

### C. Parse + eval `round`

`FormulaAstParser`:

- Nhận dạng `IDENT(` … `)` với tên `round` (case-insensitive).
- AST gợi ý: `{ type: 'call', name: 'round', args: [expr, decimals?] }`  
  hoặc MVP unwrap: parse như chỉ lấy arg đầu (đủ refs), eval làm tròn.
- `collectRefs` / `toPlainVi` đi vào args (`Làm tròn(…, 4)`).
- `evaluateAst`: `round(x)` → `Math.round(x)`; `round(x, n)` → làm tròn `n` chữ số thập phân (FBO-style).

Không hỗ trợ mọi hàm JS — chỉ `round` trong MVP (có thể mở rộng `Math.*` sau).

### D. Canvas nhóm vẫn vẽ mọi alias thuộc nhóm

Tab Tiền & Giá / Chiết khấu / …: mọi entry `group` khớp → đủ cạnh (id unique).  
Playground eval: chỉ alias trong `default_demo_chain` (1 / target — FIX-15).

### E. Từ điển — ghi chú cùng target

Với mỗi formula entry, nếu còn alias khác cùng `target`:

```text
(cùng ghi gia_nt: gia_nt, gia_nt_sl, gia_nt_vat)
```

Alias **không** nằm trong `default_demo_chain` có thể gắn badge nhỏ “Nhánh phụ” (optional UX).

**Cấm** bắt buộc parse `onChange`/`validExpression` để chọn nhánh (FEAT-06). Runtime FBO chọn alias — Preview chỉ trình bày sổ `g.$a`.

---

## Việc phải làm (checklist code)

1. `FormulaFlowCanvas.jsx` — edge id có `alias`; skip `ref === target`.
2. `FormulaAstParser` + `evaluateAst` — hỗ trợ `round`.
3. Tests AST: `round([a]*[b], 4)` → refs `a`,`b`; eval ổn.
4. Từ điển (`DictionaryTab` / `GroupTab` / caption): liệt kê sibling cùng `target`.
5. Smoke BIPO tab **Tiền & Giá**: không dây treo chỗ trống; zoom thấy `gia_nt` / `gia` / refs.
6. `npm run test:formula-preview` + `npm run build:formula-preview`.

---

## Done

- [ ] Tab Tiền & Giá `BIPODetail`: không còn dây hội tụ chỗ trống
- [ ] `gia_nt_vat` / formula `round` có refs + plain_vi / eval không null AST
- [ ] Từ điển: đủ `gia_nt`, `gia_nt_sl`, `gia_nt_vat` + note cùng target
- [ ] Playground chạy 1 nhánh đại diện / target (sau FIX-15)
- [ ] `npm run test:formula-preview` + `npm run build:formula-preview`

## Không làm

- Không khớp 100% thứ tự `validExpression` từng `case` onChange
- Không đổi XML khách
- Không tách node canvas theo alias (vẫn 1 node / field name)
