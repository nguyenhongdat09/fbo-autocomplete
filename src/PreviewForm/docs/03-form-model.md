# 03 — FormModel Schema

`FormModel` là JSON ổn định giữa **parser (Node/extension host)** và **Preact webview**. Mọi thay đổi schema phải cập nhật file này + tests + UI.

---

## Top-level

```ts
type FormModel = {
  version: 1;
  source_path: string;
  file_name: string;
  generated_at: string; // ISO

  warnings: Warning[];
  fields: Record<string, FieldDef>;
  view: ViewDef;
};
```

```ts
type Warning = {
  code:
    | 'PATTERN_COLUMN_MISMATCH'
    | 'CATEGORY_WIDTH_MISMATCH'
    | 'MISSING_FIELD'
    | 'UNMAPPED_CATEGORY_INDEX'
    | 'MISSING_ENTITY'
    | 'PARSE_SOFT'
    | 'NO_VIEW_DIR'
    | 'NOT_DIR_FILE';
  message: string;
  detail?: string;
};
```

---

## FieldDef

```ts
type FieldKind = 'input' | 'dropdown' | 'checkbox' | 'date' | 'grid';

type FieldDef = {
  name: string;
  kind: FieldKind;
  category_index: string | null; // null = general; "-1" = footer; else tab key
  read_only: boolean;
  disabled: boolean;            // true khi field có disabled="true" trong XML
  header_v: string;
  header_e: string;
  /** Từ <label v="..."> node — dùng khi header_v rỗng (thường gặp ở Grid field) */
  label_v: string;
  label_e: string;
  footer_v: string;
  footer_e: string;
  /** dropdown only */
  options?: Array<{ value: string; label_v: string; label_e: string }>;
  /** grid only */
  grid_controller?: string;
  grid_placeholder: string; // always `${name}_Grid` khi kind=grid; "" nếu không
};

/**
 * Hàm helper derive display text (parser hoặc UI gọi):
 *   display_label(f) = f.header_v || f.label_v || f.header_e || f.label_e || f.name
 */
```

---

## ViewDef

```ts
type ViewDef = {
  id: 'Dir';
  height: number;       // px — chiều cao vùng tab
  anchor: number | null;
  split: number | null;
  master_columns: number[]; // px widths từ item đầu
  master_total_px: number;

  /** Tabs theo thứ tự khai báo, KHÔNG gồm index -1 */
  categories: CategoryDef[];

  /** Footer category metadata nếu có index=-1 */
  footer_category: CategoryDef | null;

  rows_general: ViewRow[];
  rows_by_category: Record<string, ViewRow[]>; // key = category.index string, gồm "-1"
};
```

```ts
type CategoryDef = {
  index: string;          // "1", "2", "-1", ...
  header_v: string;
  header_e: string;
  columns: number[];      // px; nếu XML chỉ 1 số (809) → [809]
  columns_total_px: number;
  anchor: number | null;
  split: number | null;
  declaration_order: number; // 0-based trong <categories> (kể cả -1)
};
```

---

## ViewRow / cells

```ts
type ViewRow = {
  pattern: string;
  columns_ref: 'master' | string; // 'master' | category index used for widths
  column_widths: number[];        // resolved px array dùng để render
  cells: LayoutCell[];            // length === pattern.length
  raw_item_value: string;         // debug
};

type LayoutCell =
  | { type: 'empty' }                                    // pattern '-'
  | { type: 'span' }                                     // pattern '0' — continuation / stretch
  | { type: 'slot'; slot: SlotRef; col_span: number };   // pattern '1' (+ trailing 0s gộp span)

type SlotRef =
  | { role: 'label'; field: string }
  | { role: 'description'; field: string }
  | { role: 'control'; field: string }
  | { role: 'lookup_name'; field: string }; // từ [field%l]
```

### Quy tắc tính `col_span`

Khi gặp `1` tại vị trí `i`:

- `col_span = 1 + số lượng ký tự `0` liên tiếp ngay sau `i`.
- Các ô `0` đó trong mảng `cells` thành `{ type: 'span' }` (không render control riêng).
- Ký tự `-` → `{ type: 'empty' }`.

Ví dụ pattern `11000--1`:

| index | char | cell |
|-------|------|------|
| 0 | 1 | slot (span 1) — nếu không có 0 sau |
| 1 | 1 | slot + span qua các 0 ở 2,3,4 → col_span=4 |
| 2–4 | 0 | span |
| 5–6 | - | empty |
| 7 | 1 | slot |

(Implementer: gắn span vào **ô `1`**, các `0` đánh dấu span để CSS `grid-column: span N`.)

---

## Helper derived (UI có thể tính lại)

Không bắt buộc trong JSON, nhưng panel có thể derive:

```ts
type DerivedLayout = {
  tabs: Array<{
    index: string;
    title: string;
    rows: ViewRow[];
    column_widths: number[];
  }>; // categories.filter(c => c.index !== '-1') theo declaration_order
  footer_rows: ViewRow[];
};
```

---

## Ví dụ tối thiểu

Xem [examples/tntran-form-model.snippet.json](./examples/tntran-form-model.snippet.json).

### Kỳ vọng vài field TNTran

| name | kind | category_index |
|------|------|----------------|
| `status` | dropdown | null (general) |
| `zcdtndgsc` | grid | `"2"` |
| `k_dong_y_yn` | checkbox | `"15"` |
| `t_so_luong` | input (Decimal→input) | `"-1"` |

---

## Versioning

- `version: 1` cố định cho MVP.
- Webview nếu nhận version khác → hiện “FormModel version không hỗ trợ”.
