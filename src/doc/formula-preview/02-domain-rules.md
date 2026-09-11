# 02 — Domain rules: công thức Grid FBO

Agent **không được bịa** quy tắc tiền. File này là nguồn sự thật. Chi tiết tiền tệ: skill `fbo_js_skill` / `js-currency-amount.md` + `js-grid-expression.md`.

---

## 1. `g.$a` là gì

Object gắn trên **grid behavior** trong `load$Grid...`:

```javascript
g.$a = {
  tien_nt2_sl: '[tien_nt2]:=[so_luong]*[gia_nt]',           // expression cùng dòng
  t_ck_nt: ['t_ck_nt', 'ck_nt'],                             // aggregate: SUM cột → field master
  t_tien_giam_nt: ['t_tien_giam_nt', '[tien_nt2]', '[loai] == "90"']  // aggregate có lọc
};
```

| Kind | Cú pháp value | Runtime FBO |
|------|----------------|-------------|
| `formula` | `'[target]:=expr'` | `g.executeExpression` / `validExpression` arg 2 |
| `aggregate` | `['masterField', 'gridCol']` | `executeAggregate` / arg 3 `validExpression` |
| `aggregate_filter` | `['masterField', 'gridCol' hoặc '[gridCol]', 'filterExpr']` | SUM các dòng thỏa filter |
| `unknown` | khác | Hiện raw, không chạy playground |

**Alias** (key bên trái, vd `tien_nt2_sl`) ≠ **target** (cột bị ghi, vd `tien_nt2`). Nhiều alias ghi cùng target.

Entity có thể **xen giữa** object (DHN):

```javascript
g.$a = {
  tienmt_ty_le: '[tienmt]:=[tien2]',
  ]]>&VoucherGoodsTypeFomulaGrid;<![CDATA[
  t_tien_hang_nt: ['t_tien_hang_nt', 'tien_mthang_nt'],
```

Parser **bắt buộc flatten entity trước** (`extractGaDeclaration`). Không parse `g.$a` trên XML thô nếu còn `&Entity;`.

---

## 2. Nguyên tệ / hạch toán / tỷ giá

| Hậu tố | Ý nghĩa UI | Ví dụ |
|--------|------------|--------|
| `*_nt` / `*_nt2` | Nguyên tệ (theo `ma_nt` phiếu) | `gia_nt`, `tien_nt2`, `ck_nt`, `thue_nt` |
| không `_nt` | Hạch toán (× tỷ giá, hoặc nhập khi ngoại tệ) | `gia`, `tien2`, `ck`, `thue` |
| `[$ty_gia]` | Tỷ giá **master** (không phải cột grid) | `[tien2]:=[tien_nt2]*[$ty_gia]` |

**Anti-pattern tên gọi (cấm trong UI tiếng Việt):** gọi `tien2` là “nguyên tệ”.

**Path chuẩn (kịch bản mặc định playground):**

```
so_luong, gia_nt  →  tien_nt2  →  tien2 (= × ty_gia)
                      ↓
                   ck_nt → ck
                      ↓
                   thue_nt → thue   (thuế = (tiền − CK) × thuế suất / 100)
                      ↓
                   aggregate t_*  →  master t_tt / t_tt_nt
```

Nhánh **sửa Giá (hạch toán)** dùng `tien2_sl`: `[tien2]:=[so_luong]*[gia]` — **không** trộn với path NT trong cùng một lần chạy playground.

---

## 3. Grammar expression (bên phải `:=`)

Tập con JS FBO thật dùng trong chuỗi:

```
expr     := ternary | or-cmp
ternary  := or-cmp '?' expr ':' expr
or-cmp   := add ( ('=='|'!='|'>='|'<='|'>'|'<') add )?
add      := mul (('+'|'-') mul)*
mul      := unary (('*'|'/') unary)*
unary    := '-' unary | primary
primary  := number | field | '(' expr ')'
field    := '[' '$'? IDENT ']'
number   := digits ('.' digits)?
IDENT    := [A-Za-z_][A-Za-z0-9_]*
```

Ví dụ DHN bắt buộc parse được:

| Chuỗi | Ý nghĩa |
|-------|---------|
| `[so_luong]*[gia_nt]` | nhân |
| `[tien_nt2]*[$ty_gia]` | × tỷ giá master |
| `[tien_nt2]*[tl_ck]/100` | % |
| `([tien_nt2] - [ck_nt])*[thue_suat]/100` | thuế sau CK |
| `([phi_dvtn_yn] == 0 ? [tien_nt2] : 0)` | nếu không phải phí DV-TN thì lấy tiền hàng |
| `([gia_nt] == 0 ? ([so_luong] != 0 ? ([tien_nt2]/[so_luong]) : 0) : [gia_nt])` | suy giá khi giá đang 0 |

