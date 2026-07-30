/**
 * Phân tích item value FBO: "111000-1100-: [f1].Label, [f1], [f2], ..."
 * Trả về cells[] với start_col để CSS grid-column-start đặt đúng vị trí (FIX-03).
 */
function parseViewItem(rawItemValue, fieldDefs) {
  const colonIndex = rawItemValue.indexOf(':');
  if (colonIndex === -1) return null;

  const patternStr = rawItemValue.substring(0, colonIndex).trim();
  const refsStr = rawItemValue.substring(colonIndex + 1).trim();

  // Parse refs
  const refsList = refsStr.split(',').map(s => s.trim()).filter(Boolean);

  const parsedRefs = refsList.map(ref => {
    let role = 'control';
    let field = ref;

    if (ref.endsWith('.Label')) {
      role = 'label';
      field = ref.replace('.Label', '');
    } else if (ref.endsWith('.Description')) {
      role = 'description';
      field = ref.replace('.Description', '');
    } else if (ref.includes('%l')) {
      role = 'lookup_name';
      field = ref.replace('%l', '');
    }

    // Remove brackets: [ma_kh] -> ma_kh
    field = field.replace(/^\[|\]$/g, '');

    return { role, field };
  });

  const cells = [];
  let refIndex = 0;

  // --- FIX-03: mỗi cell biết start_col (vị trí trong pattern) ---
  for (let i = 0; i < patternStr.length; i++) {
    const char = patternStr[i];
    const start_col = i; // vị trí cột bắt đầu (0-based)

    if (char === '1') {
      const slot = parsedRefs[refIndex++] || { role: 'unknown', field: 'unknown' };

      // Đếm '0' ngay sau '1' → col_span
      let col_span = 1;
      while (i + 1 < patternStr.length && patternStr[i + 1] === '0') {
        col_span++;
        i++;
      }

      cells.push({ type: 'slot', slot, col_span, start_col });
    } else if (char === '-') {
      // FIX-03: gap '-' giữ chỗ thật, không bỏ qua
      cells.push({ type: 'empty', start_col });
    }
    // '0' sau '1' đã bị consume bởi col_span loop — không push thêm
  }

  // Zone từ categoryIndex của field đầu tiên (không mix rule - FIX-11/12 reverted)
  let category_index = null;
  for (const ref of parsedRefs) {
    const fDef = fieldDefs[ref.field];
    if (fDef && fDef.category_index != null) {
      category_index = fDef.category_index;
      break;
    }
  }

  return {
    pattern: patternStr,
    raw_item_value: rawItemValue,
    cells,
    category_index
  };
}

module.exports = { parseViewItem };
