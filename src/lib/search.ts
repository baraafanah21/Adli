/**
 * Product search: Arabic-aware normalising and ranking, run in the browser over the cached catalog (no request per
 * letter). Safe anywhere (no imports). Checked by `npm run check:search`.
 *
 * Normalising: lower case; أ إ آ ٱ → ا, ة → ه, ى → ي; harakat, shadda, sukun, the dagger alif and tatweel dropped;
 * Latin accents dropped (é → e); Arabic-Indic digits → western. Words split on anything that isn't a letter or a
 * digit, and «ال» at the start of a word is ignored (البحر = بحر): a product keeps each word with and without it, so
 * a query still being typed («الس») finds «السبع» too.
 *
 * Matching: every word of the query must appear inside some word of the product (partial: «تروب» finds «تروبيكال»).
 * Ranking: a whole word beats the start of a word, which beats the middle of one; the name counts most, then the
 * family, the category, and the slug last (it often holds the English spelling: hawas, qomra). Ties keep the
 * catalog's order.
 */

const MARKS = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD") // أ → ا + hamza mark, آ → ا + madda mark, é → e + accent: the marks go below
    .replace(MARKS, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ → ا
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي") // ى → ي
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** «ال» at a word's start, only when at least two letters are left after it. */
const stripArticle = (word: string) => (word.startsWith("ال") && word.length >= 4 ? word.slice(2) : word);

const rawWords = (text: string) => normalizeSearch(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** A query's words, without «ال». */
export function searchWords(text: string): string[] {
  return rawWords(text).map(stripArticle);
}

/** A product field's words, each with and without «ال». */
function fieldWords(text: string): string[] {
  return [...new Set(rawWords(text).flatMap((w) => [w, stripArticle(w)]))];
}

/** Field weights, in this order: name, family, category, slug. */
const WEIGHTS = [8, 4, 3, 1];

export type SearchFields = [name: string, family: string | null, category: string | null, slug: string];

export type SearchIndex<T> = { item: T; fields: string[][] }[];

export function buildSearchIndex<T>(items: T[], fieldsOf: (item: T) => SearchFields): SearchIndex<T> {
  return items.map((item) => ({ item, fields: fieldsOf(item).map((f) => (f ? fieldWords(f) : [])) }));
}

/** 3 a whole word, 2 the start of a word, 1 inside one, 0 nowhere. */
function wordScore(query: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    if (w === query) return 3;
    if (w.startsWith(query)) best = 2;
    else if (best < 1 && w.includes(query)) best = 1;
  }
  return best;
}

/** The items matching every word of `query`, best first. An empty query gives every item, in order. */
export function searchIndex<T>(index: SearchIndex<T>, query: string): T[] {
  const words = searchWords(query);
  if (words.length === 0) return index.map((e) => e.item);
  const hits: { item: T; score: number; order: number }[] = [];
  index.forEach((entry, order) => {
    let score = 0;
    for (const q of words) {
      let wordBest = 0;
      entry.fields.forEach((words, i) => {
        wordBest = Math.max(wordBest, wordScore(q, words) * WEIGHTS[i]);
      });
      if (wordBest === 0) return; // one word of the query found nowhere: not a match
      score += wordBest;
    }
    hits.push({ item: entry.item, score, order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).map((h) => h.item);
}

/** The query as it goes in the address (?q=): trimmed, inner spaces collapsed, at most 80 characters. */
export function cleanQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}