Không hỗ trợ MVP: gọi hàm (`Math.round`), `&&` / `||` phức tạp, string compare ngoài `==`/`!=` với số hoặc chuỗi `"90"` trong filter aggregate.

**Chia 0:** nếu mẫu số = 0 → kết quả 0 (không NaN, không crash).

---

## 4. `onChange` quyết định chuỗi chạy

Khai báo `g.$a` **không** chạy hết. Ví dụ DHN:

```javascript
case 'so_luong':
  g.validExpression(o, [g.$a.tien_nt2_sl, g.$a.tien2, g.$a.ck_nt, g.$a.ck_tl, g.$a.thue_nt, g.$a.thue_tl].concat(row_phi), agg, master, 'tien_nt2');
```

`row_phi` = `[tien_mthang_nt, tien_mthang, tienmt, s5, thue_dvtn_nt, thue_dvtn]`.

`agg` / `master` = list aggregate + formula master (`t_thue_nt_net`, `t_tt`, …).

Parser scenario:

1. Bắt `function onChange$...$(` rồi `switch (name)`.
2. Mỗi `case 'field':` … đến `break;` — thu mọi `g.$a.ALIAS`.
3. `.concat(row_phi)` / `concat(getRowPhi$...(g))`: **resolve** nếu tìm được hàm `getRowPhi$...` `return [g.$a.a, g.$a.b, ...]`. Không resolve được → warning + giữ tên `row_phi`.
4. Bỏ qua thân JS khác (`calcGiaDvtn$...`) — ghi `extra_js: true` trên scenario.

Playground khi user sửa ô `so_luong`: chạy **đúng list formula theo thứ tự**, rồi aggregate, rồi master formulas.

---

## 5. Master formulas vs aggregate

Sau khi SUM:

```javascript
t_thue_nt_net: '[t_thue_nt]:=[t_thue_nt]-[t_thue_dvtn_nt]',
t_tien_nt2: '[t_tien_nt2]:=[t_tien_hang_nt]+[t_tien_bvmt_nt]',
t_tt_nt: '[t_tt_nt]:=[t_tien_nt2]-[t_ck_nt]+[t_thue_nt]+[t_thue_dvtn_nt]'
```

Đây là `formula` nhưng field nằm **Dir (master)**. Playground 1 dòng: aggregate = chính giá trị cột dòng đó (SUM 1 phần tử).

---

## 6. Nhóm hiển thị (heuristic, không đổi XML)

Dùng để vẽ luồng (05). Thứ tự nhóm:

1. `qty_price` — `so_luong`, `gia_nt`, `gia`
2. `amount` — `tien_nt2`, `tien2`
3. `discount` — `tl_ck`, `ck_nt`, `ck`
4. `tax` — `thue_suat`, `thue_nt`, `thue`
5. `fee` — `phi_*_yn`, `tienmt*`, `tien_mthang*`, `s5`, `thue_dvtn*`
6. `master` — `t_*`, `[$ty_gia]` / `ty_gia`
7. `other` — còn lại

Field `hidden="true"`: mặc định không hiện trên sân chơi; vẫn tính; toggle “Hiện cột ẩn”.

Boolean (`type="Boolean"` hoặc `items CheckBox`): playground là checkbox; `!= 0` / `== 0` diễn giải *được tick* / *không tick*.

---

## 7. `AmountFormula`

Thường gán runtime: `t.$a.AmountFormula=t.$a.&AmountFormula;` → alias thật `tien2` hoặc `tien2_sl` (entity `ValidFormula.ent`).

Nếu `g.$a.AmountFormula` xuất hiện trong scenario nhưng không có key trong map: tìm trong flat XML pattern `AmountFormula=t.$a.IDENT` hoặc entity đã flatten thành tên alias; gắn `alias_of`. Không tìm được → skip + warning `UNRESOLVED_ALIAS`.

---

## 8. Companion Dir

Từ `.../Grid/DHNDetail.xml` → thử `.../Dir/DHNTran.xml` (đổi `Detail` → `Tran`, folder `Grid` → `Dir`).

Nếu có: flatten, lấy `header` của `ty_gia`, `t_tt`, `t_tien_hang`, …  
Nếu không: vẫn chạy, nhãn = tên field.

Không bắt buộc đọc đúng mọi project layout (có file `*Grid.xml` không phải Detail) — best-effort, warning `NO_COMPANION_DIR`.
