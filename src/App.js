import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AI_QUICK_PROMPTS, COMPONENTS, SAMPLE_HTML, THEMES } from './data';
import {
  appendToBody,
  duplicateSection,
  extractSections,
  getEditableElementDescriptors,
  getElementPath,
  moveSectionHtml,
  parseHtmlDocument,
  parseInlineStyle,
  removeSectionHtml,
  replaceSectionHtml,
  updateElementStyle,
  updateElementText,
} from './utils/html';

function createState(html) {
  return {
    html,
    history: [{ html, label: 'Initial', ts: Date.now() }],
    historyIndex: 0,
    selectedSection: null,
    mode: 'visual',
    zoom: 100,
    notifications: [],
    aiDiff: null,
    aiLoading: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_HTML': {
      if (state.html === action.html) return state;
      const history = [
        ...state.history.slice(0, state.historyIndex + 1),
        { html: action.html, label: action.label || 'Edit', ts: Date.now() },
      ];
      return { ...state, html: action.html, history, historyIndex: history.length - 1 };
    }
    case 'UNDO':
      if (state.historyIndex <= 0) return state;
      return { ...state, html: state.history[state.historyIndex - 1].html, historyIndex: state.historyIndex - 1 };
    case 'REDO':
      if (state.historyIndex >= state.history.length - 1) return state;
      return { ...state, html: state.history[state.historyIndex + 1].html, historyIndex: state.historyIndex + 1 };
    case 'SELECT':
      return { ...state, selectedSection: action.id };
    case 'MODE':
      return { ...state, mode: action.value };
    case 'ZOOM':
      return { ...state, zoom: Math.max(30, Math.min(200, action.value)) };
    case 'AI_LOAD':
      return { ...state, aiLoading: action.value };
    case 'AI_DIFF':
      return { ...state, aiDiff: action.value };
    case 'NOTIFY':
      return {
        ...state,
        notifications: [...state.notifications, { id: action.id, msg: action.msg, kind: action.kind || 'info' }],
      };
    case 'DISMISS':
      return { ...state, notifications: state.notifications.filter((n) => n.id !== action.id) };
    default:
      return state;
  }
}

