# 07 — Implementation Plan

Thứ tự TDD — không đảo bước.

## Phase 0 — Extract helper dùng chung (nếu chưa có)

- [ ] T0.1 Tách `createSqlTempFile(folder, baseName)` từ `ContextMenu.newSqlTemp` → `src/Utils/sqlTempFile.js`
- [ ] T0.2 ContextMenu gọi helper mới (refactor nhỏ, không đổi hành vi)

## Phase 1 — Scaffold module riêng

- [ ] T1.1 Tạo `src/RetrieveFlow/` + `index.js` (chỉ register command)
- [ ] T1.2 `RetrieveFlowCommand` + `RetrieveFlowPanel` shell
- [ ] T1.3 `package.json` command + menu + **`.vscodeignore` whitelist RetrieveFlowTemplates**
- [ ] T1.4 **`extension.js` đúng 2 dòng** require + register — không code thêm

## Phase 2 — Presets & Validator

- [ ] T2.1 `Presets.js` — JSON YCNDXA + zcWIMO (copy từ 02-domain-model)
- [ ] T2.2 `FormInputValidator.test.js` — `$` rules
- [ ] T2.3 `FormInputValidator.js`

- [ ] T2.4 `deriveFormInput.test.js` + `deriveFormInput.js`
- [ ] T2.5 `buildF2FromTrace` / default prime join tests

## Phase 3 — Templates & Renderer

- [ ] T3.1 Đọc template từ `src/Database/RetrieveFlowTemplates/`
- [ ] T3.2 `XmlTemplateRenderer.test.js` — 2 fixture
- [ ] T3.3 `XmlTemplateRenderer.js`
- [ ] T3.4 `SqlTemplateRenderer.test.js` — addFields + sysfilter + proc branch
- [ ] T3.5 `SqlTemplateRenderer.js`

## Phase 4 — Webview UI

- [ ] T4.1 `preview.html` + CSS theme
- [ ] T4.2 Form sections + preset buttons + validation inline
- [ ] T4.3 Preview tabs — **host roundtrip** (`preview` / `previewResult`)
- [ ] T4.4 Message protocol wired

## Phase 5 — Write & Polish

- [ ] T5.1 Ghi 4 XML + overwrite modal **Ghi đè tất cả / Bỏ qua / Hủy**
- [ ] T5.2 Ghi sql temp (skip nếu chưa config folder) + open document
- [ ] T5.3 Resolve controllers_root — **AppDataPathHelper** (UNC OK)

## Phase 6 — Acceptance

- [ ] T6.1 Chạy checklist [08-acceptance-checklist.md](./08-acceptance-checklist.md)
- [ ] T6.2 `npm test` RetrieveFlow tests pass

---

## Ưu tiên rủi ro

1. Lookup Finding — 2 mode khác nhiều → test trước
2. Quy ước `$` fsd_addFields
3. Filter Inserting loop vs single query
