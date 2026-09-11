# 08 — Acceptance Checklist

Đánh dấu từng dòng khi nghiệm thu tay / test tự động.

---

## A. Guard & phiên bản

| # | Case | Kỳ vọng | Pass |
|---|------|---------|------|
| A1 | Mở file ngoài `Templates/Upload` (vd Grid) → chạy command | Error: chỉ chạy trên Upload | ☐ |
| A2 | Mở `SVTran.xml` (có `<template>`) | Error phiên bản mới; không QuickPick / không Excel | ☐ |
| A3 | Mở `ARTran.xml` legacy | Qua guard, sang bước search | ☐ |

---

## B. Prefix & search

| # | Case | Kỳ vọng | Pass |
|---|------|---------|------|
| B1 | Upload `ARTran.xml` | Keyword kiểu `AR*.xml`; list có Dir/Grid `AR*` | ☐ |
| B2 | List **không** chứa Filter/Lookup/Upload/Report cùng prefix (trừ khi path lạ) | Chỉ Dir + Grid | ☐ |
| B3 | Upload tên `zcamdm.xml` (hoặc fixture tương đương exact) | Không cắt 2 ký tự; exact basename trong Dir/Grid | ☐ |
| B4 | 0 kết quả Dir/Grid | Error rõ, không mở QuickPick rỗng gây confuse | ☐ |
| B5 | Index service null | Error “index chưa sẵn sàng” | ☐ |

---

## C. QuickPick & header

| # | Case | Kỳ vọng | Pass |
|---|------|---------|------|
| C1 | Chọn `Dir/ARTran.xml` + `Grid/ARDetail.xml` | Catalog gom header từ cả hai | ☐ |
| C2 | Field trùng 2 file khác header | Header theo file chọn **trước** | ☐ |
| C3 | Field Upload không có trong Dir/Grid | Excel dùng `name` làm header | ☐ |
| C4 | Hủy QuickPick (Esc) | Không crash; không ghi file | ☐ |

---

## D. Excel output (`upload_chuan.xlsx`)

Dùng ARTran fields làm chuẩn đối chiếu:

| # | Case | Kỳ vọng | Pass |
|---|------|---------|------|
| D1 | Header nằm **dòng 5** | Đúng row | ☐ |
| D2 | `ma_dvcs` → cột **A**, có `*` đỏ | `*…` required | ☐ |
| D3 | `ma_kh` → cột **B**, `*` đỏ | | ☐ |
| D4 | Cột **C** trống (không field) | Không dồn `ngay_ct` sang C | ☐ |
| D5 | `ngay_ct` → cột **D**, `*` đỏ | | ☐ |
| D6 | `dien_giai` → cột **G**, **không** `*` | allowNulls không false | ☐ |
| D7 | Legend **D3**: `* Tên trường bắt buộc nhập` đỏ italic | | ☐ |
| D8 | SaveDialog hủy | Warning hủy; không file orphan | ☐ |
| D9 | Sau save | Info toast + Excel mở được | ☐ |

---

## E. Pack & regression

| # | Case | Kỳ vọng | Pass |
|---|------|---------|------|
| E1 | `.vscodeignore` có `!src/Database/upload_chuan.xlsx` | | ☐ |
| E2 | Trong VSIX / extensionPath có file template | Runtime không báo thiếu template | ☐ |
| E3 | `FBO: Convert To Excel` (Grid cũ) vẫn chạy như trước | Không regress | ☐ |
| E4 | `node src/ConvertExcelFromUpload/tests/run-all.js` | exit 0 | ☐ |

---

## F. Unit tests bắt buộc (auto)

| Module | Cover tối thiểu | Pass |
|--------|-----------------|------|
| UploadVersionDetector | legacy vs template | ☐ |
| UploadFieldsParser | ARTran snippet columns + required | ☐ |
| SearchPrefixDeriver | Tran/Detail/Master/exact + DirGrid filter | ☐ |
| DirGridHeaderCatalog | first-wins, hidden skip, merge fallback | ☐ |

---

## Fixture tham chiếu (mạng)

```
\\172.168.5.14\CustomerPro\FBO\Gate-FBOR2\Program\App_Data\Controllers\Templates\Upload\ARTran.xml
\\172.168.5.14\CustomerPro\FBO\Gate-FBOR2\Program\App_Data\Controllers\Dir\ARTran.xml
\\172.168.5.14\CustomerPro\FBO\Gate-FBOR2\Program\App_Data\Controllers\Grid\ARDetail.xml
\\172.168.5.14\CustomerPro\FBI\SHOWA\FBISP242\App_Data\Controllers\Templates\Upload\SVTran.xml
```

Nếu UNC không mount được trên máy agent: copy snippet Upload fields + Dir/Grid field headers vào `tests/fixtures/` và ghi chú path gốc trong comment test.
