# FIX-07 — Khôi phục `evaluateAst` + chain demo không cộng kép

## Mức: BLOCKER (A) + High (B)

Đọc cùng [FEAT-06](./FEAT-06-scope-ga-block-only.md). Không đụng `onChange` / `validExpression`.

File vàng: `Grid/DHNDetail.xml` (FBISP229).

---

## A. Playground crash — thiếu `evaluateAst`

### Hiện tượng

`src/FormulaPreview/media/src/hooks/useFormulaEvaluator.js` gọi `evaluateAst(entry.ast, nextVals)` nhưng **không còn định nghĩa hàm**.

Mở Preview Công thức / gõ số → `ReferenceError: evaluateAst is not defined`. Sân chơi không tính được.

`valuesRef` / param `activeScenarioId` thừa — dọn nếu còn.

### Sửa bắt buộc

Trong **cùng file** hook, thêm lại hàm thuần (không `eval` JS):

```js
function evaluateAst(ast, currentVals) {
  if (!ast) return 0;
  switch (ast.type) {
    case 'number':
      return Number(ast.value) || 0;
    case 'field': {
      const val = currentVals[ast.name];
      if (typeof val === 'boolean') return val ? 1 : 0;
      return Number(val) || 0;
    }
    case 'unary':
      return -evaluateAst(ast.arg, currentVals);
    case 'binary': {
      const l = evaluateAst(ast.left, currentVals);
      const r = evaluateAst(ast.right, currentVals);
      if (ast.op === '+') return l + r;
      if (ast.op === '-') return l - r;
      if (ast.op === '*') return l * r;
      if (ast.op === '/') return r === 0 ? 0 : l / r;
      return 0;
    }
    case 'cmp': {
      const l = evaluateAst(ast.left, currentVals);
      const r = evaluateAst(ast.right, currentVals);
      if (ast.op === '==') return l === r ? 1 : 0;
      if (ast.op === '!=') return l !== r ? 1 : 0;
      if (ast.op === '>') return l > r ? 1 : 0;
      if (ast.op === '<') return l < r ? 1 : 0;
      if (ast.op === '>=') return l >= r ? 1 : 0;
      if (ast.op === '<=') return l <= r ? 1 : 0;
      return 0;
    }
    case 'ternary': {
      const cond = evaluateAst(ast.cond, currentVals);
      return (cond !== 0 && cond !== false)
        ? evaluateAst(ast.then, currentVals)
        : evaluateAst(ast.else, currentVals);
    }
    default:
      return 0;
  }
}
```

Đặt **ngoài** component (module scope) — không phụ thuộc closure.

Sau sửa: `npm run build:formula-preview`.

### Test

Có thể extract `evaluateAst` sang `parser/evalAst.js` dùng chung test Node **hoặc** test gián tiếp: `FormulaModelBuilder.build` + eval chain trong test (copy cùng logic). Tối thiểu: F5 panel không trắng / không lỗi webview console.

---

## B. `default_demo_chain` nhét alias nhánh → cộng kép tổng phiếu

### Hiện tượng (smoke DHN, seed `phi_dvtn_yn = 0`)

`FormulaModelBuilder.buildDefaultDemoChain` path NT đúng phần đầu:

`tien_nt2_sl`, `tien2`, `ck_nt`, `ck_tl`, `thue_nt`, `thue_tl`, `tien_mthang_*`, …

Rồi **leftover** thêm:

- `gia_sl` (suy giá ngược)
- `tienmt` / **`tienmt_nt_ty_le`** (`[tienmt_nt]:=[tien_nt2]` — nhánh phí, không phải path demo)

Và **`s5` đứng trước `tienmt`** (index 8 vs 12).

Kết quả số:

| Field | Sai (hiện tại leftover) | Kỳ vọng demo 1 dòng |
|-------|-------------------------|---------------------|
| `tien_nt2` | 1_000_000 | 1_000_000 |
| `ck_nt` | 50_000 | 50_000 |
| `thue_nt` | 95_000 | 95_000 |
| `t_tien_hang_nt` | 1_000_000 | 1_000_000 |
| `t_tien_bvmt_nt` | **1_000_000** (copy từ `tien_nt2` qua `*_ty_le`) | **0** (không tick phí) |
| `t_tt_nt` | **~2_045_000** | **~1_045_000** (= hàng − CK + thuế) |

