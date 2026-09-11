# FIX-15 — Tab «Tất cả» / `default_demo_chain` cứng DHN → thiếu graph BIPO

## Mức: High (user báo trên `BIPODetail.xml` — tab Tất cả thiếu giá / tiền vốn)

## Hiện tượng

Mở Preview Công thức trên `Grid/BIPODetail.xml` (FAHASAKHANHHOA), chip **Tất cả**:

- Chỉ còn vài nhánh: `so_luong` → Σ → `t_so_luong`, thuế / tiền → Σ → `t_tt*`.
- **Thiếu** hầu hết node giá / tiền vốn: `gia_nt`, `gia`, `gia_vat_nt`, `tien_v_mua_nt`, `tien_nt` (formula), `ck_*`, …
- Tab **Tiền & Giá** thì thấy nhiều hơn nhưng vẫn lỗi giao diện (xem FIX-16).

XML khách **đúng** — `g.$a` khai báo đầy đủ (~511–569). Lỗi nằm ở Preview chọn sai tập alias để vẽ / eval.

---

## Root cause (đã xác nhận)

### 1. Canvas tab `all` lọc theo `default_demo_chain`

[`FormulaFlowCanvas.jsx`](../../FormulaPreview/media/src/components/FormulaFlowCanvas.jsx):

```js
let aliasesToRender = model.default_demo_chain || entries.map(e => e.alias);

if (selectedGroup !== 'all') {
  aliasesToRender = entries.filter(/* theo group */).map(e => e.alias);
}
```

Khi `selectedGroup === 'all'` → **không** dùng toàn bộ `entries`, mà dùng `default_demo_chain`.

### 2. `buildDefaultDemoChain` hard list alias DHN

[`FormulaModelBuilder.js`](../../FormulaPreview/parser/FormulaModelBuilder.js) `primarySequence`:

```js
'tien_nt2_sl', 'tien2', 'ck_nt', 'ck_tl', 'ck',
'thue_nt', 'thue_tl', 'thue',
'tien_mthang_nt', 'tien_mthang', 'tienmt', 's5',
'thue_dvtn_nt', 'thue_dvtn'
```

BIPO dùng tên khác (`gia_nt`, `tien_nt`, `tien_v_mua_nt`, `ck_mua_nt`, …).  
→ Chain BIPO gần như chỉ còn: aggregate `t_*` + vài `thue*` trùng tên + master `t_tt*`.

### 3. Evaluator cũng chỉ chạy chain này

[`useFormulaEvaluator.js`](../../FormulaPreview/media/src/hooks/useFormulaEvaluator.js):

```js
const chain = model.default_demo_chain || Array.from(entryMap.keys());
```

Playground không tính các formula BIPO ngoài chain → số / highlight lệch.

Khớp hướng FEAT-06 (path demo từ `g.$a`, không onChange) — nhưng path **không được hard DHN**.

---

## Rule (bắt buộc)

### A. Canvas `selectedGroup === 'all'`

Vẽ **mọi** `entries` có `kind === 'formula' | 'aggregate' | 'aggregate_filter'`.

```js
let aliasesToRender = entries.map(e => e.alias);
if (selectedGroup !== 'all') {
  aliasesToRender = entries.filter(/* group */).map(e => e.alias);
}
```

**Cấm** dùng `default_demo_chain` để lọc node/edge trên canvas.

### B. `default_demo_chain` — generic (playground eval)

Viết lại `buildDefaultDemoChain(entries)`:

1. Lấy mọi `kind === 'formula'` có `target` + AST (hoặc raw parse được).
2. **Mỗi `target` chọn đúng 1 alias** theo ưu tiên:
   - `alias === target` (vd `gia_nt` ghi `[gia_nt]:=…`)
   - else alias kết thúc `_sl` **nếu** không phải nhánh phụ rõ (`*_vat`, `*_zero`, …) — tùy chọn; mặc định an toàn: ưu tiên `alias === target` rồi **alias khai báo đầu tiên** trong `g.$a`
   - else alias đầu tiên theo thứ tự `entries`
3. Topo-sort tập alias đã chọn theo cạnh `refs → target` (cycle → bỏ alias gây cycle + warning mềm `PARSE_SOFT` / bỏ qua, không crash).
4. Append **mọi** aggregate / `aggregate_filter`.
5. Append formula master còn lại (`target` bắt đầu `t_`) nếu chưa có.

**Cấm** hardcode `tien_nt2_sl`, `tien2`, `ck_nt`, …

Nhánh phụ cùng target (`gia_nt_sl`, `gia_nt_vat`, `tien_nt_sl`, …) **không** vào demo chain — vẫn hiện Từ điển / Raw / canvas nhóm (FIX-16).

### C. Regression DHN

Sau generic: DHN vẫn chọn được `tien_nt2_sl` (hoặc `alias === target` nếu có), aggregates, `t_tt_nt` — seed playground ra tiền/CK/thuế như checklist cũ.

---

## Việc phải làm (checklist code)

1. `FormulaFlowCanvas.jsx` — `all` = full `entries` aliases (không `default_demo_chain`).
2. `FormulaModelBuilder.buildDefaultDemoChain` — generic 1-alias/target + topo + agg + master; xóa `primarySequence` DHN.
3. `useFormulaEvaluator.js` — giữ dùng `default_demo_chain` cho **eval** (sau khi builder đúng).
4. Test: fixture / assert chain BIPO-like có `gia_nt` (hoặc alias đại diện), **không** bắt buộc có `tien_nt2_sl` khi map không có; DHN test vẫn `includes('tien_nt2_sl')` nếu fixture DHN còn.
5. `npm run test:formula-preview` + `npm run build:formula-preview`.

---

## Done

- [ ] Preview `BIPODetail.xml` — **Tất cả**: thấy `gia_nt` / `gia` / `tien_nt` (hoặc path tiền vốn) / Σ / `t_tt*`
- [ ] Không còn graph «chỉ aggregate + tổng»
- [ ] DHN seed playground vẫn ra tiền / CK / thuế
- [ ] `npm run test:formula-preview` + `npm run build:formula-preview`

## Không làm

- Không parse `onChange` / `validExpression` để dựng chain (FEAT-06)
- Không đổi XML khách `BIPODetail.xml`
- Không gộp FIX-16 (edge id / `round` / multi-alias UI)
