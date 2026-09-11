import React, { memo } from 'react';

const ScenarioTab = ({ model, activeScenarioId, onScenarioChange }) => {
  const scenarios = model.scenarios || [];
  const entries = model.entries || [];
  const entryMap = new Map();
  entries.forEach(e => entryMap.set(e.alias, e));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px' }}>
        Chọn một kịch bản bên dưới để xem chuỗi thứ tự tính toán và cập nhật lại Sân chơi:
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {scenarios.map((scen) => {
          const isActive = scen.id === activeScenarioId;
          return (
            <div
              key={scen.id}
              onClick={() => onScenarioChange(scen.id)}
              style={{
                border: isActive ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '10px 14px',
                background: isActive ? 'rgba(0, 122, 204, 0.08)' : 'rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '12px', color: isActive ? 'var(--accent-color)' : 'inherit' }}>
                  {isActive ? '● ' : '○ '} {scen.title_vi}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>
                  trigger: <code>{scen.trigger_field}</code>
                </span>
              </div>

              {/* Các bước tính */}
              <div style={{ marginTop: '8px', paddingLeft: '14px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(scen.formula_aliases || []).map((alias, idx) => {
                  const e = entryMap.get(alias);
                  return (
                    <div key={idx} style={{ color: 'var(--vscode-editor-foreground)' }}>
                      <span style={{ opacity: 0.6 }}>{idx + 1}.</span> <code>{alias}</code>: {e ? e.plain_vi : alias}
                    </div>
                  );
                })}

                {(scen.aggregate_aliases || []).map((alias, idx) => {
                  const e = entryMap.get(alias);
                  return (
                    <div key={`agg-${idx}`} style={{ color: '#ba55d3' }}>
                      <span>Σ</span> <code>{alias}</code>: {e ? e.plain_vi : alias}
                    </div>
                  );
                })}

                {(scen.master_aliases || []).map((alias, idx) => {
                  const e = entryMap.get(alias);
                  return (
                    <div key={`master-${idx}`} style={{ color: '#4ec9b0' }}>
                      <span>★</span> <code>{alias}</code>: {e ? e.plain_vi : alias}
                    </div>
                  );
                })}

                {scen.extra_js && (
                  <div style={{ color: '#eab308', marginTop: '4px', fontStyle: 'italic' }}>
                    ⚠ {scen.extra_js_note || 'Có gọi thêm hàm Javascript ngoài (không mô phỏng trong sân chơi MVP)'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(ScenarioTab);
