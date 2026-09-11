# 08 — Acceptance Checklist

## Mở wizard

- [ ] Command **Thiết kế Lấy dữ liệu** mở panel Beside
- [ ] Preview XML Flat / Formula vẫn hoạt động

---

## Preset YCNDXA (partitioned)

- [ ] Load preset → `src_table_mode=partitioned`, identity=YCNDXA
- [ ] Generate → 4 file trong Controllers/
- [ ] **Filter:** `table="m64$000000"`, `id="DXA"`, loop `i64$`
- [ ] **Lookup:** Finding có `c64$000000`, `m64$`, `convert(char(6)`, `@$primeJoin`
- [ ] **MultiGrid:** `d64$%Partition`, field `sl_ycn`, toggle trừ `sl_ycn`
- [ ] **MultiForm:** `FlowMultiGeneralTable="c64$000000"`, f2 có `stt_rec_dxa`
- [ ] **SQL:** `exec fsd_addFields 'd64$','sl_ycn'`, proc update `d64$`, sysfilter `YCNDXAMultiGrid`
- [ ] **SQL /***/:** entity VoucherBeforeUpdate + chú thích dán Tran

---

## Preset zcWIMO (single)

- [ ] Load preset → `src_table_mode=single`
- [ ] **Filter:** `table="phsx"`, retrieve từ `isx` (không loop tháng)
- [ ] **Lookup:** `'isx', 'phsx', 'isx'`, `''''''`, `'{0}'`, `''`, cuối `'ctsx','z3','z3.sl_pxh < z3.so_luong'`
- [ ] **MultiGrid:** `phsx join ctsx`, `sl_pnd`
- [ ] **SQL:** `fsd_addFields 'ctsx','sl_pnd'`

---

## Validation

- [ ] partitioned + dest_d_table=`dycn` (thiếu `$`) → báo lỗi
- [ ] single + master=`phsx$` → warning

---

## Ghi file

- [ ] Trùng file → hỏi overwrite
- [ ] SQL temp tạo trong `sqlTempFolder`, tên `{identity}_retrieve.sql`
- [ ] Không có side-effect DB

---

## Non-regression

- [ ] Extension activate không lỗi
- [ ] `npm test` pass (RetrieveFlow + existing)
