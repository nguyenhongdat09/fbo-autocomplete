# FIX-13 — Lookup detail: ô trống → **không** auto-fill `d64$%Partition` / `z3` / remain

## Mức: Low–Medium (derive bug / UX)

## Vấn đề (đúng như screenshot)

Mục 5 — 3 ô Lookup Detail:

| UI | User để |
|----|---------|
| Lookup Detail Table | **trống** (chỉ placeholder `d64$%Partition hoặc ctsx`) |
| Lookup Detail Alias | **trống** (placeholder `z3`) |
| Lookup Detail Remain Expr | **trống** (placeholder `z3.sl_ycn < …`) |

Nhưng Preview **Lookup.xml** vẫn ra:

```sql
'd64$%Partition', 'z3', 'z3.sl_ycn < z3.so_luong'
```

Nguyên nhân: `deriveFormInput.js` (theo FIX-04 / FIX-06) **âm thầm** fill khi rỗng:

```js
out.lookup_detail_alias = out.lookup_detail_alias || 'z3';
out.lookup_detail_table = out.lookup_detail_table || `d${ext}$%Partition`;
out.lookup_detail_remain_expr = out.lookup_detail_remain_expr || `${alias}.${taken} < ${alias}.${qty}`;
```

Placeholder HTML ≠ giá trị form — user để trống thì XML phải trống / `''`, không “đoán giúp”.

---

## Quyết định (đè FIX-04 §5 / FIX-06 alias default)

1. **Không** auto-derive 3 field Lookup Detail khi user để trống.
2. Placeholder chỉ là gợi ý — **không** copy vào FormInput / render.
3. Giá trị generate = đúng những gì user gõ (trim). Rỗng → chuỗi rỗng trong SQL arg.

### Output khi cả 3 ô trống

```sql
… @$primeJoin, @$primeFilter,
  '', '', ''
```

(Giữ đủ 3 arg cuối để template ổn định; không nhét `d64$%Partition` / `z3`.)

### Output khi user tự điền

Ví dụ nhập table `d64$%Partition`, alias `z3`, expr `z3.sl_ycn < z3.so_luong`:

```sql
… 'd64$%Partition', 'z3', 'z3.sl_ycn < z3.so_luong'
```

### Preset

| Preset | `lookup_detail_*` |
|--------|-------------------|
| YCNDXA | **Rỗng** cả 3 (giống UI hiện tại) → Lookup ra `'', '', ''` |
| zcWIMO | Chỉ fill nếu fixture thật cần — hoặc cũng rỗng + user tự nhập; **không** ép derive khi preset để `""` |

Nếu muốn demo zcWIMO đủ 3 arg: preset **ghi rõ** `ctsx` / `z3` / `z3.sl_pxh < z3.so_luong` trong JSON (giá trị thật), không dựa `||` trong derive.

---

## Code phải sửa

### `deriveFormInput.js`

**Xóa** (hoặc comment + không chạy) các dòng:

```js
out.lookup_detail_alias = out.lookup_detail_alias || 'z3';
out.lookup_detail_table = out.lookup_detail_table || …;
out.lookup_detail_remain_expr = out.lookup_detail_remain_expr || …;
```

Giữ:

```js
out.lookup_detail_table = (out.lookup_detail_table || '').trim();
out.lookup_detail_alias = (out.lookup_detail_alias || '').trim();
out.lookup_detail_remain_expr = (out.lookup_detail_remain_expr || '').trim();
```

### Tests

- Load / derive YCNDXA với 3 field `""` → assert Lookup **không** chứa `d64$%Partition` (hoặc chỉ chứa trong chỗ khác nếu có); 3 arg cuối là `'', '', ''`.
- Khi form set đủ 3 giá trị → assert đúng chuỗi user nhập.
- Sửa `deriveFormInput.test.js` đang expect auto `d64$%Partition` / `z3` / remain.

### Spec

- Ghi chú đè FIX-04: 3 arg detail **không** derive on-the-fly; optional user input.
- FIX-06: “derive fill `z3` lúc render” — **hủy**; trống thì trống.

### UI (optional nhỏ)

Hint dưới 3 ô: `Để trống = không lọc SL còn trên Lookup (arg '', '', ''). Placeholder chỉ là ví dụ.`

---

## Done

- [ ] Ô trống → Lookup preview/generate: `'','',''` — **không** còn `d64$%Partition` / `z3.sl_ycn` từ derive.
- [ ] User nhập tay → đúng giá trị đã nhập.
- [ ] Placeholder không bị `setVal` thành value khi Load preset rỗng.
- [ ] Test derive + XmlTemplateRenderer cập nhật; suite pass.

## Không làm

- Không đổi Finding API / bỏ hẳn 3 arg khỏi template (vẫn luôn có 3 slot).
- Không auto-fill lại “cho tiện” khi partitioned — user chủ động nhập khi cần.
