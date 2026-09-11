import React, { useState, useMemo, memo } from 'react';

const DiagnosticsTab = ({ model }) => {
  const diagnostics = model.diagnostics || [];
  const [filterType, setFilterType] = useState('all');

  const counts = useMemo(() => {
    let error = 0;
    let warning = 0;
    let info = 0;
    diagnostics.forEach(d => {
      if (d.type === 'error') error++;
      else if (d.type === 'warning') warning++;
      else info++;
    });
    return { error, warning, info, total: diagnostics.length };
  }, [diagnostics]);

  const filtered = useMemo(() => {
    if (filterType === 'all') return diagnostics;
    return diagnostics.filter(d => d.type === filterType);
  }, [diagnostics, filterType]);

  if (diagnostics.length === 0) {
    return (
      <div style={{
        padding: '30px',
        textAlign: 'center',
        background: 'rgba(0, 200, 83, 0.05)',
        border: '1px solid rgba(0, 200, 83, 0.3)',
        borderRadius: '6px'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '8px' }}>🎉 Hoàn toàn chuẩn xác!</div>
        <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
          Không phát hiện lỗi cú pháp, chu trình phụ thuộc vòng, hay nguy cơ chia cho 0 trong khối <code>g.$a</code>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn ${filterType === 'all' ? '' : 'btn-secondary'}`}
            style={{ fontSize: '11px', padding: '3px 10px' }}
            onClick={() => setFilterType('all')}
          >
            Tất cả ({counts.total})
          </button>
          {counts.error > 0 && (
            <button
              className={`btn ${filterType === 'error' ? '' : 'btn-secondary'}`}
              style={{ fontSize: '11px', padding: '3px 10px', color: '#f48771', borderColor: 'rgba(244,135,113,0.5)' }}
              onClick={() => setFilterType('error')}
            >
              🔴 Lỗi ({counts.error})
            </button>
          )}
          {counts.warning > 0 && (
            <button
              className={`btn ${filterType === 'warning' ? '' : 'btn-secondary'}`}
              style={{ fontSize: '11px', padding: '3px 10px', color: '#cca700', borderColor: 'rgba(204,167,0,0.5)' }}
              onClick={() => setFilterType('warning')}
            >
              🟡 Cảnh báo ({counts.warning})
            </button>
          )}
          {counts.info > 0 && (
            <button
              className={`btn ${filterType === 'info' ? '' : 'btn-secondary'}`}
              style={{ fontSize: '11px', padding: '3px 10px', color: '#4fc1ff', borderColor: 'rgba(79,193,255,0.5)' }}
              onClick={() => setFilterType('info')}
            >
              ℹ️ Chu trình ({counts.info})
            </button>
          )}
        </div>

        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          Phân tích tĩnh kiểm tra logic công thức FBO
        </span>
      </div>

      {/* List of issues */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map((item, idx) => {
          let borderColor = 'rgba(79, 193, 255, 0.4)';
          let badgeBg = 'rgba(79, 193, 255, 0.15)';
          let badgeColor = '#4fc1ff';
          let badgeLabel = 'CHU TRÌNH';

          if (item.type === 'error') {
            borderColor = 'rgba(244, 135, 113, 0.6)';
            badgeBg = 'rgba(244, 135, 113, 0.15)';
            badgeColor = '#f48771';
            badgeLabel = 'LỖI CÚ PHÁP';
          } else if (item.type === 'warning') {
            borderColor = 'rgba(204, 167, 0, 0.5)';
            badgeBg = 'rgba(204, 167, 0, 0.15)';
            badgeColor = '#e5c07b';
            badgeLabel = item.code === 'POTENTIAL_DIVIDE_BY_ZERO' ? 'CHIA CHO 0' : 'CẢNH BÁO';
          }

          return (
            <div
              key={idx}
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                padding: '12px 14px',
                background: 'rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: badgeBg,
                      color: badgeColor,
                      letterSpacing: '0.5px'
                    }}
                  >
                    {badgeLabel}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '12px' }}>{item.title}</span>
                </div>

                {item.alias && (
                  <code style={{ fontSize: '10px', color: '#4fc1ff' }}>{item.alias}</code>
                )}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--vscode-editor-foreground)', lineHeight: 1.5 }}>
                {item.message}
              </div>

              {item.suggestion && (
                <div
                  style={{
                    fontSize: '11px',
                    color: '#89d185',
                    background: 'rgba(137, 209, 133, 0.08)',
                    borderLeft: '3px solid #89d185',
                    padding: '6px 10px',
                    borderRadius: '0 4px 4px 0',
                    marginTop: '2px'
                  }}
                >
                  💡 <strong>Gợi ý:</strong> {item.suggestion}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(DiagnosticsTab);
