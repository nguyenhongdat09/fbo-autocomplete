# FIX-09 — Ô **Điều kiện lọc MultiGrid** → `@queryWhereClause`

## Mức: Low–Medium (UI + MultiGrid template)

## Vấn đề

Fixture `YCNDXAMultiGrid.xml` ~dòng 136:

```sql
select @queryWhereClause = ' m.ma_dvcs = ''' + replace(rtrim(@ma_dvcs), '''', '''''') + ''' and  m.status in (''2'')  and a.sl_ycn < a.so_luong  and trang_thai_giao_hang in (''5'')  '
```

FIX-04 chỉ derive `m.status` từ `finding_status_list`, **không** cho user nhập phần điều kiện nghiệp vụ thêm (vd. `trang_thai_giao_hang in ('5')`). User muốn **một ô input** trên wizard để gõ phần đó.

## Quyết định

### 1. FormInput + UI

| Field | Label UI | Default |
|-------|----------|---------|
| `multigrid_filter_extra` | **Điều kiện lọc MultiGrid** | YCNDXA: `and trang_thai_giao_hang in ('5')` · zcWIMO: `''` (rỗng) hoặc điều kiện còn lại nếu có |

- Đặt ở **mục 5** (cùng khu lọc), dưới `finding_status_list`.
- Input **full-width** textarea hoặc text dài; placeholder:

```
and trang_thai_giao_hang in ('5')
```

- User gõ SQL **thường** (một dấu nháy `'`) — generator escape thành `''` khi nhúng vào chuỗi `@queryWhereClause`.

### 2. Cách ghép `@queryWhereClause` (đã chốt)

**Không** bắt user viết cả dòng. Generator ghép cố định + status + SL còn + ô user:

```text
 m.ma_dvcs = ''' + replace(rtrim(@ma_dvcs), '''', '''''') + '''
 and m.status in (''{status_from_finding_status_list}'')
 and a.{src_taken_col} < a.{src_qty_col}
 {multigrid_filter_extra_escaped}
```

**Ví dụ** `finding_status_list = 2`, `src_taken=sl_ycn`, `src_qty=so_luong`, extra = `and trang_thai_giao_hang in ('5')`:

```sql
select @queryWhereClause = ' m.ma_dvcs = ''' + replace(rtrim(@ma_dvcs), '''', '''''') + ''' and m.status in (''2'') and a.sl_ycn < a.so_luong and trang_thai_giao_hang in (''5'') '
```

Khớp fixture dòng 136.

### 3. Sửa FIX-04 / derive

| Field | Ai tạo |
|-------|--------|
| `finding_status_list` | User — Lookup Finding arg + `m.status in (...)` trong MultiGrid |
| `multigrid_filter_extra` | User — **chỉ** đoạn AND thêm |
| ~~`multigrid_where_extra` gộp status+extra~~ | Tách rõ: derive status riêng; **không** ghi đè / nuốt ô user |

Trong `deriveFormInput.js`:

```js
// KHÔNG: out.multigrid_where_extra = out.multigrid_where_extra || deriveMultigridWhereExtra(...)
out.multigrid_status_clause = deriveMultigridStatusClause(statusList); // " and m.status in (''2'')"
out.multigrid_filter_extra_sql = escapeSqlStringLiteral(out.multigrid_filter_extra || '');
```

Template MultiGrid Finding (partitioned / single) dùng đủ 3 phần + `ma_dvcs` như fixture (không chỉ `' a.taken < a.qty' + extra`).

### 4. Escape

```js
function escapeSqlStringLiteral(s) {
  return String(s).replace(/'/g, "''");
}
```

User nhập `in ('5')` → trong XML/`@queryWhereClause` thành `in (''5'')`.

### 5. Preset

```js
// YCNDXA
multigrid_filter_extra: "and trang_thai_giao_hang in ('5')"

// zcWIMO — thường đã đủ status + SL; để rỗng trừ khi cần thêm
multigrid_filter_extra: ""
```

---

## Việc phải làm

1. `preview.html` + `retrieveFlow.js`: ô **Điều kiện lọc MultiGrid** (`#multigrid_filter_extra`).
2. `Presets.js`: default YCNDXA như trên.
3. `deriveFormInput.js`: tách status clause vs filter extra; escape extra.
4. `partitioned/MultiGrid.xml.tpl` + `single/MultiGrid.xml.tpl`: `@queryWhereClause` đủ `ma_dvcs` + status + qty + `{{multigrid_filter_extra_sql}}`.
5. Spec `02` / `03` / `05`; test assert YCNDXA MultiGrid chứa `trang_thai_giao_hang in (''5'')` và `m.status in (''2'')`.

## Done

- [ ] Mục 5 có ô **Điều kiện lọc MultiGrid**.
- [ ] Load YCNDXA → ô = `and trang_thai_giao_hang in ('5')`.
- [ ] Preview MultiGrid `@queryWhereClause` khớp pattern fixture (ma_dvcs + status + sl_ycn + trang_thai).
- [ ] Sửa / xóa ô extra → preview đổi; status vẫn theo `finding_status_list`.
- [ ] Test pass.

## Không làm

- Không gộp lại thành 1 field status+extra (dễ lệch Lookup vs MultiGrid).
- Không bắt user escape `''` tay trên form.
- Không đưa `ma_dvcs` / so sánh SL vào ô extra (luôn generate cố định).
