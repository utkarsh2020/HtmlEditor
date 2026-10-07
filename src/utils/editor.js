/**
 * Direct iframe DOM manipulation engine.
 *
 * Instead of serializing HTML → writing to iframe on every edit, this module
 * mutates the live iframe DOM directly (zero flicker, animations preserved)
 * and only serializes back to a string when we need to commit to history.
 *
 * Also handles:
 *  - Auto-normalization of imported HTML (injecting data-section attributes)
 *  - Reading computed/inline styles from live elements (for the style panel)
 *  - Clean serialization that strips editor metadata
 *  - Deciding when the iframe must be rewritten vs. merely re-decorated
 */

export const EDITOR_ATTRS = [
  'data-hc-path',
  'data-hc-section',
  'data-hc-label',
  'data-hc-section-active',
  'data-hc-selected',
  'contenteditable',
];

/**
 * Decide how the canvas iframe should update for this React effect cycle.
 *
 * Selection / path / mode-only updates must NOT rewrite the iframe — that was
 * wiping contenteditable mid-edit and making Visual mode feel inconsistent.
 *
 * @returns {'full' | 'decorate' | 'undecorate' | 'skip'}
 */
export function resolveIframeRenderPlan({
  editType,
  htmlChanged,
  iframeRemounted,
  mode,
  hasIframe,
}) {
  if (!hasIframe) return 'skip';

  // Live DOM already has the latest content (style/text apply, inline commit).
  if (editType === 'incremental' && !iframeRemounted) {
    return mode === 'visual' ? 'decorate' : 'undecorate';
  }

  // Real HTML change, or iframe was remounted (e.g. leaving Code mode).
  if (htmlChanged || iframeRemounted) return 'full';

  // Same document instance + same HTML: selection or mode chrome only.
  return mode === 'visual' ? 'decorate' : 'undecorate';
}

/**
 * Remove editor-injected attributes, handlers, and the editor stylesheet
 * from a live (or cloned) document without rewriting its HTML content.
 */
