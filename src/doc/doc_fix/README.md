# Formula Preview — docs_fix (prompt fix cho Gemini)

Thư mục này chứa **prompt fix** sau review implementation. Agent đọc theo thứ tự số FIX, sửa code, chạy Done checklist từng file.

Spec gốc vẫn ở [`../formula-preview/`](../formula-preview/README.md). Không viết lại feature — **chỉ fix bug / gap** dưới đây.

## Thứ tự bắt buộc

| # | File | Mức | Tóm tắt |
|---|------|-----|---------|
| 0 | [README.md](./README.md) | — | File này |
| — | [FEAT-06-scope-ga-block-only.md](./FEAT-06-scope-ga-block-only.md) | Scope | Chỉ trình diễn khối `g.$a` |
| 7–13 | FIX-07 … FIX-13 | … | Các fix trước (focus path, chip nhóm, Σ filter, …) |
| 14 | [FIX-14-aggregate-expr-truncate-bracket.md](./FIX-14-aggregate-expr-truncate-bracket.md) | High | Aggregate `grid_col` biểu thức bị cắt `]` + plain_vi (SVDetail) |
| 15 | **[FIX-15-all-tab-generic-demo-chain.md](./FIX-15-all-tab-generic-demo-chain.md)** | **High** | Tab Tất cả / `default_demo_chain` cứng DHN → thiếu graph BIPO |
| 16 | **[FIX-16-multi-alias-same-target-and-round.md](./FIX-16-multi-alias-same-target-and-round.md)** | **High** | Nhiều alias cùng `gia_nt` + edge id trùng + `round()` |
| 17 | **[FIX-17-input-badge-after-formula-or-aggregate.md](./FIX-17-input-badge-after-formula-or-aggregate.md)** | **Medium** | Badge NHẬP sai trên master `t_*` sau Σ |

## Việc tiếp theo cho Gemini

1. Làm **[FIX-15](./FIX-15-all-tab-generic-demo-chain.md)** — canvas `all` = full `entries`; `buildDefaultDemoChain` generic (1 alias / target), bỏ hard list DHN.
2. Làm **[FIX-16](./FIX-16-multi-alias-same-target-and-round.md)** — edge id có `alias`; bỏ self-edge; parse/eval `round`; ghi chú sibling cùng target trên Từ điển.
3. Làm **[FIX-17](./FIX-17-input-badge-after-formula-or-aggregate.md)** — `isInput` theo computed set (target/master), không kẹt NHẬP.
4. Nếu chưa xong: **[FIX-14](./FIX-14-aggregate-expr-truncate-bracket.md)** (SVDetail aggregate expression).
5. Smoke: Preview `BIPODetail.xml` — Tất cả có giá/tiền; Tiền & Giá không dây treo; badge master đúng. Regression DHN.
6. `npm run test:formula-preview` + `npm run build:formula-preview`.
