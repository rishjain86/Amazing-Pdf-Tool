// Old Hindi fonts (Kruti Dev / DevLys style) store Devanagari as odd Latin-looking codes.
// This converts the common Kruti Dev 010 / DevLys 010 layout to real Unicode so the text can be edited.
const MAP = [
    // vowels
    ['vkS', 'औ'], ['vks', 'ओ'], ['vk', 'आ'], ['v', 'अ'], ['bZ', 'ई'], ['b', 'इ'], ['m', 'उ'], ['Å', 'ऊ'], ['_', 'ऋ'], [',s', 'ऐ'], [',', 'ए'],
    // matras / signs
    ['ks', 'ो'], ['kS', 'ौ'], ['k', 'ा'], ['h', 'ी'], ['q', 'ु'], ['w', 'ू'], ['`', 'ृ'], ['s', 'े'], ['S', 'ै'], ['a', 'ं'], ['¡', 'ँ'], ['%', 'ः'], ['~', '्'], ['ª', '्र'], ['z', '्र'],
    // consonants (multi-char first via length sort)
    ['[k', 'ख'], ['?k', 'घ'], ['.k', 'ण'], ['Fk', 'थ'], ['/k', 'ध'], ['Hk', 'भ'], ["'k", 'श'], ['"k', 'ष'], ['{k', 'क्ष'],
    ['d', 'क'], ['x', 'ग'], ['³', 'ङ'], ['p', 'च'], ['N', 'छ'], ['t', 'ज'], ['>', 'झ'], ['¥', 'ञ'], ['V', 'ट'], ['B', 'ठ'], ['M', 'ड'], ['<', 'ढ'], ['r', 'त'], ['n', 'द'], ['u', 'न'], ['i', 'प'], ['Q', 'फ'], ['c', 'ब'], ['e', 'म'], [';', 'य'], ['j', 'र'], ['y', 'ल'], ['o', 'व'], ['l', 'स'], ['g', 'ह'], ['=', 'त्र'], ['K', 'ज्ञ'], ['J', 'श्र'],
    // half forms
    ['D', 'क्'], ['[', 'ख्'], ['X', 'ग्'], ['?', 'घ्'], ['P', 'च्'], ['T', 'ज्'], ['U', 'न्'], ['I', 'प्'], ['C', 'ब्'], ['H', 'भ्'], ['E', 'म्'], ['Y', 'ल्'], ['O', 'व्'], ['"', 'ष्'], ["'", 'श्'], ['L', 'स्'], ['R', 'त्'], ['F', 'थ्'], ['/', 'ध्'], ['{', 'क्ष्'], ['.', 'ण्'],
    // conjunct glyphs & punctuation
    ['Ø', 'क्र'], ['Ù', 'त्त'], ['Ö', 'ट्'], ['µ', 'फ'], ['¼', '('], ['½', ')'], ['A', '।'], ['&', '-'], ['\u2013', '-']
];
const SORTED = MAP.slice().sort((a, b) => b[0].length - a[0].length);
const REPH = '\uE001', IMATRA = '\uE000';
const LATIN_FONTS = /arial|helvet|times|courier|calibri|cambria|verdana|tahoma|georgia|segoe|roboto|open ?sans|noto|mangal|arial unicode|nirmala|lohit|devanagari/i;
const LEGACY_FONTS = /kruti|krut|devlys|dev-?lys|chanakya|walkman|shusha|shree|sulekh|agra|kiran|hindi-?\d|aps-?|ism|akruti|ravi|dvb|dvw|surekh|kritidev/i;
export const isLegacyFontName = (n) => !!n && LEGACY_FONTS.test(n) && !/mangal|nirmala|noto|lohit/i.test(n);
export function looksLegacy(str) {
    if (!str || LATIN_FONTS.test('')) return false;
    const strong = (str.match(/[ØµÅªÙ¡¼½]/g) || []).length; const weak = (str.match(/~|\{[A-Za-z]|\[k|\/k|\?k|;k|\.k|Zk|fk|dk/g) || []).length;
    return strong >= 1 || weak >= 2;
}
export function legacyToUnicode(text) {
    let out = ''; const src = String(text);
    for (let i = 0; i < src.length;) {
        let hit = null;
        if (src[i] === 'f' && !/\s/.test(src[i + 1] || ' ')) { out += IMATRA; i++; continue; } // i-matra is typed before the consonant
        if (src[i] === 'Z') { out += REPH; i++; continue; }
        for (const [k, v] of SORTED) if (src.startsWith(k, i)) { hit = [k, v]; break; }
        if (hit) { out += hit[1]; i += hit[0].length; } else { out += src[i]; i++; }
    }
    const C = '[\u0915-\u0939]\u093C?', cluster = `(?:${C}\u094D)*${C}`;
    out = out.replace(new RegExp(`${IMATRA}(${cluster})`, 'g'), '$1\u093F');
    out = out.replace(new RegExp(`(${cluster}[\u093E-\u094C\u0902\u0903\u0901]*)${REPH}`, 'g'), '\u0930\u094D$1');
    return out.replace(/[\uE000\uE001]/g, '').replace(/\u093E\u0947/g, '\u094B').replace(/\u093E\u0948/g, '\u094C');
}

const EN = new Set('the and of to in is are was for with on at by from this that these those it as be or an a not no yes line here page text name date total paper exam question answer marks time hours part section note notes all any each one two three four five six seven eight nine ten first second third normal english hello world sample paragraph invoice number subject class student school total amount price qty item address phone email'.split(' '));
export const looksEnglish = (str) => { const t = String(str).toLowerCase().match(/[a-z]+/g) || []; return t.length > 0 && t.some(w => EN.has(w)); };