export function stripEditorChrome(doc) {
  if (!doc) return;

  doc.querySelectorAll('[data-hc-path], [contenteditable]').forEach((el) => {
    EDITOR_ATTRS.forEach((attr) => el.removeAttribute(attr));
    el.onclick = null;
    el.ondblclick = null;
    el.onblur = null;
    el.onkeydown = null;
  });

  const editorStyle = doc.getElementById('__hc_editor__');
  if (editorStyle) editorStyle.remove();

  if (doc.body) doc.body.onclick = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDoc(iframeRef) {
  const iframe = iframeRef && 'current' in iframeRef ? iframeRef.current : iframeRef;
  return iframe?.contentDocument || iframe?.contentWindow?.document || null;
}

function resolveEl(iframeRef, sectionId, path) {
  const doc = getDoc(iframeRef);
  if (!doc) return null;

  // Safe attribute-value lookup that tolerates special chars in sectionId
  const sectionEl = Array.from(doc.querySelectorAll('[data-section]')).find(
    (el) => el.getAttribute('data-section') === sectionId
  );
  if (!sectionEl) return null;

  if (!path || path === 'root') return sectionEl;

  return path.split('.').reduce((node, seg) => {
    if (!node) return null;
    const i = Number(seg);
    return Number.isNaN(i) ? null : node.children[i] ?? null;
  }, sectionEl);
}

// ---------------------------------------------------------------------------
// HTML Normalization
// ---------------------------------------------------------------------------

/**
 * Auto-inject data-section attributes into imported HTML that has none.
 * Leaves HTML that already contains data-section attributes untouched.
 */
export function normalizeImportedHtml(html) {
  if (/data-section\s*=/.test(html)) return html; // already tagged

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  const visible = Array.from(body.children).filter(
    (el) => !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(el.tagName)
  );

  if (visible.length === 0) {
    // Everything is either empty or non-element — wrap in one section
    const s = doc.createElement('section');
    s.setAttribute('data-section', 'main');
    s.setAttribute('style', 'min-height:100vh');
    while (body.firstChild) s.appendChild(body.firstChild);
    body.appendChild(s);
  } else {
    visible.forEach((el, i) => {
      const raw =
        el.id ||
        (typeof el.className === 'string' && el.className.trim().split(/\s+/)[0]) ||
        `${el.tagName.toLowerCase()}-${i + 1}`;
      const id = raw
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || `section-${i + 1}`;
      el.setAttribute('data-section', id);
    });
  }

  const hasDoctype = /<!doctype\s+html/i.test(html);
  return (hasDoctype ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
}

// ---------------------------------------------------------------------------
// Direct style / text mutation
// ---------------------------------------------------------------------------

/**
 * Apply a single CSS property directly to a live iframe element.
 * Returns true if the element was found and mutated.
 */
export function applyStyleDirect(iframeRef, sectionId, path, prop, value) {
  const el = resolveEl(iframeRef, sectionId, path);
  if (!el) return false;
  try {
    el.style.setProperty(prop, value);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Apply several CSS properties at once.
 */
export function applyStylesBatch(iframeRef, sectionId, path, styles) {
  const el = resolveEl(iframeRef, sectionId, path);
  if (!el) return false;
  Object.entries(styles).forEach(([prop, value]) => {
    try { el.style.setProperty(prop, value); } catch (_) {}
  });
  return true;
}

/**
 * Remove an inline CSS property from a live iframe element.
 */
export function removeStyleDirect(iframeRef, sectionId, path, prop) {
  const el = resolveEl(iframeRef, sectionId, path);
  if (!el) return false;
  try {
    el.style.removeProperty(prop);
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Computed style reading
// ---------------------------------------------------------------------------

/**
 * Read all relevant computed + inline styles from a live iframe element.
 * Returns an object with camelCase keys. The style panel uses these values
 * to populate its inputs with the element's actual current appearance.
 */
export function getElementComputedProps(iframeRef, sectionId, path) {
  const el = resolveEl(iframeRef, sectionId, path);
  if (!el) return {};

  const doc = getDoc(iframeRef);
  if (!doc?.defaultView) return {};

  const comp = doc.defaultView.getComputedStyle(el);
  const s = el.style;

  // Prefer inline style over computed (inline = intentional, computed = inherited/cascaded)
  const get = (hyphenProp) => s.getPropertyValue(hyphenProp) || comp.getPropertyValue(hyphenProp) || '';

  return {
    // Colors
    color: get('color'),
    backgroundColor: get('background-color'),
    background: s.background || '',

    // Typography
    fontSize: get('font-size'),
    fontWeight: get('font-weight'),
    fontFamily: get('font-family'),
    lineHeight: get('line-height'),
    letterSpacing: get('letter-spacing'),
    textAlign: get('text-align'),
    textTransform: get('text-transform'),
    textDecoration: get('text-decoration'),

    // Box model
    padding: s.padding || '',
    paddingTop: get('padding-top'),
    paddingRight: get('padding-right'),
    paddingBottom: get('padding-bottom'),
    paddingLeft: get('padding-left'),
    margin: s.margin || '',
    marginTop: get('margin-top'),
    marginRight: get('margin-right'),
    marginBottom: get('margin-bottom'),
    marginLeft: get('margin-left'),

    // Borders
    borderRadius: get('border-radius'),
    border: s.border || '',
    borderWidth: get('border-width'),
    borderColor: get('border-color'),
    borderStyle: get('border-style'),

    // Sizing
    width: s.width || '',
    height: s.height || '',
    minHeight: get('min-height'),
    maxWidth: get('max-width'),

    // Decorations
    opacity: get('opacity') || '1',
    boxShadow: get('box-shadow'),

    // Layout
    display: get('display'),
    flexDirection: get('flex-direction'),
    alignItems: get('align-items'),
    justifyContent: get('justify-content'),
    gap: get('gap'),

    // Positioning
    position: get('position'),
    zIndex: get('z-index'),

    // Misc
    transform: get('transform'),
    overflow: get('overflow'),
    cursor: get('cursor'),

    // Meta (not CSS, but useful in the panel)
    inlineStyle: el.getAttribute('style') || '',
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    className: typeof el.className === 'string' ? el.className : '',
    textContent: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    hasChildren: el.children.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Editable element descriptors from live DOM
// ---------------------------------------------------------------------------

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'HEAD']);
const TEXT_EDITABLE_TAGS = new Set([
  'H1','H2','H3','H4','H5','H6',
  'P','BUTTON','LI','SPAN','A','TD','TH','LABEL',
  'DIV','STRONG','EM','SMALL','B','I',
  'FIGCAPTION','BLOCKQUOTE','PRE','CODE',
  'DT','DD','CITE','MARK','CAPTION','SUMMARY','LEGEND',
]);

/**
 * Build the editable-element descriptor list from the live iframe DOM.
 * This is the source of truth — replaces the old approach of parsing the
 * HTML string with DOMParser on every render.
 */
export function getEditableDescriptors(iframeRef, sectionId) {
  const doc = getDoc(iframeRef);
  if (!doc) return [];

  const sectionEl = Array.from(doc.querySelectorAll('[data-section]')).find(
    (el) => el.getAttribute('data-section') === sectionId
  );
  if (!sectionEl) return [];

  const computePath = (el) => {
    if (el === sectionEl) return 'root';
    const segs = [];
    let cur = el;
    while (cur && cur !== sectionEl) {
      const parent = cur.parentElement;
      if (!parent) return null;
      segs.unshift(Array.from(parent.children).indexOf(cur));
      cur = parent;
    }
    return cur === sectionEl ? segs.join('.') : null;
  };

  return [sectionEl, ...sectionEl.querySelectorAll('*')]
    .filter((el) => !SKIP_TAGS.has(el.tagName))
    .map((el) => {
      const path = computePath(el);
      if (path === null) return null;
      return {
        path,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        style: el.getAttribute('style') || '',
        canEditText: TEXT_EDITABLE_TAGS.has(el.tagName),
        hasChildren: el.children.length > 0,
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Clean serialization
// ---------------------------------------------------------------------------

/**
 * Serialize the live iframe DOM to a clean HTML string, removing all
 * editor-injected attributes and style tags before export.
 */
export function serializeFromIframe(iframeRef, originalHtml = '') {
  const doc = getDoc(iframeRef);
  if (!doc) return originalHtml;

  try {
    const clone = doc.cloneNode(true);

    // Strip editor marker attributes / chrome before export
    stripEditorChrome(clone);

    const hasDoctype = /<!doctype\s+html/i.test(originalHtml);
    return (hasDoctype ? '<!DOCTYPE html>\n' : '') + clone.documentElement.outerHTML;
  } catch (_) {
    return originalHtml;
  }
}

// ---------------------------------------------------------------------------
// Color / unit utilities for the style panel
// ---------------------------------------------------------------------------

/**
 * Convert any CSS color value to a 6-digit hex string for <input type="color">.
 * Falls back to #000000 for gradients, vars, and unparseable values.
 */
export function rgbToHex(rgb) {
  if (!rgb || rgb === 'transparent' || rgb === 'none') return '#000000';
  if (rgb.includes('gradient') || rgb.includes('var(')) return '#000000';
  if (rgb.startsWith('#')) {
    if (rgb.length === 4) {
      // Expand #abc → #aabbcc
      return '#' + [rgb[1], rgb[2], rgb[3]].map((c) => c + c).join('');
    }
    return rgb.slice(0, 7);
  }
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0, 3).map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
}

/**
 * Extract the numeric pixel value from a CSS dimension string.
 * extractPx('16px') → 16, extractPx('1.5rem', 24) → 1.5 (raw number).
 */
export function extractPx(val, fallback = 0) {
  if (!val) return fallback;
  const m = String(val).match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : fallback;
}

/**
 * Check if a CSS string value is parseable as a color (not a gradient/var).
 */
export function isPlainColor(val) {
  if (!val) return false;
  return !val.includes('gradient') && !val.includes('var(') && val !== 'transparent' && val !== 'none';
}
