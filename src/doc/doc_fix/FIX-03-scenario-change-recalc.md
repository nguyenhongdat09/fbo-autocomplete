# FIX-03 — Đổi kịch bản trên UI không recalc playground / canvas

## Mức: BLOCKER

## Hiện tượng

Trong webview:

1. User chọn scenario khác trên dropdown Hero hoặc tab **Kịch bản**.
2. `activeScenarioId` đổi.
3. **Giá trị ô tính không đổi** theo chuỗi formula của scenario mới.
4. Canvas có thể cập nhật nodes (nếu `FormulaFlowCanvas` depend `activeScenarioId`) nhưng số liệu Hero vẫn theo chain cũ.

## Root cause

`src/FormulaPreview/media/src/hooks/useFormulaEvaluator.js`:

```js
useEffect(() => {
  // ...
  recalcValues(...);
}, [model]); // ← thiếu activeScenarioId
```

`App.jsx` `handleScenarioChange` chỉ `setActiveScenarioId` — **không** gọi `recalcValues`.

Spec: [`../formula-preview/05-ui-playground.md`](../formula-preview/05-ui-playground.md) — click scenario → active + **recalc** từ values hiện tại.

## Cách sửa (bắt buộc)

Trong `useFormulaEvaluator.js`:

1. Khi `activeScenarioId` đổi (và đã có `model` + `values`): gọi `recalcValues(values, activeScenarioId)`.
2. `useEffect` deps gồm `model` **và** `activeScenarioId` (cẩn thận không reset về seed — chỉ recalc trên `values` hiện tại).
3. Optional UX (spec): khi user **sửa ô** tên field trùng `scenario.trigger_field` → tự set scenario đó rồi recalc (nếu chưa có thì thêm; tối thiểu là FIX đổi dropdown).

Gợi ý:

```js
useEffect(() => {
  if (!model) return;
  if (model.playground?.values && Object.keys(values).length === 0) {
    const seed = { ...model.playground.values };
    setValues(seed);
    recalcValues(seed, activeScenarioId || model.playground.default_scenario_id);
    return;
  }
  if (Object.keys(values).length > 0 && activeScenarioId) {
    recalcValues(values, activeScenarioId);
  }
}, [model, activeScenarioId]);
```

Tránh vòng lặp vô hạn: `recalcValues` không được đưa `values` vào deps một cách làm effect chạy lại mỗi lần setValues — dùng functional update hoặc tách “init model” vs “scenario changed”.

Pattern sạch hơn:

- Effect 1: `model` đổi → reset seed + recalc default scenario.
- Effect 2: `activeScenarioId` đổi (không phải lần mount cùng model) → `recalcValues(currentValues, id)`.

Hoặc export `recalcValues` và trong `App`:

```js
const handleScenarioChange = (id) => {
  setActiveScenarioId(id);
  recalcValues(values, id);
};
```

(Chốt một trong hai; ưu tiên logic trong hook để mọi chỗ đổi scenario đều đúng.)

## Verify tay

1. Seed DHN: scenario `so_luong` → `tien_nt2 = 1000000`.
2. Đổi sang scenario `gia` (sau FIX-01) → chain dùng `tien2_sl`; sửa `gia` trên playground → `tien2` cập nhật theo `so_luong * gia`.
3. Caption / `lastWritten` pulse lại sau đổi scenario.

## Done

- [ ] Đổi scenario → evaluator chạy lại ngay (không cần sửa số)
- [ ] Canvas + Hero dùng cùng `values` sau recalc
- [ ] `npm run build:formula-preview` lại sau sửa JSX/hook
- [ ] Không regress reset “Đặt lại demo”

## Không làm

- Không chạy toàn bộ `entries` (vẫn chỉ chain scenario active)
