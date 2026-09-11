# FIX-03 — Mục 8 sysfilterdeclares: mặc định 6 dòng chuẩn

## Mức: Low (default data)

## Vấn đề

Mục **8. Khai báo sysfilterdeclares** hiện preset YCNDXA chỉ có **2 dòng** (`ItemCode`, `VoucherNumber`). Thực tế fixture vàng cần đủ bộ lọc cột chuẩn như SQL dưới đây.

User muốn: **luôn mặc định** list này khi mở form / load preset; sau đó thêm / sửa / xóa tùy ý.

## Default rows (đã chốt)

`controller` khi generate = `{identity}MultiGrid` (vd. `YCNDXAMultiGrid`). UI chỉ lưu `id_suffix` / `name` / `exname`; renderer ghép `id = {controller}.{id_suffix}`.

| id_suffix | name | exname |
|-----------|------|--------|
| `CurrencyCode` | `ma_nt` | `þm.ma_nt` |
| `ItemCode` | `ma_vt` | `þa.ma_vt` |
| `ItemName` | `ten_vt%2` | `þb.ten_vt%2` |
| `UOM` | `dvt` | `þa.dvt` |
| `VoucherDate` | `ngay_ct` | `þa.ngay_ct` |
| `VoucherNumber` | `so_ct` | `þa.so_ct` |

SQL temp kỳ vọng (ví dụ identity `YCNDXA`):

```sql
DELETE FROM sysfilterdeclares WHERE controller = 'YCNDXAMultiGrid'
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace]) VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.CurrencyCode', N'ma_nt', N'þm.ma_nt', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace]) VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.ItemCode', N'ma_vt', N'þa.ma_vt', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace]) VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.ItemName', N'ten_vt%2', N'þb.ten_vt%2', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace]) VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.UOM', N'dvt', N'þa.dvt', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace]) VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.VoucherDate', N'ngay_ct', N'þa.ngay_ct', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace]) VALUES(N'YCNDXAMultiGrid', N'YCNDXAMultiGrid.VoucherNumber', N'so_ct', N'þa.so_ct', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
```

Các cột còn lại (`xtable` … `conditionalreplace`) = `NULL` như hiện tại.

## Quyết định

1. Hằng số dùng chung (export từ Presets hoặc `DEFAULT_SYSFILTER_ROWS`):

```js
const DEFAULT_SYSFILTER_ROWS = [
  { id_suffix: 'CurrencyCode', name: 'ma_nt', exname: 'þm.ma_nt' },
  { id_suffix: 'ItemCode', name: 'ma_vt', exname: 'þa.ma_vt' },
  { id_suffix: 'ItemName', name: 'ten_vt%2', exname: 'þb.ten_vt%2' },
  { id_suffix: 'UOM', name: 'dvt', exname: 'þa.dvt' },
  { id_suffix: 'VoucherDate', name: 'ngay_ct', exname: 'þa.ngay_ct' },
  { id_suffix: 'VoucherNumber', name: 'so_ct', exname: 'þa.so_ct' }
];
```

2. **Preset YCNDXA + zcWIMO** (và mọi preset mới): `sysfilter_rows` = copy của default trên (zcWIMO chỉ khác `controller` lúc generate theo `identity`).
3. **Form trống / init webview lần đầu** (chưa bấm Load preset): cũng seed `DEFAULT_SYSFILTER_ROWS` — không để bảng 0 dòng hoặc chỉ 2 dòng.
4. Giữ nút **+ Thêm dòng** / **X** — user thêm/sửa/xóa sau khi default đã fill.

## Việc phải làm

- `Presets.js`: thay `sysfilter_rows` hiện tại (2 dòng) bằng 6 dòng trên cho cả YCNDXA và ZCWIMO.
- `retrieveFlow.js` / `init`: nếu `sysfilter_rows` rỗng → render default.
- `SqlTemplateRenderer.test.js`: assert đủ `CurrencyCode`, `ItemName`, `UOM`, `VoucherDate` (không chỉ ItemCode).
- Spec `02-domain-model.md` / `04-sql-generator.md`: ghi default 6 dòng; user editable.

## Done

- [ ] Load YCNDXA → mục 8 hiện đúng 6 dòng theo bảng trên.
- [ ] Mở wizard mới (không load preset) → vẫn thấy 6 dòng default.
- [ ] Xóa 1 dòng / thêm 1 dòng → Generate SQL phản ánh đúng phần user giữ lại.
- [ ] SQL preview có DELETE + 6 INSERT (hoặc số dòng còn lại sau chỉnh).
- [ ] Test pass.

## Không làm

- Không hardcode `YCNDXAMultiGrid` trong UI — luôn derive từ `identity`.
- Không auto-sync lại default nếu user đã xóa dòng (không “reset ngầm”).
- Không bắt buộc đủ 6 dòng để Generate.