function isSelectableCanvasNode(el) {
  return !!el && !['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(el.tagName);
}

function isInlineEditableNode(el) {
  return !!el &&
    ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BUTTON', 'LI', 'SPAN', 'A', 'TD', 'TH', 'LABEL', 'DIV'].includes(el.tagName) &&
    el.children.length === 0;
}

function getThemeOverride(theme) {
  const { bg, surface, border, accent, accent2, text, muted } = theme.colors;
  return `<style id="__hc_theme__">
    body{background:${bg}!important;color:${text}!important}
    section,[data-section]{color:${text}}
    .card,.panel,[data-card]{background:${surface}!important;border-color:${border}!important}
    h1,h2,h3,h4,h5,h6,strong{color:${text}!important}
    p,li,span,label,small{color:${muted}!important}
    button,.btn,[role="button"]{background:linear-gradient(135deg,${accent},${accent2})!important;color:#fff!important;border-color:${accent}!important}
  </style>`;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, () => createState(SAMPLE_HTML));
  const [leftTab, setLeftTab] = useState('sections');
  const [rightTab, setRightTab] = useState('edit');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('hc_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState('root');
  const [componentSearch, setComponentSearch] = useState('');
  const [componentCategory, setComponentCategory] = useState('All');
  const iframeRef = useRef(null);
  const fileRef = useRef(null);

  const notify = useCallback((msg, kind = 'info') => {
    const id = Date.now() + Math.random();
    dispatch({ type: 'NOTIFY', id, msg, kind });
    window.setTimeout(() => dispatch({ type: 'DISMISS', id }), 2800);
  }, []);

  const setHtml = useCallback((html, label) => {
    dispatch({ type: 'SET_HTML', html, label });
  }, []);

  const saveKey = useCallback((value) => {
    setApiKey(value);
    localStorage.setItem('hc_key', value);
  }, []);

  const sections = useMemo(() => extractSections(state.html), [state.html]);
  const editableNodes = useMemo(
    () => (state.selectedSection ? getEditableElementDescriptors(state.html, state.selectedSection) : []),
    [state.html, state.selectedSection]
  );
  const selectedNode = useMemo(() => {
    if (!editableNodes.length) return null;
    return editableNodes.find((node) => node.path === selectedPath) || editableNodes[0];
  }, [editableNodes, selectedPath]);

  const componentCategories = useMemo(
    () => ['All', ...Array.from(new Set(COMPONENTS.map((component) => component.category || 'Other')))],
    []
  );

  const filteredComponents = useMemo(() => {
    return COMPONENTS.filter((component) => {
      const matchesCategory = componentCategory === 'All' || (component.category || 'Other') === componentCategory;
      const query = componentSearch.trim().toLowerCase();
      const matchesSearch = !query ||
        component.label.toLowerCase().includes(query) ||
        (component.category || '').toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [componentCategory, componentSearch]);

  useEffect(() => {
    if (state.selectedSection && !sections.includes(state.selectedSection)) {
      dispatch({ type: 'SELECT', id: null });
      setSelectedPath('root');
    }
  }, [sections, state.selectedSection]);

  useEffect(() => {
    if (!state.selectedSection) {
      setSelectedPath('root');
      return;
    }
    if (!editableNodes.length) {
      setSelectedPath('root');
      return;
    }
    if (!editableNodes.some((node) => node.path === selectedPath)) {
      setSelectedPath(editableNodes[0].path);
    }
  }, [editableNodes, selectedPath, state.selectedSection]);

  const selectCanvasNode = useCallback((sectionId, path = 'root') => {
    dispatch({ type: 'SELECT', id: sectionId });
    setSelectedPath(path || 'root');
    setRightTab('edit');
  }, []);

  const commitInlineText = useCallback((sectionId, path, nextText) => {
    const current = getEditableElementDescriptors(state.html, sectionId).find((node) => node.path === path);
    if (!current || current.text === nextText) return;
    setHtml(updateElementText(state.html, sectionId, path, nextText), 'Inline text edit');
  }, [setHtml, state.html]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(state.html);
    doc.close();

    if (state.mode !== 'visual') return;

    const decorate = () => {
      try {
        const iDoc = iframe.contentDocument;
        if (!iDoc?.body) return;

        let styleEl = iDoc.getElementById('__hc_editor__');
        if (!styleEl) {
          styleEl = iDoc.createElement('style');
          styleEl.id = '__hc_editor__';
          iDoc.head.appendChild(styleEl);
        }

        styleEl.textContent = `
          [data-section]{position:relative}
          [data-hc-path]{cursor:pointer;transition:outline-color .12s ease, box-shadow .12s ease}
          [data-hc-path]:hover{outline:2px dashed rgba(124,58,237,.45);outline-offset:2px}
          [data-hc-section-active="true"]{outline:2px dashed rgba(6,182,212,.5);outline-offset:4px}
          [data-hc-selected="true"]{outline:2px solid #7c3aed!important;outline-offset:3px;box-shadow:0 0 0 4px rgba(124,58,237,.12)}
          [data-hc-selected="true"]::after{
            content:attr(data-hc-label);
            position:absolute;
            top:-12px;
            left:0;
            background:#7c3aed;
            color:#fff;
            font:700 10px/1 system-ui,sans-serif;
            padding:4px 8px;
            border-radius:999px;
            pointer-events:none;
            white-space:nowrap;
            z-index:2147483647;
          }
          [contenteditable="true"]{cursor:text!important;outline:2px solid #06b6d4!important;outline-offset:3px}
        `;

        iDoc.querySelectorAll('[data-section]').forEach((sectionEl) => {
          const sectionId = sectionEl.getAttribute('data-section');
          const sectionNodes = [sectionEl, ...sectionEl.querySelectorAll('*')].filter(isSelectableCanvasNode);

          sectionNodes.forEach((node) => {
            const path = getElementPath(sectionEl, node);
            if (path == null) return;

            node.setAttribute('data-hc-path', path);
            node.setAttribute('data-hc-section', sectionId);
            node.setAttribute('data-hc-label', `${sectionId} / ${node.tagName.toLowerCase()}`);
            node.setAttribute('data-hc-section-active', sectionId === state.selectedSection ? 'true' : 'false');
            node.setAttribute(
              'data-hc-selected',
              sectionId === state.selectedSection && path === (selectedNode?.path || 'root') ? 'true' : 'false'
            );

            node.onclick = (event) => {
              event.preventDefault();
              event.stopPropagation();
              selectCanvasNode(sectionId, path);
            };

            node.ondblclick = (event) => {
              if (!isInlineEditableNode(node)) return;
              event.preventDefault();
              event.stopPropagation();
              selectCanvasNode(sectionId, path);

              const originalText = node.textContent;
              node.setAttribute('contenteditable', 'true');
              node.focus();

              const range = iDoc.createRange();
              range.selectNodeContents(node);
              const selection = iDoc.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);

              const cleanup = (commit) => {
                node.removeAttribute('contenteditable');
                node.onblur = null;
                node.onkeydown = null;
                if (commit && node.textContent !== originalText) {
                  commitInlineText(sectionId, path, node.textContent);
                  notify('Text updated', 'success');
                } else {
                  node.textContent = originalText;
                }
              };

              node.onblur = () => cleanup(true);
              node.onkeydown = (keyEvent) => {
                if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
                  keyEvent.preventDefault();
                  cleanup(true);
                }
                if (keyEvent.key === 'Escape') {
                  keyEvent.preventDefault();
                  cleanup(false);
                }
              };
            };
          });
        });

        iDoc.body.onclick = () => {
          dispatch({ type: 'SELECT', id: null });
          setSelectedPath('root');
        };
      } catch (_) {
        // Ignore iframe decoration failures for malformed HTML.
      }
    };

    window.setTimeout(decorate, 60);
  }, [commitInlineText, notify, selectCanvasNode, selectedNode?.path, state.html, state.mode, state.selectedSection]);

  useEffect(() => {
    const handleKeys = (event) => {
      if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if (mod && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
        event.preventDefault();
        dispatch({ type: 'REDO' });
      }
      if (mod && event.key === 's') {
        event.preventDefault();
        downloadHtml(state.html);
      }
      if (event.key === 'Escape') {
        dispatch({ type: 'SELECT', id: null });
        setSelectedPath('root');
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [state.html]);

  const handleImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setHtml(loadEvent.target.result, `Import: ${file.name}`);
      notify(`Imported ${file.name}`, 'success');
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [notify, setHtml]);

  const insertComponent = useCallback((component) => {
    setHtml(appendToBody(state.html, component.html), `Insert: ${component.label}`);
    notify(`Added ${component.label}`, 'success');
  }, [notify, setHtml, state.html]);

  const removeSection = useCallback((sectionId) => {
    setHtml(removeSectionHtml(state.html, sectionId), `Remove: ${sectionId}`);
    if (state.selectedSection === sectionId) {
      dispatch({ type: 'SELECT', id: null });
      setSelectedPath('root');
    }
    notify('Section removed', 'info');
  }, [notify, setHtml, state.html, state.selectedSection]);

  const duplicateSelectedSection = useCallback((sectionId) => {
    setHtml(duplicateSection(state.html, sectionId), `Duplicate: ${sectionId}`);
    notify('Section duplicated', 'success');
  }, [notify, setHtml, state.html]);

  const moveSection = useCallback((sectionId, direction) => {
    const next = moveSectionHtml(state.html, sectionId, direction);
    if (next !== state.html) setHtml(next, `Move ${direction}`);
  }, [setHtml, state.html]);

  const applyStyle = useCallback((property, value) => {
    if (!state.selectedSection || !selectedNode) {
      notify('Select something in the canvas first', 'error');
      return;
    }
    setHtml(updateElementStyle(state.html, state.selectedSection, selectedNode.path, property, value), `${property}: ${value}`);
    notify('Style applied', 'success');
  }, [notify, selectedNode, setHtml, state.html, state.selectedSection]);

  const applyTextEdit = useCallback((value) => {
    if (!state.selectedSection || !selectedNode) return;
    setHtml(updateElementText(state.html, state.selectedSection, selectedNode.path, value), 'Text edit');
    notify('Text updated', 'success');
  }, [notify, selectedNode, setHtml, state.html, state.selectedSection]);

  const applyTheme = useCallback((theme) => {
    const block = getThemeOverride(theme);
    const nextHtml = state.html.match(/<style id="__hc_theme__">[\s\S]*?<\/style>/)
      ? state.html.replace(/<style id="__hc_theme__">[\s\S]*?<\/style>/, block)
      : state.html.replace('</head>', `${block}\n</head>`);
    setHtml(nextHtml, `Theme: ${theme.label}`);
    notify(`Theme applied: ${theme.label}`, 'success');
  }, [notify, setHtml, state.html]);

  async function runAiEdit() {
    if (!aiPrompt.trim()) return;
    if (!apiKey) {
      setShowKey(true);
      notify('Set your Anthropic API key first', 'error');
      return;
    }

    dispatch({ type: 'AI_LOAD', value: true });

    try {
      const isDocumentEdit = !state.selectedSection;
      const target = isDocumentEdit
        ? state.html
        : parseHtmlDocument(state.html).querySelector(`[data-section="${state.selectedSection}"]`)?.outerHTML;

      if (!target) throw new Error('Target section not found');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 4096,
          system: 'You are an expert HTML/CSS developer. Modify the supplied HTML only as requested. Return only valid HTML. Preserve data-section attributes exactly.',
          messages: [{ role: 'user', content: `HTML:\n${target}\n\nRequest: ${aiPrompt}` }],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || `HTTP ${response.status}`);
      }

      const payload = await response.json();
      const modified = payload.content.map((block) => block.text || '').join('').trim();
      dispatch({
        type: 'AI_DIFF',
        value: {
          original: target,
          modified,
          sectionId: state.selectedSection,
          isDocumentEdit,
        },
      });
    } catch (error) {
      notify(`AI error: ${error.message}`, 'error');
    }

    dispatch({ type: 'AI_LOAD', value: false });
  }

  async function generateSection() {
    if (!genPrompt.trim()) return;
    if (!apiKey) {
      setShowKey(true);
      notify('Set your Anthropic API key first', 'error');
      return;
    }

    setGenLoading(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: 'Generate a polished HTML presentation section. Return only HTML. Include a unique data-section attribute. Use inline styles only.',
          messages: [{ role: 'user', content: `Create a section for: ${genPrompt}` }],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const sectionHtml = payload.content.map((block) => block.text || '').join('').trim();
      setHtml(appendToBody(state.html, sectionHtml), `Generate: ${genPrompt.slice(0, 24)}`);
      setGenPrompt('');
      notify('AI section generated', 'success');
    } catch (error) {
      notify(`Generate error: ${error.message}`, 'error');
    }

    setGenLoading(false);
  }

  function applyAiDiff() {
    if (!state.aiDiff) return;
    const next = state.aiDiff.isDocumentEdit
      ? state.aiDiff.modified
      : replaceSectionHtml(state.html, state.aiDiff.sectionId, state.aiDiff.modified);
    setHtml(next, `AI: ${aiPrompt.slice(0, 32)}`);
    dispatch({ type: 'AI_DIFF', value: null });
    setAiPrompt('');
    notify('AI changes applied', 'success');
  }

  return (
    <div style={C.root}>
      <div style={C.topbar}>
        <div style={C.logo}>
          <div style={C.logoIcon}>✦</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>HTMLCanvas</div>
            <div style={{ color: '#475569', fontSize: 10 }}>PowerPoint-style editing for imported HTML</div>
          </div>
        </div>

        <TB onClick={() => fileRef.current?.click()}>Open</TB>
        <TB onClick={() => downloadHtml(state.html)}>Export</TB>
        <TB onClick={() => navigator.clipboard.writeText(state.html)}>Copy HTML</TB>
        <Sep />
        <TB onClick={() => dispatch({ type: 'UNDO' })} disabled={state.historyIndex <= 0}>Undo</TB>
        <TB onClick={() => dispatch({ type: 'REDO' })} disabled={state.historyIndex >= state.history.length - 1}>Redo</TB>

        <div style={{ flex: 1 }} />

        {showKey ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => saveKey(event.target.value)}
              placeholder="Anthropic API key"
              style={C.keyInput}
            />
            <TB onClick={() => setShowKey(false)} style={{ color: '#10b981' }}>Save</TB>
          </div>
        ) : (
          <TB onClick={() => setShowKey(true)} style={{ color: apiKey ? '#10b981' : '#f59e0b' }}>
            {apiKey ? 'AI Key Set' : 'Set AI Key'}
          </TB>
        )}

        <Sep />
        <div style={C.modeToggle}>
          {[
            ['visual', 'Visual'],
            ['preview', 'Preview'],
            ['code', 'Code'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => dispatch({ type: 'MODE', value: mode })}
              style={{
                ...C.modeBtn,
                background: state.mode === mode ? 'linear-gradient(135deg,#7c3aed,#5b21b6)' : 'transparent',
                color: state.mode === mode ? '#fff' : '#64748b',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={C.body}>
        {state.mode !== 'preview' && (
          <div style={C.leftPanel}>
            <div style={C.tabRow}>
              {[
                ['sections', 'Sections'],
                ['components', 'Library'],
                ['history', 'History'],
                ['theme', 'Theme'],
              ].map(([tab, label]) => (
                <TabBtn key={tab} active={leftTab === tab} onClick={() => setLeftTab(tab)} wide>{label}</TabBtn>
              ))}
            </div>

            <div style={C.panelScroll}>
              {leftTab === 'sections' && (
                <>
                  <PLabel>Slides and frames</PLabel>
                  {sections.map((sectionId, index) => (
                    <SRow
                      key={sectionId}
                      id={sectionId}
                      sel={state.selectedSection === sectionId}
                      first={index === 0}
                      last={index === sections.length - 1}
                      onSel={() => selectCanvasNode(sectionId, 'root')}
                      onUp={() => moveSection(sectionId, 'up')}
                      onDown={() => moveSection(sectionId, 'down')}
                      onDup={() => duplicateSelectedSection(sectionId)}
                      onDel={() => removeSection(sectionId)}
                    />
                  ))}

                  <div style={C.divider} />
                  <PLabel>Generate new section</PLabel>
                  <textarea
                    value={genPrompt}
                    onChange={(event) => setGenPrompt(event.target.value)}
                    placeholder="Describe the section to generate"
                    style={C.textarea}
                  />
                  <button
                    onClick={generateSection}
                    disabled={genLoading || !genPrompt.trim() || !apiKey}
                    style={{ ...C.primaryBtn, opacity: genLoading || !genPrompt.trim() || !apiKey ? 0.45 : 1 }}
                  >
                    {genLoading ? 'Generating...' : 'Generate with AI'}
                  </button>
                </>
              )}

              {leftTab === 'components' && (
                <>
                  <PLabel>Component library</PLabel>
                  <input
                    value={componentSearch}
                    onChange={(event) => setComponentSearch(event.target.value)}
                    placeholder="Search components"
                    style={C.input}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {componentCategories.map((category) => (
                      <button
                        key={category}
                        onClick={() => setComponentCategory(category)}
                        style={{
                          ...C.filterChip,
                          borderColor: componentCategory === category ? '#7c3aed' : '#1e1e2e',
                          color: componentCategory === category ? '#a78bfa' : '#64748b',
                        }}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  {filteredComponents.map((component) => (
                    <button key={component.id} onClick={() => insertComponent(component)} style={C.compBtn}>
                      <span style={{ fontSize: 18 }}>{component.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{component.label}</div>
                        <div style={{ color: '#475569', fontSize: 11 }}>{component.category || 'Component'}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {leftTab === 'history' && (
                <>
                  <PLabel>Version timeline</PLabel>
                  {[...state.history].reverse().map((entry, reverseIndex) => {
                    const index = state.history.length - 1 - reverseIndex;
                    const active = index === state.historyIndex;
                    return (
                      <button
                        key={`${entry.ts}-${index}`}
                        onClick={() => setHtml(entry.html, `Restore: ${entry.label}`)}
                        style={{
                          ...C.histBtn,
                          background: active ? '#1e1e3e' : '#111120',
                          borderColor: active ? '#7c3aed' : '#1e1e2e',
                        }}
                      >
                        <div style={{ color: active ? '#a78bfa' : '#cbd5e1', fontSize: 12, fontWeight: 700 }}>{entry.label}</div>
                        <div style={{ color: '#475569', fontSize: 10, marginTop: 4 }}>{new Date(entry.ts).toLocaleString()}</div>
                      </button>
                    );
                  })}
                </>
              )}

              {leftTab === 'theme' && (
                <>
                  <PLabel>Global theme overrides</PLabel>
                  {THEMES.map((theme) => (
                    <button key={theme.id} onClick={() => applyTheme(theme)} style={C.themeBtn}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[theme.colors.bg, theme.colors.surface, theme.colors.accent, theme.colors.accent2].map((color) => (
                          <div key={color} style={{ width: 14, height: 14, borderRadius: 4, background: color, border: '1px solid #00000020' }} />
                        ))}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 12 }}>{theme.label}</div>
                        <div style={{ color: '#475569', fontSize: 11 }}>{theme.description}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        <div style={C.canvasArea}>
          {state.mode === 'visual' && (
            <div style={C.zoomBar}>
              {[50, 75, 100, 125, 150].map((zoom) => (
                <button
                  key={zoom}
                  onClick={() => dispatch({ type: 'ZOOM', value: zoom })}
                  style={{
                    ...C.zoomChip,
                    background: state.zoom === zoom ? '#2d2d44' : 'transparent',
                    color: state.zoom === zoom ? '#a78bfa' : '#64748b',
                  }}
                >
                  {zoom}%
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {state.selectedSection ? (
                <div style={{ color: '#94a3b8', fontSize: 12 }}>
                  {state.selectedSection} / <span style={{ color: '#a78bfa' }}>{selectedNode?.tag || 'section'}</span>
                </div>
              ) : (
                <div style={{ color: '#475569', fontSize: 12 }}>Click any imported element. Double-click text to edit inline.</div>
              )}
            </div>
          )}

          {state.mode !== 'code' ? (
            <div style={C.canvasShell}>
              <div
                style={{
                  width: state.mode === 'preview' ? '100%' : `${state.zoom}%`,
                  minHeight: 680,
                  background: '#fff',
                  borderRadius: state.mode === 'preview' ? 0 : 12,
                  overflow: 'hidden',
                  border: state.mode === 'visual' ? '1px solid #1e1e2e' : 'none',
                  boxShadow: state.mode === 'visual' ? '0 20px 70px rgba(0,0,0,.55)' : 'none',
                }}
              >
                <iframe
                  ref={iframeRef}
                  title="HTML preview"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  style={{ width: '100%', minHeight: 720, border: 'none', display: 'block' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={C.codeBar}>
                <span style={{ color: '#a78bfa' }}>Live HTML</span>
                <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 11 }}>{state.html.length.toLocaleString()} chars</span>
              </div>
              <textarea
                value={state.html}
                onChange={(event) => setHtml(event.target.value, 'Code edit')}
                spellCheck={false}
                style={C.codeArea}
              />
            </div>
          )}
        </div>

        {state.mode !== 'preview' && (
          <div style={C.rightPanel}>
            <div style={C.tabRow}>
              {[
                ['edit', 'Edit'],
                ['style', 'Style'],
                ['ai', 'AI'],
              ].map(([tab, label]) => (
                <TabBtn key={tab} active={rightTab === tab} onClick={() => setRightTab(tab)} wide>{label}</TabBtn>
              ))}
            </div>
            <div style={C.panelScroll}>
              {rightTab === 'edit' && (
                <EditPanel
                  selectedSection={state.selectedSection}
                  selectedNode={selectedNode}
                  editableNodes={editableNodes}
                  onSelectNode={(path) => setSelectedPath(path)}
                  onApplyText={applyTextEdit}
                  onSelectSection={(sectionId) => selectCanvasNode(sectionId, 'root')}
                  sections={sections}
                />
              )}

              {rightTab === 'style' && (
                <StylePanel selectedSection={state.selectedSection} selectedNode={selectedNode} onApply={applyStyle} />
              )}

              {rightTab === 'ai' && (
                <AIPanel
                  selectedSection={state.selectedSection}
                  sections={sections}
                  aiPrompt={aiPrompt}
                  setAiPrompt={setAiPrompt}
                  loading={state.aiLoading}
                  diff={state.aiDiff}
                  hasKey={!!apiKey}
                  onSetKey={() => setShowKey(true)}
                  onRun={runAiEdit}
                  onApply={applyAiDiff}
                  onDiscard={() => dispatch({ type: 'AI_DIFF', value: null })}
                  onSelect={(sectionId) => selectCanvasNode(sectionId || null, 'root')}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div style={C.notifications}>
        {state.notifications.map((note) => (
          <div
            key={note.id}
            onClick={() => dispatch({ type: 'DISMISS', id: note.id })}
            style={{
              ...C.toast,
              background: note.kind === 'success' ? '#059669' : note.kind === 'error' ? '#dc2626' : '#7c3aed',
            }}
          >
            {note.msg}
          </div>
        ))}
      </div>

      <input ref={fileRef} type="file" accept=".html" style={{ display: 'none' }} onChange={handleImport} />
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

function EditPanel({ selectedSection, selectedNode, editableNodes, onSelectNode, onApplyText, onSelectSection, sections }) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(selectedNode?.text || '');
  }, [selectedNode?.path, selectedNode?.text]);

  if (!selectedSection) {
    return (
      <div>
        <PLabel>Choose a section</PLabel>
        <PMuted>Select a section or click any element in the canvas.</PMuted>
        <div style={{ marginTop: 10 }}>
          {sections.map((sectionId) => (
            <button key={sectionId} onClick={() => onSelectSection(sectionId)} style={C.sectionPill}>
              {sectionId}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PLabel>Selection</PLabel>
      <div style={C.selectionCard}>
        <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 12 }}>{selectedSection}</div>
        <div style={{ color: '#e2e8f0', fontSize: 13, marginTop: 6 }}>{selectedNode?.tag || 'section'}</div>
        <div style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>{selectedNode?.path || 'root'}</div>
      </div>

      <PLabel>Text editor</PLabel>
      {selectedNode?.canEditText ? (
        <>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            style={{ ...C.textarea, minHeight: 110 }}
            placeholder="Edit selected text"
          />
          <button onClick={() => onApplyText(draft)} style={C.primaryBtn}>Apply text</button>
        </>
      ) : (
        <PMuted>This element is best edited with styles or AI. Double-click text in the canvas for direct editing.</PMuted>
      )}

      <div style={C.divider} />
      <PLabel>Section structure</PLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {editableNodes.map((node) => (
          <button
            key={node.path}
            onClick={() => onSelectNode(node.path)}
            style={{
              ...C.nodeRow,
              borderColor: selectedNode?.path === node.path ? '#7c3aed' : '#1e1e2e',
              background: selectedNode?.path === node.path ? '#1a1730' : '#111120',
            }}
          >
            <div style={{ color: '#a78bfa', fontSize: 10, textTransform: 'uppercase' }}>{node.tag}</div>
            <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4, textAlign: 'left' }}>
              {node.text || '<empty>'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StylePanel({ selectedSection, selectedNode, onApply }) {
  const style = useMemo(() => parseInlineStyle(selectedNode?.style || ''), [selectedNode?.style]);
  const [background, setBackground] = useState('#1e1e2e');
  const [color, setColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(18);
  const [padding, setPadding] = useState(32);
  const [radius, setRadius] = useState(0);

  useEffect(() => {
    setBackground(normalizeColor(style.background, '#1e1e2e'));
    setColor(normalizeColor(style.color, '#ffffff'));
    setFontSize(parseInt(style['font-size'], 10) || 18);
    setPadding(parseInt(style.padding, 10) || 32);
    setRadius(parseInt(style['border-radius'], 10) || 0);
  }, [style]);

  if (!selectedSection || !selectedNode) {
    return <PMuted>Select an element in the canvas to style it.</PMuted>;
  }

  return (
    <div>
      <PLabel>Styling target</PLabel>
      <div style={C.selectionCard}>
        <div style={{ color: '#e2e8f0', fontWeight: 700 }}>{selectedSection}</div>
        <div style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>{selectedNode.tag} / {selectedNode.path}</div>
      </div>

      <PSec title="Colors">
        <PRow label="Background">
          <input type="color" value={background} onChange={(event) => setBackground(event.target.value)} style={C.colorPicker} />
          <TB onClick={() => onApply('background', background)}>Apply</TB>
        </PRow>
        <PRow label="Text">
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} style={C.colorPicker} />
          <TB onClick={() => onApply('color', color)}>Apply</TB>
        </PRow>
      </PSec>

      <PSec title="Typography">
        <PRow label={`Font size: ${fontSize}px`}>
          <input type="range" min={10} max={96} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} style={C.slider} />
          <TB onClick={() => onApply('font-size', `${fontSize}px`)}>Set</TB>
        </PRow>
        <div style={{ display: 'flex', gap: 6 }}>
          {['left', 'center', 'right'].map((value) => (
            <TB key={value} onClick={() => onApply('text-align', value)}>{value}</TB>
          ))}
        </div>
      </PSec>

      <PSec title="Box model">
        <PRow label={`Padding: ${padding}px`}>
          <input type="range" min={0} max={120} value={padding} onChange={(event) => setPadding(Number(event.target.value))} style={C.slider} />
          <TB onClick={() => onApply('padding', `${padding}px`)}>Set</TB>
        </PRow>
        <PRow label={`Radius: ${radius}px`}>
          <input type="range" min={0} max={48} value={radius} onChange={(event) => setRadius(Number(event.target.value))} style={C.slider} />
          <TB onClick={() => onApply('border-radius', `${radius}px`)}>Set</TB>
        </PRow>
      </PSec>

      <PSec title="Presets">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            ['Glow', [['box-shadow', '0 0 40px rgba(124,58,237,.35)']]],
            ['Soft card', [['background', 'rgba(255,255,255,0.05)'], ['border', '1px solid rgba(255,255,255,0.12)'], ['backdrop-filter', 'blur(14px)']]],
            ['Elevated', [['box-shadow', '0 16px 48px rgba(0,0,0,.35)']]],
            ['Flex center', [['display', 'flex'], ['align-items', 'center'], ['justify-content', 'center'], ['flex-direction', 'column']]],
            ['Full width', [['width', '100%']]],
            ['Full height', [['min-height', '100vh']]],
          ].map(([label, operations]) => (
            <button key={label} onClick={() => operations.forEach(([property, value]) => onApply(property, value))} style={C.presetBtn}>
              {label}
            </button>
          ))}
        </div>
      </PSec>
    </div>
  );
}

function AIPanel({ selectedSection, sections, aiPrompt, setAiPrompt, loading, diff, hasKey, onSetKey, onRun, onApply, onDiscard, onSelect }) {
  return (
    <div>
      {!hasKey && (
        <div style={C.warnCard}>
          <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}>API key required</div>
          <div style={{ color: '#78716c', fontSize: 11, marginBottom: 8 }}>AI editing runs directly against Anthropic from the browser in this MVP.</div>
          <TB onClick={onSetKey} style={{ background: '#f59e0b', color: '#0b0b15', border: 'none', fontWeight: 700 }}>Set key</TB>
        </div>
      )}

      <PLabel>Target</PLabel>
      <select value={selectedSection || ''} onChange={(event) => onSelect(event.target.value || null)} style={C.select}>
        <option value="">Entire document</option>
        {sections.map((sectionId) => (
          <option key={sectionId} value={sectionId}>{sectionId}</option>
        ))}
      </select>

      <PLabel>Quick prompts</PLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {AI_QUICK_PROMPTS.map((item) => (
          <button
            key={item.label}
            onClick={() => setAiPrompt(item.prompt)}
            style={{
              ...C.presetBtn,
              borderColor: aiPrompt === item.prompt ? '#7c3aed' : '#2d2d44',
              color: aiPrompt === item.prompt ? '#a78bfa' : '#94a3b8',
            }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      <PLabel>Prompt</PLabel>
      <textarea
        value={aiPrompt}
        onChange={(event) => setAiPrompt(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onRun();
        }}
        placeholder="Improve the selected section, redesign a layout, or add interactions"
        style={{ ...C.textarea, minHeight: 100 }}
      />

      <button onClick={onRun} disabled={loading || !aiPrompt.trim() || !hasKey} style={{ ...C.primaryBtn, opacity: loading || !aiPrompt.trim() || !hasKey ? 0.45 : 1 }}>
        {loading ? 'Running AI...' : 'Run AI edit'}
      </button>

      {diff && (
        <div style={{ marginTop: 14 }}>
          <PLabel>Preview</PLabel>
          <div style={C.diffBox}>{diff.modified.slice(0, 700)}{diff.modified.length > 700 ? '\n...' : ''}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={onApply} style={{ ...C.primaryBtn, flex: 1, background: 'linear-gradient(135deg,#059669,#047857)' }}>Apply</button>
            <button onClick={onDiscard} style={{ ...C.secondaryBtn, flex: 1 }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SRow({ id, sel, first, last, onSel, onUp, onDown, onDup, onDel }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 8,
        marginBottom: 4,
        background: sel ? '#1e1e3e' : hover ? '#121221' : '#111120',
        border: `1px solid ${sel ? '#7c3aed' : '#1e1e2e'}`,
        cursor: 'pointer',
      }}
    >
      <span style={{ color: sel ? '#a78bfa' : '#475569' }}>▣</span>
      <span style={{ color: sel ? '#e2e8f0' : '#94a3b8', fontSize: 12, flex: 1 }}>{id}</span>
      {hover && (
        <div style={{ display: 'flex', gap: 2 }} onClick={(event) => event.stopPropagation()}>
          <IB onClick={onUp} off={first}>↑</IB>
          <IB onClick={onDown} off={last}>↓</IB>
          <IB onClick={onDup}>⊕</IB>
          <IB onClick={onDel} danger>✕</IB>
        </div>
      )}
    </div>
  );
}

function IB({ children, onClick, off, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={off}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: off ? '#1e293b' : danger ? '#ef4444' : '#64748b',
        cursor: off ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function TabBtn({ children, active, onClick, wide }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: wide ? '10px 6px' : '8px 4px',
        border: 'none',
        borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
        background: active ? '#1a1a2e' : 'transparent',
        color: active ? '#a78bfa' : '#475569',
        cursor: 'pointer',
        fontSize: wide ? 12 : 13,
        fontFamily: 'inherit',
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function TB({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid #1e1e2e',
        background: '#111120',
        color: disabled ? '#334155' : '#94a3b8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        fontSize: 12,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: '#1e1e2e', margin: '0 6px' }} />;
}

function PLabel({ children }) {
  return <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontWeight: 800 }}>{children}</div>;
}

function PMuted({ children }) {
  return <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.6 }}>{children}</div>;
}

function PSec({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function PRow({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#475569', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  );
}

function downloadHtml(html) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  link.download = 'presentation.html';
  link.click();
}

function normalizeColor(value, fallback) {
  if (!value || value.includes('gradient') || value.includes('var(') || value === 'transparent') return fallback;
  return value;
}

const GLOBAL_CSS = `
  @keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-thumb{background:#2d2d44;border-radius:999px}
  ::-webkit-scrollbar-track{background:transparent}
`;

const C = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#09090f', color: '#e2e8f0', fontFamily: "'DM Sans',system-ui,sans-serif", overflow: 'hidden' },
  topbar: { height: 56, background: '#0b0b15', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 },
  logoIcon: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', color: '#fff', fontWeight: 800 },
  keyInput: { width: 240, background: '#111120', color: '#e2e8f0', border: '1px solid #7c3aed', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, outline: 'none' },
  modeToggle: { display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #1e1e2e', background: '#0f0f1a' },
  modeBtn: { border: 'none', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  leftPanel: { width: 280, borderRight: '1px solid #1a1a2e', background: '#0b0b15', display: 'flex', flexDirection: 'column', minHeight: 0 },
  rightPanel: { width: 320, borderLeft: '1px solid #1a1a2e', background: '#0b0b15', display: 'flex', flexDirection: 'column', minHeight: 0 },
  tabRow: { display: 'flex', borderBottom: '1px solid #1a1a2e', flexShrink: 0 },
  panelScroll: { flex: 1, overflowY: 'auto', padding: 12 },
  canvasArea: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#05050e' },
  zoomBar: { height: 38, borderBottom: '1px solid #1a1a2e', background: '#0b0b15', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 },
  zoomChip: { padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  canvasShell: { flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 20 },
  codeBar: { padding: '10px 14px', borderBottom: '1px solid #1a1a2e', background: '#0b0b15', display: 'flex', alignItems: 'center', gap: 8 },
  codeArea: { flex: 1, width: '100%', background: '#07070f', color: '#a78bfa', border: 'none', padding: 20, fontFamily: "'Fira Code','Consolas',monospace", fontSize: 13, lineHeight: 1.7, resize: 'none', outline: 'none' },
  input: { width: '100%', background: '#111120', border: '1px solid #2d2d44', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 10 },
  textarea: { width: '100%', background: '#111120', border: '1px solid #2d2d44', borderRadius: 8, color: '#e2e8f0', padding: '10px 12px', fontFamily: 'inherit', fontSize: 12, resize: 'vertical', outline: 'none', marginBottom: 8, lineHeight: 1.6 },
  primaryBtn: { width: '100%', border: 'none', borderRadius: 8, padding: '10px 12px', background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', color: '#fff', cursor: 'pointer', fontWeight: 800, fontFamily: 'inherit', fontSize: 12 },
  secondaryBtn: { width: '100%', border: '1px solid #2d2d44', borderRadius: 8, padding: '10px 12px', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: 12 },
  compBtn: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: '#111120', border: '1px solid #1e1e2e', borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' },
  themeBtn: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: '#111120', border: '1px solid #1e1e2e', borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' },
  histBtn: { width: '100%', textAlign: 'left', border: '1px solid #1e1e2e', borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' },
  divider: { height: 1, background: '#1a1a2e', margin: '14px 0' },
  sectionPill: { width: '100%', textAlign: 'left', border: '1px solid #1e1e2e', borderRadius: 8, padding: '8px 10px', background: '#111120', color: '#cbd5e1', marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit' },
  nodeRow: { width: '100%', textAlign: 'left', border: '1px solid #1e1e2e', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  selectionCard: { border: '1px solid #1e1e2e', borderRadius: 10, background: '#111120', padding: '10px 12px', marginBottom: 12 },
  slider: { flex: 1, accentColor: '#7c3aed' },
  colorPicker: { width: 36, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' },
  presetBtn: { border: '1px solid #2d2d44', borderRadius: 8, background: '#111120', color: '#94a3b8', padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  filterChip: { border: '1px solid #1e1e2e', borderRadius: 999, background: '#111120', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  warnCard: { padding: '10px 12px', background: '#1c120880', border: '1px solid #f59e0b40', borderRadius: 10, marginBottom: 14 },
  select: { width: '100%', background: '#111120', border: '1px solid #2d2d44', borderRadius: 8, color: '#e2e8f0', padding: '8px 10px', fontFamily: 'inherit', fontSize: 12, outline: 'none', marginBottom: 12 },
  diffBox: { background: '#07070f', border: '1px solid #2d2d44', borderRadius: 8, padding: 10, fontSize: 11, fontFamily: 'monospace', color: '#6ee7b7', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto' },
  notifications: { position: 'fixed', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 },
  toast: { padding: '10px 14px', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 12, boxShadow: '0 12px 30px rgba(0,0,0,.35)', cursor: 'pointer', animation: 'toast-in .16s ease' },
};
