# 04 — Parser Spec: Grid XML → FormulaModel

## Mục tiêu

Từ đường dẫn file + text XML (ưu tiên buffer editor) → `FormulaModel` version 1. Không crash extension; lỗi soft → `warnings`.

---

## Pipeline

```
raw_xml
  ├─ expandXmlEntities(file, raw)           → flat_xml, entity warnings
  ├─ extractGaDeclaration(file, raw)        → ga_block (đã flat entity trong g.$a)
  ├─ buildFormulaMap(ga_block)              → Map alias → entry thô (mở rộng)
  ├─ FormulaAstParser.parse(entry)          → ast + plain_vi + refs
  ├─ FieldCatalogParser.parse(flat_xml)     → fields grid
  ├─ resolveCompanionDir(file)              → merge fields master
  ├─ ScenarioParser.parse(flat_xml or raw script) → scenarios
  └─ FormulaModelBuilder.build(...)         → FormulaModel
```

Ưu tiên đọc buffer `vscode.workspace.textDocuments` (giống XmlFlatPreview).

---

## 1. Mở rộng `GaFormulaMapBuilder`

File hiện tại: `src/ReadXMLByJS/FormulaHover/GaFormulaMapBuilder.js`.

**Giữ** API `buildFormulaMap(gaBlockFlat) → Map`.

**Bổ sung** khi `value` là mảng `[...]` (sau `splitByTopLevelComma`):

| Số phần tử | kind | Fields |
|------------|------|--------|
| 2 | `aggregate` | `master = strip(p0)`, `grid_col = stripBrackets(p1)` |
| 3 | `aggregate_filter` | + `filter = unescape(p2)` |
| khác | `unknown` | |

`stripBrackets`: bỏ `[` `]` và quote quanh phần tử.

Formula string: giữ logic `'[target]:=...'` → `kind: 'formula'`, `target`, `formula`.

Export thêm (cùng file hoặc `FormulaAstParser.js`):

- `parseExpression(formula: string) → ExprNode`
- `toPlainVi(ast, fieldLookup) → string`
- `collectRefs(ast) → string[]`

Không đổi hành vi Hover: Hover vẫn `appendCodeblock(entry.display)`. Có thể cải thiện Hover sau (ngoài MVP) bằng `plain_vi`.

---

## 2. FormulaAstParser

### Lexer

Token: `NUMBER`, `FIELD` (`[name]` / `[$name]`), `OP` (`+ - * / == != >= <= > < ? :`), `LPAREN` `RPAREN`, EOF.

Bỏ whitespace. Field name: bỏ `$` khi đưa vào AST (`[$ty_gia]` → `{type:'field', name:'ty_gia'}`).

### Parser

Recursive descent theo grammar [02-domain-rules.md](./02-domain-rules.md) §3. Precedence: `?:` thấp nhất, rồi so sánh, rồi `+ -`, rồi `* /`, rồi unary `-`.

Lỗi → trả `null` + caller set `EXPR_PARSE_FAIL`.

### `toPlainVi`

| Node | Mẫu |
|------|-----|
| field | `display_label(name)` |
| number | chuỗi số có phân tách nghìn nếu ≥ 1000 |
| binary `*` | `{L} × {R}` |
| binary `/` | `{L} / {R}` |
| binary `+` `-` | `{L} + {R}` / `{L} − {R}` |
| cmp `== 0` với boolean field | `không tick {label}` |
| cmp `!= 0` với boolean | `tick {label}` |
| cmp khác | `{L} {op_vi} {R}` (`bằng`, `khác`, …) |
| ternary | `Nếu {cond} thì {then}, không thì {else}` |

Bọc ngoặc chỉ khi cần (precedence). Entry formula: `plain_vi = "{label_target} = {plain_expr}"`.

---

## 3. FieldCatalogParser

Input: `flat_xml`.

1. Cắt vùng `<fields>...</fields>` đầu tiên của grid (không lấy nested nếu có — Grid chuẩn 1 khối).
2. Regex / fast-xml-parser từng `<field ...>...</field>`:
   - `name`, `type`, `hidden`, `readOnly`
   - `header/@v`, `header/@e`
   - Boolean nếu `type="Boolean"` hoặc `items style="CheckBox"`
3. `group` theo heuristic §6 domain.
4. Bỏ field không có `name`.

Không loại hidden khỏi catalog — chỉ flag `hidden`.

---

## 4. Companion Dir

```
Grid/DHNDetail.xml  →  Dir/DHNTran.xml
Grid/ARDetail.xml   →  Dir/ARTran.xml
```

