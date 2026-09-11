const vscode = acquireVsCodeApi();

const DEFAULT_SYSFILTER_ROWS = [
    { id_suffix: 'CurrencyCode', name: 'ma_nt', exname: 'þm.ma_nt' },
    { id_suffix: 'ItemCode', name: 'ma_vt', exname: 'þa.ma_vt' },
    { id_suffix: 'ItemName', name: 'ten_vt%2', exname: 'þb.ten_vt%2' },
    { id_suffix: 'UOM', name: 'dvt', exname: 'þa.dvt' },
    { id_suffix: 'VoucherDate', name: 'ngay_ct', exname: 'þa.ngay_ct' },
    { id_suffix: 'VoucherNumber', name: 'so_ct', exname: 'þa.so_ct' }
];

let currentPresets = {};
let previewData = {
    Filter: '',
    MultiForm: '',
    MultiGrid: '',
    Lookup: '',
    SQL: ''
};
let activeTab = 'Filter';
let previewDebounceTimer = null;

// DOM Elements
const formPane = document.getElementById('formPane');
const codeViewer = document.getElementById('codeViewer');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const btnLoadYCNDXA = document.getElementById('btnLoadYCNDXA');
const btnLoadZCWIMO = document.getElementById('btnLoadZCWIMO');
const btnRefreshPreview = document.getElementById('btnRefreshPreview');
const btnGenerate = document.getElementById('btnGenerate');
const btnAddTraceField = document.getElementById('btnAddTraceField');
const btnAddSysfilterRow = document.getElementById('btnAddSysfilterRow');
const traceFieldsList = document.getElementById('traceFieldsList');
const sysfilterTableBody = document.querySelector('#sysfilterTable tbody');

function setStatus(type, message) {
    statusBadge.className = `badge badge-${type}`;
    statusBadge.textContent = type.toUpperCase();
    statusText.textContent = message;
}

function getSelectedMode() {
    const checked = document.querySelector('input[name="src_table_mode"]:checked');
    return checked ? checked.value : 'partitioned';
}

function switchMode(mode) {
    const partitionedEls = document.querySelectorAll('.mode-partitioned-only');
    const singleEls = document.querySelectorAll('.mode-single-only');

    if (mode === 'partitioned') {
        partitionedEls.forEach(el => el.style.display = '');
        singleEls.forEach(el => el.style.display = 'none');
    } else {
        partitionedEls.forEach(el => el.style.display = 'none');
        singleEls.forEach(el => el.style.display = '');
    }

    updateDerivedPreview();
}

function updateDerivedPreview() {
    const ext = document.getElementById('src_ext').value.trim();
    const dTablePreview = document.getElementById('src_d_table_preview');
    if (dTablePreview) {
        dTablePreview.value = ext ? `d${ext}$` : 'd{ext}$';
    }
}

function getTraceFieldsFromList() {
    const rows = traceFieldsList.querySelectorAll('.trace-row');
    const trace_fields = [];
    rows.forEach(row => {
        const name = row.querySelector('.field-name')?.value.trim();
        const sql_type = row.querySelector('.field-sql-type')?.value.trim();
        const header_v = row.querySelector('.field-header-v')?.value.trim();
        if (name) {
            trace_fields.push({ name, sql_type, header_v });
        }
    });
    return trace_fields;
}

function getSysfilterRowsFromTable() {
    const rows = sysfilterTableBody.querySelectorAll('tr');
    const sysfilter_rows = [];
    rows.forEach(tr => {
        const id_suffix = tr.querySelector('.sysfilter-id')?.value.trim();
        const name = tr.querySelector('.sysfilter-name')?.value.trim();
        const exname = tr.querySelector('.sysfilter-exname')?.value.trim();
        if (id_suffix || name) {
            sysfilter_rows.push({ id_suffix, name, exname });
        }
    });
    return sysfilter_rows;
}

function renderTraceFieldsList(fields) {
    traceFieldsList.innerHTML = '';
    if (!Array.isArray(fields)) return;

    fields.forEach((field) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'trace-row';
        rowEl.innerHTML = `
            <button type="button" class="btn-delete-row" title="Xóa dòng">✕</button>
            <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));">
                <div class="form-group">
                    <label>Tên trường đích</label>
                    <input type="text" class="field-name" value="${field.name || ''}" placeholder="stt_rec_dxa">
                </div>
                <div class="form-group">
                    <label>Kiểu SQL</label>
                    <input type="text" class="field-sql-type" value="${field.sql_type || 'char(13)'}" placeholder="char(13)">
                </div>
                <div class="form-group">
                    <label>Tiêu đề</label>
                    <input type="text" class="field-header-v" value="${field.header_v || ''}" placeholder="Tiêu đề (để trống nếu ẩn)">
                </div>
            </div>
        `;
        traceFieldsList.appendChild(rowEl);
    });

    bindListEvents();
}

