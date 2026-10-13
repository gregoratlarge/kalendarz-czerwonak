// Text helpers for matching and pretty-printing Polish names.

/** Remove Polish diacritics, uppercase, collapse whitespace and trailing dots. */
export function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/[żź]/g, 'z')
    .replace(/[.,/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact matching key for a (city, street) pair. */
export function matchKey(...parts: string[]): string {
  return parts.map(norm).join('|');
}

const ROMAN = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XX']);
const LOWERCASE_WORDS = new Set(['w', 'i', 'na', 'z', 'do', 'od', 'oraz', 'im', 'nr', 'ul', 'os', 'przy', 'nad', 'pod']);

/** Capitalise a single (possibly hyphenated) token. */
function capitalizeToken(token: string): string {
  return token
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join('-');
}

/**
 * Convert an ALL-CAPS source street name to readable Polish Title Case.
 * Handles roman numerals (JANA III SOBIESKIEGO), abbreviations (KS., ŚW.) and
 * short prepositions (w, i, na...).
 */
export function titleCaseStreet(raw: string): string {
  const words = raw.trim().replace(/\s+/g, ' ').split(' ');
  return words
    .map((word, i) => {
      if (/^[IVXL]+$/.test(word) && ROMAN.has(word)) return word; // roman numeral
      const bare = word.replace(/\.$/, '');
      if (LOWERCASE_WORDS.has(bare.toLowerCase()) && i !== 0) return bare.toLowerCase();
      const cased = capitalizeToken(word);
      return cased;
    })
    .join(' ');
}

/** Title-case a locality name (e.g. "BOLECHOWO OSIEDLE" -> handled by LOCALITIES). */
export function titleCaseCity(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => capitalizeToken(w))
    .join(' ');
}
