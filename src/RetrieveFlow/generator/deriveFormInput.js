/**
 * Module tự động suy biến (derive) các trường phụ thuộc cho Generator
 */

function defaultF1() {
    return 'so_luong0, so_luong, stt_rec, stt_rec0, so_ct, line_nbr';
}

function buildF2FromTrace(trace_fields) {
    const list = ['so_luong'];
    if (Array.isArray(trace_fields)) {
        trace_fields.forEach(f => {
            if (f && f.name && !list.includes(f.name)) {
                list.push(f.name);
            }
        });
    }
    return list.join(', ');
}

function buildMasterSetFields(trace_fields) {
    const list = [];
    if (Array.isArray(trace_fields) && trace_fields.length > 0) {
        if (trace_fields[0]?.name) {
            list.push(trace_fields[0].name);
        }
        if (trace_fields.length > 2 && trace_fields[2]?.name) {
            list.push(trace_fields[2].name);
        } else if (trace_fields.length > 1 && trace_fields[1]?.name) {
            list.push(trace_fields[1].name);
        }
    }
    return list.join(', ');
}

function parseStatusList(raw) {
    return String(raw || '2').split(',').map(s => s.trim()).filter(Boolean);
}

function formatFindingStatusArg(raw) {
    const list = parseStatusList(raw);
    if (list.length === 0) return '2';
    return list.join(', ');
}

function deriveFilterKeyFlow(list) {
    const quoted = (list.length > 0 ? list : ['2']).map(s => `''${s}''`).join(', ');
    return `status in (${quoted})`;
}

function deriveMultigridWhereExtra(list) {
    const quoted = (list.length > 0 ? list : ['2']).map(s => `''${s}''`).join(', ');
    return ` and m.status in (${quoted})`;
}

function buildDetailFieldXml(trace_fields) {
    if (!Array.isArray(trace_fields) || trace_fields.length === 0) return '';
    return trace_fields.map(f => {
        const name = f.name || '';
        const header_v = f.header_v || '';
        const header_e = f.header_e || '';
        const sql_type = (f.sql_type || '').toLowerCase();
        const hasHeader = Boolean(header_v);

        if (!hasHeader) {
            return `<field name="${name}" width="0" hidden="true" readOnly="true">\n\t<header v="" e=""></header>\n</field>`;
        }
        if (sql_type.includes('int')) {
            return `<field name="${name}" type="Int32" width="70" align="right" readOnly="true">\n\t<header v="${header_v}" e="${header_e || ''}"></header>\n</field>`;
        }
        return `<field name="${name}" width="100" readOnly="true">\n\t<header v="${header_v}" e="${header_e || ''}"></header>\n</field>`;
    }).join('\n');
}

function buildDetailViewXml(trace_fields) {
    if (!Array.isArray(trace_fields) || trace_fields.length === 0) return '';
    return trace_fields.map(f => `<field name="${f.name || ''}"/>`).join('\n');
}

function buildMultiFormTransferJs(include_ma_nt, transfer_map_fields) {
    const fields = transfer_map_fields || 'ma_vt, ten_vt%l, dvt, he_so, ma_lo_ban, lo_yn';
    if (include_ma_nt) {
        return `  var ma_nt = w.getItemValue('ma_nt'),
    l0 = z._getColumnOrder('ma_vt'),
    l1 = z._getColumnOrder('dvt'),
    l2 = getColumnOrderTagRow(g, 'nhieu_dvt'),
    l3 = getColumnOrderTagRow(g, 'so_luong0'),
    l4 = getColumnOrderTagRow(g, 'so_luong'),
    l8 = getColumnOrderTagRow(g, 'ma_nt');
  var fields = '${fields}';

  for (var r = 0; r < a.length; r++) {
    var v = (ma_nt == a[r][l8]);
    var map = fields;
    if (v) map += ''; //ex 'gia_nt, gia'
    if (a[r][l3] != 0) {
      var ins = true, row = z._rowCount;
      if (first && row > 0) if (z.blankMemvar(row)) { ins = false; first = false; }
      if (ins) z._appendRow(null, true);
      row = z._rowCount;
      insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);
      $func.setObjectWhen(z._getItem(row, l1), a[r][l2]);
    }
  }`;
    }
    return `  var l0 = z._getColumnOrder('ma_vt'),
    l1 = z._getColumnOrder('dvt'),
    l2 = getColumnOrderTagRow(g, 'nhieu_dvt'),
    l3 = getColumnOrderTagRow(g, 'so_luong0'),
    l4 = getColumnOrderTagRow(g, 'so_luong');
  var fields = '${fields}';

  for (var r = 0; r < a.length; r++) {
    var map = fields;
    if (a[r][l3] != 0) {
      var ins = true, row = z._rowCount;
      if (first && row > 0) if (z.blankMemvar(row)) { ins = false; first = false; }
      if (ins) z._appendRow(null, true);
      row = z._rowCount;
      insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);
      $func.setObjectWhen(z._getItem(row, l1), a[r][l2]);
    }
  }`;
}

