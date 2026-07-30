const { XMLParser } = require('fast-xml-parser');
const { classifyField } = require('./classifyField');
const { parseViewItem } = require('./viewItemUtils');

function as_array(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Hàm parse XML content (đã phẳng - expand entities)
 * để lấy ra đối tượng FormModel.
 */
function parseFormXml(flatXmlText) {
  // Loại bỏ DOCTYPE và khai báo XML header để tránh lỗi "External entities are not supported"
  let cleanXml = flatXmlText;
  const dirIndex = cleanXml.indexOf('<dir');
  if (dirIndex !== -1) {
    cleanXml = cleanXml.substring(dirIndex);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: false,
    ignoreDeclaration: true
  });

  const xmlObj = parser.parse(cleanXml);
  if (!xmlObj || !xmlObj.dir) {
    throw new Error('Not a valid Dir XML');
  }

  const dirNode = xmlObj.dir;
  const fieldsNode = dirNode.fields && dirNode.fields.field;
  const viewNode = dirNode.views && dirNode.views.view;

  // 1. Phân loại fields
  const fields = {};
  const fieldList = as_array(fieldsNode);
  for (const f of fieldList) {
    const fieldDef = classifyField(f);
    if (fieldDef.name) {
      fields[fieldDef.name] = fieldDef;
    }
  }

  // 2. Parse views
  const viewElement = Array.isArray(viewNode) ? viewNode[0] : viewNode;
  if (!viewElement) {
    return { fields, view: null };
  }

  const splitAttr = viewElement['@_split'] ? parseInt(viewElement['@_split']) : null;
  const anchorAttr = viewElement['@_anchor'] ? parseInt(viewElement['@_anchor']) : null;
  const itemList = as_array(viewElement.item);

  // Master columns: dòng item đầu tiên KHÔNG chứa ':' là khai báo column widths
  let masterColumns = [];
  let firstRowIdx = 0;
  if (itemList.length > 0) {
    const firstVal = String(itemList[0]['@_value'] || '');
    if (!firstVal.includes(':')) {
      masterColumns = firstVal.split(',').map(s => Number(String(s).trim())).filter(n => !Number.isNaN(n));
      firstRowIdx = 1;
    }
  }

  // --- FIX-01: Categories từ viewElement.categories.category, columns từ @_columns ---
  const categoriesArray = [];
  let footerCols = [];
  let footerAnchor = null;

  let footerSplit = null;

  const cats_parent = viewElement.categories;
  const categoryNodes = as_array(cats_parent && cats_parent.category);

  categoryNodes.forEach((cat, declaration_order) => {
    const idx = String(cat['@_index']);
    // columns từ @_columns (không phải cat.item[0])
    const cols = String(cat['@_columns'] || '')
      .split(',')
      .map(s => Number(String(s).trim()))
      .filter(n => !Number.isNaN(n));
    const anchor = cat['@_anchor'] ? parseInt(cat['@_anchor']) : null;
    const split = cat['@_split'] ? parseInt(cat['@_split']) : null;

    if (idx === '-1') {
      footerCols = cols;
      footerAnchor = anchor;
      footerSplit = split;
    } else {
      categoriesArray.push({
        index: idx,
        header_v: cat.header?.['@_v'] || cat.header?.v || '',
        header_e: cat.header?.['@_e'] || cat.header?.e || '',
        columns: cols,
        columns_total_px: cols.reduce((a, b) => a + b, 0),
        anchor: anchor,
        split: split,
        declaration_order
      });
    }
  });

  const footerCategory = {
    index: '-1',
    header_v: '',
    header_e: '',
    columns: footerCols,
    columns_total_px: footerCols.reduce((a, b) => a + b, 0),
    anchor: footerAnchor,
    split: footerSplit,
    declaration_order: 99
  };

  if (!footerCols.length && masterColumns.length) {
    footerCategory.columns = masterColumns;
    footerCategory.columns_total_px = masterColumns.reduce((a, b) => a + b, 0);
    footerCategory.columns_fallback_master = true;
  }

  const rows_general = [];
  const rows_by_category = {};

  function effective_columns(cat_conf, master_cols) {
    const cols = cat_conf?.columns;
    if (cols && cols.length > 0) return cols;
    return master_cols;
  }

  // --- FIX-01: CHỈ processItems(viewElement.item) — không processItems(cat.item) ---
  const processItems = (items, skipFirst) => {
    const list = as_array(items);
    for (let i = skipFirst ? 1 : 0; i < list.length; i++) {
      const rawVal = String(list[i]['@_value'] || '');
      if (!rawVal.includes(':')) continue; // column-def line, bỏ qua

      const parsed = parseViewItem(rawVal, fields);
      if (!parsed) continue;

      // Zone từ categoryIndex của field đầu tiên trong row
      const catIdx = parsed.category_index;

      const r = {
        pattern: parsed.pattern,
        raw_item_value: parsed.raw_item_value,
        cells: parsed.cells
      };

      if (catIdx == null) {
        r.columns_ref = 'master';
        r.column_widths = masterColumns;
        rows_general.push(r);
      } else {
        const catConf = catIdx === '-1' ? footerCategory : categoriesArray.find(c => c.index === String(catIdx));
        r.column_widths = effective_columns(catConf, masterColumns);
        
        if (catIdx === '-1' && !footerCols.length && masterColumns.length) {
          r.columns_ref = 'master';
        } else {
          r.columns_ref = String(catIdx);
        }

        if (!rows_by_category[catIdx]) rows_by_category[catIdx] = [];
        rows_by_category[catIdx].push(r);
      }
    }
  };

  processItems(viewElement.item, firstRowIdx > 0); // bỏ dòng master_columns nếu đã lấy

  const model = {
    version: 1,
    fields,
    view: {
      id: viewElement['@_id'] || 'Dir',
      height: viewElement['@_height'] ? parseInt(viewElement['@_height']) : null,
      anchor: anchorAttr,
      split: splitAttr,
      master_columns: masterColumns,
      master_total_px: masterColumns.reduce((a, b) => a + b, 0),
      categories: categoriesArray,
      footer_category: footerCategory,
      rows_general,
      rows_by_category
    }
  };

  return model;
}

module.exports = { parseFormXml };