function renderSysfilterTable(rows) {
    sysfilterTableBody.innerHTML = '';
    const targetRows = (Array.isArray(rows) && rows.length > 0) ? rows : DEFAULT_SYSFILTER_ROWS;

    targetRows.forEach(row => {
        const tr = document.createElement('tr');

        const tdId = document.createElement('td');
        tdId.innerHTML = `<input type="text" class="sysfilter-id" value="${row.id_suffix || ''}" placeholder="ItemCode">`;

        const tdName = document.createElement('td');
        tdName.innerHTML = `<input type="text" class="sysfilter-name" value="${row.name || ''}" placeholder="ma_vt">`;

        const tdExname = document.createElement('td');
        tdExname.innerHTML = `<input type="text" class="sysfilter-exname" value="${row.exname || ''}" placeholder="þa.ma_vt">`;

        const tdActions = document.createElement('td');
        tdActions.innerHTML = `<button type="button" class="btn-secondary btn-sm btn-delete-row" title="Xóa dòng">✕</button>`;

        tr.appendChild(tdId);
        tr.appendChild(tdName);
        tr.appendChild(tdExname);
        tr.appendChild(tdActions);

        sysfilterTableBody.appendChild(tr);
    });

    bindListEvents();
}

function bindListEvents() {
    traceFieldsList.querySelectorAll('.btn-delete-row').forEach(btn => {
        btn.onclick = function() {
            this.closest('.trace-row').remove();
            triggerAutoPreview();
        };
    });

    sysfilterTableBody.querySelectorAll('.btn-delete-row').forEach(btn => {
        btn.onclick = function() {
            this.closest('tr').remove();
            triggerAutoPreview();
        };
    });

    traceFieldsList.querySelectorAll('input').forEach(input => {
        input.oninput = triggerAutoPreview;
    });

    sysfilterTableBody.querySelectorAll('input').forEach(input => {
        input.oninput = triggerAutoPreview;
    });
}

function getFormInput() {
    const mode = getSelectedMode();
    return {
        src_table_mode: mode,
        identity: document.getElementById('identity').value.trim(),
        dest_tran: document.getElementById('dest_tran').value.trim(),
        src_ma_ct: document.getElementById('src_ma_ct').value.trim(),
        src_ext: document.getElementById('src_ext').value.trim(),
        dest_d_table: document.getElementById('dest_d_table').value.trim(),
        dest_m_table: document.getElementById('dest_m_table').value.trim(),
        src_c_table: document.getElementById('src_c_table').value.trim(),
        src_inquiry_table: document.getElementById('src_inquiry_table').value.trim(),
        src_master_table: document.getElementById('src_master_table').value.trim(),
        src_detail_table: document.getElementById('src_detail_table').value.trim(),
        src_qty_col: document.getElementById('src_qty_col').value.trim(),
        src_taken_col: document.getElementById('src_taken_col').value.trim(),
        src_taken_sql_type: document.getElementById('src_taken_sql_type').value.trim(),
        src_taken_header_v: document.getElementById('src_taken_header_v').value.trim(),
        finding_status_list: document.getElementById('finding_status_list').value.trim(),
        multigrid_filter_extra: document.getElementById('multigrid_filter_extra').value.trim(),
        lookup_detail_table: document.getElementById('lookup_detail_table').value.trim(),
        lookup_detail_alias: document.getElementById('lookup_detail_alias').value.trim(),
        lookup_detail_remain_expr: document.getElementById('lookup_detail_remain_expr').value.trim(),
        titles: {
            filter_v: document.getElementById('title_filter_v').value.trim(),
            multiform_v: document.getElementById('title_multiform_v').value.trim(),
            multigrid_v: document.getElementById('title_multigrid_v').value.trim(),
            filter_date_v: document.getElementById('title_filter_date_v').value.trim(),
            filter_so_v: document.getElementById('title_filter_so_v').value.trim()
        },
        filter_none_message_v: document.getElementById('filter_none_message_v').value.trim(),
        trace_fields: getTraceFieldsFromList(),
        include_ma_nt: document.getElementById('include_ma_nt').checked,
        f1: document.getElementById('f1').value.trim(),
        f2: document.getElementById('f2').value.trim(),
        master_set_fields: document.getElementById('master_set_fields').value.trim(),
        transfer_map_fields: document.getElementById('transfer_map_fields') ? document.getElementById('transfer_map_fields').value.trim() : '',
        other_copy_field: document.getElementById('other_copy_field').value.trim(),
        sysfilter_rows: getSysfilterRowsFromTable(),
        proc_name: document.getElementById('proc_name').value.trim(),
        use_he_so_convert: document.getElementById('use_he_so_convert').checked,
        dest_parent_date_field: document.getElementById('dest_parent_date_field').value.trim(),
        dest_parent_unit_field: document.getElementById('dest_parent_unit_field').value.trim()
    };
}

