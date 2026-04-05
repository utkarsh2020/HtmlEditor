/**
 * HTML manipulation utilities
 * Pure functions — no side effects, fully testable
 */

/**
 * Extract all data-section IDs from an HTML string
 */
export function extractSections(html) {
  const sections = [];
  const regex = /data-section="([^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (!sections.includes(m[1])) sections.push(m[1]);
  }
  return sections;
}

/**
 * Get the outer HTML of a section by its data-section id
 * Handles nested tags properly using a stack-based approach
 */
export function getSectionHtml(html, sectionId) {
  // Find the opening tag that contains data-section="sectionId"
  const openRe = new RegExp(
    `<(section|div|article|main|header|footer|aside|nav)([^>]*data-section="${sectionId}"[^>]*)>`,
    'i'
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagName = openMatch[1].toLowerCase();
  const startIdx = openMatch.index;

  // Walk forward to find the matching closing tag (handle nesting)
  let depth = 0;
  let i = startIdx;
  const openTag = new RegExp(`<${tagName}[\\s>]`, 'gi');
  const closeTag = new RegExp(`<\\/${tagName}>`, 'gi');

  openTag.lastIndex = startIdx;
  closeTag.lastIndex = startIdx;

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

/**
 * Replace a section's HTML content in the full document
 */
export function replaceSectionHtml(fullHtml, sectionId, newSectionHtml) {
  const original = getSectionHtml(fullHtml, sectionId);
  if (!original) return fullHtml;
  // Use indexOf for safe replacement (avoids regex special chars in content)
  const idx = fullHtml.indexOf(original);
  if (idx === -1) return fullHtml;
  return fullHtml.slice(0, idx) + newSectionHtml + fullHtml.slice(idx + original.length);
}

/**
 * Insert HTML before </body>
 */
export function appendToBody(fullHtml, htmlToInsert) {
  if (fullHtml.includes('</body>')) {
    return fullHtml.replace('</body>', htmlToInsert + '\n</body>');
  }
  return fullHtml + htmlToInsert;
}

/**
 * Remove a section from HTML by its data-section id
 */
export function removeSectionHtml(fullHtml, sectionId) {
  const section = getSectionHtml(fullHtml, sectionId);
  if (!section) return fullHtml;
  const idx = fullHtml.indexOf(section);
  if (idx === -1) return fullHtml;
  return fullHtml.slice(0, idx) + fullHtml.slice(idx + section.length);
}

/**
 * Move a section up or down relative to its siblings
 */
export function moveSectionHtml(fullHtml, sectionId, direction) {
  const sections = extractSections(fullHtml);
  const idx = sections.indexOf(sectionId);
  if (idx === -1) return fullHtml;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= sections.length) return fullHtml;

  const thisHtml = getSectionHtml(fullHtml, sectionId);
  const targetHtml = getSectionHtml(fullHtml, sections[targetIdx]);
  if (!thisHtml || !targetHtml) return fullHtml;

  if (direction === 'up') {
    // swap: targetHtml comes first currently
    const targetPos = fullHtml.indexOf(targetHtml);
    const thisPos = fullHtml.indexOf(thisHtml);
    if (targetPos > thisPos) return fullHtml; // already above

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

/**
 * Apply a CSS property to a section's root element inline style
 */
export function applyStyleToSection(fullHtml, sectionId, cssProperty, cssValue) {
  const section = getSectionHtml(fullHtml, sectionId);
  if (!section) return fullHtml;

  // Regex: find the first opening tag in this section
  const openTagRe = /^(<[a-zA-Z][^>]*?)(\s*\/?>)/;
  const match = openTagRe.exec(section);
  if (!match) return fullHtml;

  let openTag = match[1];
  const closing = match[2];

  // Extract or create style attribute
  const styleRe = /style="([^"]*)"/i;
  const styleMatch = styleRe.exec(openTag);

  let newOpenTag;
  if (styleMatch) {
    // Parse existing properties and override/add
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

/**
 * Parse inline style string into object
 */
export function parseInlineStyle(styleStr) {
  const result = {};
  if (!styleStr) return result;
  styleStr.split(';').forEach(part => {
    const [key, ...vals] = part.split(':');
    if (key && vals.length) {
      result[key.trim()] = vals.join(':').trim();
    }
  });
  return result;
}

/**
 * Serialize style object back to string
 */
export function serializeInlineStyle(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/**
 * Extract <style> block from HTML document
 */
export function extractStyleBlock(html) {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}

/**
 * Replace or insert a <style> block
 */
export function replaceStyleBlock(html, newCss) {
  if (html.match(/<style[^>]*>/i)) {
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/i, `<style>\n${newCss}\n</style>`);
  }
  return html.replace('</head>', `<style>\n${newCss}\n</style>\n</head>`);
}

/**
 * Sanitize HTML to remove XSS vectors (basic)
 */
export function sanitizeHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=/gi, 'data-removed=');
}

/**
 * Duplicate a section (insert a copy right after the original)
 */
export function duplicateSection(fullHtml, sectionId) {
  const section = getSectionHtml(fullHtml, sectionId);
  if (!section) return fullHtml;

  const newId = sectionId + '-copy-' + Date.now().toString(36);
  const newSection = section.replace(
    `data-section="${sectionId}"`,
    `data-section="${newId}"`
  );

  const idx = fullHtml.indexOf(section);
  return fullHtml.slice(0, idx + section.length) + '\n' + newSection + fullHtml.slice(idx + section.length);
}

/**
 * Extract title from HTML document
 */
export function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : 'Untitled';
}

