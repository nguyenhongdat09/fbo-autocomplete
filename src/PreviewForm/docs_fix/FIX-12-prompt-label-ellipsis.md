# Prompt Gemini — FIX-12: Label giống web (1 dòng / che khi hẹp — không wrap)

> Gộp đầy đủ hơn với footer: xem [FIX-12-13-prompt-label-footer.md](./FIX-12-13-prompt-label-footer.md)

## Ý user (đã chỉnh)

- Form web: width khai báo **đủ** → hiện đủ «Ghi chú công việc» **1 dòng**.
- Form web: width **thiếu** → chữ bị **che**, **không wrap**.
- Preview wrap 2 dòng = sai. Preview cắt ellipsis oan khi width XML đủ = sai (cột bị co hơn XML).

→ Preview phải **same same** web: đúng px columns; nowrap; hẹp thì clip.

Dùng prompt trong FIX-12-13.
