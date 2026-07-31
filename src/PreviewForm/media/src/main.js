import './previewForm.css';
import { html, render, Component } from 'htm/preact';
import { provideVSCodeDesignSystem, vsCodeTextField, vsCodeDropdown,
         vsCodeOption, vsCodeCheckbox, vsCodeBadge } from '@vscode/webview-ui-toolkit';

// Removed panels from VS Code toolkit as we use custom tabs for wrapping
provideVSCodeDesignSystem().register(
  vsCodeTextField(), vsCodeDropdown(), vsCodeOption(),
  vsCodeCheckbox(), vsCodeBadge()
);

function display_label(f) {
  return f.header_v || f.label_v || f.header_e || f.label_e || f.name;
}

function FieldControl({ f, role, fieldName, hidden, tab_index }) {
  if (hidden) return null;

  if (role === 'label') {
    return html`<label class="field-label">${display_label(f)}</label>`;
  }
  if (role === 'description') {
    return html`<span class="description-text">${f.footer_v || ''}</span>`;
  }
  if (role === 'lookup_name') {
    // %l / tên lookup: plain text như form web (không ô input)
    return html`<span class="readonly-value" title="${fieldName}">${fieldName}</span>`;
  }
  if (role === 'control' && f.read_only) {
    return html`<span class="readonly-value" title="${f.name}">${f.name}</span>`;
  }

  const disabledAttr = (f.disabled || f.inactive) ? true : undefined;
  const tabIndexAttr = tab_index !== undefined ? tab_index : -1;
  const inactiveStyle = f.inactive ? 'opacity: 0.6;' : '';

  if (f.kind === 'grid') {
    return html`<div class="grid-placeholder"><vscode-badge>${f.grid_placeholder}</vscode-badge></div>`;
  }
  if (f.kind === 'checkbox') {
    return html`<vscode-checkbox disabled=${disabledAttr} tabindex=${tabIndexAttr} style="${inactiveStyle}" title="${f.name}"></vscode-checkbox>`;
  }
  if (f.kind === 'dropdown') {
    const options = (f.options || []).map(opt => html`<vscode-option value="${opt.value}">${opt.label_v}</vscode-option>`);
    return html`<vscode-dropdown disabled=${disabledAttr} tabindex=${tabIndexAttr} style="${inactiveStyle}">
      <vscode-option value="">${f.name}</vscode-option>
      ${options}
    </vscode-dropdown>`;
  }
  if (f.kind === 'date') {
    return html`<vscode-text-field placeholder="dd/mm/yyyy" disabled=${disabledAttr} tabindex=${tabIndexAttr} style="${inactiveStyle}" value="${f.name}"></vscode-text-field>`;
  }

  return html`<vscode-text-field disabled=${disabledAttr} tabindex=${tabIndexAttr} style="${inactiveStyle}" value="${f.name}"></vscode-text-field>`;
}

/** Bù px cột label: font webview VS Code rộng hơn FBO — pad = 2 để khớp hiển thị form web (FIX-16) */
const LABEL_COL_PAD_PX = -2;

