import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AI_QUICK_PROMPTS, COMPONENTS, SAMPLE_HTML, THEMES } from './data';
import {
  applyStyleDirect,
  applyStylesBatch,
  extractPx,
  getEditableDescriptors,
  getElementComputedProps,
  isPlainColor,
  normalizeImportedHtml,
  resolveIframeRenderPlan,
  rgbToHex,
  serializeFromIframe,
  stripEditorChrome,
} from './utils/editor';
import {
  appendToBody,
  duplicateSection,
  extractSections,
  moveSectionHtml,
  parseHtmlDocument,
  removeSectionHtml,
  replaceSectionHtml,
} from './utils/html';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inline-editing eligibility
// ---------------------------------------------------------------------------

const INLINE_EDITABLE_TAGS = new Set([
  'H1','H2','H3','H4','H5','H6',
  'P','BUTTON','LI','SPAN','A','TD','TH','LABEL',
  'DIV','STRONG','EM','SMALL','B','I',
  'FIGCAPTION','BLOCKQUOTE','CODE','CITE','MARK','SUMMARY','LEGEND','DT','DD',
]);

function isInlineEditable(el) {
  return !!el && INLINE_EDITABLE_TAGS.has(el.tagName);
}

function isSelectableNode(el) {
  return !!el && !['HTML','HEAD','BODY','SCRIPT','STYLE','META','LINK','TITLE','NOSCRIPT'].includes(el.tagName);
}