/**
 * Tự động derive các trường on-the-fly từ FormInput mà không làm thay đổi trực tiếp form gốc
 * @param {object} form - FormInput JSON
 * @returns {object} FormInput kèm các trường derived
 */
function deriveFormInput(form) {
    if (!form || typeof form !== 'object') return {};
    const out = { ...form };

    if (out.src_table_mode === 'partitioned') {
        const ext = out.src_ext || '';
        out.src_d_table = `d${ext}$`;
        out.src_m_prefix = `m${ext}$`;
        out.src_i_prefix = `i${ext}$`;
        out.src_m_table_general = `m${ext}$000000`;
        out.src_c_table = out.src_c_table || `c${ext}$000000`;
        out.flow_multi_general_table = out.src_c_table;
        out.src_d_table_arg = out.src_d_table;
    } else {
        out.src_d_table = out.src_detail_table || '';
        out.src_d_table_arg = out.src_detail_table || '';
        out.flow_multi_general_table = out.src_master_table || '';
    }

    out.f1 = out.f1 || defaultF1();
    out.f2 = out.f2 || buildF2FromTrace(out.trace_fields);
    out.master_set_fields = out.master_set_fields || buildMasterSetFields(out.trace_fields);
    out.other_copy_field = out.other_copy_field || 'nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn';
    out.include_ma_nt = out.include_ma_nt !== false;

    // FIX-15: Proc SQL variables
    out.dest_line_qty_col = out.dest_line_qty_col || 'so_luong';
    out.use_he_so_convert = Boolean(out.use_he_so_convert);
    out.dest_d_table_struct = out.dest_d_table ? (out.dest_d_table.endsWith('$') ? `${out.dest_d_table}000000` : out.dest_d_table) : 'd$000000';
    out.src_taken_col = out.src_taken_col || (out.src_table_mode === 'partitioned' ? 'sl_ycn' : 'sl_pnd');

    // FIX-04 & FIX-09: Status, conditions & filter extra
    const statusList = parseStatusList(out.finding_status_list);
    out.finding_status_arg = formatFindingStatusArg(out.finding_status_list);
    out.filter_key_flow = out.filter_key_flow || deriveFilterKeyFlow(statusList);
    out.multigrid_status_clause = deriveMultigridWhereExtra(statusList);
    const extraFilter = (out.multigrid_filter_extra || '').trim();
    out.multigrid_filter_extra_sql = extraFilter ? (' ' + extraFilter.replace(/'/g, "''")) : '';

    // FIX-13: Lookup detail 3 arguments - do NOT silently auto-fill when empty
    out.lookup_detail_table = (out.lookup_detail_table || '').trim();
    out.lookup_detail_alias = (out.lookup_detail_alias || '').trim();
    out.lookup_detail_remain_expr = (out.lookup_detail_remain_expr || '').trim();

    // FIX-08 & FIX-11: MultiGrid & MultiForm transfer JS / ma_nt fields
    if (out.include_ma_nt) {
        out.multigrid_ma_nt_field = `\n    <field name="ma_nt" width="50" allowFilter="&GridQueryAllowFilter;" allowSorting="&GridQueryAllowSorting;" aliasName="m" readOnly="true">\n      <header v="Mã nt" e="Currency"></header>\n      <query>&InsertCommandFilter;</query>\n    </field>`;
        out.multigrid_ma_nt_view = `\n      <field name="ma_nt"/>`;
    } else {
        out.multigrid_ma_nt_field = '';
        out.multigrid_ma_nt_view = '';
    }

    out.parent_controller = out.parent_controller || out.dest_tran || '';
    out.dest_parent_unit_field = out.dest_parent_unit_field || 'ma_dvcs';
    out.dest_parent_date_field = out.dest_parent_date_field || (out.src_table_mode === 'partitioned' ? 'ngay_lct' : 'ngay_ct');
    out.transfer_map_fields = out.transfer_map_fields || (out.src_table_mode === 'single' ? 'ma_vt, ten_vt%l, dvt, he_so, lo_yn' : 'ma_vt, ten_vt%l, dvt, he_so, ma_lo_ban, lo_yn');
    out.multiform_transfer_js = buildMultiFormTransferJs(out.include_ma_nt, out.transfer_map_fields);
    out.filter_retrieve_fields = (out.include_ma_nt !== false)
        ? (out.filter_retrieve_fields || 'ma_nt')
        : (out.filter_retrieve_fields || '');
    out.filter_none_message_v = out.filter_none_message_v || 'Không có dữ liệu theo điều kiện đang lọc.';
    out.filter_none_message_e = out.filter_none_message_e || 'No data matching filter condition.';

    // Tiêu đề
    if (out.titles) {
        out.title_filter_v = out.titles.filter_v || '';
        out.title_filter_e = out.titles.filter_e || '';
        out.title_multiform_v = out.titles.multiform_v || '';
        out.title_multiform_e = out.titles.multiform_e || '';
        out.title_multigrid_v = out.titles.multigrid_v || '';
        out.title_multigrid_e = out.titles.multigrid_e || '';
        out.subtitle_multigrid_v = out.titles.subtitle_multigrid_v || out.subtitle_multigrid_v || 'Từ ngày %d1 đến ngày %d2';
        out.subtitle_multigrid_e = out.titles.subtitle_multigrid_e || out.subtitle_multigrid_e || 'Date from %d1 to %d2';
        out.title_filter_date_v = out.titles.filter_date_v || '';
        out.title_filter_date_e = out.titles.filter_date_e || '';
        out.title_filter_so_v = out.titles.filter_so_v || '';
        out.title_filter_so_e = out.titles.filter_so_e || '';
    } else {
        out.subtitle_multigrid_v = out.subtitle_multigrid_v || 'Từ ngày %d1 đến ngày %d2';
        out.subtitle_multigrid_e = out.subtitle_multigrid_e || 'Date from %d1 to %d2';
    }

    // FIX-22: Lookup default field list args
    out.lookup_output_fields = out.lookup_output_fields || 'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,status';
    out.lookup_select_fields = out.lookup_select_fields || 'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,a.status,b.statusname%l u0%l';
    out.lookup_from_clause = out.lookup_from_clause || `a left join dmttct b on a.status = b.status where b.ma_ct = ''${out.src_ma_ct || ''}''`;

    // Trường vết cho template SQL: lấy theo index 0 (khóa) và index 1 (dòng)
    if (Array.isArray(out.trace_fields) && out.trace_fields.length > 0) {
        out.stt_rec_src_col = out.trace_fields[0]?.name || 'stt_rec_src';
        out.stt_rec0_src_col = out.trace_fields[1]?.name || 'stt_rec0_src';
    } else {
        out.stt_rec_src_col = 'stt_rec_src';
        out.stt_rec0_src_col = 'stt_rec0_src';
    }

    // FIX-05: Detail XML snippets
    out.dest_tran_detail = (out.dest_tran || '').replace(/Tran$/i, 'Detail') || 'Detail';
    out.detail_fields_xml = buildDetailFieldXml(out.trace_fields);
    out.detail_views_xml = buildDetailViewXml(out.trace_fields);

    return out;
}

module.exports = {
    defaultF1,
    buildF2FromTrace,
    buildMasterSetFields,
    parseStatusList,
    formatFindingStatusArg,
    deriveFilterKeyFlow,
    deriveMultigridWhereExtra,
    buildDetailFieldXml,
    buildDetailViewXml,
    buildMultiFormTransferJs,
    deriveFormInput
};
