/* ═══════════════════════════════════════════════════════════════
   XML Flat Preview — Webview Renderer (Plain Text + Entity Highlight)
   ═══════════════════════════════════════════════════════════════ */

var data = null;
var active_tooltip_span = null;
var pinned_tooltip_span = null;
var hover_timeout = null;
var search_matches_count = 0;
var current_search_match_idx = -1;
var current_active_line = -1;
var current_search_query = '';

// Webview gán html động: DOMContentLoaded có thể đã fire trước khi script chạy
function bootstrap_preview() {
    if (!window.flatPreviewData) return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { init(window.flatPreviewData); });
    } else {
        init(window.flatPreviewData);
    }
}
bootstrap_preview();

/* ─── Init ─── */
function init(payload) {
    data = payload;

    if (data.theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    // Cấu hình checkboxes
    if (document.getElementById('chk-wrap')) document.getElementById('chk-wrap').checked = data.settings.word_wrap;

    // Stats
    document.getElementById('stat-total-entities').textContent = data.model.stats.entity_count;
    document.getElementById('stat-unique-entities').textContent = data.model.stats.unique_entities.length;
    var flat_len = data.model.flat_text.length;
    var flat_cr = (data.model.flat_text.match(/\r/g) || []).length;
    document.getElementById('stat-size').textContent = fmt_num(data.model.stats.expanded_chars) + ' (Webview: ' + flat_len + ', CR: ' + flat_cr + ')';
    document.getElementById('stat-duration').textContent = data.model.stats.duration_ms;

    // Warnings
    var banner = document.getElementById('warnings-banner');
    var list = document.getElementById('warnings-list');
    var toggle = document.getElementById('btn-warnings-toggle');
    list.innerHTML = '';
    if (data.model.warnings && data.model.warnings.length > 0) {
        document.getElementById('warning-count').textContent = data.model.warnings.length;
        data.model.warnings.forEach(function(warn) {
            var li = document.createElement('li');
            li.textContent = '[' + warn.code + '] ' + warn.message;
            list.appendChild(li);
        });
        banner.classList.remove('hidden');
        banner.classList.remove('collapsed');
        if (toggle) toggle.innerHTML = '&#x25be;';
    } else {
        banner.classList.add('hidden');
    }

    if (document.getElementById('txt-entity-search')) document.getElementById('txt-entity-search').value = '';
    if (document.getElementById('txt-search')) document.getElementById('txt-search').value = '';
    current_search_query = '';

    renderCodeView();
    renderLegend();
    setupEventListeners();
}

/* ─── Helpers ─── */
function fmt_num(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getFlatLineNum(offset) {
    if (!data || !data.model || !data.model.flat_text) return 1;
    var lines = data.model.flat_text.split('\n');
    var len = 0;
    for (var i = 0; i < lines.length; i++) {
        if (offset <= len + lines[i].length) return i + 1;
        len += lines[i].length + 1;
    }
    return 1;
}

function esc(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* --- XML Syntax Highlighter --- */
function highlightXmlSyntax(text) {
    var result = '';
    var i = 0;
    var len = text.length;
    
    while (i < len) {
        // 1. Comment
        if (text.substr(i, 4) === '<!--') {
            var end = text.indexOf('-->', i + 4);
            if (end === -1) end = len;
            else end += 3;
            result += '<span class="xml-comment">' + esc(text.substring(i, end)) + '</span>';
            i = end;
            continue;
        }
        
        // 2. CDATA start/end
        if (text.substr(i, 9) === '<![CDATA[') {
            result += '<span class="xml-cdata-b">' + esc('<![CDATA[') + '</span>';
            i += 9;
            continue;
        }
        if (text.substr(i, 3) === ']]>') {
            result += '<span class="xml-cdata-b">' + esc(']]>') + '</span>';
            i += 3;
            continue;
        }
        
        // 3. Tag XML
        if (text[i] === '<') {
            var in_quote = false;
            var quote_char = '';
            var j = i + 1;
            while (j < len) {
                var char = text[j];
                if (!in_quote) {
                    if (char === '"' || char === "'") {
                        in_quote = true;
                        quote_char = char;
                    } else if (char === '>') {
                        j++;
                        break;
                    }
                } else {
                    if (char === quote_char) {
                        in_quote = false;
                    }
                }
                j++;
            }
            var tag_str = text.substring(i, j);
            result += highlightTagSyntax(tag_str);
            i = j;
            continue;
        }
        
        // 4. Text thường
        var next_bracket = text.indexOf('<', i);
        var next_cdata_end = text.indexOf(']]>', i);
        var next = len;
        if (next_bracket !== -1 && next_bracket < next) next = next_bracket;
        if (next_cdata_end !== -1 && next_cdata_end < next) next = next_cdata_end;
        
        result += '<span class="native-text">' + esc(text.substring(i, next)) + '</span>';
        i = next;
    }
    return result;
}

function highlightTagSyntax(tag_str) {
    var is_close = tag_str.charAt(1) === '/';
    var inner_start = is_close ? 2 : 1;
    var is_self_close = tag_str.slice(-2) === '/>';
    var inner_end = is_self_close ? tag_str.length - 2 : tag_str.length - 1;
    
    var inner = tag_str.substring(inner_start, inner_end);
    var name_match = inner.match(/^([\w:.\-]+)/);
    var tag_name = name_match ? name_match[1] : inner;
    var attrs_str = name_match ? inner.substring(tag_name.length) : '';
    
    var html = '';
    html += '<span class="xml-bracket">&lt;' + (is_close ? '/' : '') + '</span>';
    html += '<span class="xml-tag">' + esc(tag_name) + '</span>';
    
    if (attrs_str.trim().length > 0) {
        var attr_regex = /([\w:.\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        var last_attr_idx = 0;
        var match;
        while ((match = attr_regex.exec(attrs_str)) !== null) {
            var before_attr = attrs_str.substring(last_attr_idx, match.index);
            html += esc(before_attr);
            
            var attr_name = match[1];
            var attr_val = match[2] !== undefined ? match[2] : match[3];
            var quote = match[2] !== undefined ? '"' : "'";
            
            html += '<span class="xml-attr">' + esc(attr_name) + '</span>';
            html += '<span class="xml-equal">=</span>';
            html += '<span class="xml-attr-val">' + esc(quote + attr_val + quote) + '</span>';
            
            last_attr_idx = attr_regex.lastIndex;
        }
        if (last_attr_idx < attrs_str.length) {
            html += esc(attrs_str.substring(last_attr_idx));
        }
    }
    
    html += '<span class="xml-bracket">' + (is_self_close ? '/' : '') + '&gt;</span>';
    return html;
}

/* ═══════════════════════════════════
   RENDER CODE VIEW — tô màu theo vùng không chồng (hỗ trợ entity lồng nhau)
   ═══════════════════════════════════ */
function getHighlightSpans() {
    if (!data || !data.model || !data.model.spans) return [];
    return data.model.spans.slice().sort(function(a, b) {
        return a.start - b.start || a.depth - b.depth;
    });
}

function getSortedRootSpans() {
    return getHighlightSpans().filter(function(s) { return s.depth === 0; });
}

function findSpanForRange(spans, start, end) {
    var best = null;
    for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        if (s.start <= start && s.end >= end) {
            if (!best || s.depth > best.depth) {
                best = s;
            }
        }
    }
    return best;
}

function findSpanIndex(all_spans, target) {
    for (var i = 0; i < all_spans.length; i++) {
        var s = all_spans[i];
        if (s.start === target.start && s.end === target.end && s.entity_name === target.entity_name && s.depth === target.depth) {
            return i;
        }
    }
    return -1;
}

function buildEntityStyle(span) {
    if (span.missing) return '';
    return '--span-bg-light:' + span.color_light + ';'
        + '--span-bg-dark:' + span.color_dark + ';'
        + '--span-bg-active:' + (data.theme === 'light' ? span.color_light : span.color_dark) + ';'
        + '--span-hue:' + span.color_hue + ';'
        + '--span-border-active:hsla(' + span.color_hue + ',65%,50%,0.45);';
}

function renderCodeView() {
    var code_view = document.getElementById('code-view');
    var container = document.getElementById('code-container');

    if (data.settings.word_wrap) {
        container.classList.add('wrap');
    } else {
        container.classList.remove('wrap');
    }

    var flat_text = data.model.flat_text;
    var lines = flat_text.split('\n');
    var all_spans = getHighlightSpans();
    var highlight_spans = data.settings.highlight_entities ? all_spans : [];

    var output_html = '';
    var current_pos = 0;

    for (var li = 0; li < lines.length; li++) {
        var line_text = lines[li];
        var line_start = current_pos;
        var line_end = current_pos + line_text.length;

        // Tìm các spans đè lên dòng này
        var line_spans = highlight_spans.filter(function(s) {
            return s.start < line_end && s.end > line_start;
        });

        // Tạo mảng unique_points cho dòng này
        var points = [line_start, line_end];
        line_spans.forEach(function(s) {
            var s_start = Math.max(line_start, s.start);
            var s_end = Math.min(line_end, s.end);
            if (s_end > s_start) {
                points.push(s_start, s_end);
            }
        });
        points.sort(function(a, b) { return a - b; });

        var unique_points = [];
        for (var pi = 0; pi < points.length; pi++) {
            if (pi === 0 || points[pi] !== points[pi - 1]) {
                unique_points.push(points[pi]);
            }
        }

        var line_html = '';
        for (var i = 0; i < unique_points.length - 1; i++) {
            var seg_start = unique_points[i];
            var seg_end = unique_points[i + 1];
            var chunk = flat_text.substring(seg_start, seg_end);
            
            var active = findSpanForRange(line_spans, seg_start, seg_end);

            if (active) {
                var span_idx = findSpanIndex(all_spans, active);
                var cls = active.missing ? 'entity-span missing-entity' : 'entity-span entity-depth-' + active.depth;
                var style_str = buildEntityStyle(active);
                
                if (chunk.trim() === '') {
                    line_html += esc(chunk);
                } else {
                    line_html += '<span class="' + cls + '" data-span-idx="' + span_idx + '" style="' + style_str + '">';
                    line_html += esc(chunk);
                    line_html += '</span>';
                }
            } else {
                line_html += highlightXmlSyntax(chunk);
            }
        }

        // Tạo cấu trúc row
        var line_num = li + 1;
        output_html += '<div class="code-row">';
        if (data.settings.show_line_numbers) {
            output_html += '<div class="line-number">' + line_num + '</div>';
        }
        output_html += '<div class="line-content">' + (line_html || '&nbsp;') + '</div>';
        output_html += '</div>';

        current_pos = line_end + 1; // +1 cho ký tự '\n'
    }

    code_view.innerHTML = output_html || '<div class="code-row"><div class="line-content">&lt;!-- Empty XML --&gt;</div></div>';

    if (current_active_line !== -1 && current_active_line <= lines.length) {
        highlightActiveLine(current_active_line);
    }
}

/* ─── Active line highlight helper ─── */
function highlightActiveLine(line_num) {
    var code_view = document.getElementById('code-view');
    if (!code_view) return;

    var rows = code_view.querySelectorAll('.code-row');
    if (rows.length === 0) return;

    line_num = Math.max(1, Math.min(line_num, rows.length));
    current_active_line = line_num;

    var old_active = code_view.querySelector('.code-row.active-line');
    if (old_active) {
        old_active.classList.remove('active-line');
    }

    var new_active = rows[line_num - 1];
    if (new_active) {
        new_active.classList.add('active-line');
    }
}

/* ═══════════════════════════════════
   RENDER LEGEND SIDEBAR
   ═══════════════════════════════════ */
function renderLegend(filter_query) {
    var list_el = document.getElementById('legend-list');
    list_el.innerHTML = '';

    var all_spans = getHighlightSpans();
    var counts = {};
    all_spans.forEach(function(s) {
        counts[s.entity_name] = (counts[s.entity_name] || 0) + 1;
    });
    var unique_names = Object.keys(counts).sort();

    if (filter_query && filter_query.trim() !== '') {
        var q = filter_query.toLowerCase();
        unique_names = unique_names.filter(function(name) {
            return name.toLowerCase().includes(q);
        });
    }

    if (unique_names.length === 0) {
        list_el.innerHTML = '<div style="font-size:11px;opacity:0.5;padding:10px 4px;">Không tìm thấy thực thể.</div>';
        return;
    }

    unique_names.forEach(function(name) {
        var occurrences = all_spans.filter(function(s) { return s.entity_name === name; });
        var sample = occurrences[0];
        
        // Gom nhóm occurrences theo dòng
        var line_to_occ = {};
        occurrences.forEach(function(occ) {
            var line_num = occ.root_source_line || occ.source_line || getFlatLineNum(occ.start);
            if (!line_to_occ[line_num]) {
                line_to_occ[line_num] = [];
            }
            line_to_occ[line_num].push(occ);
        });
        
        var unique_lines = Object.keys(line_to_occ).map(Number).sort(function(a, b) { return a - b; });
        
        var container = document.createElement('div');
        container.className = 'legend-item-container';

        var item = document.createElement('div');
        item.className = 'legend-item';
        item.setAttribute('data-entity-name', name);

        var left = document.createElement('div');
        left.className = 'legend-left';

        var dot = document.createElement('div');
        dot.className = 'legend-dot';
        if (sample && sample.missing) {
            dot.style.backgroundColor = '#f44336';
        } else if (sample) {
            dot.style.backgroundColor = 'hsl(' + sample.color_hue + ',70%,55%)';
        }

        var name_span = document.createElement('span');
        name_span.className = 'legend-name';
        name_span.textContent = name;
        name_span.title = '&' + name + ';';

        left.appendChild(dot);
        left.appendChild(name_span);

        var count_el = document.createElement('span');
        count_el.className = 'legend-count';
        count_el.textContent = occurrences.length;

        item.appendChild(left);
        item.appendChild(count_el);
        container.appendChild(item);

        if (unique_lines.length > 1) {
            // Dropdown indicator
            var indicator = document.createElement('span');
            indicator.className = 'legend-indicator';
            indicator.innerHTML = '&#x25be;'; // chevron down
            count_el.parentElement.insertBefore(indicator, count_el);
            item.classList.add('has-sublist');

            var sublist = document.createElement('div');
            sublist.className = 'legend-sublist';
            
            unique_lines.forEach(function(line_num) {
                var sub_item = document.createElement('div');
                sub_item.className = 'legend-subitem';
                
                sub_item.innerHTML = '<span style="opacity:0.5; margin-right:6px;">&rarr;</span>Dòng ' + line_num;
                
                var first_occ = line_to_occ[line_num][0];
                var span_idx = all_spans.findIndex(function(s) { 
                    return s.start === first_occ.start && s.end === first_occ.end && s.entity_name === first_occ.entity_name && s.depth === first_occ.depth; 
                });
                sub_item.setAttribute('data-span-idx', span_idx);
                
                sublist.appendChild(sub_item);
            });
            container.appendChild(sublist);
        } else {
            // single occurrence or multiple occurrences on the same line
            var only_line = unique_lines[0];
            var first_occ = line_to_occ[only_line][0];
            var span_idx = all_spans.findIndex(function(s) { 
                return s.start === first_occ.start && s.end === first_occ.end && s.entity_name === first_occ.entity_name && s.depth === first_occ.depth; 
            });
            item.setAttribute('data-span-idx', span_idx);
        }

        list_el.appendChild(container);
    });
}

/* ═══════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════ */
function setupEventListeners() {
    // Settings
    var settings_map = [
        { id: 'chk-wrap', key: 'word_wrap' }
    ];
    settings_map.forEach(function(item) {
        var cb = document.getElementById(item.id);
        if (cb) {
            cb.onclick = function() {
                var upd = {};
                upd[item.key] = cb.checked;
                window.vscode.postMessage({ type: 'updateSettings', settings: upd });
            };
        }
    });

    // Dropdown
    var settings_btn = document.getElementById('btn-settings');
    var dropdown = settings_btn.parentElement;
    settings_btn.onclick = function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    };
    document.addEventListener('click', function() {
        dropdown.classList.remove('open');
    });

    // Toolbar
    document.getElementById('btn-refresh').onclick = function() {
        window.vscode.postMessage({ type: 'updateSettings', settings: {} });
    };
    document.getElementById('btn-copy-flat').onclick = function() {
        window.vscode.postMessage({ type: 'copyToClipboard', text: data.model.flat_text });
    };
    document.getElementById('btn-copy-original').onclick = function() {
        // Copy original XML
        window.vscode.postMessage({ type: 'copyToClipboard', text: data.model.flat_text });
    };

    // Sidebar
    var sidebar = document.getElementById('sidebar');
    var toggle_btn = document.getElementById('btn-toggle-sidebar');
    toggle_btn.onclick = function() {
        var is_collapsed = sidebar.classList.toggle('collapsed');
        toggle_btn.innerHTML = is_collapsed ? '&#x25c0;' : '&#x25b6;';
    };

    // Entity list search
    var entity_search = document.getElementById('txt-entity-search');
    entity_search.addEventListener('input', function(e) {
        renderLegend(e.target.value);
    });

    // Entity span events
    var code_view = document.getElementById('code-view');

    code_view.addEventListener('mouseover', function(e) {
        var span = e.target.closest('.entity-span');
        if (!span || pinned_tooltip_span) return;
        if (hover_timeout) clearTimeout(hover_timeout);
        active_tooltip_span = span;
        hover_timeout = setTimeout(function() { showTooltip(span, false); }, 300);
    });

    code_view.addEventListener('mouseout', function(e) {
        var span = e.target.closest('.entity-span');
        if (!span) return;
        if (hover_timeout) clearTimeout(hover_timeout);
        if (pinned_tooltip_span) return;
        hideTooltip();
    });

    code_view.addEventListener('click', function(e) {
        var span = e.target.closest('.entity-span');
        if (!span) {
            if (pinned_tooltip_span) { hideTooltip(); pinned_tooltip_span = null; }
            return;
        }
        e.stopPropagation();
        pinned_tooltip_span = span;
        showTooltip(span, true);
    });

    // Tooltip close
    document.getElementById('tooltip-close').onclick = function(e) {
        e.stopPropagation();
        hideTooltip();
        pinned_tooltip_span = null;
    };

    // Tooltip actions
    document.getElementById('btn-tooltip-copy').onclick = function() {
        var active = pinned_tooltip_span || active_tooltip_span;
        if (!active) return;
        var idx = parseInt(active.getAttribute('data-span-idx'), 10);
        var all_spans = getHighlightSpans();
        var sd = all_spans[idx];
        if (sd) {
            window.vscode.postMessage({ type: 'copyToClipboard', text: data.model.flat_text.substring(sd.start, sd.end) });
        }
    };

    document.getElementById('btn-tooltip-goto').onclick = function() {
        var active = pinned_tooltip_span || active_tooltip_span;
        if (!active) return;
        var idx = parseInt(active.getAttribute('data-span-idx'), 10);
        var all_spans = getHighlightSpans();
        var sd = all_spans[idx];
        if (sd) {
            window.vscode.postMessage({ type: 'goToEntity', entity_name: sd.entity_name });
        }
    };

    // Legend click
    document.getElementById('legend-list').addEventListener('click', function(e) {
        var subitem = e.target.closest('.legend-subitem');
        if (subitem) {
            var idx = parseInt(subitem.getAttribute('data-span-idx'), 10);
            var el = document.querySelector('.entity-span[data-span-idx="' + idx + '"]');
            if (el) {
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                el.classList.add('highlighted-occurrence');
                setTimeout(function() { el.classList.remove('highlighted-occurrence'); }, 1500);
            }
            
            var all_spans = getHighlightSpans();
            var sd = all_spans[idx];
            if (sd) {
                var flat_line = getFlatLineNum(sd.start);
                highlightActiveLine(flat_line);
                var target_source_line = sd.root_source_line || sd.source_line;
                var target_entity_name = sd.root_entity_name || sd.entity_name;
                if (target_source_line) {
                    window.vscode.postMessage({
                        type: 'goToSourceLine',
                        file_path: data.model.source_file,
                        line: target_source_line,
                        entity_name: target_entity_name
                    });
                }
            }
            return;
        }

        var item = e.target.closest('.legend-item');
        if (!item) return;

        var container = item.closest('.legend-item-container');
        var sublist = container ? container.querySelector('.legend-sublist') : null;

        if (sublist) {
            var is_open = item.classList.contains('expanded');
            if (is_open) {
                sublist.style.display = 'none';
                item.classList.remove('expanded');
            } else {
                sublist.style.display = 'block';
                item.classList.add('expanded');
            }
        } else {
            var idx = parseInt(item.getAttribute('data-span-idx'), 10);
            var el = document.querySelector('.entity-span[data-span-idx="' + idx + '"]');
            if (el) {
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                el.classList.add('highlighted-occurrence');
                setTimeout(function() { el.classList.remove('highlighted-occurrence'); }, 1500);
            }
            
            var all_spans = getHighlightSpans();
            var sd = all_spans[idx];
            if (sd) {
                var flat_line = getFlatLineNum(sd.start);
                highlightActiveLine(flat_line);
                var target_source_line = sd.root_source_line || sd.source_line;
                var target_entity_name = sd.root_entity_name || sd.entity_name;
                if (target_source_line) {
                    window.vscode.postMessage({
                        type: 'goToSourceLine',
                        file_path: data.model.source_file,
                        line: target_source_line,
                        entity_name: target_entity_name
                    });
                }
            }
        }
    });

    // Click to highlight active line
    code_view.addEventListener('mousedown', function(e) {
        var row = e.target.closest('.code-row');
        if (row) {
            var rows = Array.prototype.slice.call(code_view.querySelectorAll('.code-row'));
            var line_num = rows.indexOf(row) + 1;
            highlightActiveLine(line_num);
        }
    });

    // Warnings toggle click event
    var warn_banner = document.getElementById('warnings-banner');
    var warn_toggle = document.getElementById('btn-warnings-toggle');
    if (warn_toggle && warn_banner) {
        warn_toggle.onclick = function(e) {
            e.stopPropagation();
            var is_collapsed = warn_banner.classList.toggle('collapsed');
            warn_toggle.innerHTML = is_collapsed ? '&#x25b8;' : '&#x25be;';
        };
    }

    // Search
    var search_input = document.getElementById('txt-search');
    var btn_search_exec = document.getElementById('btn-search-exec');
    
    function executeSearch() {
        if (search_input.value !== current_search_query) {
            current_search_query = search_input.value;
            performSearch(current_search_query);
        } else {
            navigateSearch(1); // Mặc định qua kết quả tiếp theo nếu bấm lại
        }
    }

    btn_search_exec.onclick = executeSearch;

    search_input.addEventListener('input', function(e) {
        if (e.target.value.trim() === '') {
            current_search_query = '';
            performSearch('');
        }
    });

    search_input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            if (search_input.value !== current_search_query) {
                current_search_query = search_input.value;
                performSearch(current_search_query);
            } else {
                navigateSearch(e.shiftKey ? -1 : 1);
            }
        }
    });
    document.getElementById('btn-search-prev').onclick = function() { navigateSearch(-1); };
    document.getElementById('btn-search-next').onclick = function() { navigateSearch(1); };

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { hideTooltip(); pinned_tooltip_span = null; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            search_input.focus();
            search_input.select();
        }
        if (e.key === 'r' && document.activeElement !== search_input) {
            window.vscode.postMessage({ type: 'updateSettings', settings: {} });
        }
    });
}

