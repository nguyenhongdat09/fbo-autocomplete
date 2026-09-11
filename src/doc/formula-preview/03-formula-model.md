# 03 — FormulaModel Schema

`FormulaModel` là JSON ổn định giữa **parser (extension host)** và **webview React**. Đổi schema → cập nhật file này + tests + `media/src` (hook evaluator / components).

`version` hiện tại: **1**. Webview nhận version khác → banner “FormulaModel version không hỗ trợ”.

---

## Top-level

```ts
type FormulaModel = {
  version: 1;
  source_path: string;
  file_name: string;
  generated_at: string; // ISO
  companion_dir_path: string | null;

  warnings: Warning[];

  fields: Record<string, FieldInfo>;   // grid + master (ty_gia, t_*)
  entries: FormulaEntry[];             // thứ tự khai báo trong g.$a
  scenarios: Scenario[];
  groups: GroupId[];                   // thứ tự vẽ luồng
  playground: PlaygroundSeed;
};
```

```ts
type Warning = {
  code:
    | 'NO_GA_BLOCK'
    | 'MISSING_ENTITY'
    | 'PARSE_SOFT'
    | 'UNRESOLVED_ALIAS'
    | 'UNRESOLVED_CONCAT'
    | 'NO_COMPANION_DIR'
    | 'EXPR_PARSE_FAIL'
    | 'NO_ONCHANGE'
    | 'NOT_GRID_FILE';
  message: string;
  detail?: string;
};
```

```ts
type GroupId =
  | 'qty_price'
  | 'amount'
  | 'discount'
  | 'tax'
  | 'fee'
  | 'master'
  | 'other';
```

---

## FieldInfo

```ts
type FieldInfo = {
  name: string;
  header_v: string;
  header_e: string;
  source: 'grid' | 'master';
  type: 'decimal' | 'boolean' | 'string' | 'unknown';
  hidden: boolean;
  read_only: boolean;
  group: GroupId;
};

/** display_label(f) = f.header_v || f.header_e || f.name */
```

`$ty_gia` trong expression map vào field name `ty_gia` (`source: 'master'`).

---

## FormulaEntry

```ts
type FormulaEntry = {
  alias: string;
  kind: 'formula' | 'aggregate' | 'aggregate_filter' | 'unknown';
  raw: string;                 // value đã unescape, không quote ngoài
  target?: string;             // cột/field bị ghi
  formula?: string;            // bên phải :=
  ast?: ExprNode | null;
  plain_vi: string;            // câu người đọc — bắt buộc, kể cả unknown (khi đó = raw)
  refs: string[];              // field đọc (không gồm target trừ khi tự đọc)
  master?: string;             // aggregate
  grid_col?: string;
  filter?: string;
  filter_plain_vi?: string;
  alias_of?: string;           // AmountFormula → tien2
  group: GroupId;
};
```

### ExprNode

```ts
type ExprNode =
  | { type: 'number'; value: number }
  | { type: 'field'; name: string }          // so_luong; ty_gia (đã bỏ $)
  | { type: 'unary'; op: '-'; arg: ExprNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode }
  | { type: 'cmp'; op: '==' | '!=' | '>' | '<' | '>=' | '<='; left: ExprNode; right: ExprNode }
  | { type: 'ternary'; cond: ExprNode; then: ExprNode; else: ExprNode };
```

Không nhúng HTML trong `plain_vi`. Dùng nhãn field, không dùng tên kỹ thuật trừ khi thiếu header.

Ví dụ:

- `'[tien_nt2]:=[so_luong]*[gia_nt]'` → `Tiền hàng nt = Số lượng × Giá nt`
- `'[tien2]:=[tien_nt2]*[$ty_gia]'` → `Tiền = Tiền hàng nt × Tỷ giá`
- `'[ck_nt]:=[tien_nt2]*[tl_ck]/100'` → `Chiết khấu nt = Tiền hàng nt × Tỷ lệ chiết khấu (%) / 100`
- `'[tien_mthang_nt]:=([phi_dvtn_yn] == 0 ? [tien_nt2] : 0)'` → `Nếu không tick Phí DV-TN thì lấy Tiền hàng nt, không thì 0`
- Aggregate `['t_ck_nt','ck_nt']` → `Cộng dồn Chiết khấu nt trên lưới thành Tiền chiết khấu trên phiếu`
- Filter `loai == "90"` → `chỉ cộng các dòng loại 90`

---

## Scenario

```ts
type Scenario = {
  id: string;                  // field name, vd 'so_luong'
  trigger_field: string;
  title_vi: string;            // 'Khi sửa Số lượng'
  formula_aliases: string[];   // thứ tự executeExpression
  aggregate_aliases: string[];
  master_aliases: string[];
  extra_js: boolean;
  extra_js_note?: string;
};
```

Kịch bản mặc định playground: ưu tiên `so_luong`, không có thì `gia_nt`, không có thì scenario đầu.

---

## PlaygroundSeed

Giá trị mẫu để BA thấy số “ra tiền” ngay khi mở. Không đọc DB.

```ts
type PlaygroundSeed = {
  default_scenario_id: string;
  values: Record<string, number | boolean>;
};
```

Seed DHN (và grid thiếu key thì bỏ qua):

```
so_luong: 10
gia_nt: 100000
gia: 100000
ty_gia: 1
tl_ck: 5
thue_suat: 10
phi_dvtn_yn: false
ty_le: 0
tienmt_nt: 0
```

Các field computed **không** seed — evaluator ghi đè.

---

## Evaluator (webview, không phải host)

Input: `values` hiện tại + `scenario` active + `entries`.

1. Copy `values`.
2. Với mỗi `alias` trong `scenario.formula_aliases` (bỏ unknown / không có AST): `values[target] = eval(ast, values)` (chia 0 → 0).
3. Mỗi aggregate: `values[master] = values[grid_col]` (1 dòng; filter: MVP gán như không filter + ghi chú UI nếu `kind === 'aggregate_filter'`).
4. Mỗi master formula: eval như bước 2.
5. Trả `{ values, last_written: string[] }` để UI pulse.

**Cấm** chạy toàn bộ `entries` một lượt.

---

## Ví dụ rút gọn

Xem [examples/dhn-formula-model.snippet.json](./examples/dhn-formula-model.snippet.json). Đây **không** phải output auto — dùng đối chiếu test.