function FormRow({ row, fields, split, anchor, field_tab_indexes = {} }) {
  const widths = row.column_widths;

  const label_col_indexes = new Set();
  (row.cells || []).forEach(c => {
    if (c && c.type === 'slot' && c.slot && c.slot.role === 'label') {
      label_col_indexes.add(c.start_col);
    }
  });

  // FIX-15/16: minmax cố định px; cột label + LABEL_COL_PAD_PX để khớp hiển thị form web
  const getTemplateCols = (wArray, startIndex = 0) => {
    return wArray.map((w, idx) => {
      if (w === 0) return '0px';
      const global_col = startIndex + idx;
      const pad = label_col_indexes.has(global_col) ? LABEL_COL_PAD_PX : 0;
      const ww = w + pad;
      if (anchor && (global_col + 1) === anchor) {
        return `minmax(${ww}px, 1fr)`;
      }
      return `minmax(${ww}px, ${ww}px)`;
    }).join(' ');
  };

  const clamp_cell_to_panel = (cell, panel_col_count) => {
    if (cell.type === 'empty') {
      if (cell.start_col >= panel_col_count) return null;
      return cell;
    }
    if (cell.type !== 'slot') return cell;
    if (cell.start_col >= panel_col_count) return null;
    const max_span = panel_col_count - cell.start_col;
    const col_span = Math.min(cell.col_span || 1, max_span);
    return { ...cell, col_span };
  };

  const renderCellList = (cellsArray, targetWidths) => cellsArray.map(c => {
    if (!c) return null;
    if (c.type === 'empty') {
      return html`<div class="form-cell-empty" style="grid-column-start: ${c.start_col + 1};"></div>`;
    }
    if (c.type === 'slot') {
      const f = fields[c.slot.field] || { name: c.slot.field, kind: 'input', read_only: false, hidden: false };
      const startWidth = targetWidths[c.start_col] !== undefined ? targetWidths[c.start_col] : 1;
      const col_hidden = f.hidden || startWidth === 0;
      const is_label = c.slot.role === 'label';
      // Label: không overflow:hidden trên cell — tránh che sớm hơn width XML (khớp form web)
      const overflow = is_label ? 'overflow: visible;' : 'overflow: hidden;';
      const gridStyle = `grid-column: ${c.start_col + 1} / span ${c.col_span}; ${overflow}`;

      if (col_hidden) {
        return html`<div class="form-cell" style="${gridStyle} visibility: hidden; pointer-events: none;"></div>`;
      }

      const tab_index = is_label ? -1 : field_tab_indexes[c.slot.field];
      return html`<div class="form-cell ${is_label ? 'form-cell--label' : ''}" style="${gridStyle}">
        <${FieldControl} f=${f} role=${c.slot.role} fieldName=${c.slot.field} hidden=${col_hidden} tab_index=${tab_index} />
      </div>`;
    }
    return null;
  });

  // FIX-09c: Render split panel
  if (split != null && split > 0 && split <= widths.length) {
    const leftWidths = widths.slice(0, split);
    const rightWidths = widths.slice(split);
    const leftCells = [];
    const rightCells = [];

    row.cells.forEach(c => {
      if (c.start_col < split) {
        const clamped = clamp_cell_to_panel(c, leftWidths.length);
        if (clamped) leftCells.push(clamped);
      } else {
        const shifted = { ...c, start_col: c.start_col - split };
        const clamped = clamp_cell_to_panel(shifted, rightWidths.length);
        if (clamped) rightCells.push(clamped);
      }
    });

    const leftTemplateCols = getTemplateCols(leftWidths, 0);
    const rightTemplateCols = getTemplateCols(rightWidths, split);
    const left_min_px = leftWidths.reduce((a, w, idx) => {
      if (w <= 0) return a;
      const pad = label_col_indexes.has(idx) ? LABEL_COL_PAD_PX : 0;
      return a + w + pad;
    }, 0);
    const right_min_px = rightWidths.reduce((a, w, idx) => {
      if (w <= 0) return a;
      const global_idx = split + idx;
      const pad = label_col_indexes.has(global_idx) ? LABEL_COL_PAD_PX : 0;
      return a + w + pad;
    }, 0);

    // FEAT-03: Panel chứa cột anchor dùng flex:1 1 auto để grid 1fr có chỗ giãn
    const anchor_in_left = anchor != null && anchor > 0 && anchor <= split;
    const anchor_in_right = anchor != null && anchor > split;
    const left_style = anchor_in_left
      ? `display: grid; grid-template-columns: ${leftTemplateCols}; flex: 1 1 auto; min-width: ${left_min_px}px; width: 100%; align-items: center;`
      : `display: grid; grid-template-columns: ${leftTemplateCols}; flex: 0 0 auto; min-width: ${left_min_px}px; align-items: center;`;
    const right_style = anchor_in_right
      ? `display: grid; grid-template-columns: ${rightTemplateCols}; flex: 1 1 auto; min-width: ${right_min_px}px; width: 100%; align-items: center;`
      : `display: grid; grid-template-columns: ${rightTemplateCols}; flex: 0 0 auto; margin-left: auto; min-width: ${right_min_px}px; align-items: center;`;

    return html`<div class="form-row-split" style="display: flex; width: 100%; align-items: start; margin-bottom: 6px;">
       <div class="panel-left" style="${left_style}">
          ${renderCellList(leftCells, leftWidths)}
       </div>
       <div class="panel-right" style="${right_style}">
          ${renderCellList(rightCells, rightWidths)}
       </div>
    </div>`;
  }

  // Fallback if no split
  const templateCols = getTemplateCols(widths, 0);
  // Removed overflow: hidden inline to rely on css, added width 100%
  return html`<div class="form-row" style="display: grid; grid-template-columns: ${templateCols}; margin-bottom: 6px; align-items: center; width: 100%;">
    ${renderCellList(row.cells, widths)}
  </div>`;
}

class CategoryPanel extends Component {
  constructor() {
    super();
    this.state = { hover_guide: null };
  }