// ---------------------------------------------------------------------------
// Theme helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

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

  // Live data read from the iframe DOM (not derived from state.html string)
  const [editableNodes, setEditableNodes] = useState([]);
  const [elementStyles, setElementStyles] = useState({});

  const iframeRef = useRef(null);
  const fileRef = useRef(null);

  /**
   * editTypeRef controls the iframe rendering strategy in the main effect:
   *   'full'        → rewrite iframe entirely (import, undo/redo, AI apply)
   *   'incremental' → DOM was already mutated; just re-decorate, skip reload
   *
   * Selection / path / mode-only updates leave editType as the default 'full'
   * but resolveIframeRenderPlan still chooses decorate/undecorate when the HTML
   * string and iframe instance are unchanged — avoiding the reload that used
   * to kill contenteditable mid-edit.
   */
  const editTypeRef = useRef('full');
  const lastWrittenHtmlRef = useRef('');
  const writtenIframeRef = useRef(null);
  const inlineEditingRef = useRef(false);
  const decorateTimerRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  const notify = useCallback((msg, kind = 'info') => {
    const id = Date.now() + Math.random();
    dispatch({ type: 'NOTIFY', id, msg, kind });
    window.setTimeout(() => dispatch({ type: 'DISMISS', id }), 2800);
  }, []);

  // ---------------------------------------------------------------------------
  // HTML state helpers
  // ---------------------------------------------------------------------------

  const setHtml = useCallback((html, label) => {
    dispatch({ type: 'SET_HTML', html, label });
  }, []);

  const saveKey = useCallback((value) => {
    setApiKey(value);
    localStorage.setItem('hc_key', value);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const sections = useMemo(() => extractSections(state.html), [state.html]);

  const selectedNode = useMemo(
    () => editableNodes.find((n) => n.path === selectedPath) || editableNodes[0] || null,
    [editableNodes, selectedPath]
  );

  const componentCategories = useMemo(
    () => ['All', ...Array.from(new Set(COMPONENTS.map((c) => c.category || 'Other')))],
    []
  );

  const filteredComponents = useMemo(() => {
    return COMPONENTS.filter((c) => {
      const matchCat = componentCategory === 'All' || (c.category || 'Other') === componentCategory;
      const q = componentSearch.trim().toLowerCase();
      const matchSearch = !q || c.label.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [componentCategory, componentSearch]);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const selectCanvasNode = useCallback((sectionId, path = 'root') => {
    dispatch({ type: 'SELECT', id: sectionId });
    setSelectedPath(path || 'root');
    setRightTab('edit');
  }, []);

  // Reset selection if the selected section disappears (e.g. after remove)
  useEffect(() => {
    if (state.selectedSection && !sections.includes(state.selectedSection)) {
      dispatch({ type: 'SELECT', id: null });
      setSelectedPath('root');
      setEditableNodes([]);
      setElementStyles({});
    }
  }, [sections, state.selectedSection]);

  // Sync selectedPath when editableNodes refresh
  useEffect(() => {
    if (!state.selectedSection) {
      setSelectedPath('root');
      setEditableNodes([]);
      return;
    }
    if (editableNodes.length && !editableNodes.some((n) => n.path === selectedPath)) {
      setSelectedPath(editableNodes[0]?.path || 'root');
    }
  }, [editableNodes, selectedPath, state.selectedSection]);

  // ---------------------------------------------------------------------------
  // Read computed element styles whenever selection changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!state.selectedSection || !selectedPath) {
      setElementStyles({});
      return;
    }
    // Small delay lets the iframe render before we read computed styles
    const t = window.setTimeout(() => {
      const props = getElementComputedProps(iframeRef, state.selectedSection, selectedPath);
      setElementStyles(props);
    }, 80);
    return () => window.clearTimeout(t);
  }, [state.selectedSection, selectedPath, state.html]);

  // ---------------------------------------------------------------------------
  // Inline text commit (called after contenteditable blur)
  // The text is already live in the DOM; we just serialize.
  // ---------------------------------------------------------------------------

  const commitInlineText = useCallback(() => {
    editTypeRef.current = 'incremental';
    inlineEditingRef.current = false;
    const newHtml = serializeFromIframe(iframeRef, state.html);
    if (newHtml !== state.html) {
      setHtml(newHtml, 'Inline text edit');
    }
  }, [setHtml, state.html]);

  // ---------------------------------------------------------------------------
  // Main iframe rendering effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document || null;
    const editType = editTypeRef.current;
    editTypeRef.current = 'full'; // reset for next cycle

    const htmlChanged = state.html !== lastWrittenHtmlRef.current;
    const iframeRemounted = !!iframe && writtenIframeRef.current !== iframe;
    const plan = resolveIframeRenderPlan({
      editType,
      htmlChanged,
      iframeRemounted,
      mode: state.mode,
      hasIframe: !!iframe && !!doc,
    });

    if (decorateTimerRef.current) {
      window.clearTimeout(decorateTimerRef.current);
      decorateTimerRef.current = null;
    }

    if (plan === 'skip') return undefined;

    // ── decorate ────────────────────────────────────────────────────────────
    // Inject editor styles + event handlers into the iframe without rewriting it.
    const decorate = () => {
      if (state.mode !== 'visual') return;
      try {
        const iDoc = iframe.contentDocument;
        if (!iDoc?.body) return;

        // Editor CSS injected once into iframe head
        let styleEl = iDoc.getElementById('__hc_editor__');
        if (!styleEl) {
          styleEl = iDoc.createElement('style');
          styleEl.id = '__hc_editor__';
          iDoc.head.appendChild(styleEl);
        }
        styleEl.textContent = `
          [data-section]{position:relative}
          [data-hc-path]{cursor:pointer;transition:outline-color .1s,box-shadow .1s}
          [data-hc-path]:hover{outline:2px dashed rgba(124,58,237,.45)!important;outline-offset:2px}
          [data-hc-section-active="true"]{outline:2px dashed rgba(6,182,212,.45);outline-offset:3px}
          [data-hc-selected="true"]{outline:2px solid #7c3aed!important;outline-offset:3px;box-shadow:0 0 0 5px rgba(124,58,237,.13)!important}
          [data-hc-selected="true"]::after{
            content:attr(data-hc-label);
            position:absolute;top:-22px;left:0;
            background:#7c3aed;color:#fff;
            font:700 10px/1 system-ui,sans-serif;
            padding:3px 8px;border-radius:999px;
            pointer-events:none;white-space:nowrap;z-index:2147483647;
          }
          [contenteditable="true"]{cursor:text!important;outline:2px solid #06b6d4!important;outline-offset:3px!important;caret-color:#06b6d4}
        `;

        // Attach click/dblclick on every element within each section
        iDoc.querySelectorAll('[data-section]').forEach((sectionEl) => {
          const sectionId = sectionEl.getAttribute('data-section');
          const nodes = [sectionEl, ...sectionEl.querySelectorAll('*')].filter(isSelectableNode);

          nodes.forEach((node) => {
            // Compute path relative to section root
            let path = 'root';
            if (node !== sectionEl) {
              const segs = [];
              let cur = node;
              while (cur && cur !== sectionEl) {
                const parent = cur.parentElement;
                if (!parent) { path = null; break; }
                segs.unshift(Array.from(parent.children).indexOf(cur));
                cur = parent;
              }
              path = cur === sectionEl ? segs.join('.') : null;
            }
            if (path === null) return;

            const isActivelyEditing =
              inlineEditingRef.current && node.getAttribute('contenteditable') === 'true';

            node.setAttribute('data-hc-path', path);
            node.setAttribute('data-hc-section', sectionId);
            node.setAttribute('data-hc-label', `${node.tagName.toLowerCase()}`);
            node.setAttribute('data-hc-section-active', sectionId === state.selectedSection ? 'true' : 'false');
            node.setAttribute(
              'data-hc-selected',
              sectionId === state.selectedSection && path === (selectedPath || 'root') ? 'true' : 'false'
            );

            // Keep an in-progress contenteditable session intact — rebinding
            // dblclick/blur here was a source of dropped keystrokes / lost focus.
            if (isActivelyEditing) return;

            // ── Click: select ────────────────────────────────────────────
            node.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (node.getAttribute('contenteditable') === 'true') return; // don't deselect while editing
              selectCanvasNode(sectionId, path);
            };

            // ── Double-click: inline text edit ───────────────────────────
            node.ondblclick = (e) => {
              if (!isInlineEditable(node)) return;
              e.preventDefault();
              e.stopPropagation();
              selectCanvasNode(sectionId, path);

              // End any other inline edit first (one active editor at a time)
              iDoc.querySelectorAll('[contenteditable="true"]').forEach((other) => {
                if (other !== node) {
                  other.removeAttribute('contenteditable');
                  other.onblur = null;
                  other.onkeydown = null;
                }
              });

              const originalHtml = node.innerHTML;
              inlineEditingRef.current = true;
              node.setAttribute('contenteditable', 'true');
              node.focus();

              // Select all text in the element
              try {
                const range = iDoc.createRange();
                range.selectNodeContents(node);
                const sel = iDoc.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (_) {}

              let committed = false;
              const cleanup = (commit) => {
                if (committed) return;
                committed = true;
                inlineEditingRef.current = false;
                node.removeAttribute('contenteditable');
                node.onblur = null;
                node.onkeydown = null;
                if (commit) {
                  // Content is already in the live DOM; just serialize
                  commitInlineText();
                  notify('Text updated', 'success');
                } else {
                  node.innerHTML = originalHtml; // restore on Escape
                }
              };

              node.onblur = () => cleanup(true);
              node.onkeydown = (ke) => {
                if (ke.key === 'Enter' && !ke.shiftKey) {
                  ke.preventDefault();
                  node.blur(); // blur → cleanup(true) via onblur
                }
                if (ke.key === 'Escape') {
                  ke.preventDefault();
                  cleanup(false);
                  node.blur(); // onblur is already cleared; just drop focus
                }
              };
            };
          });
        });

        // Click on blank canvas background deselects
        iDoc.body.onclick = (e) => {
          if (!e.target.closest('[data-section]')) {
            dispatch({ type: 'SELECT', id: null });
            setSelectedPath('root');
          }
        };

        // Update editable nodes from live DOM (skip while typing to avoid
        // draft textarea resets mid-keystroke from descriptor refreshes)
        if (!inlineEditingRef.current) {
          if (state.selectedSection) {
            setEditableNodes(getEditableDescriptors(iframeRef, state.selectedSection));
          } else {
            setEditableNodes([]);
          }
        }
      } catch (_) {
        // Silently ignore decoration failures on malformed HTML
      }
    };

    // ── Apply render plan ──────────────────────────────────────────────────
    if (plan === 'full') {
      // Abort any in-flight inline edit — the document is about to be replaced.
      inlineEditingRef.current = false;
      doc.open();
      doc.write(state.html);
      doc.close();
      lastWrittenHtmlRef.current = state.html;
      writtenIframeRef.current = iframe;
      decorateTimerRef.current = window.setTimeout(() => {
        decorateTimerRef.current = null;
        if (state.mode === 'visual') decorate();
      }, 60);
    } else if (plan === 'decorate') {
      // Keep lastWrittenHtml in sync after incremental commits
      lastWrittenHtmlRef.current = state.html;
      writtenIframeRef.current = iframe;
      decorate();
    } else if (plan === 'undecorate') {
      lastWrittenHtmlRef.current = state.html;
      writtenIframeRef.current = iframe;
      stripEditorChrome(doc);
    }

    return () => {
      if (decorateTimerRef.current) {
        window.clearTimeout(decorateTimerRef.current);
        decorateTimerRef.current = null;
      }
    };
  }, [
    commitInlineText,
    notify,
    selectCanvasNode,
    selectedPath,
    state.html,
    state.mode,
    state.selectedSection,
  ]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e) => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); dispatch({ type: 'REDO' }); }
      if (mod && e.key === 's') { e.preventDefault(); downloadHtml(state.html); }
      if (e.key === 'Escape') { dispatch({ type: 'SELECT', id: null }); setSelectedPath('root'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.html]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Normalize: inject data-section if the imported file lacks them
      const normalized = normalizeImportedHtml(ev.target.result);
      editTypeRef.current = 'full';
      setHtml(normalized, `Import: ${file.name}`);
      notify(`Imported ${file.name}`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [notify, setHtml]);

  const insertComponent = useCallback((component) => {
    editTypeRef.current = 'full';
    setHtml(appendToBody(state.html, component.html), `Insert: ${component.label}`);
    notify(`Added ${component.label}`, 'success');
  }, [notify, setHtml, state.html]);

  const removeSection = useCallback((sectionId) => {
    editTypeRef.current = 'full';
    setHtml(removeSectionHtml(state.html, sectionId), `Remove: ${sectionId}`);
    if (state.selectedSection === sectionId) {
      dispatch({ type: 'SELECT', id: null });
      setSelectedPath('root');
    }
    notify('Section removed', 'info');
  }, [notify, setHtml, state.html, state.selectedSection]);

  const duplicateSelectedSection = useCallback((sectionId) => {
    editTypeRef.current = 'full';
    setHtml(duplicateSection(state.html, sectionId), `Duplicate: ${sectionId}`);
    notify('Section duplicated', 'success');
  }, [notify, setHtml, state.html]);

  const moveSection = useCallback((sectionId, direction) => {
    const next = moveSectionHtml(state.html, sectionId, direction);
    if (next !== state.html) {
      editTypeRef.current = 'full';
      setHtml(next, `Move ${direction}`);
    }
  }, [setHtml, state.html]);

  /**
   * Apply a CSS property to the selected element.
   * Uses direct DOM mutation — no iframe reload, zero flicker.
   */
  const applyStyle = useCallback((property, value) => {
    if (!state.selectedSection || !selectedNode) {
      notify('Select an element in the canvas first', 'error');
      return;
    }
    const ok = applyStyleDirect(iframeRef, state.selectedSection, selectedNode.path, property, value);
    if (ok) {
      editTypeRef.current = 'incremental';
      const newHtml = serializeFromIframe(iframeRef, state.html);
      setHtml(newHtml, `${property}: ${value}`);
      // Refresh local style readout immediately
      setElementStyles((prev) => ({ ...prev }));
      setTimeout(() => {
        setElementStyles(getElementComputedProps(iframeRef, state.selectedSection, selectedNode.path));
      }, 20);
    } else {
      notify('Could not apply style (element not found)', 'error');
    }
  }, [notify, selectedNode, setHtml, state.html, state.selectedSection]);

  /**
   * Apply several CSS properties at once (used by presets).
   */
  const applyStyleBatch = useCallback((styles) => {
    if (!state.selectedSection || !selectedNode) return;
    const ok = applyStylesBatch(iframeRef, state.selectedSection, selectedNode.path, styles);
    if (ok) {
      editTypeRef.current = 'incremental';
      const newHtml = serializeFromIframe(iframeRef, state.html);
      setHtml(newHtml, 'Preset applied');
      notify('Preset applied', 'success');
    }
  }, [notify, selectedNode, setHtml, state.html, state.selectedSection]);

  /**
   * Update text content for the selected element via the sidebar textarea.
   * Uses direct DOM mutation then serializes.
   */
  const applyTextEdit = useCallback((text) => {
    if (!state.selectedSection || !selectedNode) return;

    const iframe = iframeRef.current;
    if (!iframe) return;
    const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iDoc) return;

    // Resolve element
    const sectionEl = Array.from(iDoc.querySelectorAll('[data-section]')).find(
      (el) => el.getAttribute('data-section') === state.selectedSection
    );
    if (!sectionEl) return;

    const el = selectedNode.path === 'root'
      ? sectionEl
      : selectedNode.path.split('.').reduce((node, seg) => {
          if (!node) return null;
          const i = Number(seg);
          return Number.isNaN(i) ? null : node.children[i] ?? null;
        }, sectionEl);

    if (!el) return;
    el.textContent = text;

    editTypeRef.current = 'incremental';
    const newHtml = serializeFromIframe(iframeRef, state.html);
    setHtml(newHtml, 'Text edit');
    notify('Text updated', 'success');
  }, [notify, selectedNode, setHtml, state.html, state.selectedSection]);

  const applyTheme = useCallback((theme) => {
    const block = getThemeOverride(theme);
    const nextHtml = state.html.match(/<style id="__hc_theme__">[\s\S]*?<\/style>/)
      ? state.html.replace(/<style id="__hc_theme__">[\s\S]*?<\/style>/, block)
      : state.html.replace('</head>', `${block}\n</head>`);
    editTypeRef.current = 'full';
    setHtml(nextHtml, `Theme: ${theme.label}`);
    notify(`Theme applied: ${theme.label}`, 'success');
  }, [notify, setHtml, state.html]);

  // ---------------------------------------------------------------------------
  // AI editing
  // ---------------------------------------------------------------------------

  async function runAiEdit() {
    if (!aiPrompt.trim()) return;
    if (!apiKey) { setShowKey(true); notify('Set your Anthropic API key first', 'error'); return; }
    dispatch({ type: 'AI_LOAD', value: true });
    try {
      const isDocEdit = !state.selectedSection;
      const target = isDocEdit
        ? state.html
        : parseHtmlDocument(state.html).querySelector(`[data-section="${state.selectedSection}"]`)?.outerHTML;
      if (!target) throw new Error('Target not found');

      const res = await fetch('https://api.anthropic.com/v1/messages', {
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      const modified = payload.content.map((b) => b.text || '').join('').trim();
      dispatch({ type: 'AI_DIFF', value: { original: target, modified, sectionId: state.selectedSection, isDocEdit } });
    } catch (err) {
      notify(`AI error: ${err.message}`, 'error');
    }
    dispatch({ type: 'AI_LOAD', value: false });
  }

  async function generateSection() {
    if (!genPrompt.trim()) return;
    if (!apiKey) { setShowKey(true); notify('Set your Anthropic API key first', 'error'); return; }
    setGenLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const sectionHtml = payload.content.map((b) => b.text || '').join('').trim();
      editTypeRef.current = 'full';
      setHtml(appendToBody(state.html, sectionHtml), `Generate: ${genPrompt.slice(0, 24)}`);
      setGenPrompt('');
      notify('AI section generated', 'success');
    } catch (err) {
      notify(`Generate error: ${err.message}`, 'error');
    }
    setGenLoading(false);
  }

  function applyAiDiff() {
    if (!state.aiDiff) return;
    const next = state.aiDiff.isDocEdit
      ? state.aiDiff.modified
      : replaceSectionHtml(state.html, state.aiDiff.sectionId, state.aiDiff.modified);
    editTypeRef.current = 'full';
    setHtml(next, `AI: ${aiPrompt.slice(0, 32)}`);
    dispatch({ type: 'AI_DIFF', value: null });
    setAiPrompt('');
    notify('AI changes applied', 'success');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={C.root}>
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
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
        <TB onClick={() => { editTypeRef.current = 'full'; dispatch({ type: 'UNDO' }); }} disabled={state.historyIndex <= 0}>Undo</TB>
        <TB onClick={() => { editTypeRef.current = 'full'; dispatch({ type: 'REDO' }); }} disabled={state.historyIndex >= state.history.length - 1}>Redo</TB>

        <div style={{ flex: 1 }} />

        {showKey ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveKey(e.target.value)}
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
          {[['visual','Visual'],['preview','Preview'],['code','Code']].map(([mode, label]) => (
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

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={C.body}>

        {/* Left panel */}
        {state.mode !== 'preview' && (
          <div style={C.leftPanel}>
            <div style={C.tabRow}>
              {[['sections','Sections'],['components','Library'],['history','History'],['theme','Theme']].map(([tab, label]) => (
                <TabBtn key={tab} active={leftTab === tab} onClick={() => setLeftTab(tab)} wide>{label}</TabBtn>
              ))}
            </div>
            <div style={C.panelScroll}>
              {leftTab === 'sections' && (
                <>
                  <PLabel>Slides / Sections</PLabel>
                  {sections.length === 0 && (
                    <PMuted>No sections found. Import an HTML file or add a component from the Library tab.</PMuted>
                  )}
                  {sections.map((sectionId, i) => (
                    <SRow
                      key={sectionId}
                      id={sectionId}
                      sel={state.selectedSection === sectionId}
                      first={i === 0}
                      last={i === sections.length - 1}
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
                    onChange={(e) => setGenPrompt(e.target.value)}
                    placeholder="Describe the section to generate…"
                    style={C.textarea}
                  />
                  <button
                    onClick={generateSection}
                    disabled={genLoading || !genPrompt.trim() || !apiKey}
                    style={{ ...C.primaryBtn, opacity: genLoading || !genPrompt.trim() || !apiKey ? 0.45 : 1 }}
                  >
                    {genLoading ? 'Generating…' : 'Generate with AI'}
                  </button>
                </>
              )}

              {leftTab === 'components' && (
                <>
                  <PLabel>Component library</PLabel>
                  <input
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="Search components…"
                    style={C.input}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {componentCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setComponentCategory(cat)}
                        style={{
                          ...C.filterChip,
                          borderColor: componentCategory === cat ? '#7c3aed' : '#1e1e2e',
                          color: componentCategory === cat ? '#a78bfa' : '#64748b',
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {filteredComponents.map((comp) => (
                    <button key={comp.id} onClick={() => insertComponent(comp)} style={C.compBtn}>
                      <span style={{ fontSize: 18 }}>{comp.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{comp.label}</div>
                        <div style={{ color: '#475569', fontSize: 11 }}>{comp.category || 'Component'}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {leftTab === 'history' && (
                <>
                  <PLabel>Version timeline</PLabel>
                  {[...state.history].reverse().map((entry, ri) => {
                    const idx = state.history.length - 1 - ri;
                    const active = idx === state.historyIndex;
                    return (
                      <button
                        key={`${entry.ts}-${idx}`}
                        onClick={() => { editTypeRef.current = 'full'; setHtml(entry.html, `Restore: ${entry.label}`); }}
                        style={{ ...C.histBtn, background: active ? '#1e1e3e' : '#111120', borderColor: active ? '#7c3aed' : '#1e1e2e' }}
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
                        {[theme.colors.bg, theme.colors.surface, theme.colors.accent, theme.colors.accent2].map((col) => (
                          <div key={col} style={{ width: 14, height: 14, borderRadius: 4, background: col, border: '1px solid #00000020' }} />
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

        {/* Canvas */}
        <div style={C.canvasArea}>
          {state.mode === 'visual' && (
            <div style={C.zoomBar}>
              {[50, 75, 100, 125, 150].map((z) => (
                <button
                  key={z}
                  onClick={() => dispatch({ type: 'ZOOM', value: z })}
                  style={{
                    ...C.zoomChip,
                    background: state.zoom === z ? '#2d2d44' : 'transparent',
                    color: state.zoom === z ? '#a78bfa' : '#64748b',
                  }}
                >
                  {z}%
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {state.selectedSection ? (
                <div style={{ color: '#94a3b8', fontSize: 12 }}>
                  <span style={{ color: '#a78bfa' }}>{state.selectedSection}</span>
                  {selectedNode && selectedNode.path !== 'root' && (
                    <> / <span style={{ color: '#67e8f9' }}>{selectedNode.tag}</span></>
                  )}
                </div>
              ) : (
                <div style={{ color: '#475569', fontSize: 12 }}>
                  Click to select • Double-click text to edit inline
                </div>
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
                onChange={(e) => { editTypeRef.current = 'full'; setHtml(e.target.value, 'Code edit'); }}
                spellCheck={false}
                style={C.codeArea}
              />
            </div>
          )}
        </div>

        {/* Right panel */}
        {state.mode !== 'preview' && (
          <div style={C.rightPanel}>
            <div style={C.tabRow}>
              {[['edit','Edit'],['style','Style'],['ai','AI']].map(([tab, label]) => (
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
                  onSelectSection={(id) => selectCanvasNode(id, 'root')}
                  sections={sections}
                  elementStyles={elementStyles}
                />
              )}
              {rightTab === 'style' && (
                <StylePanel
                  selectedSection={state.selectedSection}
                  selectedNode={selectedNode}
                  elementStyles={elementStyles}
                  onApply={applyStyle}
                  onApplyBatch={applyStyleBatch}
                />
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
                  onSelect={(id) => selectCanvasNode(id || null, 'root')}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div style={C.notifications}>
        {state.notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => dispatch({ type: 'DISMISS', id: n.id })}
            style={{
              ...C.toast,
              background: n.kind === 'success' ? '#059669' : n.kind === 'error' ? '#dc2626' : '#7c3aed',
            }}
          >
            {n.msg}
          </div>
        ))}
      </div>

      <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={handleImport} />
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Panel
// ---------------------------------------------------------------------------

function EditPanel({ selectedSection, selectedNode, editableNodes, onSelectNode, onApplyText, onSelectSection, sections, elementStyles }) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(selectedNode?.text || '');
  }, [selectedNode?.path, selectedNode?.text]);

  if (!selectedSection) {
    return (
      <div>
        <PLabel>Choose a section</PLabel>
        <PMuted>Click any element in the canvas, or pick a section below.</PMuted>
        <div style={{ marginTop: 10 }}>
          {sections.map((id) => (
            <button key={id} onClick={() => onSelectSection(id)} style={C.sectionPill}>{id}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Selection info */}
      <PLabel>Selection</PLabel>
      <div style={C.selectionCard}>
        <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 12 }}>{selectedSection}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>
            {`<${selectedNode?.tag || 'section'}>`}
          </span>
          {selectedNode?.id && (
            <span style={{ color: '#475569', fontSize: 11 }}>#{selectedNode.id}</span>
          )}
        </div>
        {selectedNode?.path && selectedNode.path !== 'root' && (
          <div style={{ color: '#334155', fontSize: 10, marginTop: 4, fontFamily: 'monospace' }}>{selectedNode.path}</div>
        )}
        {elementStyles.className && (
          <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>.{elementStyles.className.split(' ').join(' .')}</div>
        )}
      </div>

      {/* Text editor */}
      <PLabel>Text content</PLabel>
      {selectedNode?.canEditText ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ ...C.textarea, minHeight: 80 }}
            placeholder="Edit text content"
          />
          <button onClick={() => onApplyText(draft)} style={C.primaryBtn}>Apply text</button>
          <PMuted style={{ marginTop: 6 }}>Or double-click text in the canvas to edit inline.</PMuted>
        </>
      ) : (
        <PMuted>Double-click any text element in the canvas to edit it inline.</PMuted>
      )}

      <div style={C.divider} />

      {/* Section element tree */}
      <PLabel>Element tree ({editableNodes.length})</PLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {editableNodes.map((node) => (
          <button
            key={node.path}
            onClick={() => onSelectNode(node.path)}
            style={{
              ...C.nodeRow,
              borderColor: selectedNode?.path === node.path ? '#7c3aed' : '#1e1e2e',
              background: selectedNode?.path === node.path ? '#1a1730' : '#111120',
              paddingLeft: node.path === 'root' ? 10 : 8 + Math.min(node.path.split('.').length, 5) * 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: selectedNode?.path === node.path ? '#a78bfa' : '#475569', fontSize: 10, fontFamily: 'monospace' }}>
                {'<'}{node.tag}{'>'}
              </span>
              {node.canEditText && <span style={{ color: '#334155', fontSize: 9, background: '#1e2a3a', padding: '1px 4px', borderRadius: 4 }}>T</span>}
            </div>
            {node.text && (
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 2, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {node.text.slice(0, 55)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style Panel — reads real computed values, applies live via direct mutation
// ---------------------------------------------------------------------------

function StylePanel({ selectedSection, selectedNode, elementStyles, onApply, onApplyBatch }) {
  // Local state for each control — synced from elementStyles whenever selection changes
  const [bgColor, setBgColor] = useState('#1e1e2e');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(16);
  const [fontWeight, setFontWeight] = useState('400');
  const [lineHeight, setLineHeight] = useState(1.5);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [textAlign, setTextAlign] = useState('left');
  const [paddingAll, setPaddingAll] = useState(0);
  const [borderRadius, setBorderRadius] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [borderColor, setBorderColor] = useState('#2d2d44');
  const [borderWidth, setBorderWidth] = useState(0);
  const [display, setDisplay] = useState('block');
  const [gap, setGap] = useState(0);
  const [flexDir, setFlexDir] = useState('row');
  const [alignItems, setAlignItems] = useState('stretch');
  const [justifyContent, setJustifyContent] = useState('flex-start');

  // Sync all controls whenever the selected element changes
  useEffect(() => {
    if (!elementStyles || !selectedSection || !selectedNode) return;

    setBgColor(rgbToHex(elementStyles.backgroundColor || '#1e1e2e'));
    setTextColor(rgbToHex(elementStyles.color || '#ffffff'));
    setFontSize(extractPx(elementStyles.fontSize, 16));
    setFontWeight(elementStyles.fontWeight || '400');
    setLineHeight(extractPx(elementStyles.lineHeight, 24) / Math.max(extractPx(elementStyles.fontSize, 16), 1) || 1.5);
    setLetterSpacing(extractPx(elementStyles.letterSpacing, 0));
    setTextAlign(elementStyles.textAlign || 'left');
    // Use the computed top padding as a proxy for all-sides padding
    setPaddingAll(extractPx(elementStyles.paddingTop, 0));
    setBorderRadius(extractPx(elementStyles.borderRadius, 0));
    setOpacity(extractPx(elementStyles.opacity, 1));
    setBorderColor(isPlainColor(elementStyles.borderColor) ? rgbToHex(elementStyles.borderColor) : '#2d2d44');
    setBorderWidth(extractPx(elementStyles.borderWidth, 0));
    setDisplay(elementStyles.display || 'block');
    setGap(extractPx(elementStyles.gap, 0));
    setFlexDir(elementStyles.flexDirection || 'row');
    setAlignItems(elementStyles.alignItems || 'stretch');
    setJustifyContent(elementStyles.justifyContent || 'flex-start');
  }, [elementStyles, selectedSection, selectedNode?.path]);

  if (!selectedSection || !selectedNode) {
    return <PMuted>Select an element in the canvas to style it.</PMuted>;
  }

  const A = (prop, val) => onApply(prop, val);

  const isFlexOrGrid = display === 'flex' || display === 'grid';

  return (
    <div>
      {/* Target info */}
      <div style={{ ...C.selectionCard, marginBottom: 14 }}>
        <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 11 }}>{selectedSection}</span>
        <span style={{ color: '#475569', fontSize: 11 }}> / </span>
        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{`<${selectedNode.tag}>`}</span>
      </div>

      {/* Colors */}
      <PSec title="Colors">
        <PRow label="Background">
          <input type="color" value={bgColor}
            onChange={(e) => { setBgColor(e.target.value); A('background-color', e.target.value); }}
            style={C.colorPicker} />
          <span style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace' }}>{bgColor}</span>
        </PRow>
        <PRow label="Text color">
          <input type="color" value={textColor}
            onChange={(e) => { setTextColor(e.target.value); A('color', e.target.value); }}
            style={C.colorPicker} />
          <span style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace' }}>{textColor}</span>
        </PRow>
        <PRow label="Border color">
          <input type="color" value={borderColor}
            onChange={(e) => { setBorderColor(e.target.value); A('border-color', e.target.value); }}
            style={C.colorPicker} />
        </PRow>
      </PSec>

      {/* Typography */}
      <PSec title="Typography">
        <PRow label={`Font size: ${fontSize}px`}>
          <input type="range" min={8} max={120} value={fontSize}
            onChange={(e) => { const v = Number(e.target.value); setFontSize(v); A('font-size', `${v}px`); }}
            style={C.slider} />
        </PRow>
        <PRow label="Font weight">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[['300','Light'],['400','Reg'],['600','Semi'],['700','Bold'],['800','Extra'],['900','Black']].map(([w, lbl]) => (
              <button key={w}
                onClick={() => { setFontWeight(w); A('font-weight', w); }}
                style={{ ...C.presetBtn, borderColor: fontWeight === w ? '#7c3aed' : '#2d2d44', color: fontWeight === w ? '#a78bfa' : '#64748b', padding: '4px 7px', fontSize: 10 }}>
                {lbl}
              </button>
            ))}
          </div>
        </PRow>
        <PRow label={`Line height: ${lineHeight.toFixed(2)}`}>
          <input type="range" min={0.8} max={3} step={0.05} value={lineHeight}
            onChange={(e) => { const v = parseFloat(e.target.value); setLineHeight(v); A('line-height', String(v)); }}
            style={C.slider} />
        </PRow>
        <PRow label={`Letter spacing: ${letterSpacing}px`}>
          <input type="range" min={-2} max={10} step={0.5} value={letterSpacing}
            onChange={(e) => { const v = Number(e.target.value); setLetterSpacing(v); A('letter-spacing', `${v}px`); }}
            style={C.slider} />
        </PRow>
        <PRow label="Text align">
          <div style={{ display: 'flex', gap: 4 }}>
            {['left','center','right','justify'].map((val) => (
              <button key={val}
                onClick={() => { setTextAlign(val); A('text-align', val); }}
                style={{ ...C.presetBtn, borderColor: textAlign === val ? '#7c3aed' : '#2d2d44', color: textAlign === val ? '#a78bfa' : '#64748b', padding: '4px 8px' }}>
                {val === 'left' ? '⬤⬤⬤' : val === 'center' ? '∷∷∷' : val === 'right' ? '∶∶∶' : '═══'}
              </button>
            ))}
          </div>
        </PRow>
        <PRow label="Transform">
          <div style={{ display: 'flex', gap: 4 }}>
            {[['none','Aa'],['uppercase','AA'],['lowercase','aa'],['capitalize','Aa']].map(([val, lbl]) => (
              <button key={val}
                onClick={() => A('text-transform', val)}
                style={{ ...C.presetBtn, fontSize: 10, padding: '4px 8px' }}>
                {lbl}
              </button>
            ))}
          </div>
        </PRow>
      </PSec>

      {/* Box model */}
      <PSec title="Box model">
        <PRow label={`Padding: ${paddingAll}px`}>
          <input type="range" min={0} max={120} value={paddingAll}
            onChange={(e) => { const v = Number(e.target.value); setPaddingAll(v); A('padding', `${v}px`); }}
            style={C.slider} />
        </PRow>
        <PRow label={`Border radius: ${borderRadius}px`}>
          <input type="range" min={0} max={50} value={borderRadius}
            onChange={(e) => { const v = Number(e.target.value); setBorderRadius(v); A('border-radius', `${v}px`); }}
            style={C.slider} />
        </PRow>
        <PRow label={`Border width: ${borderWidth}px`}>
          <input type="range" min={0} max={8} step={0.5} value={borderWidth}
            onChange={(e) => { const v = Number(e.target.value); setBorderWidth(v); A('border-width', `${v}px`); if (v > 0) A('border-style', 'solid'); }}
            style={C.slider} />
        </PRow>
        <PRow label={`Opacity: ${Math.round(opacity * 100)}%`}>
          <input type="range" min={0} max={1} step={0.01} value={opacity}
            onChange={(e) => { const v = parseFloat(e.target.value); setOpacity(v); A('opacity', String(v)); }}
            style={C.slider} />
        </PRow>
      </PSec>

      {/* Layout */}
      <PSec title="Layout">
        <PRow label="Display">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['block','flex','grid','inline','inline-block','none'].map((val) => (
              <button key={val}
                onClick={() => { setDisplay(val); A('display', val); }}
                style={{ ...C.presetBtn, borderColor: display === val ? '#7c3aed' : '#2d2d44', color: display === val ? '#a78bfa' : '#64748b', fontSize: 10, padding: '4px 7px' }}>
                {val}
              </button>
            ))}
          </div>
        </PRow>
        {isFlexOrGrid && (
          <>
            <PRow label={`Gap: ${gap}px`}>
              <input type="range" min={0} max={80} value={gap}
                onChange={(e) => { const v = Number(e.target.value); setGap(v); A('gap', `${v}px`); }}
                style={C.slider} />
            </PRow>
            {display === 'flex' && (
              <>
                <PRow label="Direction">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['row','column'].map((val) => (
                      <button key={val}
                        onClick={() => { setFlexDir(val); A('flex-direction', val); }}
                        style={{ ...C.presetBtn, borderColor: flexDir === val ? '#7c3aed' : '#2d2d44', color: flexDir === val ? '#a78bfa' : '#64748b', fontSize: 10 }}>
                        {val}
                      </button>
                    ))}
                  </div>
                </PRow>
                <PRow label="Align items">
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['flex-start','center','flex-end','stretch','baseline'].map((val) => (
                      <button key={val}
                        onClick={() => { setAlignItems(val); A('align-items', val); }}
                        style={{ ...C.presetBtn, borderColor: alignItems === val ? '#7c3aed' : '#2d2d44', color: alignItems === val ? '#a78bfa' : '#64748b', fontSize: 9, padding: '3px 6px' }}>
                        {val.replace('flex-', '')}
                      </button>
                    ))}
                  </div>
                </PRow>
                <PRow label="Justify content">
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['flex-start','center','flex-end','space-between','space-around'].map((val) => (
                      <button key={val}
                        onClick={() => { setJustifyContent(val); A('justify-content', val); }}
                        style={{ ...C.presetBtn, borderColor: justifyContent === val ? '#7c3aed' : '#2d2d44', color: justifyContent === val ? '#a78bfa' : '#64748b', fontSize: 9, padding: '3px 6px' }}>
                        {val.replace('flex-', '').replace('space-', 'sp-')}
                      </button>
                    ))}
                  </div>
                </PRow>
              </>
            )}
          </>
        )}
      </PSec>

      {/* Decorative presets */}
      <PSec title="Quick presets">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            ['Glow', { 'box-shadow': '0 0 40px rgba(124,58,237,.4)' }],
            ['Soft card', { 'background': 'rgba(255,255,255,0.06)', 'border': '1px solid rgba(255,255,255,0.12)', 'backdrop-filter': 'blur(14px)' }],
            ['Elevated', { 'box-shadow': '0 16px 48px rgba(0,0,0,.4)' }],
            ['Flex center', { 'display': 'flex', 'align-items': 'center', 'justify-content': 'center', 'flex-direction': 'column' }],
            ['Full width', { 'width': '100%' }],
            ['Full height', { 'min-height': '100vh' }],
            ['Rounded', { 'border-radius': '16px' }],
            ['Pill', { 'border-radius': '999px' }],
            ['No border', { 'border': 'none' }],
            ['Invisible', { 'opacity': '0' }],
            ['Show', { 'opacity': '1', 'visibility': 'visible' }],
          ].map(([label, styles]) => (
            <button key={label} onClick={() => onApplyBatch(styles)} style={C.presetBtn}>
              {label}
            </button>
          ))}
        </div>
      </PSec>

      {/* Raw inline style */}
      {elementStyles.inlineStyle && (
        <PSec title="Current inline style">
          <div style={{ background: '#07070f', border: '1px solid #1e1e2e', borderRadius: 8, padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#6ee7b7', lineHeight: 1.6, wordBreak: 'break-all' }}>
            {elementStyles.inlineStyle}
          </div>
        </PSec>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Panel
// ---------------------------------------------------------------------------

function AIPanel({ selectedSection, sections, aiPrompt, setAiPrompt, loading, diff, hasKey, onSetKey, onRun, onApply, onDiscard, onSelect }) {
  return (
    <div>
      {!hasKey && (
        <div style={C.warnCard}>
          <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}>API key required</div>
          <div style={{ color: '#78716c', fontSize: 11, marginBottom: 8 }}>AI editing runs directly against Anthropic from the browser.</div>
          <TB onClick={onSetKey} style={{ background: '#f59e0b', color: '#0b0b15', border: 'none', fontWeight: 700 }}>Set key</TB>
        </div>
      )}

      <PLabel>Target</PLabel>
      <select value={selectedSection || ''} onChange={(e) => onSelect(e.target.value || null)} style={C.select}>
        <option value="">Entire document</option>
        {sections.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>

      <PLabel>Quick prompts</PLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {AI_QUICK_PROMPTS.map((item) => (
          <button
            key={item.label}
            onClick={() => setAiPrompt(item.prompt)}
            style={{ ...C.presetBtn, borderColor: aiPrompt === item.prompt ? '#7c3aed' : '#2d2d44', color: aiPrompt === item.prompt ? '#a78bfa' : '#94a3b8' }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      <PLabel>Prompt</PLabel>
      <textarea
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onRun(); }}
        placeholder="Improve design, change layout, add interactions…"
        style={{ ...C.textarea, minHeight: 100 }}
      />
      <button
        onClick={onRun}
        disabled={loading || !aiPrompt.trim() || !hasKey}
        style={{ ...C.primaryBtn, opacity: loading || !aiPrompt.trim() || !hasKey ? 0.45 : 1 }}
      >
        {loading ? 'Running AI…' : 'Run AI edit (⌘↵)'}
      </button>

      {diff && (
        <div style={{ marginTop: 14 }}>
          <PLabel>AI preview</PLabel>
          <div style={C.diffBox}>{diff.modified.slice(0, 700)}{diff.modified.length > 700 ? '\n…' : ''}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={onApply} style={{ ...C.primaryBtn, flex: 1, background: 'linear-gradient(135deg,#059669,#047857)' }}>Apply</button>
            <button onClick={onDiscard} style={{ ...C.secondaryBtn, flex: 1 }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable UI primitives
// ---------------------------------------------------------------------------

function SRow({ id, sel, first, last, onSel, onUp, onDown, onDup, onDel }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSel}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
        borderRadius: 8, marginBottom: 4, cursor: 'pointer',
        background: sel ? '#1e1e3e' : hover ? '#121221' : '#111120',
        border: `1px solid ${sel ? '#7c3aed' : '#1e1e2e'}`,
      }}
    >
      <span style={{ color: sel ? '#a78bfa' : '#475569' }}>▣</span>
      <span style={{ color: sel ? '#e2e8f0' : '#94a3b8', fontSize: 12, flex: 1, fontFamily: 'monospace' }}>{id}</span>
      {hover && (
        <div style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
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
      onClick={onClick} disabled={off}
      style={{
        width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent',
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
        flex: 1, padding: wide ? '10px 6px' : '8px 4px', border: 'none',
        borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
        background: active ? '#1a1a2e' : 'transparent',
        color: active ? '#a78bfa' : '#475569',
        cursor: 'pointer', fontSize: wide ? 12 : 13, fontFamily: 'inherit', fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function TB({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: '6px 10px', borderRadius: 8, border: '1px solid #1e1e2e',
        background: '#111120', color: disabled ? '#334155' : '#94a3b8',
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, ...style,
      }}
    >
      {children}
    </button>
  );
}

function Sep() { return <div style={{ width: 1, height: 20, background: '#1e1e2e', margin: '0 6px' }} />; }
function PLabel({ children }) {
  return <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontWeight: 800 }}>{children}</div>;
}
function PMuted({ children, style }) {
  return <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.6, ...style }}>{children}</div>;
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function downloadHtml(html) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = 'presentation.html';
  a.click();
}

// ---------------------------------------------------------------------------
// Global CSS & design tokens
// ---------------------------------------------------------------------------

const GLOBAL_CSS = `
  @keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-thumb{background:#2d2d44;border-radius:999px}
  ::-webkit-scrollbar-track{background:transparent}
`;

const C = {
  root: { display:'flex', flexDirection:'column', height:'100vh', background:'#09090f', color:'#e2e8f0', fontFamily:"'DM Sans',system-ui,sans-serif", overflow:'hidden' },
  topbar: { height:56, background:'#0b0b15', borderBottom:'1px solid #1a1a2e', display:'flex', alignItems:'center', gap:6, padding:'0 12px', flexShrink:0 },
  logo: { display:'flex', alignItems:'center', gap:10, marginRight:8 },
  logoIcon: { width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#7c3aed,#06b6d4)', color:'#fff', fontWeight:800 },
  keyInput: { width:240, background:'#111120', color:'#e2e8f0', border:'1px solid #7c3aed', borderRadius:8, padding:'7px 10px', fontFamily:'inherit', fontSize:12, outline:'none' },
  modeToggle: { display:'flex', borderRadius:10, overflow:'hidden', border:'1px solid #1e1e2e', background:'#0f0f1a' },
  modeBtn: { border:'none', padding:'7px 14px', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700 },
  body: { display:'flex', flex:1, minHeight:0 },
  leftPanel: { width:280, borderRight:'1px solid #1a1a2e', background:'#0b0b15', display:'flex', flexDirection:'column', minHeight:0 },
  rightPanel: { width:340, borderLeft:'1px solid #1a1a2e', background:'#0b0b15', display:'flex', flexDirection:'column', minHeight:0 },
  tabRow: { display:'flex', borderBottom:'1px solid #1a1a2e', flexShrink:0 },
  panelScroll: { flex:1, overflowY:'auto', padding:12 },
  canvasArea: { flex:1, minWidth:0, display:'flex', flexDirection:'column', background:'#05050e' },
  zoomBar: { height:38, borderBottom:'1px solid #1a1a2e', background:'#0b0b15', display:'flex', alignItems:'center', gap:6, padding:'0 12px', flexShrink:0 },
  zoomChip: { padding:'4px 10px', borderRadius:999, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11 },
  canvasShell: { flex:1, overflow:'auto', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:20 },
  codeBar: { padding:'10px 14px', borderBottom:'1px solid #1a1a2e', background:'#0b0b15', display:'flex', alignItems:'center', gap:8 },
  codeArea: { flex:1, width:'100%', background:'#07070f', color:'#a78bfa', border:'none', padding:20, fontFamily:"'Fira Code','Consolas',monospace", fontSize:13, lineHeight:1.7, resize:'none', outline:'none' },
  input: { width:'100%', background:'#111120', border:'1px solid #2d2d44', borderRadius:8, color:'#e2e8f0', padding:'8px 10px', fontFamily:'inherit', fontSize:12, outline:'none', marginBottom:10 },
  textarea: { width:'100%', background:'#111120', border:'1px solid #2d2d44', borderRadius:8, color:'#e2e8f0', padding:'10px 12px', fontFamily:'inherit', fontSize:12, resize:'vertical', outline:'none', marginBottom:8, lineHeight:1.6 },
  primaryBtn: { width:'100%', border:'none', borderRadius:8, padding:'10px 12px', background:'linear-gradient(135deg,#7c3aed,#06b6d4)', color:'#fff', cursor:'pointer', fontWeight:800, fontFamily:'inherit', fontSize:12 },
  secondaryBtn: { width:'100%', border:'1px solid #2d2d44', borderRadius:8, padding:'10px 12px', background:'transparent', color:'#94a3b8', cursor:'pointer', fontWeight:700, fontFamily:'inherit', fontSize:12 },
  compBtn: { display:'flex', alignItems:'center', gap:10, width:'100%', background:'#111120', border:'1px solid #1e1e2e', borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', fontFamily:'inherit' },
  themeBtn: { display:'flex', alignItems:'center', gap:10, width:'100%', background:'#111120', border:'1px solid #1e1e2e', borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', fontFamily:'inherit' },
  histBtn: { width:'100%', textAlign:'left', border:'1px solid #1e1e2e', borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', fontFamily:'inherit' },
  divider: { height:1, background:'#1a1a2e', margin:'14px 0' },
  sectionPill: { width:'100%', textAlign:'left', border:'1px solid #1e1e2e', borderRadius:8, padding:'8px 10px', background:'#111120', color:'#cbd5e1', marginBottom:6, cursor:'pointer', fontFamily:'inherit', fontFamily:'monospace' },
  nodeRow: { width:'100%', textAlign:'left', border:'1px solid #1e1e2e', borderRadius:8, padding:'6px 8px', cursor:'pointer', fontFamily:'inherit', transition:'border-color .1s,background .1s' },
  selectionCard: { border:'1px solid #1e1e2e', borderRadius:10, background:'#111120', padding:'10px 12px', marginBottom:12 },
  slider: { flex:1, accentColor:'#7c3aed' },
  colorPicker: { width:36, height:28, border:'none', background:'transparent', cursor:'pointer', borderRadius:4 },
  presetBtn: { border:'1px solid #2d2d44', borderRadius:8, background:'#111120', color:'#94a3b8', padding:'6px 10px', cursor:'pointer', fontFamily:'inherit', fontSize:11, transition:'border-color .1s,color .1s' },
  filterChip: { border:'1px solid #1e1e2e', borderRadius:999, background:'#111120', padding:'5px 10px', cursor:'pointer', fontFamily:'inherit', fontSize:11 },
  warnCard: { padding:'10px 12px', background:'#1c120880', border:'1px solid #f59e0b40', borderRadius:10, marginBottom:14 },
  select: { width:'100%', background:'#111120', border:'1px solid #2d2d44', borderRadius:8, color:'#e2e8f0', padding:'8px 10px', fontFamily:'inherit', fontSize:12, outline:'none', marginBottom:12 },
  diffBox: { background:'#07070f', border:'1px solid #2d2d44', borderRadius:8, padding:10, fontSize:11, fontFamily:'monospace', color:'#6ee7b7', whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:180, overflowY:'auto' },
  notifications: { position:'fixed', bottom:16, right:16, display:'flex', flexDirection:'column', gap:8, zIndex:9999 },
  toast: { padding:'10px 14px', borderRadius:10, color:'#fff', fontWeight:700, fontSize:12, boxShadow:'0 12px 30px rgba(0,0,0,.35)', cursor:'pointer', animation:'toast-in .16s ease' },
};
