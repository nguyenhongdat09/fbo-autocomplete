import React, { memo, useMemo, useState } from 'react';

function formatDisplayNumber(val) {
  if (val === undefined || val === null || val === '') return '';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function NumericInputField({ value, isComputed, isJustUpdated, onChange, onFocus, style, className }) {
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState('');

  const displayVal = isFocused ? localText : formatDisplayNumber(value);

  const handleFocus = () => {
    setIsFocused(true);
    setLocalText(value !== undefined && value !== null ? String(value) : '');
    if (onFocus) onFocus();
  };

  const handleBlur = () => {
    setIsFocused(false);
    const cleaned = localText.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    onChange(isNaN(num) ? 0 : num);
  };

  const handleChange = (e) => {
    const txt = e.target.value;
    setLocalText(txt);
    const cleaned = txt.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    onChange(isNaN(num) ? 0 : num);
  };

  if (isComputed) {
    return (
      <input
        type="text"
        className={`field-input computed ${isJustUpdated ? 'just-updated' : ''} ${className || ''}`}
        style={style}
        value={formatDisplayNumber(value)}
        readOnly
        onFocus={onFocus}
      />
    );
  }

  return (
    <input
      type="text"
      className={`field-input ${isJustUpdated ? 'just-updated' : ''} ${className || ''}`}
      style={style}
      value={displayVal}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
}

function getParticipatingGridFields(model) {
  const names = new Set();
  for (const e of model.entries || []) {
    if (e.target && !e.target.startsWith('t_')) names.add(e.target);
    (e.refs || []).forEach(r => {
      if (!r.startsWith('t_')) names.add(r);
    });
    if (e.grid_col && !e.grid_col.startsWith('t_')) names.add(e.grid_col);
  }
  names.delete('ty_gia'); // Đã có trên header riêng
  return names;
}

const PlaygroundHero = ({
  model,
  values,
  lastWritten,
  lastFormulaCaption,
  onValueChange,
  showHidden,
  lang,
  onFocusField,
  onReset
}) => {
  const fields = model.fields || {};
  const entries = model.entries || [];
  const entryMap = new Map();
  entries.forEach(e => entryMap.set(e.alias, e));

  const computedTargets = new Set();
  const chain = model.default_demo_chain || entries.map(e => e.alias);
  chain.forEach(alias => {
    const e = entryMap.get(alias);
    if (e && e.target) computedTargets.add(e.target);
  });

  const getLabel = (fieldObj, name) => {
    if (!fieldObj) return name;
    if (lang === 'e' && fieldObj.header_e) return fieldObj.header_e;
    return fieldObj.header_v || fieldObj.header_e || name;
  };

  // Tập hợp các trường tham gia trong g.$a (FIX-08)
  const participating = getParticipatingGridFields(model);

  const preferredNtOrder = [
    'so_luong', 'gia_nt', 'tien_nt2', 'tl_ck', 'ck_nt', 'thue_suat', 'thue_nt',
    'phi_dvtn_yn', 'tienmt_nt', 'tien_mthang_nt', 'thue_dvtn_nt', 's5'
  ];

  const preferredHtOrder = [
    'gia', 'tien2', 'ck', 'thue', 'tienmt', 'tien_mthang', 'thue_dvtn'
  ];

  const ntFieldNames = [];
  const htFieldNames = [];

  // 1. Duyệt các trường NT ưu tiên
  preferredNtOrder.forEach(name => {
    if (participating.has(name)) {
      const f = fields[name] || {};
      if (!f.hidden || showHidden) {
        ntFieldNames.push(name);
      }
    }
  });

  // 2. Các trường NT khác nếu có
  participating.forEach(name => {
    if (!preferredNtOrder.includes(name) && !preferredHtOrder.includes(name)) {
      const f = fields[name] || {};
      if (f.source === 'master') return;
      if (f.hidden && !showHidden) return;

      if (name.includes('_nt') || name === 'so_luong' || name.endsWith('_yn')) {
        if (!ntFieldNames.includes(name)) ntFieldNames.push(name);
      } else {
        if (!htFieldNames.includes(name)) htFieldNames.push(name);
      }
    }
  });

  // 3. Duyệt các trường Hạch toán ưu tiên
  preferredHtOrder.forEach(name => {
    if (participating.has(name)) {
      const f = fields[name] || {};
      if (!f.hidden || showHidden) {
        if (!htFieldNames.includes(name)) {
          htFieldNames.push(name);
        }
      }
    }
  });

  const renderFieldInput = (name) => {
    const f = fields[name] || {};
    const val = values[name] !== undefined ? values[name] : '';
    const isComputed = computedTargets.has(name);
    const isJustWritten = lastWritten.includes(name);

    if (f.type === 'boolean' || name.endsWith('_yn')) {
      return (
        <div key={name} className="field-row">
          <label className="field-label" title={name}>
            <input
              type="checkbox"
              checked={Boolean(val)}
              onChange={(e) => onValueChange(name, e.target.checked)}
              onFocus={() => onFocusField && onFocusField(name)}
              style={{ marginRight: '6px' }}
            />
            {getLabel(f, name)}
          </label>
        </div>
      );
    }

    return (
      <div key={name} className="field-row">
        <span className="field-label" title={name}>
          {getLabel(f, name)}
        </span>
        <NumericInputField
          value={val}
          isComputed={isComputed}
          isJustUpdated={isJustWritten}
          onChange={(v) => onValueChange(name, v)}
          onFocus={() => onFocusField && onFocusField(name)}
        />
      </div>
    );
  };

  // Master Summary Fields (Động theo các trường master có trong entries)
  const masterFieldsToDisplay = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Tiền hàng chính
    ['t_tien_hang_nt', 't_tien_nt2', 't_tien_hang', 't_tien2'].forEach(name => {
      if ((fields[name] || values[name] !== undefined) && !seen.has(name)) {
        list.push(name);
        seen.add(name);
      }
    });

    // 2. Chiết khấu & Thuế
    ['t_ck_nt', 't_ck', 't_thue_nt', 't_thue'].forEach(name => {
      if ((fields[name] || values[name] !== undefined) && !seen.has(name)) {
        list.push(name);
        seen.add(name);
      }
    });

    // 3. Các master field khác từ entries
    (entries || []).forEach(e => {
      const m = e.master || (e.target && e.target.startsWith('t_') ? e.target : null);
      if (m && !seen.has(m) && m !== 't_tt_nt' && m !== 't_tt') {
        list.push(m);
        seen.add(m);
      }
    });

    // 4. Tổng thanh toán cuối cùng
    ['t_tt_nt', 't_tt'].forEach(name => {
      if ((fields[name] || values[name] !== undefined) && !seen.has(name)) {
        list.push(name);
        seen.add(name);
      }
    });

    return list;
  }, [entries, fields, values]);

  return (
    <div className="hero-playground">
      <div className="hero-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '12px' }}>Sân chơi tính toán mẫu (1 dòng)</span>
          <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>— Tự động tính theo chuỗi công thức g.$a</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px' }}>Tỷ giá:</span>
          <NumericInputField
            style={{ width: '80px' }}
            value={values['ty_gia'] !== undefined ? values['ty_gia'] : 1}
            onChange={(v) => onValueChange('ty_gia', v || 1)}
          />
          <button className="btn btn-secondary" onClick={onReset} title="Khôi phục số liệu seed mẫu">
            Đặt lại demo
          </button>
        </div>
      </div>

      <div className="grid-two-columns">
        <div className="column-box">
          <div className="column-title">Nguyên tệ (Ngoại tệ)</div>
          {ntFieldNames.map(renderFieldInput)}
        </div>

        <div className="column-box">
          <div className="column-title">Hạch toán (VND)</div>
          {htFieldNames.map(renderFieldInput)}
        </div>
      </div>

      {lastFormulaCaption && (
        <div className="formula-caption">
          <strong>Diễn giải:</strong> {lastFormulaCaption}
        </div>
      )}

      {/* Thanh tổng cộng trên Master (Động) */}
      <div className="master-summary-bar">
        {masterFieldsToDisplay.map(name => {
          const val = values[name] !== undefined ? values[name] : 0;
          const isTotal = name === 't_tt_nt' || name === 't_tt';
          const isPrimaryAmount = name === 't_tien_hang_nt' || name === 't_tien_nt2' || name === 't_ck_nt' || name === 't_thue_nt';

          // Với các trường phụ (phí, thuế DVTN...), chỉ hiện khi giá trị > 0 hoặc khi có cấu hình rõ ràng
          if (!isTotal && !isPrimaryAmount && Number(val) === 0) {
            return null;
          }

          const f = fields[name] || {};
          const label = getLabel(f, name);

          return (
            <div key={name} className="master-stat-item">
              <span className="master-stat-label">{label}</span>
              <span className={`master-stat-val ${isTotal ? 'primary' : ''}`}>
                {Number(val).toLocaleString('vi-VN')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(PlaygroundHero);