/**
 * Parse HTML into a document
 */
export function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Serialize a document back to HTML, preserving doctype when present
 */
export function serializeHtmlDocument(doc, originalHtml = '') {
  const hasDoctype = /<!doctype/i.test(originalHtml);
  const prefix = hasDoctype ? '<!DOCTYPE html>\n' : '';
  return prefix + doc.documentElement.outerHTML;
}

/**
 * Resolve a section element from a parsed document
 */
export function getSectionElement(doc, sectionId) {
  if (!doc || !sectionId) return null;
  return doc.querySelector(`[data-section="${sectionId}"]`);
}

/**
 * Build an element path relative to a section root using child element indexes
 */
export function getElementPath(sectionEl, targetEl) {
  if (!sectionEl || !targetEl) return null;
  if (sectionEl === targetEl) return 'root';

  const segments = [];
  let current = targetEl;
  while (current && current !== sectionEl) {
    const parent = current.parentElement;
    if (!parent) return null;
    const index = Array.from(parent.children).indexOf(current);
    if (index === -1) return null;
    segments.unshift(String(index));
    current = parent;
  }

  return current === sectionEl ? segments.join('.') : null;
}

/**
 * Resolve an element by its section-relative path
 */
export function getElementByPath(sectionEl, path) {
  if (!sectionEl || path == null) return null;
  if (path === 'root' || path === '') return sectionEl;

  return path.split('.').reduce((node, segment) => {
    if (!node) return null;
    const next = Number(segment);
    return Number.isNaN(next) ? null : node.children[next] || null;
  }, sectionEl);
}

function isEditableElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  return !['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(el.tagName);
}

function isTextEditableElement(el) {
  return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BUTTON', 'LI', 'SPAN', 'A', 'TD', 'TH', 'LABEL', 'DIV'].includes(el.tagName);
}

/**
 * List editable descendants for a section
 */
export function getEditableElementDescriptors(fullHtml, sectionId) {
  const doc = parseHtmlDocument(fullHtml);
  const sectionEl = getSectionElement(doc, sectionId);
  if (!sectionEl) return [];

  const nodes = [sectionEl, ...sectionEl.querySelectorAll('*')]
    .filter(isEditableElement)
    .map((el) => {
      const path = getElementPath(sectionEl, el);
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const style = el.getAttribute('style') || '';
      return {
        path,
        tag: el.tagName.toLowerCase(),
        text,
        style,
        canEditText: isTextEditableElement(el),
        hasChildren: el.children.length > 0,
      };
    });

  return nodes.filter((node) => node.path !== null);
}

/**
 * Update text content for a selected element
 */
export function updateElementText(fullHtml, sectionId, path, nextText) {
  const doc = parseHtmlDocument(fullHtml);
  const sectionEl = getSectionElement(doc, sectionId);
  const target = getElementByPath(sectionEl, path || 'root');
  if (!target) return fullHtml;
  target.textContent = nextText;
  return serializeHtmlDocument(doc, fullHtml);
}

/**
 * Update inline style for a selected element
 */
export function updateElementStyle(fullHtml, sectionId, path, cssProperty, cssValue) {
  const doc = parseHtmlDocument(fullHtml);
  const sectionEl = getSectionElement(doc, sectionId);
  const target = getElementByPath(sectionEl, path || 'root');
  if (!target) return fullHtml;
  target.style.setProperty(cssProperty, cssValue);
  return serializeHtmlDocument(doc, fullHtml);
}