function loadForm(form) {
    if (!form) return;

    // Mode radio
    const mode = form.src_table_mode || 'partitioned';
    const radio = document.querySelector(`input[name="src_table_mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    switchMode(mode);

    // Text inputs
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined && val !== null ? val : '';
    };

    setVal('identity', form.identity);
    setVal('dest_tran', form.dest_tran);
    setVal('src_ma_ct', form.src_ma_ct);
    setVal('src_ext', form.src_ext);
    setVal('dest_d_table', form.dest_d_table);
    setVal('dest_m_table', form.dest_m_table);
    setVal('src_c_table', form.src_c_table);
    setVal('src_inquiry_table', form.src_inquiry_table);
    setVal('src_master_table', form.src_master_table);
    setVal('src_detail_table', form.src_detail_table);
    setVal('src_qty_col', form.src_qty_col || 'so_luong');
    setVal('src_taken_col', form.src_taken_col);
    setVal('src_taken_sql_type', form.src_taken_sql_type || 'numeric(19,4)');
    setVal('src_taken_header_v', form.src_taken_header_v);
    setVal('finding_status_list', form.finding_status_list || '2');
    setVal('multigrid_filter_extra', form.multigrid_filter_extra || '');
    setVal('lookup_detail_table', form.lookup_detail_table);
    setVal('lookup_detail_alias', form.lookup_detail_alias || '');
    setVal('lookup_detail_remain_expr', form.lookup_detail_remain_expr);

    if (form.titles) {
        setVal('title_filter_v', form.titles.filter_v);
        setVal('title_multiform_v', form.titles.multiform_v);
        setVal('title_multigrid_v', form.titles.multigrid_v);
        setVal('title_filter_date_v', form.titles.filter_date_v);
        setVal('title_filter_so_v', form.titles.filter_so_v);
    }

    setVal('filter_none_message_v', form.filter_none_message_v);

    const chkMaNt = document.getElementById('include_ma_nt');
    if (chkMaNt) chkMaNt.checked = form.include_ma_nt !== false;

    setVal('f1', form.f1);
    setVal('f2', form.f2);
    setVal('master_set_fields', form.master_set_fields);
    setVal('transfer_map_fields', form.transfer_map_fields || (form.src_table_mode === 'single' ? 'ma_vt, ten_vt%l, dvt, he_so, lo_yn' : 'ma_vt, ten_vt%l, dvt, he_so, ma_lo_ban, lo_yn'));
    setVal('other_copy_field', form.other_copy_field || 'nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn');
    setVal('proc_name', form.proc_name);

    const chkHeSo = document.getElementById('use_he_so_convert');
    if (chkHeSo) chkHeSo.checked = Boolean(form.use_he_so_convert);

    setVal('dest_parent_date_field', form.dest_parent_date_field || 'ngay_lct');
    setVal('dest_parent_unit_field', form.dest_parent_unit_field || 'ma_dvcs');

    renderTraceFieldsList(form.trace_fields || []);
    renderSysfilterTable(form.sysfilter_rows || DEFAULT_SYSFILTER_ROWS);

    updateDerivedPreview();
    requestPreview();
}

function updateCodeViewer() {
    codeViewer.value = previewData[activeTab] || '';
}

function requestPreview() {
    const form = getFormInput();
    vscode.postMessage({
        type: 'preview',
        form
    });
}

function triggerAutoPreview() {
    if (previewDebounceTimer) {
        clearTimeout(previewDebounceTimer);
    }
    previewDebounceTimer = setTimeout(() => {
        requestPreview();
    }, 350);
}

// Event Listeners
document.querySelectorAll('input[name="src_table_mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
        switchMode(e.target.value);
        triggerAutoPreview();
    });
});

document.getElementById('src_ext')?.addEventListener('input', () => {
    updateDerivedPreview();
    triggerAutoPreview();
});

formPane.addEventListener('input', e => {
    if (e.target.closest('#traceFieldsList') || e.target.closest('#sysfilterTable')) return;
    triggerAutoPreview();
});

document.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', () => {
        triggerAutoPreview();
    });
});

btnAddTraceField.addEventListener('click', () => {
    const rowEl = document.createElement('div');
    rowEl.className = 'trace-row';
    rowEl.innerHTML = `
        <button type="button" class="btn-delete-row" title="Xóa dòng">✕</button>
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));">
            <div class="form-group">
                <label>Tên trường đích</label>
                <input type="text" class="field-name" placeholder="stt_rec_custom">
            </div>
            <div class="form-group">
                <label>Kiểu SQL</label>
                <input type="text" class="field-sql-type" value="char(13)" placeholder="char(13)">
            </div>
            <div class="form-group">
                <label>Tiêu đề</label>
                <input type="text" class="field-header-v" placeholder="Tiêu đề (để trống nếu ẩn)">
            </div>
        </div>
    `;
    traceFieldsList.appendChild(rowEl);
    bindListEvents();
    triggerAutoPreview();
});

btnAddSysfilterRow.addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="sysfilter-id" placeholder="FieldSuffix"></td>
        <td><input type="text" class="sysfilter-name" placeholder="field_name"></td>
        <td><input type="text" class="sysfilter-exname" placeholder="þa.field_name"></td>
        <td><button type="button" class="btn-secondary btn-sm btn-delete-row" title="Xóa dòng">✕</button></td>
    `;
    sysfilterTableBody.appendChild(tr);
    bindListEvents();
    triggerAutoPreview();
});

