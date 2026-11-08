// Real (selectable / searchable) Hindi, Gujarati etc. text inside PDFs.
// The visible text stays whatever the caller draws (e.g. a picture, which shapes perfectly);
// this adds an invisible Unicode text layer using an embedded Noto font, so copy / search / screen readers work.
const CDN = 'https://cdn.jsdelivr.net/npm/@fontsource/';
const FONTS = [
    { id: 'deva', re: /[\u0900-\u097F]/, pkg: 'noto-sans-devanagari', file: 'noto-sans-devanagari-devanagari-400-normal.woff' },
    { id: 'gujr', re: /[\u0A80-\u0AFF]/, pkg: 'noto-sans-gujarati', file: 'noto-sans-gujarati-gujarati-400-normal.woff' },
    { id: 'guru', re: /[\u0A00-\u0A7F]/, pkg: 'noto-sans-gurmukhi', file: 'noto-sans-gurmukhi-gurmukhi-400-normal.woff' },
    { id: 'beng', re: /[\u0980-\u09FF]/, pkg: 'noto-sans-bengali', file: 'noto-sans-bengali-bengali-400-normal.woff' },
    { id: 'taml', re: /[\u0B80-\u0BFF]/, pkg: 'noto-sans-tamil', file: 'noto-sans-tamil-tamil-400-normal.woff' },
    { id: 'telu', re: /[\u0C00-\u0C7F]/, pkg: 'noto-sans-telugu', file: 'noto-sans-telugu-telugu-400-normal.woff' }
];
const bytesCache = {}; let fontkitP = null;
export const needsUnicode = (s) => FONTS.some(f => f.re.test(s)) || /[^\u0000-\u00FF\u2010-\u2022\u20AC\u2122]/.test(s);
export function splitRuns(text) { // -> [{text, font: FONTS entry | null}]  (null = latin / WinAnsi)
    const runs = []; for (const ch of text) { const f = FONTS.find(x => x.re.test(ch)) || null; const last = runs[runs.length - 1]; if (last && (last.font === f || (!f && /\s/.test(ch)) || (last.font && /\s/.test(ch)))) last.text += ch; else runs.push({ text: ch, font: f }); } return runs;
}
function loadFontkit() {
    if (window.fontkit) return Promise.resolve(window.fontkit);
    return fontkitP || (fontkitP = new Promise((res, rej) => { const urls = ['https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js', 'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js']; const next = () => { const u = urls.shift(); if (!u) { fontkitP = null; return rej(new Error('fontkit')); } const s = document.createElement('script'); s.src = u; s.onload = () => window.fontkit ? res(window.fontkit) : next(); s.onerror = next; document.head.appendChild(s); }; next(); }));
}
async function fontBytes(f) { if (bytesCache[f.id]) return bytesCache[f.id]; const r = await fetch(`${CDN}${f.pkg}/files/${f.file}`); if (!r.ok) throw new Error('font ' + f.id); return bytesCache[f.id] = new Uint8Array(await r.arrayBuffer()); }
async function embedFor(doc, L, f) { doc.__uf = doc.__uf || {}; if (doc.__uf[f.id]) return doc.__uf[f.id]; if (!doc.__fk) { doc.registerFontkit(await loadFontkit()); doc.__fk = true; } return doc.__uf[f.id] = await doc.embedFont(await fontBytes(f), { subset: true }); }

// Draws invisible, selectable text. Returns true if it managed to.
export async function drawInvisibleUnicode(doc, L, page, text, x, y, size, latinFont) {
    try {
        let cx = x; let any = false;
        for (const run of splitRuns(String(text))) {
            let font = latinFont, t = run.text;
            if (run.font) font = await embedFor(doc, L, run.font); else { try { latinFont.encodeText(t); } catch (e) { t = Array.from(t).filter(c => { try { latinFont.encodeText(c); return true; } catch (er) { return false; } }).join(''); } }
            if (!t.trim()) { cx += size * 0.3 * t.length; continue; }
            page.drawText(t, { x: cx, y, size, font, opacity: 0 }); cx += font.widthOfTextAtSize(t, size); any = true;
        }
        return any;
    } catch (e) { return false; /* offline / font blocked: the visible picture is still correct */ }
}
