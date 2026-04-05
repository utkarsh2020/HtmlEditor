/**
 * Editor state management
 * Pure reducer — fully testable
 */

export const MODES = { VISUAL: 'visual', CODE: 'code', PREVIEW: 'preview' };
export const PANELS = { COMPONENTS: 'components', AI: 'ai', STYLE: 'style', HISTORY: 'history', THEME: 'theme' };

export function createInitialState(html) {
  return {
    html,
    history: [{ html, label: 'Initial', ts: Date.now() }],
    historyIndex: 0,
    selectedSection: null,
    mode: MODES.VISUAL,
    panel: PANELS.AI,
    zoom: 100,
    isDraggingOver: false,
    notifications: [],
    aiDiff: null,
    aiLoading: false,
    aiPrompt: '',
    searchQuery: '',
  };
}

export function editorReducer(state, action) {
  switch (action.type) {

    case 'SET_HTML': {
      // Never push identical HTML
      if (state.html === action.html) return state;
      const prev = state.history.slice(0, state.historyIndex + 1);
      const entry = { html: action.html, label: action.label || 'Edit', ts: Date.now() };
      const history = [...prev, entry];
      return { ...state, html: action.html, history, historyIndex: history.length - 1 };
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state;
      const idx = state.historyIndex - 1;
      return { ...state, html: state.history[idx].html, historyIndex: idx };
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const idx = state.historyIndex + 1;
      return { ...state, html: state.history[idx].html, historyIndex: idx };
    }

    case 'RESTORE_VERSION': {
      const { html, label } = action;
      const prev = state.history.slice(0, state.historyIndex + 1);
      const entry = { html, label: `Restored: ${label}`, ts: Date.now() };
      const history = [...prev, entry];
      return { ...state, html, history, historyIndex: history.length - 1 };
    }

    case 'SELECT_SECTION':
      return { ...state, selectedSection: action.sectionId, panel: action.sectionId ? PANELS.AI : state.panel };

    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'SET_PANEL':
      return { ...state, panel: action.panel };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(25, Math.min(200, action.zoom)) };

    case 'SET_DRAG_OVER':
      return { ...state, isDraggingOver: action.value };

    case 'SET_AI_LOADING':
      return { ...state, aiLoading: action.value };

    case 'SET_AI_PROMPT':
      return { ...state, aiPrompt: action.value };

    case 'SET_AI_DIFF':
      return { ...state, aiDiff: action.diff };

    case 'CLEAR_AI_DIFF':
      return { ...state, aiDiff: null };

    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };

    case 'NOTIFY': {
      const n = { id: Date.now() + Math.random(), msg: action.msg, kind: action.kind || 'info', ts: Date.now() };
      return { ...state, notifications: [...state.notifications, n] };
    }

    case 'DISMISS_NOTIFY':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.id) };

    default:
      return state;
  }
}

// Action creators
export const actions = {
  setHtml: (html, label) => ({ type: 'SET_HTML', html, label }),
  undo: () => ({ type: 'UNDO' }),
  redo: () => ({ type: 'REDO' }),
  restoreVersion: (html, label) => ({ type: 'RESTORE_VERSION', html, label }),
  selectSection: (sectionId) => ({ type: 'SELECT_SECTION', sectionId }),
  setMode: (mode) => ({ type: 'SET_MODE', mode }),
  setPanel: (panel) => ({ type: 'SET_PANEL', panel }),
  setZoom: (zoom) => ({ type: 'SET_ZOOM', zoom }),
  setDragOver: (value) => ({ type: 'SET_DRAG_OVER', value }),
  setAiLoading: (value) => ({ type: 'SET_AI_LOADING', value }),
  setAiPrompt: (value) => ({ type: 'SET_AI_PROMPT', value }),
  setAiDiff: (diff) => ({ type: 'SET_AI_DIFF', diff }),
  clearAiDiff: () => ({ type: 'CLEAR_AI_DIFF' }),
  setSearch: (query) => ({ type: 'SET_SEARCH', query }),
  notify: (msg, kind = 'info') => ({ type: 'NOTIFY', msg, kind }),
  dismissNotify: (id) => ({ type: 'DISMISS_NOTIFY', id }),
};

// Selectors
export const selectors = {
  canUndo: (state) => state.historyIndex > 0,
  canRedo: (state) => state.historyIndex < state.history.length - 1,
  currentVersion: (state) => state.history[state.historyIndex],
  isVisualMode: (state) => state.mode === MODES.VISUAL,
  isCodeMode: (state) => state.mode === MODES.CODE,
  isPreviewMode: (state) => state.mode === MODES.PREVIEW,
  hasSelection: (state) => state.selectedSection !== null,
};
