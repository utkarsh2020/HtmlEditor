#!/usr/bin/env node
/**
 * Standalone test runner - pure Node.js, zero dependencies
 */
'use strict';

let passed = 0;
let failed = 0;
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  console.log('\n\x1b[1m' + name + '\x1b[0m');
  fn();
}

function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
    passed++;
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    \x1b[31m' + e.message + '\x1b[0m');
    failed++;
  }
}

function expect(val) {
  return {
    toBe: (exp) => { if (val !== exp) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
    toEqual: (exp) => { if (JSON.stringify(val) !== JSON.stringify(exp)) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
    toContain: (sub) => { if (typeof val === 'string' && !val.includes(sub)) throw new Error(`Expected string to contain "${sub}"`); else if (Array.isArray(val) && !val.includes(sub)) throw new Error(`Expected array to contain "${JSON.stringify(sub)}"`); },
    not: {
      toBe: (exp) => { if (val === exp) throw new Error(`Expected not to be ${JSON.stringify(exp)}`); },
      toContain: (sub) => { if (typeof val === 'string' && val.includes(sub)) throw new Error(`Expected string NOT to contain "${sub}"`); else if (Array.isArray(val) && val.includes(sub)) throw new Error(`Expected array NOT to contain "${sub}"`); },
      toEqual: (exp) => { if (JSON.stringify(val) === JSON.stringify(exp)) throw new Error(`Expected not to equal ${JSON.stringify(exp)}`); },
      toBeNull: () => { if (val === null) throw new Error(`Expected value not to be null`); },
    },
    toHaveLength: (n) => { if (val.length !== n) throw new Error(`Expected length ${n}, got ${val.length}`); },
    toBeNull: () => { if (val !== null) throw new Error(`Expected null, got ${JSON.stringify(val)}`); },
    toBeFalsy: () => { if (val) throw new Error(`Expected falsy, got ${JSON.stringify(val)}`); },
    toBeTruthy: () => { if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`); },
    toBeGreaterThan: (n) => { if (val <= n) throw new Error(`Expected ${val} > ${n}`); },
    toBeLessThan: (n) => { if (val >= n) throw new Error(`Expected ${val} < ${n}`); },
    toMatchObject: (exp) => {
      for (const [k, v] of Object.entries(exp)) {
        if (JSON.stringify(val[k]) !== JSON.stringify(v)) throw new Error(`Expected [${k}] to be ${JSON.stringify(v)}, got ${JSON.stringify(val[k])}`);
      }
    },
  };
}

// ═══════════════════════════════════════════════
// UTILS UNDER TEST (inline, no import needed)
// ═══════════════════════════════════════════════

function extractSections(html) {
  const sections = [];
  const regex = /data-section="([^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (!sections.includes(m[1])) sections.push(m[1]);
  }
  return sections;
}

function getSectionHtml(html, sectionId) {
  const openRe = new RegExp(
    `<(section|div|article|main|header|footer|aside|nav)([^>]*data-section="${sectionId}"[^>]*)>`,
    'i'
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagName = openMatch[1].toLowerCase();
  const startIdx = openMatch.index;

  let depth = 0;
  let i = startIdx;
  const openTag = new RegExp(`<${tagName}[\\s>]`, 'gi');
  const closeTag = new RegExp(`<\\/${tagName}>`, 'gi');

  while (i < html.length) {
    openTag.lastIndex = i;
    closeTag.lastIndex = i;

    const nextOpen = openTag.exec(html);
    const nextClose = closeTag.exec(html);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + 1;
    } else {
      if (depth === 1) {
        const endIdx = nextClose.index + nextClose[0].length;
        return html.slice(startIdx, endIdx);
      }
      depth--;
      i = nextClose.index + 1;
    }
  }
  return null;
}

function replaceSectionHtml(fullHtml, sectionId, newSectionHtml) {
  const original = getSectionHtml(fullHtml, sectionId);
  if (!original) return fullHtml;
  const idx = fullHtml.indexOf(original);
  if (idx === -1) return fullHtml;
  return fullHtml.slice(0, idx) + newSectionHtml + fullHtml.slice(idx + original.length);
}

function appendToBody(fullHtml, htmlToInsert) {
  if (fullHtml.includes('</body>')) {
    return fullHtml.replace('</body>', htmlToInsert + '\n</body>');
  }
  return fullHtml + htmlToInsert;
}

function removeSectionHtml(fullHtml, sectionId) {
  const section = getSectionHtml(fullHtml, sectionId);
  if (!section) return fullHtml;
  const idx = fullHtml.indexOf(section);
  if (idx === -1) return fullHtml;
  return fullHtml.slice(0, idx) + fullHtml.slice(idx + section.length);
}

function moveSectionHtml(fullHtml, sectionId, direction) {
  const sections = extractSections(fullHtml);
  const idx = sections.indexOf(sectionId);
  if (idx === -1) return fullHtml;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= sections.length) return fullHtml;

  const thisHtml = getSectionHtml(fullHtml, sectionId);
  const targetHtml = getSectionHtml(fullHtml, sections[targetIdx]);
  if (!thisHtml || !targetHtml) return fullHtml;

  if (direction === 'up') {
    const targetPos = fullHtml.indexOf(targetHtml);
    const thisPos = fullHtml.indexOf(thisHtml);
    if (targetPos > thisPos) return fullHtml;
    return fullHtml.slice(0, targetPos) +
      thisHtml +
      fullHtml.slice(targetPos + targetHtml.length, thisPos) +
      targetHtml +
      fullHtml.slice(thisPos + thisHtml.length);
  } else {
    const thisPos = fullHtml.indexOf(thisHtml);
    const targetPos = fullHtml.indexOf(targetHtml);
    if (targetPos < thisPos) return fullHtml;
    return fullHtml.slice(0, thisPos) +
      targetHtml +
      fullHtml.slice(thisPos + thisHtml.length, targetPos) +
      thisHtml +
      fullHtml.slice(targetPos + targetHtml.length);
  }
}

function parseInlineStyle(styleStr) {
  const result = {};
  if (!styleStr) return result;
  styleStr.split(';').forEach(part => {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) return;
    const key = part.slice(0, colonIdx).trim();
    const val = part.slice(colonIdx + 1).trim();
    if (key && val) result[key] = val;
  });
  return result;
}

function serializeInlineStyle(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function applyStyleToSection(fullHtml, sectionId, cssProperty, cssValue) {
  const section = getSectionHtml(fullHtml, sectionId);
  if (!section) return fullHtml;

  const openTagRe = /^(<[a-zA-Z][^>]*?)(\s*\/?>)/;
  const match = openTagRe.exec(section);
  if (!match) return fullHtml;

  let openTag = match[1];
  const closing = match[2];

  const styleRe = /style="([^"]*)"/i;
  const styleMatch = styleRe.exec(openTag);

  let newOpenTag;
  if (styleMatch) {
    const existing = styleMatch[1];
    const props = parseInlineStyle(existing);
    props[cssProperty] = cssValue;
    const newStyle = serializeInlineStyle(props);
    newOpenTag = openTag.replace(styleRe, `style="${newStyle}"`);
  } else {
    newOpenTag = openTag + ` style="${cssProperty}: ${cssValue}"`;
  }

  const newSection = section.replace(openTag + closing, newOpenTag + closing);
  return replaceSectionHtml(fullHtml, sectionId, newSection);
}

function extractStyleBlock(html) {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}

function replaceStyleBlock(html, newCss) {
  if (html.match(/<style[^>]*>/i)) {
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/i, `<style>\n${newCss}\n</style>`);
  }
  return html.replace('</head>', `<style>\n${newCss}\n</style>\n</head>`);
}

function sanitizeHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=/gi, 'data-removed=');
}

function duplicateSection(fullHtml, sectionId) {
  const section = getSectionHtml(fullHtml, sectionId);
  if (!section) return fullHtml;
  const newId = sectionId + '-copy-' + 'abc123';
  const newSection = section.replace(
    `data-section="${sectionId}"`,
    `data-section="${newId}"`
  );
  const idx = fullHtml.indexOf(section);
  return fullHtml.slice(0, idx + section.length) + '\n' + newSection + fullHtml.slice(idx + section.length);
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : 'Untitled';
}

// State
const MODES = { VISUAL: 'visual', CODE: 'code', PREVIEW: 'preview' };
const PANELS = { COMPONENTS: 'components', AI: 'ai', STYLE: 'style', HISTORY: 'history', THEME: 'theme' };

function createInitialState(html) {
  return {
    html,
    history: [{ html, label: 'Initial', ts: Date.now() }],
    historyIndex: 0,
    selectedSection: null,
    mode: MODES.VISUAL,
    panel: PANELS.AI,
    zoom: 100,
    notifications: [],
    aiDiff: null,
    aiLoading: false,
    aiPrompt: '',
  };
}

const actions = {
  setHtml: (html, label) => ({ type: 'SET_HTML', html, label }),
  undo: () => ({ type: 'UNDO' }),
  redo: () => ({ type: 'REDO' }),
  restoreVersion: (html, label) => ({ type: 'RESTORE_VERSION', html, label }),
  selectSection: (sectionId) => ({ type: 'SELECT_SECTION', sectionId }),
  setMode: (mode) => ({ type: 'SET_MODE', mode }),
  setPanel: (panel) => ({ type: 'SET_PANEL', panel }),
  setZoom: (zoom) => ({ type: 'SET_ZOOM', zoom }),
  setAiLoading: (value) => ({ type: 'SET_AI_LOADING', value }),
  setAiPrompt: (value) => ({ type: 'SET_AI_PROMPT', value }),
  setAiDiff: (diff) => ({ type: 'SET_AI_DIFF', diff }),
  clearAiDiff: () => ({ type: 'CLEAR_AI_DIFF' }),
  notify: (msg, kind = 'info') => ({ type: 'NOTIFY', msg, kind }),
  dismissNotify: (id) => ({ type: 'DISMISS_NOTIFY', id }),
};

function editorReducer(state, action) {
  switch (action.type) {
    case 'SET_HTML': {
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
    case 'SET_AI_LOADING':
      return { ...state, aiLoading: action.value };
    case 'SET_AI_PROMPT':
      return { ...state, aiPrompt: action.value };
    case 'SET_AI_DIFF':
      return { ...state, aiDiff: action.diff };
    case 'CLEAR_AI_DIFF':
      return { ...state, aiDiff: null };
    case 'NOTIFY': {
      const n = { id: Date.now() + Math.random(), msg: action.msg, kind: action.kind || 'info' };
      return { ...state, notifications: [...state.notifications, n] };
    }
    case 'DISMISS_NOTIFY':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.id) };
    default:
      return state;
  }
}

const selectors = {
  canUndo: (s) => s.historyIndex > 0,
  canRedo: (s) => s.historyIndex < s.history.length - 1,
  hasSelection: (s) => s.selectedSection !== null,
  isVisualMode: (s) => s.mode === MODES.VISUAL,
};

function computeSimpleDiff(original, modified) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const origSet = new Set(origLines.map(l => l.trim()).filter(Boolean));
  const modSet = new Set(modLines.map(l => l.trim()).filter(Boolean));
  let added = 0, removed = 0, unchanged = 0;
  modLines.forEach(l => { const t = l.trim(); if (!t) return; if (origSet.has(t)) unchanged++; else added++; });
  origLines.forEach(l => { const t = l.trim(); if (!t) return; if (!modSet.has(t)) removed++; });
  return { added, removed, unchanged };
}

// ═══════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════

const SIMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Doc</title></head>
<body>
  <section data-section="hero" style="background:#000;padding:60px">
    <h1>Hello World</h1>
    <p>Subtitle text here</p>
  </section>
  <div data-section="features" style="background:#111">
    <h2>Features</h2>
    <div class="card">Card 1</div>
    <div class="card">Card 2</div>
  </div>
  <section data-section="cta" style="padding:40px">
    <button>Click me</button>
  </section>
</body>
</html>`;

const NESTED_HTML = `<html><body>
  <section data-section="outer" style="padding:40px">
    <div>
      <section>Inner section no data-section</section>
      <div><p>Deep content</p></div>
    </div>
    <p>Outer paragraph</p>
  </section>
</body></html>`;

// ═══════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════

console.log('\n\x1b[1m\x1b[36m══════════════════════════════════\x1b[0m');
console.log('\x1b[1m\x1b[36m  HTMLCanvas Test Suite\x1b[0m');
console.log('\x1b[1m\x1b[36m══════════════════════════════════\x1b[0m');

describe('extractSections', () => {
  test('extracts all section ids', () => {
    const s = extractSections(SIMPLE_HTML);
    expect(s).toEqual(['hero', 'features', 'cta']);
  });
  test('returns empty array for HTML with no sections', () => {
    expect(extractSections('<html><body><div>no</div></body></html>')).toEqual([]);
  });
  test('deduplicates repeated section ids', () => {
    const html = `<div data-section="a"></div><div data-section="a"></div><div data-section="b"></div>`;
    expect(extractSections(html)).toEqual(['a', 'b']);
  });
  test('handles empty string', () => {
    expect(extractSections('')).toEqual([]);
  });
  test('handles hyphens and numbers in section ids', () => {
    const html = `<div data-section="my-section-1"></div><section data-section="hero-2"></section>`;
    expect(extractSections(html)).toContain('my-section-1');
    expect(extractSections(html)).toContain('hero-2');
  });
});

describe('getSectionHtml', () => {
  test('returns full section HTML', () => {
    const r = getSectionHtml(SIMPLE_HTML, 'hero');
    expect(r).not.toBeNull();
    expect(r).toContain('Hello World');
    expect(r).toContain('data-section="hero"');
    expect(r).toContain('Subtitle text here');
  });
  test('returns section for a div element', () => {
    const r = getSectionHtml(SIMPLE_HTML, 'features');
    expect(r).not.toBeNull();
    expect(r).toContain('Features');
    expect(r).toContain('Card 1');
  });
  test('returns null for non-existent section', () => {
    expect(getSectionHtml(SIMPLE_HTML, 'ghost')).toBeNull();
  });
  test('preserves inline styles', () => {
    const r = getSectionHtml(SIMPLE_HTML, 'hero');
    expect(r).toContain('background:#000');
  });
  test('handles nested sections without including parent', () => {
    const r = getSectionHtml(NESTED_HTML, 'outer');
    expect(r).toContain('data-section="outer"');
    expect(r).toContain('Deep content');
    expect(r).toContain('Outer paragraph');
  });
  test('returned section is self-contained (has open and close tag)', () => {
    const r = getSectionHtml(SIMPLE_HTML, 'cta');
    expect(r).toContain('<section');
    expect(r).toContain('</section>');
    expect(r).toContain('Click me');
  });
});

describe('replaceSectionHtml', () => {
  test('replaces section content', () => {
    const ns = `<section data-section="hero" style="background:red"><h1>New</h1></section>`;
    const r = replaceSectionHtml(SIMPLE_HTML, 'hero', ns);
    expect(r).toContain('New');
    expect(r).not.toContain('Hello World');
  });
  test('preserves other sections', () => {
    const ns = `<section data-section="hero"><h1>X</h1></section>`;
    const r = replaceSectionHtml(SIMPLE_HTML, 'hero', ns);
    expect(r).toContain('Features');
    expect(r).toContain('Click me');
  });
  test('returns original if section not found', () => {
    expect(replaceSectionHtml(SIMPLE_HTML, 'ghost', '<div>x</div>')).toBe(SIMPLE_HTML);
  });
});

describe('appendToBody', () => {
  test('inserts before </body>', () => {
    const nc = '<section data-section="new">New</section>';
    const r = appendToBody(SIMPLE_HTML, nc);
    expect(r).toContain(nc);
    expect(r.indexOf(nc)).toBeLessThan(r.indexOf('</body>'));
  });
  test('appends to end if no </body>', () => {
    const r = appendToBody('<div>x</div>', '<div>new</div>');
    expect(r).toContain('<div>new</div>');
  });
});

describe('removeSectionHtml', () => {
  test('removes a section', () => {
    const r = removeSectionHtml(SIMPLE_HTML, 'cta');
    expect(r).not.toContain('data-section="cta"');
    expect(r).not.toContain('Click me');
  });
  test('preserves other sections', () => {
    const r = removeSectionHtml(SIMPLE_HTML, 'cta');
    expect(r).toContain('Hello World');
    expect(r).toContain('Features');
  });
  test('returns original if not found', () => {
    expect(removeSectionHtml(SIMPLE_HTML, 'ghost')).toBe(SIMPLE_HTML);
  });
});

describe('moveSectionHtml', () => {
  test('moves section down', () => {
    const r = moveSectionHtml(SIMPLE_HTML, 'hero', 'down');
    expect(r.indexOf('data-section="features"')).toBeLessThan(r.indexOf('data-section="hero"'));
  });
  test('moves section up', () => {
    const r = moveSectionHtml(SIMPLE_HTML, 'features', 'up');
    expect(r.indexOf('data-section="features"')).toBeLessThan(r.indexOf('data-section="hero"'));
  });
  test('first section moving up stays first', () => {
    const r = moveSectionHtml(SIMPLE_HTML, 'hero', 'up');
    expect(extractSections(r)[0]).toBe('hero');
  });
  test('last section moving down stays last', () => {
    const r = moveSectionHtml(SIMPLE_HTML, 'cta', 'down');
    const sections = extractSections(r);
    expect(sections[sections.length - 1]).toBe('cta');
  });
});

describe('applyStyleToSection', () => {
  test('adds new style property', () => {
    const r = applyStyleToSection(SIMPLE_HTML, 'hero', 'color', 'red');
    expect(r).toContain('color: red');
  });
  test('overrides existing property', () => {
    const r = applyStyleToSection(SIMPLE_HTML, 'hero', 'background', 'blue');
    expect(r).toContain('background: blue');
    expect(r).not.toContain('background:#000'); // old value gone
  });
  test('adds style attr if none exists', () => {
    const html = `<html><body><section data-section="bare"><p>hi</p></section></body></html>`;
    const r = applyStyleToSection(html, 'bare', 'color', 'white');
    expect(r).toContain('style="color: white"');
  });
  test('preserves other sections', () => {
    const r = applyStyleToSection(SIMPLE_HTML, 'hero', 'color', 'red');
    expect(r).toContain('data-section="features"');
    expect(r).toContain('data-section="cta"');
  });
});

describe('parseInlineStyle', () => {
  test('parses basic style string', () => {
    const r = parseInlineStyle('background: #000; color: red; padding: 10px');
    expect(r).toMatchObject({ background: '#000', color: 'red', padding: '10px' });
  });
  test('handles empty string', () => {
    expect(parseInlineStyle('')).toEqual({});
  });
  test('handles values with colons (URLs)', () => {
    const r = parseInlineStyle('background: linear-gradient(#000, #fff)');
    expect(r['background']).toBeTruthy();
  });
});

describe('serializeInlineStyle', () => {
  test('serializes to string', () => {
    const r = serializeInlineStyle({ color: 'red', padding: '10px' });
    expect(r).toContain('color: red');
    expect(r).toContain('padding: 10px');
  });
  test('filters empty values', () => {
    const r = serializeInlineStyle({ color: 'red', background: '' });
    expect(r).not.toContain('background');
  });
});

describe('extractStyleBlock', () => {
  test('extracts CSS', () => {
    const html = '<html><head><style>body { color: red; }</style></head></html>';
    expect(extractStyleBlock(html)).toContain('body { color: red; }');
  });
  test('returns empty string if no style', () => {
    expect(extractStyleBlock('<html></html>')).toBe('');
  });
});

describe('replaceStyleBlock', () => {
  test('replaces existing style', () => {
    const html = '<html><head><style>body{color:red}</style></head></html>';
    const r = replaceStyleBlock(html, 'body{color:blue}');
    expect(r).toContain('color:blue');
    expect(r).not.toContain('color:red');
  });
  test('inserts style if none', () => {
    const html = '<html><head></head><body></body></html>';
    const r = replaceStyleBlock(html, 'body{margin:0}');
    expect(r).toContain('<style>');
    expect(r).toContain('body{margin:0}');
  });
});

describe('sanitizeHtml', () => {
  test('removes script tags', () => {
    const html = '<div>Safe</div><script>alert("xss")</script>';
    const r = sanitizeHtml(html);
    expect(r).not.toContain('<script>');
    expect(r).not.toContain('alert');
    expect(r).toContain('Safe');
  });
  test('removes inline event handlers', () => {
    const html = '<button onclick="malicious()">Click</button>';
    const r = sanitizeHtml(html);
    expect(r).not.toContain('onclick=');
    expect(r).toContain('Click');
  });
  test('preserves safe content', () => {
    const html = '<h1>Title</h1><p>Para</p>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe('duplicateSection', () => {
  test('adds a copy of section', () => {
    const r = duplicateSection(SIMPLE_HTML, 'hero');
    const sections = extractSections(r);
    expect(sections.filter(s => s.startsWith('hero'))).toHaveLength(2);
  });
  test('copy has different id', () => {
    const r = duplicateSection(SIMPLE_HTML, 'hero');
    const sections = extractSections(r);
    const copies = sections.filter(s => s.startsWith('hero'));
    expect(copies[0]).not.toBe(copies[1]);
  });
  test('copy comes after original', () => {
    const r = duplicateSection(SIMPLE_HTML, 'hero');
    const sections = extractSections(r);
    const copyId = sections.find(s => s.startsWith('hero-copy'));
    expect(r.indexOf(`data-section="hero-copy`)).toBeGreaterThan(r.indexOf('data-section="hero"'));
  });
});

describe('extractTitle', () => {
  test('extracts document title', () => {
    expect(extractTitle(SIMPLE_HTML)).toBe('Test Doc');
  });
  test('returns Untitled for missing title', () => {
    expect(extractTitle('<html><head></head></html>')).toBe('Untitled');
  });
});

describe('editorReducer - SET_HTML', () => {
  test('adds to history and updates html', () => {
    const base = createInitialState('<html>init</html>');
    const next = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    expect(next.html).toBe('<html>v2</html>');
    expect(next.history).toHaveLength(2);
    expect(next.historyIndex).toBe(1);
    expect(next.history[1].label).toBe('v2');
  });
  test('does not push identical html', () => {
    const base = createInitialState('<html>same</html>');
    const next = editorReducer(base, actions.setHtml('<html>same</html>'));
    expect(next.history).toHaveLength(1);
  });
});

describe('editorReducer - UNDO/REDO', () => {
  test('UNDO goes back one step', () => {
    const base = createInitialState('<html>v1</html>');
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.setHtml('<html>v3</html>', 'v3'));
    const undone = editorReducer(s2, actions.undo());
    expect(undone.html).toBe('<html>v2</html>');
    expect(undone.historyIndex).toBe(1);
  });
  test('UNDO does nothing at index 0', () => {
    const base = createInitialState('<html>only</html>');
    const next = editorReducer(base, actions.undo());
    expect(next).toBe(base);
  });
  test('REDO goes forward', () => {
    const base = createInitialState('<html>v1</html>');
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.undo());
    const s3 = editorReducer(s2, actions.redo());
    expect(s3.html).toBe('<html>v2</html>');
  });
  test('REDO does nothing at end', () => {
    const base = createInitialState('<html>only</html>');
    expect(editorReducer(base, actions.redo())).toBe(base);
  });
  test('SET_HTML after UNDO truncates future history', () => {
    const base = createInitialState('<html>v1</html>');
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.setHtml('<html>v3</html>', 'v3'));
    const s3 = editorReducer(s2, actions.undo());
    const s4 = editorReducer(s3, actions.setHtml('<html>branch</html>', 'branch'));
    expect(s4.history).toHaveLength(3);
    expect(s4.html).toBe('<html>branch</html>');
  });
});

describe('editorReducer - selections and modes', () => {
  test('SELECT_SECTION sets section and switches to AI panel', () => {
    const base = createInitialState('<html></html>');
    const next = editorReducer(base, actions.selectSection('hero'));
    expect(next.selectedSection).toBe('hero');
    expect(next.panel).toBe(PANELS.AI);
  });
  test('SELECT_SECTION null clears selection', () => {
    const base = createInitialState('<html></html>');
    const s1 = editorReducer(base, actions.selectSection('hero'));
    const s2 = editorReducer(s1, actions.selectSection(null));
    expect(s2.selectedSection).toBeNull();
  });
  test('SET_MODE changes mode', () => {
    const base = createInitialState('<html></html>');
    expect(editorReducer(base, actions.setMode(MODES.CODE)).mode).toBe(MODES.CODE);
  });
  test('SET_ZOOM clamps to 25-200', () => {
    const base = createInitialState('<html></html>');
    expect(editorReducer(base, actions.setZoom(5)).zoom).toBe(25);
    expect(editorReducer(base, actions.setZoom(999)).zoom).toBe(200);
    expect(editorReducer(base, actions.setZoom(75)).zoom).toBe(75);
  });
});

describe('editorReducer - notifications', () => {
  test('NOTIFY adds notification', () => {
    const base = createInitialState('<html></html>');
    const next = editorReducer(base, actions.notify('Hello', 'success'));
    expect(next.notifications).toHaveLength(1);
    expect(next.notifications[0].msg).toBe('Hello');
    expect(next.notifications[0].kind).toBe('success');
  });
  test('DISMISS_NOTIFY removes by id', () => {
    const base = createInitialState('<html></html>');
    const s1 = editorReducer(base, actions.notify('Hi'));
    const id = s1.notifications[0].id;
    const s2 = editorReducer(s1, actions.dismissNotify(id));
    expect(s2.notifications).toHaveLength(0);
  });
});

describe('editorReducer - AI diff', () => {
  test('SET_AI_DIFF stores diff', () => {
    const base = createInitialState('<html></html>');
    const diff = { original: 'a', modified: 'b', sectionId: 'hero' };
    expect(editorReducer(base, actions.setAiDiff(diff)).aiDiff).toEqual(diff);
  });
  test('CLEAR_AI_DIFF removes diff', () => {
    const base = createInitialState('<html></html>');
    const s1 = editorReducer(base, actions.setAiDiff({ original: 'a', modified: 'b' }));
    expect(editorReducer(s1, actions.clearAiDiff()).aiDiff).toBeNull();
  });
});

describe('selectors', () => {
  test('canUndo false at start', () => {
    expect(selectors.canUndo(createInitialState('<html></html>'))).toBe(false);
  });
  test('canUndo true after edit', () => {
    const base = createInitialState('<html></html>');
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    expect(selectors.canUndo(s1)).toBe(true);
  });
  test('canRedo false at start', () => {
    expect(selectors.canRedo(createInitialState('<html></html>'))).toBe(false);
  });
  test('canRedo true after undo', () => {
    const base = createInitialState('<html></html>');
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.undo());
    expect(selectors.canRedo(s2)).toBe(true);
  });
  test('hasSelection false by default', () => {
    expect(selectors.hasSelection(createInitialState('<html></html>'))).toBe(false);
  });
  test('hasSelection true when selected', () => {
    const base = createInitialState('<html></html>');
    const s1 = editorReducer(base, actions.selectSection('hero'));
    expect(selectors.hasSelection(s1)).toBe(true);
  });
  test('isVisualMode true by default', () => {
    expect(selectors.isVisualMode(createInitialState('<html></html>'))).toBe(true);
  });
});

describe('computeSimpleDiff', () => {
  test('detects added lines', () => {
    const d = computeSimpleDiff('l1\nl2', 'l1\nl2\nl3');
    expect(d.added).toBeGreaterThan(0);
  });
  test('detects removed lines', () => {
    const d = computeSimpleDiff('l1\nl2\nl3', 'l1\nl2');
    expect(d.removed).toBeGreaterThan(0);
  });
  test('identical strings have 0 added/removed', () => {
    const d = computeSimpleDiff('<div>x</div>', '<div>x</div>');
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
  });
  test('completely different strings', () => {
    const d = computeSimpleDiff('aaa\nbbb', 'ccc\nddd');
    expect(d.added).toBeGreaterThan(0);
    expect(d.removed).toBeGreaterThan(0);
    expect(d.unchanged).toBe(0);
  });
});

describe('Integration: full edit workflow', () => {
  test('insert → select → style → undo × 2', () => {
    let state = createInitialState(SIMPLE_HTML);

    const newComp = `<section data-section="pricing" style="background:#222"><h2>Pricing</h2></section>`;
    state = editorReducer(state, actions.setHtml(appendToBody(state.html, newComp), 'Insert pricing'));
    expect(extractSections(state.html)).toContain('pricing');

    state = editorReducer(state, actions.selectSection('pricing'));
    expect(state.selectedSection).toBe('pricing');

    const styled = applyStyleToSection(state.html, 'pricing', 'border', '2px solid red');
    state = editorReducer(state, actions.setHtml(styled, 'Style pricing'));
    expect(state.html).toContain('border: 2px solid red');

    state = editorReducer(state, actions.undo());
    expect(state.html).not.toContain('border: 2px solid red');
    expect(state.html).toContain('data-section="pricing"');

    state = editorReducer(state, actions.undo());
    expect(extractSections(state.html)).not.toContain('pricing');
  });

  test('replace section → remove section → undo chain → redo', () => {
    let state = createInitialState(SIMPLE_HTML);

    const r1 = replaceSectionHtml(state.html, 'hero', '<section data-section="hero"><h1>New</h1></section>');
    state = editorReducer(state, actions.setHtml(r1, 'Replace hero'));

    const r2 = removeSectionHtml(state.html, 'cta');
    state = editorReducer(state, actions.setHtml(r2, 'Remove cta'));

    expect(state.html).toContain('New');
    expect(state.html).not.toContain('data-section="cta"');

    state = editorReducer(state, actions.undo());
    state = editorReducer(state, actions.undo());
    expect(state.html).toContain('Hello World');
    expect(state.html).toContain('data-section="cta"');

    state = editorReducer(state, actions.redo());
    expect(state.html).toContain('New');
  });

  test('move sections up and down', () => {
    let state = createInitialState(SIMPLE_HTML);

    const moved = moveSectionHtml(state.html, 'cta', 'up');
    state = editorReducer(state, actions.setHtml(moved, 'Move cta up'));
    const sections = extractSections(state.html);
    expect(sections.indexOf('cta')).toBeLessThan(sections.indexOf('features'));
  });
});

// ─────────────────────────────────────────────
console.log('\n\x1b[1m\x1b[36m══════════════════════════════════\x1b[0m');
console.log(`\x1b[32m✓ ${passed} passed\x1b[0m  \x1b[31m✗ ${failed} failed\x1b[0m`);
console.log('\x1b[1m\x1b[36m══════════════════════════════════\x1b[0m\n');
process.exit(failed > 0 ? 1 : 0);