document.querySelectorAll('.preview-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.getAttribute('data-tab');
        updateCodeViewer();
    });
});

btnLoadYCNDXA.addEventListener('click', () => {
    if (currentPresets.ycndxa) {
        loadForm(currentPresets.ycndxa);
        setStatus('info', 'Đã tải Preset YCNDXA (Bảng tách kỳ theo tháng)');
    }
});

btnLoadZCWIMO.addEventListener('click', () => {
    if (currentPresets.zcwimo) {
        loadForm(currentPresets.zcwimo);
        setStatus('info', 'Đã tải Preset zcWIMO (Bảng đơn không tách kỳ)');
    }
});

btnRefreshPreview.addEventListener('click', () => {
    requestPreview();
});

btnGenerate.addEventListener('click', () => {
    const form = getFormInput();
    setStatus('info', 'Đang tiến hành generate 4 XML và 1 SQL temp...');
    vscode.postMessage({
        type: 'generate',
        form
    });
});

// Message Listener from Host
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'init':
            currentPresets = message.presets || {};
            if (currentPresets.ycndxa) {
                loadForm(currentPresets.ycndxa);
            } else {
                renderSysfilterTable(DEFAULT_SYSFILTER_ROWS);
            }
            break;

        case 'previewResult':
            if (message.error) {
                setStatus('error', `Lỗi preview: ${message.error}`);
            } else {
                if (message.xml) {
                    previewData.Filter = message.xml.Filter || '';
                    previewData.MultiForm = message.xml.MultiForm || '';
                    previewData.MultiGrid = message.xml.MultiGrid || '';
                    previewData.Lookup = message.xml.Lookup || '';
                }
                previewData.SQL = message.sql || '';
                updateCodeViewer();

                if (message.warnings && message.warnings.length > 0) {
                    setStatus('warning', `Preview sẵn sàng (${message.warnings.join(', ')})`);
                } else {
                    setStatus('success', 'Preview cập nhật thành công.');
                }
            }
            break;

        case 'generated':
            if (message.errors && message.errors.length > 0) {
                setStatus('error', `Generate hoàn tất với lỗi: ${message.errors.join(', ')}`);
            } else {
                const count = (message.paths || []).length;
                setStatus('success', `Đã tạo thành công ${count} file!`);
            }
            break;

        case 'error':
            setStatus('error', message.message || 'Lỗi không xác định.');
            break;
    }
});

// Signal to host that webview is ready
vscode.postMessage({ type: 'ready' });