  render() {
    const { rows, fields, split, anchor, show_anchor, show_split, is_footer, base_tab_index = 1 } = this.props;
    const { hover_guide } = this.state;
    if (!rows || rows.length === 0) return null;

    // FEAT-04: Calculate tab_index order
    const field_tab_indexes = {};
    let current_tab_index = base_tab_index;
    
    const is_focusable = (f, role) => {
      if (role !== 'control') return false;
      if (f.read_only || f.disabled || f.inactive || f.hidden) return false;
      if (f.kind === 'grid') return false;
      return true;
    };

    // Part 1 (trái split)
    rows.forEach(row => {
      (row.cells || []).forEach(c => {
        if (c && c.type === 'slot' && (!split || c.start_col < split)) {
          const f = fields[c.slot.field] || {};
          if (is_focusable(f, c.slot.role)) {
            field_tab_indexes[c.slot.field] = current_tab_index++;
          }
        }
      });
    });

    // Part 2 (phải split)
    if (split != null && split > 0) {
      rows.forEach(row => {
        (row.cells || []).forEach(c => {
          if (c && c.type === 'slot' && c.start_col >= split) {
            const f = fields[c.slot.field] || {};
            if (is_focusable(f, c.slot.role)) {
              field_tab_indexes[c.slot.field] = current_tab_index++;
            }
          }
        });
      });
    }

    let guideLayer = null;

    if (show_anchor || show_split) {
      const widths = rows[0]?.column_widths || [];
      const label_col_indexes = new Set();
      rows.forEach(r => {
        (r.cells || []).forEach(c => {
          if (c && c.type === 'slot' && c.slot && c.slot.role === 'label') {
            label_col_indexes.add(c.start_col);
          }
        });
      });

      const rendered_widths = widths.map((w, idx) => {
        if (w === 0) return 0;
        const pad = label_col_indexes.has(idx) ? LABEL_COL_PAD_PX : 0;
        return w + pad;
      });

      const guides = [];

      // FEAT-01c: Tính sọc split (mép trái của panel phải, dùng tọa độ right)
      if (show_split && split != null && split > 0 && split <= widths.length) {
        const split_right = rendered_widths.slice(split).reduce((a, b) => a + b, 0);
        const tip = hover_guide === 'split' ? html`<div class="guide-tooltip tooltip-flip">Đây là đường chia cắt Form ra 2 phần. Khi bấm Tab sẽ Focus vào các Field Phần 1 sau đó mới tới các Field phần 2</div>` : null;
        guides.push(html`<div class="guide-line guide-split" style="right: ${split_right}px;" title="split=${split}"
                              onMouseEnter=${() => this.setState({ hover_guide: 'split' })}
                              onMouseLeave=${() => this.setState({ hover_guide: null })}><span>S:${split}</span>${tip}</div>`);
      }

      // FEAT-01g: Tính sọc anchor (đầu cột anchor, riêng footer thì cuối cột anchor)
      if (show_anchor && anchor != null && anchor > 0 && anchor <= widths.length) {
        if (split != null && split > 0 && split <= widths.length) {
          if (anchor <= split) {
            const tip = hover_guide === 'anchor' ? html`<div class="guide-tooltip">Khi đường này cắt qua field nào thì khi Co giãn Form thì trường đó sẽ neo co giãn theo</div>` : null;
            let anchor_x = 0;
            if (is_footer) {
              anchor_x = rendered_widths.slice(0, anchor).reduce((a, b) => a + b, 0);
            } else {
              anchor_x = rendered_widths.slice(0, anchor - 1).reduce((a, b) => a + b, 0);
            }
            guides.push(html`<div class="guide-line guide-anchor" style="left: ${anchor_x}px;" title="anchor=${anchor}"
                                  onMouseEnter=${() => this.setState({ hover_guide: 'anchor' })}
                                  onMouseLeave=${() => this.setState({ hover_guide: null })}><span>A:${anchor}</span>${tip}</div>`);
          } else {
            const tip = hover_guide === 'anchor' ? html`<div class="guide-tooltip tooltip-flip">Khi đường này cắt qua field nào thì khi Co giãn Form thì trường đó sẽ neo co giãn theo</div>` : null;
            let anchor_right = 0;
            if (is_footer) {
              anchor_right = rendered_widths.slice(anchor).reduce((a, b) => a + b, 0);
            } else {
              anchor_right = rendered_widths.slice(anchor - 1).reduce((a, b) => a + b, 0);
            }
            guides.push(html`<div class="guide-line guide-anchor" style="right: ${anchor_right}px;" title="anchor=${anchor}"
                                  onMouseEnter=${() => this.setState({ hover_guide: 'anchor' })}
                                  onMouseLeave=${() => this.setState({ hover_guide: null })}><span>A:${anchor}</span>${tip}</div>`);
          }
        } else {
          const tip = hover_guide === 'anchor' ? html`<div class="guide-tooltip">Khi đường này cắt qua field nào thì khi Co giãn Form thì trường đó sẽ neo co giãn theo</div>` : null;
          let anchor_x = 0;
          if (is_footer) {
            anchor_x = rendered_widths.slice(0, anchor).reduce((a, b) => a + b, 0);
          } else {
            anchor_x = rendered_widths.slice(0, anchor - 1).reduce((a, b) => a + b, 0);
          }
          guides.push(html`<div class="guide-line guide-anchor" style="left: ${anchor_x}px;" title="anchor=${anchor}"
                                onMouseEnter=${() => this.setState({ hover_guide: 'anchor' })}
                                onMouseLeave=${() => this.setState({ hover_guide: null })}><span>A:${anchor}</span>${tip}</div>`);
        }
      }

      if (guides.length > 0) {
        guideLayer = html`<div class="layout-guide-layer">${guides}</div>`;
      }
    }

    return html`<div class="category-panel" style="position: relative;">
      ${guideLayer}
      ${rows.map(row => html`<${FormRow} row=${row} fields=${fields} split=${split} anchor=${anchor} field_tab_indexes=${field_tab_indexes} />`)}
    </div>`;
  }
}

