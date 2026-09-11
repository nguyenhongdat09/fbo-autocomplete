# FIX-09 — Aggregate có điều kiện (3 phần tử): `t_thue_dvtn_*` + `phi_dvtn_yn`

## Mức: High — user báo thiếu công thức dạng này trên Preview

## XML thật (DHNDetail — đã đổi so với bản cũ)

```javascript
t_tien_hang_nt: ['t_tien_hang_nt', 'tien_nt2', '[phi_dvtn_yn] == 0'],
t_tien_hang:    ['t_tien_hang',    'tien2',    '[phi_dvtn_yn] == 0'],
t_tien_bvmt_nt: ['t_tien_bvmt_nt', 'tienmt_nt','[phi_dvtn_yn] != 0'],
t_tien_bvmt:    ['t_tien_bvmt',    'tienmt',   '[phi_dvtn_yn] != 0'],
t_thue_nt:      ['t_thue_nt',      'thue_nt',  '[phi_dvtn_yn] == 0'],
t_thue:         ['t_thue',         'thue',     '[phi_dvtn_yn] == 0'],
t_thue_dvtn_nt: ['t_thue_dvtn_nt', 'thue_nt',  '[phi_dvtn_yn] != 0'],  // ← user chỉ
t_thue_dvtn:    ['t_thue_dvtn',    'thue',     '[phi_dvtn_yn] != 0'],
```

**Ý nghĩa FBO (1 dòng playground):**

| Alias | Khi điều kiện **đúng** | Khi **sai** |
|-------|------------------------|-------------|
| `t_thue_dvtn_nt` | `t_thue_dvtn_nt := thue_nt` | `t_thue_dvtn_nt := 0` |
| `t_thue_nt` | `t_thue_nt := thue_nt` | `t_thue_nt := 0` |

Cùng nguồn `thue_nt`, **hai “túi” master** tách theo tick **Phí DV-TN**:
- Không tick (`phi_dvtn_yn == 0`) → thuế vào `t_thue_nt`
- Có tick (`!= 0`) → thuế vào `t_thue_dvtn_nt`

---

## Gemini đang hiểu sai chỗ nào

Smoke hiện tại: parser **đã** ra `kind: 'aggregate_filter'` + `filter` cho các alias trên.

Nhưng:

1. **Evaluator** (`useFormulaEvaluator.js`) với `aggregate_filter` vẫn:
   ```js
   nextVals[master] = nextVals[grid_col] || 0;  // luôn gán — BỎ QUA filter
   ```
   → Tick / không tick Phí DV-TN: `t_thue_dvtn_nt` và `t_thue_nt` **cùng** nhận `thue_nt` → user thấy “không có công thức riêng / sai nghiệp vụ”.

2. **`plain_vi`** còn raw: `… (khi [phi_dvtn_yn] != 0) …` — non-tech không đọc được; cần tiếng Việt.

3. **`refs`** của aggregate_filter chỉ có `grid_col`, **thiếu** field trong `filter` (`phi_dvtn_yn`) → FIX-08 có thể không coi cờ phí là “tham gia” nếu chỉ dựa refs (kiểm tra lại).

4. Thanh tổng / từ điển: phải **thấy rõ** alias `t_thue_dvtn_nt` / `t_thue_dvtn` (nhóm Master), kèm điều kiện.

Spec cũ MVP “bỏ filter” **bãi bỏ** cho case `phi_dvtn_yn` trên playground 1 dòng — **bắt buộc áp filter**.

---

## Việc phải làm

### 1. Evaluator — áp filter (1 dòng = if)

Với `kind === 'aggregate_filter'`:

```js
const ok = evaluateFilter(entry.filter, nextVals); // dùng chung grammar AST / evaluateAst
nextVals[entry.master] = ok ? (nextVals[entry.grid_col] || 0) : 0;
```

`evaluateFilter`: parse `filter` string (có thể còn `[phi_dvtn_yn] != 0` hoặc đã strip ngoặc) bằng `FormulaAstParser.parse` + `evaluateAst` → truthy như ternary.

Điều kiện không parse được → warning mềm + gán 0 (không crash).

### 2. `plain_vi` tiếng Việt cho filter

Ví dụ:

- `[phi_dvtn_yn] != 0` → *khi đang tick Phí DV-TN*
- `[phi_dvtn_yn] == 0` → *khi không tick Phí DV-TN*
- `[loai] == "90"` → *khi Loại = 90* (giữ pattern chung)

Full câu:

> Cộng dồn Thuế nt trên lưới thành Tổng thuế DVTN trên phiếu **khi đang tick Phí DV-TN**

Làm trong `FormulaModelBuilder` khi build entry `aggregate_filter`.

### 3. `refs` gồm field trong filter

```js
formulaEntry.refs = unique([grid_col, ...collectRefs(parse(filter))]);
```

→ `phi_dvtn_yn` luôn thuộc field tham gia (FIX-08).

### 4. UI trình diễn (bắt buộc thấy được)

- Tab **Nhóm công thức** / **Từ điển**: dòng `t_thue_dvtn_nt` hiện `plain_vi` đã Việt hóa + badge loại `Aggregate (có điều kiện)`.
- Thanh tổng Hero: hiện `t_thue_dvtn_nt` / `t_thue_nt` (hoặc tổng thuế tách) — khi tick Phí DV-TN, số chuyển túi.
- Canvas: cạnh aggregate nét đứt + **label điều kiện trên node Σ** — xem **[FIX-10](./FIX-10-canvas-aggregate-filter-label.md)** (bắt buộc; không chỉ tooltip).

### 5. Kỳ vọng số (seed DHN)

`so_luong=10`, `gia_nt=100000`, `tl_ck=5`, `thue_suat=10` → `thue_nt=95000`.

| `phi_dvtn_yn` | `t_thue_nt` | `t_thue_dvtn_nt` |
|--------------|------------|-----------------|
| `false` / 0  | 95000      | **0**           |
| `true` / 1   | **0**      | 95000           |

Tương tự `t_tien_hang_nt` vs `t_tien_bvmt_nt` theo filter `== 0` / `!= 0`.

---

## Test

```js
// GaFormulaMap / ModelBuilder
assert.strictEqual(entry.kind, 'aggregate_filter');
assert.ok(entry.filter.includes('phi_dvtn_yn'));
assert.ok(entry.refs.includes('phi_dvtn_yn'));
assert.ok(!entry.plain_vi.includes('[phi_dvtn_yn]')); // đã Việt hóa

// Eval (extract evaluateFilter hoặc smoke builder+hook logic)
// phi false → t_thue_dvtn_nt === 0, t_thue_nt === thue_nt
// phi true  → t_thue_dvtn_nt === thue_nt, t_thue_nt === 0
```

`npm run build:formula-preview` + `npm run test:formula-preview`.

---

## Done

- [ ] Tick Phí DV-TN trên sân chơi: thuế master chuyển từ `t_thue_*` sang `t_thue_dvtn_*`
- [ ] Từ điển / nhóm có `t_thue_dvtn_nt` với câu tiếng Việt có “tick Phí DV-TN”
- [ ] Không còn luôn copy `thue_nt` vào cả hai master

## Không làm

- Không SUM nhiều dòng thật (vẫn 1 dòng demo)
- Không bắt buộc mô phỏng filter `[loai]=="90"` nếu playground không có ô `loai` — vẫn parse + plain_vi; eval: thiếu field → điều kiện false → master 0
