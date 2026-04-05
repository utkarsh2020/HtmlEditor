/**
 * AI service - Claude API integration
 */

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Make a request to Claude API
 * @param {Object[]} messages - Array of {role, content}
 * @param {string} systemPrompt
 * @param {number} maxTokens
 * @returns {Promise<string>}
 */
export async function callClaude(messages, systemPrompt, maxTokens = 4096) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

/**
 * Edit a section or full HTML based on user prompt
 */
export async function aiEditHtml(targetHtml, userPrompt, context = {}) {
  const { isFullDocument = false, sectionId = null } = context;

  const system = `You are an expert HTML/CSS/JS frontend developer specializing in beautiful, modern web presentations.
The user will give you HTML and a modification request.

RULES:
1. Return ONLY the modified HTML — no explanation, no markdown code fences, no commentary
2. Preserve ALL data-section attributes exactly as-is
3. Keep all JavaScript logic intact
4. Make the requested changes precisely and completely
5. Use inline styles for all styling (no external CSS dependencies)
6. Ensure the HTML is valid and self-contained
7. For animations, use CSS keyframes or transitions defined in a <style> tag or inline

${isFullDocument ? 'You are modifying a complete HTML document.' : `You are modifying the "${sectionId}" section only.`}`;

  const userMsg = `HTML:\n${targetHtml}\n\nModification request: ${userPrompt}`;

  const result = await callClaude(
    [{ role: 'user', content: userMsg }],
    system,
    4096
  );

  return result.trim();
}

/**
 * Generate a completely new section based on description
 */
export async function aiGenerateSection(description, existingStyle = '') {
  const system = `You are an expert HTML/CSS developer. Generate a self-contained HTML section.

RULES:
1. Return ONLY the HTML — no explanation, no markdown fences
2. Add data-section attribute with a short descriptive id (e.g., data-section="new-features")
3. Use inline styles only
4. Match the style context provided if any
5. Make it visually polished and modern`;

  const userMsg = `Generate an HTML section for: ${description}${existingStyle ? `\n\nStyle context (match this aesthetic):\n${existingStyle}` : ''}`;

  const result = await callClaude(
    [{ role: 'user', content: userMsg }],
    system,
    2048
  );

  return result.trim();
}

/**
 * Generate CSS theme overrides
 */
export async function aiGenerateTheme(description, currentHtml) {
  const system = `You are a CSS expert. Generate CSS to retheme an HTML presentation.
Return ONLY a valid CSS string that can be injected into a <style> tag. No markdown, no explanation.`;

  const userMsg = `Apply this theme to the presentation: ${description}\n\nCurrent HTML sample:\n${currentHtml.slice(0, 2000)}`;

  const result = await callClaude(
    [{ role: 'user', content: userMsg }],
    system,
    1024
  );

  return result.trim();
}

/**
 * Compute a simple text diff between two HTML strings
 * Returns { added, removed, unchanged } line counts
 */
export function computeSimpleDiff(original, modified) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  const origSet = new Set(origLines.map(l => l.trim()).filter(Boolean));
  const modSet = new Set(modLines.map(l => l.trim()).filter(Boolean));

  let added = 0, removed = 0, unchanged = 0;

  modLines.forEach(l => {
    const t = l.trim();
    if (!t) return;
    if (origSet.has(t)) unchanged++;
    else added++;
  });

  origLines.forEach(l => {
    const t = l.trim();
    if (!t) return;
    if (!modSet.has(t)) removed++;
  });

  return { added, removed, unchanged };
}