/* ═══════════════════════════════════
   TOOLTIP
   ═══════════════════════════════════ */
function showTooltip(span, is_pinned) {
    var tooltip = document.getElementById('tooltip-card');
    var idx = parseInt(span.getAttribute('data-span-idx'), 10);
    var all_spans = getHighlightSpans();
    var sd = all_spans[idx];
    if (!sd) return;

    document.getElementById('tooltip-entity-name').textContent = '&' + sd.entity_name + ';';
    document.getElementById('tooltip-entity-type').textContent = sd.missing
        ? 'Không tìm thấy'
        : (sd.entity_type === 'external' ? 'SYSTEM (External)' : 'Internal');
    document.getElementById('tooltip-entity-len').textContent = fmt_num(sd.end - sd.start) + ' chars';

    var row_src = document.getElementById('row-source-file');
    if (sd.source_file) {
        var basename = sd.source_file.split(/[\\/]/).pop();
        var el = document.getElementById('tooltip-source-file');
        el.textContent = basename;
        el.title = sd.source_file;
        row_src.classList.remove('hidden');
    } else {
        row_src.classList.add('hidden');
    }

    // Nested entities
    var nested = data.model.spans.filter(function(s) {
        return s.depth > 0 && s.start >= sd.start && s.end <= sd.end;
    });
    var nested_sec = tooltip.querySelector('.tooltip-nested-section');
    if (nested_sec) nested_sec.remove();

    if (nested.length > 0) {
        nested_sec = document.createElement('div');
        nested_sec.className = 'tooltip-nested-section';
        nested_sec.style.cssText = 'font-size:10px;border-top:1px solid var(--tooltip-border);padding-top:6px;margin-top:4px;max-height:80px;overflow-y:auto;';

        var title = document.createElement('div');
        title.style.cssText = 'opacity:0.5;margin-bottom:3px;font-weight:600;';
        title.textContent = 'Thực thể lồng bên trong:';
        nested_sec.appendChild(title);

        var unique_n = {};
        nested.forEach(function(s) { unique_n[s.entity_name] = s; });
        Object.values(unique_n).forEach(function(ns) {
            var row = document.createElement('div');
            row.style.cssText = 'padding-left:8px;opacity:0.8;';
            row.textContent = '→ &' + ns.entity_name + '; (' + ns.entity_type + ')';
            nested_sec.appendChild(row);
        });

        tooltip.insertBefore(nested_sec, tooltip.querySelector('.tooltip-footer'));
    }

    // Position
    var rect = span.getBoundingClientRect();
    var tw = 300;
    var vw = window.innerWidth;
    var left = rect.left;
    if (left + tw > vw) left = vw - tw - 12;
    var top = rect.bottom + 8;
    if (top + 200 > window.innerHeight) top = rect.top - 200;

    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
    tooltip.classList.remove('hidden');

    if (is_pinned) {
        tooltip.classList.add('pinned');
    } else {
        tooltip.classList.remove('pinned');
    }
}

