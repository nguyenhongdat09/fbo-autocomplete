# FIX-01 chi tiết — Categories trong View

## Sai (code hiện tại)

```js
// FormXmlParser.js
const categoryNodes = Array.isArray(dirNode.category)
  ? dirNode.category
  : (dirNode.category ? [dirNode.category] : []);

// columns lấy từ cat.item[0] — SAI
const cols = (cat.item && cat.item[0] && cat.item[0]['@_value'])
  ? cat.item[0]['@_value'].split(',').map(Number)
  : [];

// processItems(cat.item, ...) — SAI với FBO thật
```

## Đúng

```js
function as_array(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

const cats_parent = viewElement.categories;
const categoryNodes = as_array(cats_parent && cats_parent.category);

categoryNodes.forEach((cat, declaration_order) => {
  const idx = String(cat['@_index']);
  const cols = String(cat['@_columns'] || '')
    .split(',')
    .map(s => Number(String(s).trim()))
    .filter(n => !Number.isNaN(n));
  // header từ cat.header @_v / @_e
  // index === '-1' → footer_category; else push categoriesArray
});

// CHỈ:
processItems(viewElement.item, null, true);
// KHÔNG processItems trên category.item cho Dir chuẩn
```

## Vì sao UI không có tab

`view.categories = []` → `tabs.length === 0` → block `vscode-panels` không render.  
Rows tab có thể vẫn nằm trong `rows_by_category` (từ `categoryIndex` field) nhưng **không có tab bar** để xem.

## Fixture test phải giống FBO

```xml
<dir>
  <fields>...</fields>
  <views>
    <view id="Dir" height="200">
      <item value="100, 0"/>
      <item value="11: [ma_kh].Label, [ma_kh]"/>
      <item value="1: [grid1]"/>
      <item value="11: [footer_field].Label, [footer_field]"/>
      <categories>
        <category index="2" columns="809" anchor="1">
          <header v="1.2 Chi tiết" e="Detail"/>
        </category>
        <category index="-1" columns="100,100" anchor="1">
          <header v="" e=""/>
        </category>
      </categories>
    </view>
  </views>
</dir>
```

Field `grid1` có `categoryIndex="2"`; `footer_field` có `categoryIndex="-1"`; `ma_kh` không có categoryIndex.