class PreviewFormApp extends Component {
  constructor() {
    super();
    this.state = { model: null, error: null, activeTabId: null, show_anchor: false, show_split: false };
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateModel') {
        this.setState({ model: message.model, error: null });
      } else if (message.command === 'error') {
        this.setState({ error: message.message });
      }
    });
  }

  componentDidMount() {
    try {
      if (typeof acquireVsCodeApi === 'function') {
        if (!window.__fbo_preview_vscode) {
          window.__fbo_preview_vscode = acquireVsCodeApi();
        }
        window.__fbo_preview_vscode.postMessage({ type: 'ready' });
      }
    } catch (e) {
      /* ignore */
    }
  }

  setActiveTab(id) {
    this.setState({ activeTabId: id });
  }

  render() {
    const { model, error, activeTabId, show_anchor, show_split } = this.state;
    if (error) return html`<div class="error-banner">⚠ ${error}</div>`;
    if (!model) return html`<div class="loading">Loading Preview Form…</div>`;

    const view = model.view;
    if (!view) return html`<div class="error-banner">No View config found!</div>`;

    const tabs = [...view.categories].sort((a, b) => a.declaration_order - b.declaration_order);
    const activeTab = activeTabId || (tabs.length > 0 ? tabs[0].index : null);

    return html`
      <div class="fbo-form-preview">
        <!-- FEAT-01: Toolbar -->
        <div class="fbo-toolbar">
          <button class="fbo-toolbar-btn ${show_anchor ? 'active' : ''}" 
                  title="Hiện cột co giãn (anchor)"
                  onClick=${() => this.setState({ show_anchor: !show_anchor })}>
            ⚓ Anchor
          </button>
          <button class="fbo-toolbar-btn ${show_split ? 'active' : ''}" 
                  title="Hiện ranh giới panel trái/phải (split)"
                  onClick=${() => this.setState({ show_split: !show_split })}>
            ✂ Split
          </button>
        </div>

        <!-- General Section -->
        ${view.rows_general.length > 0 && html`
          <div class="general-section">
            <${CategoryPanel} rows=${view.rows_general} fields=${model.fields} split=${view.split} anchor=${view.anchor} show_anchor=${show_anchor} show_split=${show_split} base_tab_index=${1000} />
          </div>
        `}

        <!-- Tabs Section -->
        ${tabs.length > 0 && html`
          <div class="fbo-tab-container">
            <div class="fbo-tab-list">
              ${tabs.map(tab => html`
                <div class="fbo-tab-item ${activeTab === tab.index ? 'active' : ''}" 
                     onClick=${() => this.setActiveTab(tab.index)}>
                  ${tab.header_v || tab.index}
                </div>
              `)}
            </div>
            <div class="fbo-tab-panels">
              ${tabs.map((tab, idx) => html`
                <div class="fbo-tab-panel" style="display: ${activeTab === tab.index ? 'block' : 'none'};">
                  <${CategoryPanel} rows=${view.rows_by_category[tab.index] || []} fields=${model.fields} split=${tab.split} anchor=${tab.anchor} show_anchor=${show_anchor} show_split=${show_split} base_tab_index=${2000 + idx * 1000} />
                </div>
              `)}
            </div>
          </div>
        `}

        <!-- Footer Section (sticky) -->
        ${(view.rows_by_category['-1'] && view.rows_by_category['-1'].length > 0) && html`
          <div class="footer-section">
            <${CategoryPanel} rows=${view.rows_by_category['-1']} fields=${model.fields} split=${view.footer_category ? view.footer_category.split : null} anchor=${view.footer_category ? view.footer_category.anchor : null} show_anchor=${show_anchor} show_split=${show_split} is_footer=${true} base_tab_index=${90000} />
          </div>
        `}
      </div>
    `;
  }
}

render(html`<${PreviewFormApp} />`, document.getElementById('app'));
