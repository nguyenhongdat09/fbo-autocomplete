# FIX-20 — Giữ format XML theo gold EPLUS (Filter / MultiForm / MultiGrid / Lookup)

## Mức: Low (format template — nguyên tắc chung)

## Vấn đề

Template / generate đang **minify** hoặc lệch format so với gold EPLUS, ví dụ MultiForm:

```xml
  <fields>&FlowMultiFormField;</fields>
  <views>&FlowMultiFormView;</views>
```

Gold EPLUS `YCNDXAMultiForm.xml` ~13–18 (và CNNB đã chỉnh tay tương tự):

```xml
  <fields>
    &FlowMultiFormField;
  </fields>
  <views>
    &FlowMultiFormView;
  </views>
```

User yêu cầu: **sinh file giữ đúng format như bộ gold EPLUS** — không tự gom 1 dòng / đổi thụt lề / đổi cách xuống dòng so với:

| File | Gold path (EPLUS FBISP24) |
|------|---------------------------|
| Filter | `Filter/YCNDXAFilter.xml` |
| MultiForm | `Filter/YCNDXAMultiForm.xml` |
| MultiGrid | `Grid/YCNDXAMultiGrid.xml` |
| Lookup | `Lookup/YCNDXALookup.xml` |

Logic / ENTITY / nội dung nghiệp vụ **không đổi** vì format — chỉ whitespace / xuống dòng / thụt lề.

---

## Quyết định

### 1. Nguyên tắc chung (bắt buộc)

Khi sửa hoặc generate 4 XML Retrieve Flow:

1. **Đối chiếu gold EPLUS** cùng loại file trước khi chốt template.
2. **Giữ** cấu trúc xuống dòng / indent của gold (DOCTYPE entity, `<fields>`/`<views>`/`<commands>`/`<script>`/`<query>`…).
3. **Không** minify kiểu CNNB (gom tag + entity + `</tag>` một dòng) trừ khi **chính gold** cũng viết 1 dòng (ví dụ FIX-19: cột `#d` một hàng ngang).
4. FIX format cụ thể đã có vẫn áp dụng:
   - **FIX-18** — MultiForm Showing/Loading/Closing nhiều dòng
   - **FIX-19** — GetOtherField entity + cột ngang

### 2. MultiForm — `fields` / `views` (case này)

Sửa **cả** `partitioned/MultiForm.xml.tpl` và `single/MultiForm.xml.tpl`:

```xml
  <fields>
    &FlowMultiFormField;
  </fields>
  <views>
    &FlowMultiFormView;
  </views>
```

Không còn:

```xml
  <fields>&FlowMultiFormField;</fields>
  <views>&FlowMultiFormView;</views>
```

### 3. Các file còn lại — audit nhanh khi làm template

Khi chạm Filter / MultiGrid / Lookup templates: so sánh indent khối `<fields>`, `<views>`, `<commands>`, `<script>`, DOCTYPE entity với gold tương ứng; lệch thì chỉnh theo gold, **không** invent style mới.

---

## Việc phải làm

1. Sửa MultiForm (partitioned + single): `fields` / `views` xuống dòng như trên.
2. Smoke Generate: mở 4 XML — nhìn indent giống EPLUS ở phần đầu file (title / fields / views).
3. Khi làm FIX-17/18/19 hoặc template khác: nếu phát hiện minify lệch gold → sửa luôn theo nguyên tắc này (không cần FIX mới cho từng chỗ whitespace nhỏ).

## Done

- [ ] MultiForm: `<fields>` / `<views>` entity xuống dòng như EPLUS ~13–18.
- [ ] Không còn `...<fields>&FlowMultiFormField;</fields>...` một dòng.
- [ ] Nguyên tắc “format = gold EPLUS” ghi trong doc; agent sau không minify lại.

## Không làm

- Không đổi tên ENTITY / nội dung `&FlowMultiFormField;` / `&FlowMultiFormView;`.
- Không format lại toàn bộ gold project ngoài 4 template Retrieve Flow.
- Không trái FIX-19 (cột SQL một hàng vẫn một hàng).
