// src/skills/intent.js — fast regex-based intent classification

const PATTERNS = [
  { type: "plan",     re: /^(good morning|day plan|the briefing|run me through.*day|what.*day look)/i, conf: 0.95 },
  { type: "screen",   re: /(my screen|looking at|what.*on screen|this error|read this for me)/i,        conf: 0.95 },
  { type: "calendar", re: /(my schedule|on my calendar|what.*meetings|next meeting|calendar)/i,         conf: 0.95 },
  { type: "task",     re: /^(remind me to|add (a )?task|put.*on my list|don.?t let me forget)/i,        conf: 0.95, entity: "taskText" },
  { type: "memory",   re: /^remember (that )?(i\b|my\b|to use)/i,                                       conf: 0.90, entity: "factText" },
  { type: "email",    re: /(unread.*email|messages|inbox|gmail|new mail)/i,                             conf: 0.90 },
  { type: "note",     re: /^(note this|save (a )?note|jot down|write this down)/i,                      conf: 0.90, entity: "noteContent" },
  { type: "build",    re: /^(build|create|make me) (a |an )?.*(app|script|tool|website|component|page|cli)/i, conf: 0.85, entity: "requestText" },
  { type: "task",     re: /(my tasks|todo list|what.*to do|what.*on my plate)/i,                        conf: 0.85 },
  { type: "memory",   re: /(what.*my (favorite|preferred)|do i prefer|what did i tell you)/i,           conf: 0.80 },
  { type: "search",   re: /^(search|google|look up|what.?s the latest)/i,                               conf: 0.80, entity: "query" },
  { type: "note",     re: /(my notes|notes about|did i write)/i,                                        conf: 0.80 },
];

/**
 * @param {string} text
 * @returns {{type: string, confidence: number, entities: object}|null}
 */
export function detectIntent(text) {
  if (!text || !text.trim()) return null;
  const lower = text.trim();

  let best = null;
  for (const p of PATTERNS) {
    if (p.re.test(lower)) {
      if (!best || p.conf > best.confidence) {
        const entities = {};
        if (p.entity) {
          // Extract everything after the trigger phrase
          const match = lower.match(p.re);
          if (match) {
            const tail = lower.slice(match.index + match[0].length).trim();
            entities[p.entity] = tail || lower;
          }
        }
        best = { type: p.type, confidence: p.conf, entities };
      }
    }
  }

  if (best && best.confidence >= 0.5) return best;
  return null;
}
