// search: rank notes against a query with TF-IDF, plus phrase queries,
// exclusion (-term) and prefix wildcards (term*). Returns ranked hits with a
// context snippet around the first match.

import { tokenize } from './indexer.js';

/** Parse a query into { phrases: string[][], terms: {term, exclude, prefix}[] } */
export function parseQuery(query) {
  const phrases = [];
  const withoutPhrases = query.replace(/"([^"]+)"/g, (_, inner) => {
    const tokens = tokenize(inner);
    if (tokens.length) phrases.push(tokens);
    return ' ';
  });
  const terms = withoutPhrases
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const exclude = raw.startsWith('-');
      const word = exclude ? raw.slice(1) : raw;
      const prefix = word.endsWith('*');
      const term = word.slice(0, prefix ? -1 : undefined).toLowerCase();
      return { term, exclude, prefix };
    })
    .filter((t) => t.term.length >= 2);
  return { phrases, terms };
}

function phrasePositions(index, tokens, docId) {
  const first = index.positions(tokens[0], docId);
  if (!first) return null;
  for (const start of first) {
    let ok = true;
    for (let i = 1; i < tokens.length; i++) {
      const rest = index.positions(tokens[i], docId);
      if (!rest || !rest.includes(start + i)) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return null;
}

function tfIdf(index, term, docId) {
  const positions = index.positions(term, docId);
  if (!positions) return 0;
  const tf = 1 + Math.log(positions.length);
  return tf * index.idf(term);
}

/** A ~120-char window around the first match, with matched terms in **bold**. */
export function snippetFor(note, matchedTerms) {
  const text = note.text.replace(/\s+/g, ' ');
  const lowered = text.toLowerCase();
  let at = -1;
  for (const term of matchedTerms) {
    const i = lowered.indexOf(term);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, 120);
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + 80);
  let snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  for (const term of matchedTerms) {
    snippet = snippet.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '**$1**');
  }
  return snippet;
}

export function search(index, notesById, query) {
  const { phrases, terms } = parseQuery(query);
  if (!phrases.length && !terms.length) return [];

  const required = terms.filter((t) => !t.exclude);
  const excluded = terms.filter((t) => t.exclude);
  const results = [];

  for (const [docId, note] of notesById) {
    if (!index.docs.has(docId)) continue;
    let score = 0;
    const matched = new Set();
    let ok = true;

    // Phrases: every phrase must appear verbatim.
    for (const phraseTokens of phrases) {
      const pos = phrasePositions(index, phraseTokens, docId);
      if (pos === null) {
        ok = false;
        break;
      }
      score += 3 * phraseTokens.reduce((s, t) => s + index.idf(t), 0);
      phraseTokens.forEach((t) => matched.add(t));
    }
    if (!ok) continue;

    // Terms: AND semantics; excluded terms veto the doc.
    for (const { term, exclude, prefix } of [...required, ...excluded]) {
      const variants = prefix ? [term, ...index.expandPrefix(term)] : [term];
      const present = variants.filter((v) => index.positions(v, docId));
      if (exclude) {
        if (present.length) {
          ok = false;
          break;
        }
        continue;
      }
      if (!present.length) {
        ok = false;
        break;
      }
      for (const v of present) {
        score += tfIdf(index, v, docId);
        matched.add(v);
      }
    }
    if (!ok) continue;

    // Shorter docs rank slightly higher for the same term frequency.
    const lengthNorm = 1 / (1 + Math.log(1 + (index.docs.get(docId)?.length ?? 1)));
    results.push({ note, score: score * lengthNorm, snippet: snippetFor(note, matched) });
  }

  return results.sort((a, b) => b.score - a.score);
}
