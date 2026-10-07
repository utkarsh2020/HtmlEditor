/**
 * Comprehensive test suite for HTMLCanvas editor
 */
import {
  extractSections,
  getSectionHtml,
  replaceSectionHtml,
  appendToBody,
  removeSectionHtml,
  moveSectionHtml,
  applyStyleToSection,
  parseInlineStyle,
  serializeInlineStyle,
  extractStyleBlock,
  replaceStyleBlock,
  sanitizeHtml,
  duplicateSection,
  extractTitle,
  getEditableElementDescriptors,
  updateElementText,
  updateElementStyle,
} from '../utils/html';

import {
  editorReducer,
  createInitialState,
  actions,
  selectors,
  MODES,
  PANELS,
} from '../state/editorReducer';

import { computeSimpleDiff } from '../services/aiService';

import {
  normalizeImportedHtml,
  resolveIframeRenderPlan,
  stripEditorChrome,
} from '../utils/editor';

// ─────────────────────────────────────────────
// TEST FIXTURES
// ─────────────────────────────────────────────

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
      <section>Inner section (no data-section)</section>
      <div>
        <p>Deep content</p>
      </div>
    </div>
    <p>Outer paragraph</p>
  </section>
</body></html>`;

// ─────────────────────────────────────────────
// SECTION EXTRACTION
// ─────────────────────────────────────────────

describe('extractSections', () => {
  test('extracts all section ids', () => {
    const sections = extractSections(SIMPLE_HTML);
    expect(sections).toEqual(['hero', 'features', 'cta']);
  });

  test('returns empty array for HTML with no sections', () => {
    expect(extractSections('<html><body><div>no sections</div></body></html>')).toEqual([]);
  });

  test('deduplicates repeated section ids', () => {
    const html = `<div data-section="a"></div><div data-section="a"></div><div data-section="b"></div>`;
    expect(extractSections(html)).toEqual(['a', 'b']);
  });

  test('handles empty string', () => {
    expect(extractSections('')).toEqual([]);
  });

  test('handles section ids with hyphens and numbers', () => {
    const html = `<div data-section="my-section-1"></div><section data-section="hero-2"></section>`;
    expect(extractSections(html)).toContain('my-section-1');
    expect(extractSections(html)).toContain('hero-2');
  });
});

// ─────────────────────────────────────────────
// GET SECTION HTML
// ─────────────────────────────────────────────

describe('getSectionHtml', () => {
  test('returns the full section HTML for a section element', () => {
    const result = getSectionHtml(SIMPLE_HTML, 'hero');
    expect(result).not.toBeNull();
    expect(result).toContain('Hello World');
    expect(result).toContain('data-section="hero"');
    expect(result).toContain('Subtitle text here');
  });

  test('returns section HTML for a div element', () => {
    const result = getSectionHtml(SIMPLE_HTML, 'features');
    expect(result).not.toBeNull();
    expect(result).toContain('Features');
    expect(result).toContain('Card 1');
    expect(result).toContain('Card 2');
  });

  test('returns null for non-existent section', () => {
    expect(getSectionHtml(SIMPLE_HTML, 'nonexistent')).toBeNull();
  });

  test('preserves inline styles in returned html', () => {
    const result = getSectionHtml(SIMPLE_HTML, 'hero');
    expect(result).toContain('background:#000');
  });

  test('handles nested sections correctly without including parent', () => {
    const result = getSectionHtml(NESTED_HTML, 'outer');
    expect(result).toContain('data-section="outer"');
    expect(result).toContain('Deep content');
    expect(result).toContain('Outer paragraph');
  });

  test('returns complete self-contained section', () => {
    const result = getSectionHtml(SIMPLE_HTML, 'cta');
    expect(result).toContain('<section');
    expect(result).toContain('</section>');
    expect(result).toContain('Click me');
  });
});

// ─────────────────────────────────────────────
// REPLACE SECTION HTML
// ─────────────────────────────────────────────

describe('replaceSectionHtml', () => {
  test('replaces a section with new content', () => {
    const newSection = `<section data-section="hero" style="background:red"><h1>New Hero</h1></section>`;
    const result = replaceSectionHtml(SIMPLE_HTML, 'hero', newSection);
    expect(result).toContain('New Hero');
    expect(result).not.toContain('Hello World');
    expect(result).toContain('background:red');
  });

  test('preserves other sections when replacing one', () => {
    const newSection = `<section data-section="hero"><h1>Replaced</h1></section>`;
    const result = replaceSectionHtml(SIMPLE_HTML, 'hero', newSection);
    expect(result).toContain('Features'); // features section intact
    expect(result).toContain('Click me'); // cta section intact
  });

  test('returns original HTML if section not found', () => {
    const result = replaceSectionHtml(SIMPLE_HTML, 'ghost', '<div>x</div>');
    expect(result).toBe(SIMPLE_HTML);
  });

  test('handles replacement that preserves data-section attribute', () => {
    const newSection = `<section data-section="features" style="background:blue"><h2>New Features</h2></section>`;
    const result = replaceSectionHtml(SIMPLE_HTML, 'features', newSection);
    expect(result).toContain('data-section="features"');
    expect(result).toContain('New Features');
  });
});

// ─────────────────────────────────────────────
// APPEND TO BODY
// ─────────────────────────────────────────────

describe('appendToBody', () => {
  test('inserts HTML before </body>', () => {
    const newContent = '<section data-section="new">New</section>';
    const result = appendToBody(SIMPLE_HTML, newContent);
    expect(result).toContain(newContent);
    const bodyCloseIdx = result.indexOf('</body>');
    const insertIdx = result.indexOf(newContent);
    expect(insertIdx).toBeLessThan(bodyCloseIdx);
  });

  test('appends to end if no </body> tag', () => {
    const html = '<div>content</div>';
    const result = appendToBody(html, '<div>new</div>');
    expect(result).toContain('<div>new</div>');
  });
});

// ─────────────────────────────────────────────
// REMOVE SECTION
// ─────────────────────────────────────────────

describe('removeSectionHtml', () => {
  test('removes a section from HTML', () => {
    const result = removeSectionHtml(SIMPLE_HTML, 'cta');
    expect(result).not.toContain('data-section="cta"');
    expect(result).not.toContain('Click me');
  });

  test('preserves other sections after removal', () => {
    const result = removeSectionHtml(SIMPLE_HTML, 'cta');
    expect(result).toContain('Hello World');
    expect(result).toContain('Features');
  });

  test('returns original if section not found', () => {
    const result = removeSectionHtml(SIMPLE_HTML, 'ghost');
    expect(result).toBe(SIMPLE_HTML);
  });
});

// ─────────────────────────────────────────────
// MOVE SECTION
// ─────────────────────────────────────────────

describe('moveSectionHtml', () => {
  test('moves a section down', () => {
    const result = moveSectionHtml(SIMPLE_HTML, 'hero', 'down');
    const heroPos = result.indexOf('data-section="hero"');
    const featuresPos = result.indexOf('data-section="features"');
    expect(featuresPos).toBeLessThan(heroPos); // features now before hero
  });

  test('moves a section up', () => {
    const result = moveSectionHtml(SIMPLE_HTML, 'features', 'up');
    const featuresPos = result.indexOf('data-section="features"');
    const heroPos = result.indexOf('data-section="hero"');
    expect(featuresPos).toBeLessThan(heroPos); // features now before hero
  });

  test('does not change HTML when moving first section up', () => {
    const result = moveSectionHtml(SIMPLE_HTML, 'hero', 'up');
    // Should be effectively the same
    expect(extractSections(result)[0]).toBe('hero');
  });

  test('does not change HTML when moving last section down', () => {
    const result = moveSectionHtml(SIMPLE_HTML, 'cta', 'down');
    const sections = extractSections(result);
    expect(sections[sections.length - 1]).toBe('cta');
  });
});

// ─────────────────────────────────────────────
// APPLY STYLE TO SECTION
// ─────────────────────────────────────────────

describe('applyStyleToSection', () => {
  test('adds a new style property to a section', () => {
    const result = applyStyleToSection(SIMPLE_HTML, 'hero', 'color', 'red');
    expect(result).toContain('color: red');
  });

  test('overrides an existing style property', () => {
    const result = applyStyleToSection(SIMPLE_HTML, 'hero', 'background', 'blue');
    expect(result).toContain('background: blue');
  });

  test('adds style attribute if section has none', () => {
    const html = `<html><body><section data-section="bare"><p>hi</p></section></body></html>`;
    const result = applyStyleToSection(html, 'bare', 'color', 'white');
    expect(result).toContain('style="color: white"');
  });

  test('preserves other sections untouched', () => {
    const result = applyStyleToSection(SIMPLE_HTML, 'hero', 'color', 'red');
    expect(result).toContain('data-section="features"');
    expect(result).toContain('data-section="cta"');
  });
});

// ─────────────────────────────────────────────
// PARSE / SERIALIZE INLINE STYLE
// ─────────────────────────────────────────────

describe('parseInlineStyle', () => {
  test('parses basic style string', () => {
    const result = parseInlineStyle('background: #000; color: red; padding: 10px');
    expect(result).toMatchObject({ background: '#000', color: 'red', padding: '10px' });
  });

  test('handles empty string', () => {
    expect(parseInlineStyle('')).toEqual({});
  });

  test('handles values with colons (e.g., URLs)', () => {
    const result = parseInlineStyle('background: url(http://example.com/img.png)');
    expect(result['background']).toBe('url(http://example.com/img.png)');
  });
});

describe('serializeInlineStyle', () => {
  test('serializes style object to string', () => {
    const result = serializeInlineStyle({ color: 'red', padding: '10px' });
    expect(result).toContain('color: red');
    expect(result).toContain('padding: 10px');
  });

  test('filters out empty values', () => {
    const result = serializeInlineStyle({ color: 'red', background: '' });
    expect(result).not.toContain('background');
  });
});

// ─────────────────────────────────────────────
// STYLE BLOCK
// ─────────────────────────────────────────────

describe('extractStyleBlock', () => {
  test('extracts CSS from style tag', () => {
    const html = '<html><head><style>body { color: red; }</style></head></html>';
    expect(extractStyleBlock(html)).toContain('body { color: red; }');
  });

  test('returns empty string if no style tag', () => {
    expect(extractStyleBlock('<html></html>')).toBe('');
  });
});

describe('replaceStyleBlock', () => {
  test('replaces existing style block', () => {
    const html = '<html><head><style>body{color:red}</style></head></html>';
    const result = replaceStyleBlock(html, 'body{color:blue}');
    expect(result).toContain('color:blue');
    expect(result).not.toContain('color:red');
  });

  test('inserts style block if none exists', () => {
    const html = '<html><head></head><body></body></html>';
    const result = replaceStyleBlock(html, 'body{margin:0}');
    expect(result).toContain('<style>');
    expect(result).toContain('body{margin:0}');
  });
});

// ─────────────────────────────────────────────
// SANITIZE HTML
// ─────────────────────────────────────────────

describe('sanitizeHtml', () => {
  test('removes script tags', () => {
    const html = '<div>Safe</div><script>alert("xss")</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('Safe');
  });

  test('removes inline event handlers', () => {
    const html = '<button onclick="malicious()">Click</button>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('onclick=');
    expect(result).toContain('Click');
  });

  test('preserves safe content', () => {
    const html = '<h1>Title</h1><p>Para</p>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

// ─────────────────────────────────────────────
// DUPLICATE SECTION
// ─────────────────────────────────────────────

describe('duplicateSection', () => {
  test('adds a copy of the section', () => {
    const result = duplicateSection(SIMPLE_HTML, 'hero');
    const sections = extractSections(result);
    expect(sections.filter(s => s.includes('hero'))).toHaveLength(2);
  });

  test('the copy has a different id', () => {
    const result = duplicateSection(SIMPLE_HTML, 'hero');
    const sections = extractSections(result);
    const heroCopies = sections.filter(s => s.startsWith('hero'));
    expect(heroCopies[0]).not.toBe(heroCopies[1]);
  });

  test('copy comes after original', () => {
    const result = duplicateSection(SIMPLE_HTML, 'hero');
    const heroPos = result.indexOf('data-section="hero"');
    const copyId = extractSections(result).find(s => s.startsWith('hero-copy'));
    const copyPos = result.indexOf(`data-section="${copyId}"`);
    expect(copyPos).toBeGreaterThan(heroPos);
  });
});

// ─────────────────────────────────────────────
// EXTRACT TITLE
// ─────────────────────────────────────────────

describe('extractTitle', () => {
  test('extracts document title', () => {
    expect(extractTitle(SIMPLE_HTML)).toBe('Test Doc');
  });

  test('returns Untitled for missing title', () => {
    expect(extractTitle('<html><head></head></html>')).toBe('Untitled');
  });
});

describe('nested element editing', () => {
  test('lists editable nodes for a selected section', () => {
    const nodes = getEditableElementDescriptors(SIMPLE_HTML, 'hero');
    expect(nodes[0].path).toBe('root');
    expect(nodes.some((node) => node.tag === 'h1' && node.text === 'Hello World')).toBe(true);
    expect(nodes.some((node) => node.tag === 'p' && node.text === 'Subtitle text here')).toBe(true);
  });

  test('updates nested element text by path', () => {
    const nodes = getEditableElementDescriptors(SIMPLE_HTML, 'hero');
    const heading = nodes.find((node) => node.tag === 'h1');
    const result = updateElementText(SIMPLE_HTML, 'hero', heading.path, 'Updated Heading');
    expect(result).toContain('Updated Heading');
    expect(result).not.toContain('Hello World');
  });

  test('updates nested element styles by path', () => {
    const nodes = getEditableElementDescriptors(SIMPLE_HTML, 'hero');
    const heading = nodes.find((node) => node.tag === 'h1');
    const result = updateElementStyle(SIMPLE_HTML, 'hero', heading.path, 'color', '#ff0000');
    expect(result).toContain('color: rgb(255, 0, 0);');
  });
});

// ─────────────────────────────────────────────
// EDITOR REDUCER
// ─────────────────────────────────────────────

describe('editorReducer', () => {
  const baseState = createInitialState('<html><body>initial</body></html>');

  test('SET_HTML adds to history and updates html', () => {
    const newHtml = '<html><body>updated</body></html>';
    const next = editorReducer(baseState, actions.setHtml(newHtml, 'Test edit'));
    expect(next.html).toBe(newHtml);
    expect(next.history).toHaveLength(2);
    expect(next.historyIndex).toBe(1);
    expect(next.history[1].label).toBe('Test edit');
  });

  test('SET_HTML does not duplicate identical html', () => {
    const next = editorReducer(baseState, actions.setHtml(baseState.html));
    expect(next.history).toHaveLength(1);
  });

  test('UNDO goes back one step', () => {
    const s1 = editorReducer(baseState, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.setHtml('<html>v3</html>', 'v3'));
    const undone = editorReducer(s2, actions.undo());
    expect(undone.html).toBe('<html>v2</html>');
    expect(undone.historyIndex).toBe(1);
  });

  test('UNDO does nothing at index 0', () => {
    const result = editorReducer(baseState, actions.undo());
    expect(result).toBe(baseState); // same reference
  });

  test('REDO goes forward one step', () => {
    const s1 = editorReducer(baseState, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.undo());
    const s3 = editorReducer(s2, actions.redo());
    expect(s3.html).toBe('<html>v2</html>');
    expect(s3.historyIndex).toBe(1);
  });

  test('REDO does nothing at end of history', () => {
    const result = editorReducer(baseState, actions.redo());
    expect(result).toBe(baseState);
  });

  test('SET_HTML after UNDO truncates future history', () => {
    const s1 = editorReducer(baseState, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.setHtml('<html>v3</html>', 'v3'));
    const s3 = editorReducer(s2, actions.undo()); // back to v2
    const s4 = editorReducer(s3, actions.setHtml('<html>branch</html>', 'branch'));
    expect(s4.history).toHaveLength(3); // initial + v2 + branch (v3 discarded)
    expect(s4.html).toBe('<html>branch</html>');
  });

  test('RESTORE_VERSION sets html and adds to history', () => {
    const old = baseState.history[0];
    const next = editorReducer(baseState, actions.restoreVersion(old.html, old.label));
    expect(next.html).toBe(old.html);
  });

  test('SELECT_SECTION sets selectedSection and switches panel to AI', () => {
    const next = editorReducer(baseState, actions.selectSection('hero'));
    expect(next.selectedSection).toBe('hero');
    expect(next.panel).toBe(PANELS.AI);
  });

  test('SELECT_SECTION with null clears selection', () => {
    const s1 = editorReducer(baseState, actions.selectSection('hero'));
    const s2 = editorReducer(s1, actions.selectSection(null));
    expect(s2.selectedSection).toBeNull();
  });

  test('SET_MODE changes mode', () => {
    const next = editorReducer(baseState, actions.setMode(MODES.CODE));
    expect(next.mode).toBe(MODES.CODE);
  });

  test('SET_ZOOM clamps to 25–200', () => {
    expect(editorReducer(baseState, actions.setZoom(5)).zoom).toBe(25);
    expect(editorReducer(baseState, actions.setZoom(999)).zoom).toBe(200);
    expect(editorReducer(baseState, actions.setZoom(75)).zoom).toBe(75);
  });

  test('NOTIFY adds notification', () => {
    const next = editorReducer(baseState, actions.notify('Hello', 'success'));
    expect(next.notifications).toHaveLength(1);
    expect(next.notifications[0].msg).toBe('Hello');
    expect(next.notifications[0].kind).toBe('success');
  });

  test('DISMISS_NOTIFY removes by id', () => {
    const s1 = editorReducer(baseState, actions.notify('Hello'));
    const id = s1.notifications[0].id;
    const s2 = editorReducer(s1, actions.dismissNotify(id));
    expect(s2.notifications).toHaveLength(0);
  });

  test('SET_AI_DIFF stores diff object', () => {
    const diff = { original: 'a', modified: 'b', sectionId: 'hero' };
    const next = editorReducer(baseState, actions.setAiDiff(diff));
    expect(next.aiDiff).toEqual(diff);
  });

  test('CLEAR_AI_DIFF removes diff', () => {
    const diff = { original: 'a', modified: 'b' };
    const s1 = editorReducer(baseState, actions.setAiDiff(diff));
    const s2 = editorReducer(s1, actions.clearAiDiff());
    expect(s2.aiDiff).toBeNull();
  });
});

// ─────────────────────────────────────────────
// SELECTORS
// ─────────────────────────────────────────────

describe('selectors', () => {
  const base = createInitialState('<html></html>');

  test('canUndo is false at start', () => {
    expect(selectors.canUndo(base)).toBe(false);
  });

  test('canUndo is true after an edit', () => {
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    expect(selectors.canUndo(s1)).toBe(true);
  });

  test('canRedo is false at start', () => {
    expect(selectors.canRedo(base)).toBe(false);
  });

  test('canRedo is true after undo', () => {
    const s1 = editorReducer(base, actions.setHtml('<html>v2</html>', 'v2'));
    const s2 = editorReducer(s1, actions.undo());
    expect(selectors.canRedo(s2)).toBe(true);
  });

  test('hasSelection returns false by default', () => {
    expect(selectors.hasSelection(base)).toBe(false);
  });

  test('hasSelection returns true when section selected', () => {
    const s1 = editorReducer(base, actions.selectSection('hero'));
    expect(selectors.hasSelection(s1)).toBe(true);
  });

  test('isVisualMode returns true by default', () => {
    expect(selectors.isVisualMode(base)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// AI SERVICE UTILITIES
// ─────────────────────────────────────────────

describe('computeSimpleDiff', () => {
  test('detects added lines', () => {
    const original = 'line1\nline2';
    const modified = 'line1\nline2\nline3';
    const diff = computeSimpleDiff(original, modified);
    expect(diff.added).toBeGreaterThan(0);
  });

  test('detects removed lines', () => {
    const original = 'line1\nline2\nline3';
    const modified = 'line1\nline2';
    const diff = computeSimpleDiff(original, modified);
    expect(diff.removed).toBeGreaterThan(0);
  });

  test('handles identical strings', () => {
    const html = '<div>same</div>';
    const diff = computeSimpleDiff(html, html);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  test('handles completely different strings', () => {
    const diff = computeSimpleDiff('aaa\nbbb', 'ccc\nddd');
    expect(diff.added).toBeGreaterThan(0);
    expect(diff.removed).toBeGreaterThan(0);
    expect(diff.unchanged).toBe(0);
  });
});

// ─────────────────────────────────────────────
// INTEGRATION: Full edit workflow
// ─────────────────────────────────────────────

describe('Integration: full edit workflow', () => {
  test('insert component → select section → apply style → undo', () => {
    let state = createInitialState(SIMPLE_HTML);

    // Insert a new component
    const newComp = `<section data-section="pricing" style="background:#222"><h2>Pricing</h2></section>`;
    const html1 = appendToBody(state.html, newComp);
    state = editorReducer(state, actions.setHtml(html1, 'Insert pricing'));
    expect(extractSections(state.html)).toContain('pricing');

    // Select a section
    state = editorReducer(state, actions.selectSection('pricing'));
    expect(state.selectedSection).toBe('pricing');

    // Apply a style
    const html2 = applyStyleToSection(state.html, 'pricing', 'border', '2px solid red');
    state = editorReducer(state, actions.setHtml(html2, 'Style pricing'));
    expect(state.html).toContain('border: 2px solid red');

    // Undo the style
    state = editorReducer(state, actions.undo());
    expect(state.html).not.toContain('border: 2px solid red');
    expect(state.html).toContain('data-section="pricing"'); // section still exists

    // Undo the insert
    state = editorReducer(state, actions.undo());
    expect(extractSections(state.html)).not.toContain('pricing');
  });

  test('replace section → remove section → redo chain', () => {
    let state = createInitialState(SIMPLE_HTML);

    const replaced = replaceSectionHtml(state.html, 'hero', '<section data-section="hero"><h1>New</h1></section>');
    state = editorReducer(state, actions.setHtml(replaced, 'Replace hero'));

    const removed = removeSectionHtml(state.html, 'cta');
    state = editorReducer(state, actions.setHtml(removed, 'Remove cta'));

    expect(state.html).toContain('New');
    expect(state.html).not.toContain('data-section="cta"');

    // Undo twice
    state = editorReducer(state, actions.undo());
    state = editorReducer(state, actions.undo());
    expect(state.html).toContain('Hello World');
    expect(state.html).toContain('data-section="cta"');

    // Redo once
    state = editorReducer(state, actions.redo());
    expect(state.html).toContain('New');
  });
});

// ─────────────────────────────────────────────
// IFRAME RENDER PLAN (edit-mode consistency)
// ─────────────────────────────────────────────

describe('resolveIframeRenderPlan', () => {
  test('skips when iframe is not mounted (code mode)', () => {
    expect(
      resolveIframeRenderPlan({
        editType: 'full',
        htmlChanged: true,
        iframeRemounted: false,
        mode: 'code',
        hasIframe: false,
      })
    ).toBe('skip');
  });

  test('selection-only updates decorate instead of full reload', () => {
    // This is the core inconsistency fix: clicking/selecting must not rewrite
    // the iframe, or double-click contenteditable is destroyed mid-session.
    expect(
      resolveIframeRenderPlan({
        editType: 'full',
        htmlChanged: false,
        iframeRemounted: false,
        mode: 'visual',
        hasIframe: true,
      })
    ).toBe('decorate');
  });

  test('preview mode strips editor chrome without rewriting HTML', () => {
    expect(
      resolveIframeRenderPlan({
        editType: 'full',
        htmlChanged: false,
        iframeRemounted: false,
        mode: 'preview',
        hasIframe: true,
      })
    ).toBe('undecorate');
  });

  test('incremental edits decorate without full reload', () => {
    expect(
      resolveIframeRenderPlan({
        editType: 'incremental',
        htmlChanged: true,
        iframeRemounted: false,
        mode: 'visual',
        hasIframe: true,
      })
    ).toBe('decorate');
  });

  test('real HTML changes force a full rewrite', () => {
    expect(
      resolveIframeRenderPlan({
        editType: 'full',
        htmlChanged: true,
        iframeRemounted: false,
        mode: 'visual',
        hasIframe: true,
      })
    ).toBe('full');
  });

  test('iframe remount after leaving code mode forces a full rewrite', () => {
    expect(
      resolveIframeRenderPlan({
        editType: 'full',
        htmlChanged: false,
        iframeRemounted: true,
        mode: 'visual',
        hasIframe: true,
      })
    ).toBe('full');
  });

  test('incremental + remount still rewrites (DOM was destroyed)', () => {
    expect(
      resolveIframeRenderPlan({
        editType: 'incremental',
        htmlChanged: true,
        iframeRemounted: true,
        mode: 'visual',
        hasIframe: true,
      })
    ).toBe('full');
  });
});

describe('stripEditorChrome', () => {
  test('removes editor attributes, handlers, and stylesheet', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = `
      <section data-section="hero">
        <h1 data-hc-path="0" data-hc-section="hero" data-hc-selected="true" contenteditable="true">Hi</h1>
      </section>
    `;
    const style = doc.createElement('style');
    style.id = '__hc_editor__';
    doc.head.appendChild(style);
    const h1 = doc.querySelector('h1');
    h1.onclick = () => {};
    h1.ondblclick = () => {};
    doc.body.onclick = () => {};

    stripEditorChrome(doc);

    expect(h1.hasAttribute('data-hc-path')).toBe(false);
    expect(h1.hasAttribute('contenteditable')).toBe(false);
    expect(h1.hasAttribute('data-hc-selected')).toBe(false);
    expect(h1.onclick).toBeNull();
    expect(h1.ondblclick).toBeNull();
    expect(doc.body.onclick).toBeNull();
    expect(doc.getElementById('__hc_editor__')).toBeNull();
    // Source content preserved
    expect(doc.querySelector('[data-section="hero"] h1').textContent).toBe('Hi');
  });
});

describe('normalizeImportedHtml', () => {
  test('injects data-section when missing', () => {
    const html = '<!DOCTYPE html><html><body><div class="hero"><h1>X</h1></div></body></html>';
    const next = normalizeImportedHtml(html);
    expect(next).toContain('data-section=');
    expect(next).toContain('<!DOCTYPE html>');
  });

  test('leaves already-tagged HTML untouched', () => {
    const html = '<html><body><section data-section="a">A</section></body></html>';
    expect(normalizeImportedHtml(html)).toBe(html);
  });
});