function hideTooltip() {
    var tooltip = document.getElementById('tooltip-card');
    tooltip.classList.add('hidden');
    tooltip.classList.remove('pinned');
    active_tooltip_span = null;
}

/* ═══════════════════════════════════
   SEARCH
   ═══════════════════════════════════ */
function performSearch(query) {
    removeSearchHighlights();
    if (!query || query.trim() === '') {
        search_matches_count = 0;
        current_search_match_idx = -1;
        updateSearchCountUI();
        return;
    }

    var escaped = escapeRegExp(query);
    var regex = new RegExp(escaped, 'gi');
    var cv = document.getElementById('code-view');
    var walker = document.createTreeWalker(cv, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    while (node = walker.nextNode()) {
        if (node.parentElement.classList.contains('search-match')) continue;
        if (node.nodeValue.match(regex)) nodes.push(node);
    }

    var mc = 0;
    var MAX_MATCHES = 1000;
    for (var ni = 0; ni < nodes.length; ni++) {
        if (mc >= MAX_MATCHES) break;
        var node = nodes[ni];
        var text = node.nodeValue;
        var parent = node.parentElement;
        var frag = document.createDocumentFragment();
        var li = 0;
        var has_match = false;
        
        text.replace(regex, function(match, offset) {
            if (mc >= MAX_MATCHES) return;
            frag.appendChild(document.createTextNode(text.substring(li, offset)));
            var s = document.createElement('span');
            s.className = 'search-match';
            s.textContent = match;
            s.setAttribute('data-match-idx', mc);
            frag.appendChild(s);
            mc++;
            li = offset + match.length;
            has_match = true;
        });
        
        if (has_match) {
            frag.appendChild(document.createTextNode(text.substring(li)));
            parent.replaceChild(frag, node);
        }
    }

    search_matches_count = mc;
    current_search_match_idx = mc > 0 ? 0 : -1;
    updateSearchCountUI();
    if (mc > 0) scrollToMatch(0);
}

function removeSearchHighlights() {
    var hl = document.querySelectorAll('.search-match');
    hl.forEach(function(el) {
        var p = el.parentElement;
        p.replaceChild(document.createTextNode(el.textContent), el);
    });
    document.getElementById('code-view').normalize();
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateSearchCountUI() {
    var el = document.getElementById('search-count');
    var total_str = search_matches_count >= 1000 ? '1000+' : search_matches_count;
    el.textContent = search_matches_count === 0 ? '0/0' : (current_search_match_idx + 1) + '/' + total_str;
}

function navigateSearch(dir) {
    if (search_matches_count === 0) return;
    var prev = document.querySelector('.search-match.search-current');
    if (prev) prev.classList.remove('search-current');
    current_search_match_idx = (current_search_match_idx + dir + search_matches_count) % search_matches_count;
    updateSearchCountUI();
    scrollToMatch(current_search_match_idx);
}

function scrollToMatch(idx) {
    var el = document.querySelector('.search-match[data-match-idx="' + idx + '"]');
    if (el) {
        el.classList.add('search-current');
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
}

// Utility debounce
function debounce(func, wait) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            func.apply(context, args);
        }, wait);
    };
}
