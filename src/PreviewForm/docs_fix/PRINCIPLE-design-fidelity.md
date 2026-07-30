# Nguyên tắc trung tâm — Design fidelity

> Phần **bổ sung cho Gemini** trong `docs_fix`. Spec gốc nằm ở `../docs/` (đã xong) — không cần viết lại docs; chỉ **áp dụng** nguyên tắc này khi sửa code theo list FIX.

## Một câu

> Preview Form phải **phản ánh trung thực quy tắc layout FBO đã khai báo**, để Developer **nhìn lỗi ở đâu thì sửa XML ở đó** — không phải để có một màn hình “trông ổn” bất chấp pattern/columns.

## Vòng lặp làm việc mong muốn

```
Developer sửa <item value="PATTERN: [fields]..."> / columns / categoryIndex / height
        ↓ (live ~400ms)
Preview render đúng theo quy tắc
        ↓
Developer thấy: lệch cột / field ẩn / tràn height / sai tab / quên Label…
        ↓
Developer sửa lại khai báo XML
```

Nếu Preview **tự che** lỗi (auto-width, dồn control, bỏ tab, hiện field width 0…) thì vòng lặp này **hỏng**.

## Nguồn quy tắc (tham chiếu, không invent)

1. Skill **`fbo-design-view-field`**
2. [`../docs/02-domain-rules.md`](../docs/02-domain-rules.md) (đã có)
3. Dir thật (TNTran)

## Fidelity vs skin

| Bắt buộc 1:1 XML | Chỉ khác skin |
|------------------|---------------|
| columns px, pattern, width `0` = ẩn | Toolkit controls |
| general / tab / footer `-1` | Theme VS Code |
| tab = thứ tự khai báo | |
| height vùng tab | |

“Không pixel-perfect WinForms” trong docs gốc = **chỉ skin**, không được xấp xỉ layout.

## Cấm khi fix

- Tự reorder / “làm đẹp” hơn XML
- `width 0` → `auto` / `1fr`
- Bỏ gap `-` bằng auto-place
- Debug text (`ten_bp_name`, `readonly`)

## Câu hỏi trước khi merge mỗi FIX

*“Developer nhìn preview này có phát hiện được lỗi khai báo X không?”*
