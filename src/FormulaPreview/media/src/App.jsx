import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles/preview.css';

import { useFormulaEvaluator } from './hooks/useFormulaEvaluator';
import PlaygroundHero from './components/PlaygroundHero';
import FormulaFlowCanvas from './components/FormulaFlowCanvas';
import GroupTab from './components/GroupTab';
import DictionaryTab from './components/DictionaryTab';
import DiagnosticsTab from './components/DiagnosticsTab';
import RawFormulaTab from './components/RawFormulaTab';

// Lấy VS Code API
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

function App() {
  const [model, setModel] = useState(null);
  const [activeTab, setActiveTab] = useState('groups');
  const [showHidden, setShowHidden] = useState(false);
  const [lang, setLang] = useState('v');
  const [focusedField, setFocusedField] = useState(null);

  // Lắng nghe messages từ Extension Host
  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data;
      if (message.type === 'formulaModel') {
        setModel(message.payload);
      }
    };

    window.addEventListener('message', handleMessage);

    if (vscode) {
      vscode.postMessage({ type: 'ready' });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Evaluator hook chạy tự động theo dependency g.$a
  const {
    values,
    lastWritten,
    lastFormulaCaption,
    updateFieldValue,
    resetToSeed
  } = useFormulaEvaluator(model);

  const handleNodeSelect = useCallback((fieldName) => {
    setFocusedField(fieldName);
  }, []);

  const handleCopy = useCallback((text) => {
    if (vscode) {
      vscode.postMessage({ type: 'copy', text });
    }
  }, []);

  if (!model) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
        <div style={{ fontSize: '14px', marginBottom: '8px' }}>Đang phân tích công thức Grid XML...</div>
        <div style={{ fontSize: '11px' }}>Vui lòng chờ trong giây lát.</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className="btn"
            onClick={() => vscode && vscode.postMessage({ type: 'refresh' })}
            title="Làm mới lại dữ liệu từ file XML (Phím R)"
          >
            Làm mới
          </button>

          <span style={{ fontWeight: 600, fontSize: '12px', marginLeft: '6px' }}>
            Công thức: {model.file_name}
          </span>
        </div>

        <div className="toolbar-right">
          <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Hiện cột ẩn
          </label>

          <button
            className="btn btn-secondary"
            style={{ padding: '2px 6px', fontSize: '10px' }}
            onClick={() => setLang(lang === 'v' ? 'e' : 'v')}
            title="Chuyển đổi ngôn ngữ hiển thị nhãn"
          >
            {lang.toUpperCase()}
          </button>

          <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
            {model.entries ? model.entries.length : 0} alias
          </span>
        </div>
      </div>

      {/* Warnings Banner nếu có */}
      {model.warnings && model.warnings.length > 0 && (
        <div className="warnings-banner">
          <strong>Cảnh báo phân giải ({model.warnings.length}):</strong>
          <ul>
            {model.warnings.map((w, idx) => (
              <li key={idx}>[{w.code}] {w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Workspace chính cuộn dọc */}
      <div className="workspace-container">
        {/* 1. Hero Playground */}
        <PlaygroundHero
          model={model}
          values={values}
          lastWritten={lastWritten}
          lastFormulaCaption={lastFormulaCaption}
          onValueChange={updateFieldValue}
          showHidden={showHidden}
          lang={lang}
          onFocusField={setFocusedField}
          onReset={resetToSeed}
        />

        {/* 2. React Flow Canvas */}
        <FormulaFlowCanvas
          model={model}
          values={values}
          lastWritten={lastWritten}
          onNodeSelect={handleNodeSelect}
          focusedField={focusedField}
        />

        {/* 3. Tabs Navigation */}
        <div className="tabs-container">
          <div className="tab-headers">
            <button
              className={`tab-header-btn ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              Nhóm công thức ({model.entries ? model.entries.length : 0})
            </button>
            <button
              className={`tab-header-btn ${activeTab === 'dictionary' ? 'active' : ''}`}
              onClick={() => setActiveTab('dictionary')}
            >
              Từ điển g.$a ({model.entries ? model.entries.length : 0})
            </button>
            <button
              className={`tab-header-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
              onClick={() => setActiveTab('diagnostics')}
              style={{
                color: (model.diagnostics && model.diagnostics.length > 0)
                  ? (model.diagnostics.some(d => d.type === 'error') ? '#f48771' : '#e5c07b')
                  : undefined
              }}
            >
              {(model.diagnostics && model.diagnostics.length > 0) ? '⚠️' : '✓'} Kiểm tra logic ({model.diagnostics ? model.diagnostics.length : 0})
            </button>
            <button
              className={`tab-header-btn ${activeTab === 'raw' ? 'active' : ''}`}
              onClick={() => setActiveTab('raw')}
            >
              Khối g.$a thô
            </button>
          </div>

          <div className="tab-body">
            {activeTab === 'groups' && (
              <GroupTab model={model} />
            )}
            {activeTab === 'dictionary' && (
              <DictionaryTab model={model} />
            )}
            {activeTab === 'diagnostics' && (
              <DiagnosticsTab model={model} />
            )}
            {activeTab === 'raw' && (
              <RawFormulaTab model={model} onCopy={handleCopy} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[FormulaPreview ErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', color: '#f48771', fontFamily: 'sans-serif' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>⚠️ Đã xảy ra lỗi khi hiển thị Preview Công thức</h3>
          <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid #f48771', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
            <code>{this.state.error && this.state.error.toString()}</code>
          </div>
          {this.state.errorInfo && (
            <pre style={{ fontSize: '11px', overflowX: 'auto', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '4px' }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            className="btn"
            style={{ marginTop: '12px' }}
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null });
              if (vscode) vscode.postMessage({ type: 'refresh' });
            }}
          >
            Thử tải lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default App;
