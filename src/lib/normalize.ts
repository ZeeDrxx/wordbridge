/**
 * Search keys for Darija.
 *
 * Darija has no standard spelling. The same word shows up as "bezzaf", "bzzaf", "bzaf" or
 * "bezaf" in Latin script ("Arabizi", with digits for Arabic sounds: 3 = ع, 7 = ح, 9 = ق),
 * and as "بزاف" or "بزّاف" in Arabic script. Spellings are matched on a normalised key, so all
 * of those meet in one place, and a trigram index catches what normalisation misses.
 */

const ARABIC_CHARS = /[؀-ۿ]/;
const ARABIC_MARKS = /[ً-ٰٟۖ-ۭـ]/g; // harakat, shadda, tatweel…

export function isArabicScript(text: string): boolean {
  return ARABIC_CHARS.test(text);
}

/** Arabic script: drop vowel marks and tatweel, fold the letter variants people use interchangeably. */
export function arabicKey(text: string): string {
  return text
    .normalize("NFC")
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ڭ/g, "ك")
    .replace(/[^ء-ي]/g, "");
}

/** Latin script (Arabizi): one key for bezzaf / bzzaf / bzaf, ch7al / shhal / chhal, kifach / kifash. */
export function latinKey(text: string): string {
  let s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .toLowerCase();
  s = s
    .replace(/3/g, "a") // ع
    .replace(/7/g, "h") // ح
    .replace(/9/g, "q") // ق
    .replace(/5/g, "kh") // خ
    .replace(/2/g, "") // ء
    .replace(/[^a-z]/g, "")
    .replace(/sh/g, "ch") // English and French habits for ش
    .replace(/ou/g, "u") // French "ou"
    .replace(/oo/g, "u")
    .replace(/o/g, "u")
    .replace(/ee/g, "i")
    .replace(/dj/g, "j")
    .replace(/e/g, ""); // e is a written schwa: bezzaf ≈ bzzaf
  return s.replace(/(.)\1+/g, "$1"); // bzzaf → bzaf
}

export function searchKey(text: string): string {
  return isArabicScript(text) ? arabicKey(text) : latinKey(text);
}

/** URL slug from a Latin headword: "3afak" → "3afak", "Lbare7" → "lbare7", "l-ma" → "l-ma". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
