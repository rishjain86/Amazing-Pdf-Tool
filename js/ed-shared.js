// Shared state + pure helpers for the PDF editor (editor.js / editor-save.js / signature.js)
export const S = {
    ctx: null, mode: 'edit', file: null, name: '', bytes: null, pdf: null,
    pages: [],            // {id, src, w, h, rot, native, deleted, blank, el, cv, tl, ol, svg, token}
    objs: {},             // pageId -> [obj]
    images: {},           // imgId -> dataUrl
    scale: 1.2, tool: 'text', sel: null, undo: [], redo: [], nextId: 1, curPage: 0,
    dirty: false, format: '1',
    d: { size: 18, color: '#000000', font: 'sans', bold: false, italic: false, underline: false,
         opacity: 1, strokeW: 3, strokeC: '#ef4444', hlC: '#fde047', rot: 0 }
};

export const uid = () => 'o' + (S.nextId++);
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const CSSFONT = {
    sans: 'Arial, Helvetica, "Liberation Sans", sans-serif',
    serif: '"Times New Roman", Times, "Liberation Serif", serif',
    mono: '"Courier New", Courier, "Liberation Mono", monospace'
};
// distance from CSS line-box top (line-height 1.2) to the baseline, in em
export const BASELINE = { sans: 0.946, serif: 0.9375, mono: 0.8665 };
export const LH = 1.2;

export function detectFont(name = '') {
    const n = String(name).toLowerCase().replace(/^[a-z]{6}\+/, '');
    const bold = /bold|black|heavy|semibold|demi|extrabold/.test(n);
    const italic = /italic|oblique|ital\b|-it\b/.test(n);
    let family = 'sans';
    if (/courier|mono|consol|menlo|typewriter|lucida console/.test(n)) family = 'mono';
    else if (/times|georgia|garamond|cambria|palatino|minion|book|roman|serif(?!.*sans)|baskerville|bodoni|century/.test(n) && !/sans/.test(n)) family = 'serif';
    return { family, bold, italic };
}

// displayed (top-left, y down, pt) -> PDF user space. r = total rotation, W0/H0 = unrotated cropbox size
export function toUser(r, W0, H0, cx, cy, dx, dy) {
    r = ((r % 360) + 360) % 360;
    let ux, uy;
    if (r === 0) { ux = dx; uy = H0 - dy; }
    else if (r === 90) { ux = dy; uy = dx; }
    else if (r === 180) { ux = W0 - dx; uy = dy; }
    else { ux = W0 - dy; uy = H0 - dx; }
    return [ux + cx, uy + cy];
}

// rotate an object's displayed coordinates 90deg clockwise (Hd = displayed height before the rotation)
export function rotateObj90(o, Hd) {
    const pt = (x, y) => [Hd - y, x];
    if (o.points) o.points = o.points.map(p => { const [a, b] = pt(p.x, p.y); return { x: a, y: b }; });
    else if ('x2' in o) { let [a, b] = pt(o.x, o.y); let [c, d] = pt(o.x2, o.y2); o.x = a; o.y = b; o.x2 = c; o.y2 = d; }
    else if ('w' in o) { const nx = Hd - (o.y + o.h), ny = o.x, nw = o.h, nh = o.w; o.x = nx; o.y = ny; o.w = nw; o.h = nh; }
    else { const [a, b] = pt(o.x, o.y); o.x = a; o.y = b; }
}

// ---- pixel sampling helpers (colour of original text / background) ----
export function sampleBg(cv, x, y, w, h) {
    try {
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const px = (sx, sy) => ctx.getImageData(Math.max(0, Math.min(cv.width - 1, Math.round(sx))), Math.max(0, Math.min(cv.height - 1, Math.round(sy))), 1, 1).data;
        const pts = [[x - 2, y - 2], [x + w + 2, y - 2], [x - 2, y + h + 2], [x + w + 2, y + h + 2], [x - 2, y + h / 2], [x + w + 2, y + h / 2]];
        const cols = pts.map(p => px(p[0], p[1]));
        const buckets = {};
        cols.forEach(c => { const k = [c[0] >> 4, c[1] >> 4, c[2] >> 4].join(','); (buckets[k] = buckets[k] || []).push(c); });
        const best = Object.values(buckets).sort((a, b) => b.length - a.length)[0];
        return rgbHex(best[0]);
    } catch (e) { return '#ffffff'; }
}
export function sampleFg(cv, x, y, w, h, bgHex) {
    try {
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
        w = Math.max(1, Math.min(cv.width - x, Math.ceil(w))); h = Math.max(1, Math.min(cv.height - y, Math.ceil(h)));
        const d = ctx.getImageData(x, y, w, h).data;
        const bg = hexRgb(bgHex); let best = null, bestDist = 90;
        for (let i = 0; i < d.length; i += 4) {
            const dist = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
            if (dist > bestDist) { bestDist = dist; best = [d[i], d[i + 1], d[i + 2]]; }
        }
        return best ? rgbHex(best) : '#000000';
    } catch (e) { return '#000000'; }
}
export const rgbHex = (c) => '#' + [c[0], c[1], c[2]].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export const hexRgb = (h) => { h = (h || '#000000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };

// ---- merge pdf.js text fragments into editable line blocks (page space, pt, displayed orientation) ----
export function buildBlocks(items, styles, vp, fontInfo) {
    const raw = [];
    for (const it of items) {
        if (!it.str || !it.str.trim()) continue; // whitespace-only fragments only matter as gaps
        const t = it.transform; // [a,b,c,d,e,f] in user space
        const m = vp.transform;
        const a = m[0] * t[0] + m[2] * t[1], b = m[1] * t[0] + m[3] * t[1];
        const c = m[0] * t[2] + m[2] * t[3], d = m[1] * t[2] + m[3] * t[3];
        const e = m[0] * t[4] + m[2] * t[5] + m[4], f = m[1] * t[4] + m[3] * t[5] + m[5];
        const size = Math.hypot(c, d);
        const ang = Math.atan2(b, a) * 180 / Math.PI;
        if (Math.abs(ang) > 1 || size < 2) continue;      // only upright text is editable
        const w = it.width * vp.scale;
        const fi = fontInfo(it.fontName);
        raw.push({ str: it.str, x: e, base: f, size, w, ...fi, hasEOL: it.hasEOL });
    }
    raw.sort((p, q) => (Math.abs(p.base - q.base) < Math.min(p.size, q.size) * 0.3) ? p.x - q.x : p.base - q.base);
    const blocks = [];
    for (const r of raw) {
        const last = blocks[blocks.length - 1];
        if (last && Math.abs(last.base - r.base) < Math.min(last.size, r.size) * 0.3 &&
            r.x - (last.x + last.w) < last.size * 0.45 && r.x - (last.x + last.w) > -last.size * 0.5 &&
            Math.abs(last.size - r.size) < 0.6 && last.family === r.family && last.bold === r.bold && last.italic === r.italic) {
            const gap = r.x - (last.x + last.w);
            const needSpace = gap > last.size * 0.12 && !/\s$/.test(last.str) && !/^\s/.test(r.str);
            last.str += (needSpace ? ' ' : '') + r.str;
            last.w = (r.x + r.w) - last.x;
        } else blocks.push({ ...r });
    }
    return blocks.filter(b => b.str.trim().length);
}