Tick Phí DV-TN: `s5` vẫn 0 vì tính lúc `tienmt` chưa có.

### Rule chain mặc định (chốt)

**Được chạy:**

1. Path NT: `tien_nt2_sl` → `tien2` (alias đúng `tien2`, **không** `tien2_sl`) → `ck_nt` → `ck_tl` → `thue_nt` → `thue_tl`
2. Phí theo **cờ dòng** (đã có trong `g.$a`): `tien_mthang_nt`, `tien_mthang`, rồi `tienmt` (sau khi biết `tienmt_nt` nếu có trong seed; demo mặc định `tienmt_nt=0`), rồi `s5`, `thue_dvtn_nt`, `thue_dvtn`
3. Mọi `kind === 'aggregate' | 'aggregate_filter'`
4. Master `target` bắt đầu `t_` (`t_thue_nt_net`, `t_tien_nt2`, `t_tt_nt`, …) — **sau** aggregate

**Cấm đưa vào chain mặc định:**

| Pattern alias | Lý do |
|---------------|--------|
| `*_sl` trừ `tien_nt2_sl` | Nhánh SL/sửa giá ngược (`tien2_sl`, `gia_sl`, `gia_nt_sl`) |
| `gia_tg`, `ck_tg`, `thue_tg` | Nhánh quy đổi khác path đã chọn `tien2` / `ck_tl` / `thue_tl` |
| `*_zero` | Gán 0 khi bỏ tick — không chạy hàng loạt trên demo |
| `*_ty_le` (`tienmt_nt_ty_le`, `tienmt_ty_le`) | Copy tiền hàng → cột phí → **cộng kép** `t_tien_bvmt_*` |

Thứ tự phí: `tienmt` **trước** `s5` (vì `s5` đọc `[tienmt]`).

Không topological toàn bộ leftover. Không “thêm mọi formula chưa seen trừ `_zero`”.

### Test bắt buộc (`FormulaModelBuilder.test.js` hoặc smoke)

```js
const chain = model.default_demo_chain;
assert.ok(chain.includes('tien_nt2_sl'));
assert.ok(chain.includes('tien2'));
assert.ok(!chain.includes('tien2_sl'));
assert.ok(!chain.includes('gia_sl'));
assert.ok(!chain.includes('tienmt_nt_ty_le'));
assert.ok(chain.indexOf('tienmt') < chain.indexOf('s5') || !chain.includes('s5'));

// Eval cùng evaluateAst: seed DHN / fixture
// tien_nt2=1000000, ck_nt=50000, thue_nt=95000
// t_tien_bvmt_nt === 0 (hoặc undefined/0) khi phi_dvtn_yn false
// t_tt_nt === 1045000  // 1e6 - 50e3 + 95e3  (sau net nếu có t_thue_nt_net: vẫn 1045000 khi thue_dvtn=0)
```

Nếu `t_thue_nt_net` ghi đè `t_thue_nt`: với `thue_dvtn=0` thì `t_tt_nt` vẫn 1_045_000.

### Tick Phí DV-TN (verify tay)

- `tien_mthang_nt` → 0
- `thue_dvtn_nt` → = `thue_nt` (95_000)
- `s5` / `tienmt`: theo formula `g.$a` với `tienmt_nt` seed (0) — **không** tự gán `tienmt_nt = tien_nt2`

---

## C. Optional (cùng PR nếu rảnh)

- Hero: đừng list hết field Grid; chỉ seed + target trong `default_demo_chain` + toggle hiện cột ẩn.
- Caption: `plain_vi` của alias **vừa ghi** field đang focus, không luôn câu `tien_nt2_sl`.

Không chặn merge A+B.

---

## Done

- [ ] Hook có `evaluateAst`; `npm run build:formula-preview`
- [ ] F5 Preview trên DHN: gõ Số lượng không lỗi console; tiền/CK/thuế đúng
- [ ] `t_tt_nt` seed ≈ **1_045_000**, không ~2 triệu
- [ ] Chain không chứa `tienmt_nt_ty_le` / `tien2_sl` / `gia_sl`
- [ ] `npm run test:formula-preview` pass
- [ ] Không sửa XML khách; không parse thêm onChange

## Không làm

- Không khôi phục tab “Kịch bản onChange”
- Không resolve `agg` / `row_phi`
