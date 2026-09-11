# 01 — Requirements: Thiết kế Lấy dữ liệu FlowMulti

## Mục tiêu

Dev FBO cần triển khai luồng **Lấy dữ liệu** (Retrieve FlowMulti: Filter → MultiForm → MultiGrid + Lookup) mà không phải copy-paste thủ công từ cặp mẫu cũ.

**Sản phẩm:** Webview wizard — nhập mã CT, bảng, cột SL, field vết, điều kiện lọc → **Generate** ra 4 file XML + 1 file `.sql` temp (user tự deploy / dán snippet Tran-Detail).

Cách mở **giống Preview XML Flat**: command trên editor, panel Beside.

## User stories

1. **Chọn mode bảng:** Radio *Bảng tách kỳ (`$`)* / *Bảng đơn* → form hiện đúng ô (ext vs phsx/ctsx/isx).
2. **Preset fixture:** Nút *Load YCNDXA* / *Load zcWIMO* điền sẵn form để chỉnh tiếp.
3. **Nhập field vết:** Bảng `{ name, sql_type, header_v, header_e }` — fsd_addFields đích, snippet Detail, f2 mục 7.
4. **Nhập SL đã lấy:** Tên cột nguồn (`sl_ycn` / `sl_pnd`) + sql_type → MultiGrid field + `fsd_addFields 'd64$'` hoặc `'ctsx'`.
5. **Generate XML:** Ghi 4 file vào `App_Data/Controllers/`, hỏi overwrite nếu trùng.
6. **Generate SQL:** Tạo `{identity}_retrieve.sql` trong `sqlTempFolder` — proc, addFields, sysfilter `/* */`, Tran/Detail `/**/`.
7. **Preview:** Tab xem trước 4 XML + SQL trước khi Generate.

## Phạm vi MVP (in-scope)

| Hạng mục | Chi tiết |
|----------|----------|
| Pattern | FlowMulti 1–n only |
| Mode bảng | `partitioned` (YCNDXA) + `single` (zcWIMO) |
| Output XML | Filter, MultiForm, MultiGrid, Lookup |
| Output SQL | fsd_addFields, CREATE PROC BeforeAfterUpdate, sysfilterdeclares, snippet entity + Detail field |
| Ghi file | Controllers + sqlTempFolder |
| Command | `fbo-autocomplete.designRetrieveFlow` |

## Kiến trúc

- Code trong **`src/RetrieveFlow/`** — `extension.js` chỉ register.
- Tận dụng `AppDataPathHelper`, pattern panel XmlFlatPreview, `createSqlTempFile` (extract từ ContextMenu).

## Non-goals (out-of-scope MVP)

- Không Form/Grid 1–1 (`IdentityForm`)
- Không deploy proc / không INSERT sysfilter / không MCP mutate DB
- Không auto-sửa `*Detail.xml`, `*Tran.xml`
- Không generate menu `case` số cụ thể trong Detail (chỉ comment gợi ý)
- Không parse XML đang mở để reverse-engineer form (wizard thuần nhập tay)

## Tiêu chí Done (tóm tắt)

Chi tiết: [08-acceptance-checklist.md](./08-acceptance-checklist.md).

1. Load preset YCNDXA → Generate → 4 XML khớp cấu trúc YCNDXA (Finding partitioned, `$` tables).
2. Load preset zcWIMO → Generate → Lookup Finding `'isx','phsx','isx'` + 3 arg detail join.
3. SQL temp có `fsd_addFields`, proc, sysfilter block, Tran snippet + chú thích dán.
4. Validation: partitioned bắt `$` trên dest_d/m; single cảnh báo nếu có `$`.

## Command & UX

- **Command id:** `fbo-autocomplete.designRetrieveFlow`
- **Title:** `Thiết kế Lấy dữ liệu`
- **Menu:** submenu FBO + `editor/title` khi `.xml`
- **Panel title:** `Lấy dữ liệu: {identity hoặc "mới"}`
- **ViewColumn:** Beside
