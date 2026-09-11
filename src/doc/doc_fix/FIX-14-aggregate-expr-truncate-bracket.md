# FIX-14 — Aggregate `grid_col` biểu thức bị cắt `]` + chưa giải thích plain_vi (SVDetail `t_tien2`)

## Mức: High (user báo trên `SVDetail.xml` ~456–457)

## Hiện tượng

Flat XML (đúng):

```js
t_tien2: ['t_tien2', '(([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck]', '[km_yn] == 0'],
```

Preview hiện **cắt mất `]` cuối**:

```text
(([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck
```

Và chỉ hiện raw / nhãn thô — **không** giải thích tiếng Việt chi tiết các trường `loai`, `tien2`, `ck` trong biểu thức.

Cùng pattern: `t_tien_nt2` với `… - [ck_nt]`, và `t_tc_tien2` / `t_tc_tien_nt2` (chỉ phần `(([loai]=="90"?…)*[tien2])`).

---

## Root cause (đã xác nhận)

### 1. Bug cắt `]` — `cleanIdentifierOrBracket` trong `GaFormulaMapBuilder.js`

```js
str.replace(/^['"]|['"]$/g, '').replace(/^\[\$?|\]$/g, '')
```

Nhánh `\]$` **xóa mọi `]` ở cuối chuỗi**.

Với `grid_col` là **biểu thức** kết thúc bằng field `[ck]`:

| Trước | Sau `cleanIdentifierOrBracket` |
|-------|--------------------------------|
| `… - [ck]` | `… - [ck` ← mất `]` |

Hàm này chỉ hợp lệ cho tên cột đơn: `ck`, `'ck'`, `[ck]`, `[$ty_gia]`.  
**Cấm** áp nguyên xi lên biểu thức có toán tử / ternary.

### 2. Gap UX — aggregate expression chưa `toPlainVi`

`FormulaModelBuilder` với `aggregate` / `aggregate_filter`:

- `gridLabel = fields[entry.grid_col]` → với chuỗi biểu thức **không** có trong catalog → label = cả biểu thức thô (hoặc đã cắt).
- `plain_vi` dạng *“Cộng dồn \<raw\> …”* — không parse AST, không kể chuyện `loai` / dấu ± / trừ CK.

User muốn giải chi tiết:

> `((([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck]`  
> ≈ *Nếu Loại = 90 (dòng giảm giá): lấy −Tiền, không thì +Tiền; rồi trừ Chiết khấu; cộng dồn vào Tổng tiền (khi không khuyến mãi).*

---

## Việc phải làm

### A. Sửa `cleanIdentifierOrBracket` (bắt buộc)

Chỉ strip bracket khi **cả chuỗi** là identifier trong `[]`:

```js
function cleanIdentifierOrBracket(str) {
  if (!str) return '';
  let s = str.trim().replace(/^['"]|['"]$/g, '').trim();
  // Chỉ [name] hoặc [$name] thuần — không phải biểu thức
  const m = s.match(/^\[\$?([A-Za-z_][\w]*)\]$/);
  if (m) return m[1];
  return s; // giữ nguyên biểu thức, kể cả ] cuối
}
```

Áp dụng cho `master` và `grid_col` khi parse aggregate 2/3 phần tử.

Thêm test trong `GaFormulaMapAggregate.test.js` (hoặc test map builder):

```js
const expr = '(([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck]';
// entry.grid_col === expr  (đủ dấu ])
assert.ok(entry.grid_col.endsWith('[ck]'));
assert.ok(!entry.grid_col.endsWith('[ck')); // không bị cắt
```

### B. Phân loại `grid_col`: field đơn vs biểu thức

```js
const isExpr = /[()?+\-*/?:]|==|!=/.test(grid_col) || (grid_col.includes('[') && !/^\[\w+\]$/.test(grid_col));
```

| Loại | `refs` | `plain_vi` | Eval playground |
|------|--------|------------|-----------------|
| Field đơn `tien2` | `[grid_col]` (+ filter refs) | như hiện tại | `master := values[grid_col]` (có filter) |
| Biểu thức | `collectRefs(parse(grid_col))` (+ filter) | xem mục C | `master := evaluateAst(grid_col_ast, values)` rồi áp filter |

Lưu thêm trên entry (khuyến nghị):

- `grid_col_ast` / `grid_expr` khi là biểu thức
- `kind` vẫn `aggregate` / `aggregate_filter`

### C. `plain_vi` giải chi tiết (user hỏi — làm được)

Với biểu thức `(([loai] == "90" ? (-1) : (1)) * [tien2]) - [ck]`:

1. `FormulaAstParser.parse(grid_col)` + `toPlainVi(ast, fields)`.
2. Câu aggregate:

```text
Cộng dồn (<plain biểu thức>) thành <masterLabel> trên phiếu (khi <filter_vi>)
```

Ví dụ kỳ vọng (không cần word-perfect, nhưng phải Việt hóa field, **không** để raw cắt `]`):

```text
Cộng dồn (Nếu Loại = 90: (−1) × Tiền, ngược lại (1) × Tiền; rồi trừ Chiết khấu)
thành Tổng tiền trên phiếu (khi không tick / km_yn = 0 …)
```

Cải thiện `toPlainVi` cho pattern FBO phổ biến (optional nhưng nên có):

- `([loai] == "90" ? (-1) : (1)) * [tien2]` → *Nếu Loại = 90 thì lấy âm Tiền, không thì lấy dương Tiền*  
  (hoặc: *nhân Tiền với −1 khi Loại giảm giá 90, ngược lại ×1*)

Raw tab / Dictionary vẫn có thể hiện formula đủ `]`.

### D. Evaluator

Với `grid_col_ast`: tính số từ AST (1 dòng playground), không `values[toàn bộ chuỗi biểu thức]`.

Filter `aggregate_filter` giữ FIX-09.

### E. Canvas (nhẹ)

Node Σ: nhãn điều kiện + tooltip `plain_vi` đầy đủ.  
Edge từ các `refs` của biểu thức → Σ (không chỉ một field ảo tên cả biểu thức).

---

## Fixture / smoke

XML nguồn (sau flat entity), alias `t_tien2` / `t_tien_nt2` trên `SVDetail` (hoặc fixture mini copy 1 dòng aggregate expression).

Done:

- [ ] `grid_col` kết thúc bằng `[ck]` / `[ck_nt]` — **đủ `]`**
- [ ] `plain_vi` có tên field Việt (Loại, Tiền, Chiết khấu) + ý ± khi `loai==90` + trừ CK + filter `km_yn`
- [ ] Playground đổi `loai` / `tien2` / `ck` → `t_tien2` đổi đúng dấu
- [ ] Test unit cho `cleanIdentifierOrBracket` + map aggregate expression
- [ ] `npm run test:formula-preview` + `npm run build:formula-preview`

---

## Không làm

- Không sửa file `SVDetail.xml` / entity khách (bug nằm ở parser extension).
- Không đổi nghĩa nghiệp vụ FBO `loai==90`.