Rule: cùng thư mục cha `Controllers`, đổi folder `Grid`→`Dir`, tên file thay `Detail`→`Tran` (case-insensitive). Nếu không tồn tại → `companion_dir_path=null`, warning.

Parse field master: `ty_gia`, mọi `t_*` xuất hiện trong entries (master / target). Merge vào `fields` với `source:'master'`. Không ghi đè grid cùng tên trừ khi grid không có.

---

## 5. ScenarioParser

Tìm trong flat text (sau CDATA merge):

1. Regex `function\s+onChange\$[\w$]*\$?\s*\(` — lấy function body bằng brace-match (giống extractGaBlock).
2. Trong body, tìm `switch\s*\(\s*name\s*\)` — brace-match block.
3. Split `case\s+'([^']+)'\s*:` … đến `break;`.
4. Trong mỗi case:
   - Mọi `g\.\$a\.([A-Za-z_][\w]*)` theo thứ tự xuất hiện → tạm list.
   - Phân loại: nếu alias kind formula → `formula_aliases`; aggregate* → `aggregate_aliases`; master formulas (`target` bắt đầu `t_` hoặc field source master) → có thể nằm formula_aliases (đúng thứ tự FBO: thường `validExpression` arg2 = row, arg3 = agg, arg4 = master).

**Phân tách agg/master khi parse call:**

```javascript
g.validExpression(o, [ ... formulas ... ], agg, master, ...)
g.executeExpression(o, [ ... ])
g.executeAggregate([ ... ])
```

- Arg2 array → formulas (và có thể chứa alias aggregate nếu code lạ — phân loại theo kind map).
- Arg3 nếu là `getAggregate$...()` hoặc biến `agg` → resolve return list.
- Arg4 `getMaster$...()` / `master` → resolve.

Helper resolve:

```javascript
function getAggregate$GridVoucherDetail$(g) {
  return [g.$a.t_tien_hang_nt, ...];
}
```

Brace-match function + lấy `g.$a.X` trong `return [...]`.

`.concat(row_phi)` / `.concat(getRowPhi$...(g))`: nối list đã resolve vào **cuối** formula_aliases.

`title_vi`: `Khi sửa {display_label(trigger)}`.

`extra_js`: true nếu case còn gọi hàm không phải `validExpression`/`executeExpression`/`executeAggregate` (vd `calcGiaDvtn`).

Không có onChange → `scenarios=[]`, warning `NO_ONCHANGE`; playground vẫn chạy được nếu builder tạo **synthetic scenario** từ heuristic path NT (aliases tồn tại: `tien_nt2_sl`, `tien2`, `ck_nt`, `ck_tl`, `thue_nt`, `thue_tl` + aggregates `t_*` + masters `t_tt*`).

---

## 6. FormulaModelBuilder

1. `entries = [...map.values()]` theo thứ tự xuất hiện trong `ga_block` (Map insertion order).
2. Gắn `ast` / `plain_vi` / `refs` / `group`.
3. `fields` = catalog ∪ master ∪ mọi `refs`/`target` chưa có (stub `header` rỗng, `type:'unknown'`).
4. `scenarios` + chọn `playground.default_scenario_id`.
5. `playground.values` = seed ∩ keys có trong fields.
6. `groups` = unique group theo thứ tự domain.
7. `warnings` gom từ expander + parser.

---

## 7. Unit tests bắt buộc

Pattern: `node src/FormulaPreview/tests/Xxx.test.js`.

| Test | Assert |
|------|--------|
| AST `so_luong*gia_nt` | binary `*` |
| AST ternary `phi_dvtn_yn` | ternary + cmp |
| AST nested gia_nt_sl | ternary lồng |
| plain_vi có label | không còn `[so_luong]` trong plain nếu có header |
| aggregate 2 | kind + master + grid_col |
| aggregate 3 (VoucherGoodsType) | kind aggregate_filter + filter |
| Scenario so_luong (fixture mini) | chứa `tien_nt2_sl`, `tien2` |
| concat getRowPhi | expand đủ 6 alias DHN |
| Model builder | version 1, entries.length > 0 |

Fixture mini: copy rút gọn `g.$a` + `onChange` vào `tests/fixtures/mini-ga-grid.xml` (không cần full DHN trên network share trong CI).

---

## 8. Anti-pattern parser

```
❌ eval / new Function trên cả script Grid
❌ Parse g.$a khi còn &Entity; chưa flat
❌ Chạy mọi formula trong entries cho playground
❌ Coi tien2 là nguyên tệ trong plain_vi
❌ ILIKE / bịa Cypher — không liên quan feature này
```
