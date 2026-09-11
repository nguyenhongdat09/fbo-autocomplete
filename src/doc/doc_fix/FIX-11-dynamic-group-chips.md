# FIX-11 — Chip nhóm / filter canvas đang hard “Thuế · Phí · CK” (không theo Grid)

## Mức: High (tính tổng quát — user hỏi Grid khác không có thuế/phí)

## Hiện tượng

Hàng nút lọc trên sơ đồ luôn hiện cố định:

`Tất cả | Tiền & Giá | Chiết khấu | Thuế | Phí | Tổng Master`

Dù Grid **không** có công thức thuế/phí, nút vẫn còn; bấm vào có thể trống / vô nghĩa.

Grid tên field khác FBO chuẩn (`ps_no`, `du_co`, `chenh_lech`, …) bị đẩy hết vào `other` — **không có chip** tương ứng, trong khi vẫn hiện chip “Thuế/Phí” rỗng.

---

## Chỗ hard trong code (phải sửa)

| File | Vấn đề |
|------|--------|
| `FormulaFlowCanvas.jsx` ~264–270 | Mảng chip **cố định** label Tiền/CK/Thuế/Phí |
| `GroupTab.jsx` `groupTitles` | Nhãn section hard (OK giữ map); `model.groups` fallback luôn đủ 7 nhóm |
| `FormulaModelBuilder.js` | `groups: ['qty_price','amount','discount','tax','fee','master','other']` luôn đủ list |
| `FieldCatalogParser.classifyGroup` | Heuristic theo substring `thue`/`ck`/`phi`… — chấp nhận làm **gợi ý**, không được quyết định chip UI khi nhóm trống |
| `PlaygroundHero.jsx` thanh tổng | Label/ô hard kiểu DHN (`Tiền BVMT`, `Thuế DVTN`) — cùng đợt làm **động theo `t_*` có trong values/entries** |

---

## Rule (bắt buộc)

### 1. Chip canvas = chỉ nhóm **có ≥ 1 entry** trong `model.entries`

```
chips = ['all'] + model.groups.filter(g => entries.some(e => e.group === g))
```

- Không entry `tax` → **không** nút “Thuế”.
- Không entry `fee` → **không** nút “Phí”.
- Có nhiều entry `other` → **có** nút “Khác” (hoặc nhãn từ `groupTitles.other`).

Nhãn chip lấy từ map dùng chung (export 1 chỗ: `GROUP_LABELS`), không copy paste 2 file.

Gộp UI như hiện tại `amount_qty` = `amount` ∪ `qty_price` **chỉ khi** ít nhất một trong hai có entry.

### 2. `model.groups` = unique group xuất hiện trong entries, giữ thứ tự domain

Thứ tự ưu tiên (bỏ qua key không có entry):

`qty_price → amount → discount → tax → fee → master → other`

**Cấm** luôn return đủ 7 id dù Grid trống nhóm đó.

### 3. `classifyGroup` giữ heuristic FBO + fallback `other`

- Không bắt buộc học hết mọi tên tiền lạ trong MVP.
- Field lạ → `other` → chip “Khác” (miễn là có entry).
- Không vì “chuẩn chứng từ bán hàng” mà ép hiện Thuế/Phí.

### 4. Thanh tổng Hero — không hard tên DHN

Hiện các `t_*` có trong `values` (hoặc master từ aggregate/formula), nhãn = `fields[name].header_v` (fallback `name`).

Ưu tiên nổi `t_tt` / `t_tt_nt` nếu có.  
**Cấm** hardcode chuỗi “Tiền BVMT nt” / “Thuế DVTN nt” — chỉ hiện khi field đó thật sự có trong model.

---

## Việc phải làm (checklist code)

1. Tách `GROUP_LABELS` / helper `groupsPresentInEntries(entries)` dùng chung Canvas + GroupTab + builder.
2. `FormulaModelBuilder`: gán `model.groups` theo rule §2.
3. `FormulaFlowCanvas`: render chip từ `model.groups` (+ `all`), không mảng hard Thuế/Phí.
4. `GroupTab`: dùng cùng `GROUP_LABELS`; đã ẩn section rỗng — giữ; bỏ fallback list 7 nhóm cứng nếu builder đã đúng.
5. `PlaygroundHero` master bar: duyệt động `t_*` (hoặc list master từ entries), không if riêng DHN trừ khi cần demo tạm — ưu tiên động hết.
6. Smoke test nhỏ (optional): fixture **không** `thue`/`phi` → `model.groups` không chứa `tax`/`fee`; UI không render 2 chip đó.

---

## Done

- [ ] Mở Grid kiểu DHN: vẫn có chip Tiền/CK/Thuế/Phí/Master như hiện tại (vì có entry).
- [ ] Mở / fixture Grid **chỉ** tiền + tổng, **không** thuế/phí: **không** còn nút Thuế / Phí.
- [ ] Entry group `other` → có chip/section “Khác”.
- [ ] Thanh tổng: nhãn lấy header field, không chữ hard BVMT/DVTN.
- [ ] `npm run build:formula-preview` (+ test nếu có case mới).

---

## Không làm

- Không bỏ hẳn heuristic `classifyGroup` (vẫn hữu ích cho Grid FBO chuẩn).
- Không yêu cầu user cấu hình nhóm trong XML.
- Không đổi parser `g.$a` / aggregate filter (FIX-09/10).
