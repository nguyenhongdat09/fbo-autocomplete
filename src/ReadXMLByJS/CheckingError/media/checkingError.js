(function () {
    const vscode = acquireVsCodeApi();
    let state = { sources: ['', ''], result: null, generate_enabled: false };

    const el_sources = document.getElementById('sources-bar');
    const el_t1 = document.querySelector('#table1 tbody');
    const el_t2 = document.querySelector('#table2 tbody');
    const el_t3 = document.querySelector('#table3 tbody');
    const btn_generate = document.getElementById('btn-generate');
    const btn_add = document.getElementById('btn-add-source');
    const btn_check = document.getElementById('btn-run-check');
    const el_status = document.getElementById('status');

    function render_sources() {
        el_sources.innerHTML = '';
        (state.sources || []).forEach((src, index) => {
            const wrap = document.createElement('div');
            wrap.className = 'source-item';
            wrap.innerHTML = `<label>Nguồn ${index + 1}</label>
                <input type="text" data-index="${index}" value="${escape_attr(src || '')}" />
                <button data-pick="${index}">Browse</button>`;
            el_sources.appendChild(wrap);
        });
        el_sources.querySelectorAll('button[data-pick]').forEach(btn => {
            btn.onclick = () => vscode.postMessage({ type: 'pick_source', source_index: Number(btn.getAttribute('data-pick')) });
        });
        el_sources.querySelectorAll('input[data-index]').forEach(inp => {
            inp.onchange = () => vscode.postMessage({
                type: 'set_source',
                source_index: Number(inp.getAttribute('data-index')),
                path: inp.value.trim()
            });
        });
    }

    function escape_attr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function render_tables() {
        const result = state.result || { table1_missing: [], table2_entities: [], table3_xml_errors: [] };
        el_t1.innerHTML = '';
        (result.table1_missing || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escape_attr(row.xml_short)}</td>
                <td title="${escape_attr(row.missing_path)}">${escape_attr(row.relative_path || row.missing_path)}</td>
                <td>${escape_attr(row.source_label)}</td>`;
            el_t1.appendChild(tr);
        });

        el_t3.innerHTML = '';
        (result.table3_xml_errors || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escape_attr(row.xml_short)}</td>
                <td>${row.missing_count}</td><td>${row.undeclared_count}</td>`;
            el_t3.appendChild(tr);
        });

        el_t2.innerHTML = '';
        (result.table2_entities || []).forEach((row, row_index) => {
            const tr = document.createElement('tr');
            const icon = row.status === 'ok' ? '✔ OK' : '✖';
            const klass = row.status === 'ok' ? 'ok' : 'bad';
            const detail = row.status === 'ok'
                ? `${row.source_label}: ${row.decl_file || ''} :${row.decl_line || ''}`
                : row.source_label;
            tr.innerHTML = `<td>${escape_attr(row.xml_short)}</td>
                <td>&amp;${escape_attr(row.entity_name)};</td>
                <td class="${klass}">${icon} ${escape_attr(detail)}</td>
                <td><button data-check="${row_index}" ${row.status !== 'ok' ? 'disabled' : ''}>Check</button></td>`;
            el_t2.appendChild(tr);
        });
        el_t2.querySelectorAll('button[data-check]').forEach(btn => {
            btn.onclick = () => vscode.postMessage({
                type: 'open_entity_decl',
                row_index: Number(btn.getAttribute('data-check'))
            });
        });

        btn_generate.disabled = !state.generate_enabled;
    }

    function apply_loading(msg) {
        el_status.innerHTML = `<span class="loading-icon">⏳</span> ${escape_attr(msg.status_text || 'Loading...')}`;
        btn_check.disabled = true;
        btn_generate.disabled = true;
        btn_add.disabled = true;
        document.body.style.cursor = 'wait';
    }

    function apply_state(msg) {
        state.sources = msg.payload.sources || state.sources;
        state.result = msg.payload.result;
        state.generate_enabled = !!msg.payload.generate_enabled;
        el_status.textContent = msg.payload.status_text || '';
        
        btn_check.disabled = false;
        btn_add.disabled = false;
        document.body.style.cursor = 'default';
        
        render_sources();
        render_tables();
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg && msg.type === 'state') apply_state(msg);
        else if (msg && msg.type === 'loading') apply_loading(msg);
    });

    btn_add.onclick = () => vscode.postMessage({ type: 'add_source' });
    btn_check.onclick = () => vscode.postMessage({ type: 'run_check' });
    btn_generate.onclick = () => vscode.postMessage({ type: 'generate' });

    // Báo extension webview đã sẵn sàng nhận state (tránh race lần mở đầu)
    vscode.postMessage({ type: 'ready' });
})();
