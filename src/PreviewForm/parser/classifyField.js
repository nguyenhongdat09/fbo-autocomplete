/**
 * Phân loại field XML thành FormModel FieldDef
 * FIX-02: hidden từ @_hidden='true' hoặc @_width='0'
 * FIX-04: không để debug text (readonly, lookup name, raw HTML)
 */
function classifyField(field) {
  const name = field['@_name'] || '';
  const read_only = String(field['@_readOnly']).toLowerCase() === 'true';
  const disabled = String(field['@_disabled']).toLowerCase() === 'true';
  const category_index = field['@_categoryIndex'] != null ? String(field['@_categoryIndex']) : null;
  const type_attr = field['@_type'] || '';

  // FIX-02: field-level hidden
  const hidden = field['@_hidden'] === 'true' || field['@_width'] === '0';

  // FEAT-04: tab focus inactive
  const inactive = String(field['@_inactive'] || field['@_inactivate'] || '').toLowerCase() === 'true';

  // Phân tích items
  let itemsArray = [];
  if (field.items) {
    if (Array.isArray(field.items)) {
      itemsArray = field.items;
    } else if (field.items.item) {
      itemsArray = Array.isArray(field.items.item) ? field.items.item : [field.items.item];
    }
  }

  const style = (field.items && field.items['@_style']) || '';

  let kind = 'input';
  if (style === 'Grid') kind = 'grid';
  else if (style === 'DropDownList') kind = 'dropdown';
  else if (type_attr === 'Boolean') kind = 'checkbox';
  else if (type_attr === 'DateTime' || type_attr === 'Date') kind = 'date';

  const header_v = unescape_xml(field.header?.['@_v'] || field.header?.v || '');
  const header_e = unescape_xml(field.header?.['@_e'] || field.header?.e || '');
  const label_v = unescape_xml(field.label?.['@_v'] || field.label?.v || '');
  const label_e = unescape_xml(field.label?.['@_e'] || field.label?.e || '');

  // FEAT-05: Giữ HTML trong footer/header sau khi decode entity, không strip tags
  const raw_footer_v = field.footer?.['@_v'] || field.footer?.v || '';
  const footer_v = unescape_xml(raw_footer_v);
  const raw_footer_e = field.footer?.['@_e'] || field.footer?.e || '';
  const footer_e = unescape_xml(raw_footer_e);

  const options = [];
  if (kind === 'dropdown') {
    for (const item of itemsArray) {
      options.push({
        value: String(item['@_value'] ?? ''),
        label_v: item.text?.['@_v'] || item.text?.v || '',
        label_e: item.text?.['@_e'] || item.text?.e || ''
      });
    }
  }

  const grid_controller = field.items?.['@_controller'];
  const grid_placeholder = kind === 'grid' ? `${name}_Grid` : '';

  const result = {
    name,
    kind,
    category_index,
    read_only,
    disabled,
    inactive,
    hidden,
    header_v,
    header_e,
    label_v,
    label_e,
    footer_v,
    footer_e,
    grid_placeholder
  };

  if (kind === 'dropdown') result.options = options;
  if (kind === 'grid') result.grid_controller = grid_controller;

  return result;
}

/** Unescape XML entities để render HTML (FEAT-05) */
function unescape_xml(str) {
  if (!str) return '';
  return str.replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .trim();
}

module.exports = { classifyField };
