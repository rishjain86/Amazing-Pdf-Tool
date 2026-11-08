// Extra tools: exact-size compress, photo/signature resizer, header/footer/Bates, bookmarks, extract images,
// compare, ID card, scan enhance (+ shared helpers). create.js adds invoice / resume / PowerPoint.
import { TOOLS2 } from './registry.js';
import { mountAppLockUI } from './applock.js';
import { extractPage, pageImages } from './convert.js';
import { drawInvisibleUnicode } from './unifont.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inp = 'width:100%;padding:12px;border-radius:8px;border:1px solid var(--glass-border);background:rgba(0,0,0,.3);color:white;margin-bottom:12px;font-family:inherit';
export const lbl = 'color:var(--text-secondary);font-size:.85rem;display:block;margin-bottom:5px';
const btnS = 'background:linear-gradient(90deg,#10b981,#3b82f6);color:#fff;border:none;padding:14px 22px;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;width:100%;margin-top:6px';
const u8 = (url) => Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));
const isPdf = (f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
const isImg = (f) => f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
const base = (n) => n.replace(/\.[^.]+$/, '');
export const loadImg = (file) => new Promise((res, rej) => { const url = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(url); res(i); }; i.onerror = () => rej(new Error('Could not read image ' + file.name)); i.src = url; });
const toBlob = (cv, q) => new Promise(r => cv.toBlob(r, 'image/jpeg', q));
const whiteCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return c; };

// ---------- text drawing that also works for Hindi etc. (falls back to a rendered image)
export function textDrawer(doc, L, fonts) {
    return async function draw(page, text, o) {
        const { x, y, size = 10, bold = false, color = [0, 0, 0], align = 'left' } = o; const font = bold ? fonts.bold : fonts.reg; text = String(text);
        let ok = true; try { font.encodeText(text); } catch (e) { ok = false; }
        if (ok) { const w = font.widthOfTextAtSize(text, size); const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; if (text) page.drawText(text, { x: px, y, size, font, color: L.rgb(...color) }); return w; }
        const k = 4, c = document.createElement('canvas'), g = c.getContext('2d'); const f = `${bold ? 'bold ' : ''}${size * k}px Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif`; g.font = f; const w = g.measureText(text).width / k;
        c.width = Math.ceil(w * k) + 8; c.height = Math.ceil(size * 1.5 * k); g.font = f; g.fillStyle = `rgb(${color.map(v => Math.round(v * 255)).join(',')})`; g.fillText(text, 4, size * 1.1 * k);
        const img = await doc.embedPng(c.toDataURL('image/png')); const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        page.drawImage(img, { x: px - 1, y: y - size * 0.3, width: c.width / k, height: c.height / k }); await drawInvisibleUnicode(doc, L, page, text, px, y, size, fonts.reg); return w;
    };
}
export async function stdFonts(doc, L) { return { reg: await doc.embedFont(L.StandardFonts.Helvetica), bold: await doc.embedFont(L.StandardFonts.HelveticaBold) }; }

// ---------- image filters
export function applyFilter(cv, mode) {
    if (!mode || mode === 'original') return cv; const g = cv.getContext('2d', { willReadFrequently: true }); const { width: w, height: h } = cv; const id = g.getImageData(0, 0, w, h), d = id.data;
    if (mode === 'gray' || mode === 'bw') {
        const gray = new Uint8Array(w * h); for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        if (mode === 'gray') { // stretch levels
            const hist = new Uint32Array(256); gray.forEach(v => hist[v]++); let lo = 0, hi = 255, acc = 0; const tot = w * h; for (; lo < 255; lo++) { acc += hist[lo]; if (acc > tot * 0.01) break; } acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > tot * 0.01) break; }
            const sc = 255 / Math.max(1, hi - lo); for (let i = 0, p = 0; i < d.length; i += 4, p++) { const v = Math.max(0, Math.min(255, (gray[p] - lo) * sc)); d[i] = d[i + 1] = d[i + 2] = v; }
        } else { // adaptive threshold (integral image)
            const I = new Float64Array((w + 1) * (h + 1)); for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
            const r = Math.max(8, Math.round(Math.min(w, h) / 24)); for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1); for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]; const mean = s / ((x1 - x0) * (y1 - y0)); const v = gray[y * w + x] < mean * 0.9 ? 0 : 255; const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; } }
        }
    } else if (mode === 'magic') { // per-channel levels + contrast, keeps colour
        for (let ch = 0; ch < 3; ch++) { const hist = new Uint32Array(256); for (let i = ch; i < d.length; i += 4) hist[d[i]]++; const tot = w * h; let lo = 0, hi = 255, acc = 0; for (; lo < 255; lo++) { acc += hist[lo]; if (acc > tot * 0.02) break; } acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > tot * 0.25) break; } hi = Math.max(lo + 40, hi); const sc = 255 / (hi - lo); for (let i = ch; i < d.length; i += 4) d[i] = Math.max(0, Math.min(255, (d[i] - lo) * sc)); }
    }
    g.putImageData(id, 0, 0); return cv;
}
const FILTER_OPTS = `<option value="original">Original</option><option value="magic">Magic colour (clean, bright)</option><option value="gray">Grayscale</option><option value="bw">Black & white document</option>`;

// ---------- raster helpers
async function renderPageCanvas(pdf, i, scale) { const page = await pdf.getPage(i); const vp = page.getViewport({ scale }); const cv = whiteCanvas(vp.width, vp.height); await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; return { cv, w: vp.width / scale, h: vp.height / scale, page }; }

// =====================================================================  TOOL DEFINITIONS
const DEFS = {};
const PRESETS = { custom: [0, 0, 0], p1: [200, 230, 50], p2: [413, 531, 100], p3: [100, 120, 30], s1: [140, 60, 20], s2: [472, 236, 50] };

DEFS.exactsize = {
    accept: 'application/pdf,image/*', hint: 'Choose a PDF or a photo', multiple: false,
    options: () => `<label style="${lbl}">Target size (maximum)</label><div style="display:flex;gap:10px"><input id="es-kb" type="number" min="5" value="100" style="${inp}"><select id="es-unit" style="${inp};max-width:110px"><option value="1024">KB</option><option value="1048576">MB</option></select></div><p style="font-size:.78rem;color:#94a3b8;margin-bottom:12px">Quality is reduced step by step until the file fits. Very small targets may make text look soft.</p>`,
    async run([file], g, ctx) {
        const target = Math.floor(+g('es-kb') * +g('es-unit')); if (!(target >= 4096)) throw new Error('Please enter a target of at least 4 KB.');
        if (isImg(file)) {
            const img = await loadImg(file); let w = img.naturalWidth, h = img.naturalHeight, best = null;
            for (let round = 0; round < 12 && !best; round++) {
                const cv = whiteCanvas(w, h); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                let lo = 0.1, hi = 0.95, ok = null; if ((await toBlob(cv, 0.1)).size <= target) { for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2, b = await toBlob(cv, mid); if (b.size <= target) { ok = b; lo = mid; } else hi = mid; } best = ok || await toBlob(cv, 0.1); } else { w = Math.round(w * 0.82); h = Math.round(h * 0.82); }
            }
            if (!best) best = await toBlob(whiteCanvas(40, 40), 0.5); return { bytes: new Uint8Array(await best.arrayBuffer()), filename: `${base(file.name)}_${Math.round(target / 1024)}KB.jpg`, type: 'image/jpeg', title: `Image is now ${(best.size / 1024).toFixed(0)} KB` };
        }
        if (!isPdf(file)) throw new Error('Please choose a PDF or an image.');
        const L = ctx.PDFLIB, orig = new Uint8Array(await file.arrayBuffer()); let best = orig;
        try { const d = await L.PDFDocument.load(orig, { updateMetadata: false }); const s = await d.save({ useObjectStreams: true }); if (s.length < best.length) best = s; } catch (e) { }
        if (best.length > target) {
            const pdf = await ctx.pdfjsLib.getDocument({ data: orig.slice(0) }).promise; const levels = [[1.6, .8], [1.3, .7], [1.1, .6], [0.9, .5], [0.7, .42], [0.55, .35], [0.42, .3]];
            for (const [sc, q] of levels) {
                const out = await L.PDFDocument.create();
                for (let i = 1; i <= pdf.numPages; i++) { const { cv, w, h } = await renderPageCanvas(pdf, i, sc); const img = await out.embedJpg(cv.toDataURL('image/jpeg', q)); out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h }); cv.width = 0; }
                const bytes = await out.save(); best = bytes; if (bytes.length <= target) break;
            }
        }
        if (best.length > target) ctx.showCustomAlert(`Could not reach ${(target / 1024).toFixed(0)} KB. Smallest possible is ${(best.length / 1024).toFixed(0)} KB.`);
        return { bytes: best, filename: `${base(file.name)}_${Math.round(target / 1024)}KB.pdf`, type: 'application/pdf', title: `File is now ${(best.length / 1024).toFixed(0)} KB` };
    }
};

DEFS.photosign = {
    accept: 'image/*', hint: 'Choose a photo or signature image', multiple: false,
    options: () => `<label style="${lbl}">Preset (check your form's notification for the exact size)</label><select id="ps-pre" style="${inp}"><option value="custom">Custom</option><option value="p1">Photo - 200 x 230 px, max 50 KB</option><option value="p2">Photo - 3.5 x 4.5 cm (413 x 531 px), max 100 KB</option><option value="p3">Photo - 100 x 120 px, max 30 KB</option><option value="s1">Signature - 140 x 60 px, max 20 KB</option><option value="s2">Signature - 4 x 2 cm (472 x 236 px), max 50 KB</option></select>
    <div style="display:flex;gap:10px"><div style="flex:1"><label style="${lbl}">Width (px)</label><input id="ps-w" type="number" value="200" style="${inp}"></div><div style="flex:1"><label style="${lbl}">Height (px)</label><input id="ps-h" type="number" value="230" style="${inp}"></div><div style="flex:1"><label style="${lbl}">Max KB</label><input id="ps-kb" type="number" value="50" style="${inp}"></div></div>
    <label style="${lbl}">Fit</label><select id="ps-fit" style="${inp}"><option value="cover">Crop to fill (no empty edges)</option><option value="contain">Keep whole image (white padding)</option></select>`,
    init(root) { const s = root.querySelector('#ps-pre'); s.onchange = () => { const p = PRESETS[s.value]; if (p && p[0]) { root.querySelector('#ps-w').value = p[0]; root.querySelector('#ps-h').value = p[1]; root.querySelector('#ps-kb').value = p[2]; } }; },
    async run([file], g) {
        const W = Math.round(+g('ps-w')), H = Math.round(+g('ps-h')), maxB = Math.round(+g('ps-kb') * 1024); if (!(W >= 20 && H >= 20 && maxB >= 2048)) throw new Error('Please enter valid width, height and size.');
        const img = await loadImg(file); const cv = whiteCanvas(W, H), c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
        const k = g('ps-fit') === 'cover' ? Math.max(W / img.naturalWidth, H / img.naturalHeight) : Math.min(W / img.naturalWidth, H / img.naturalHeight); const dw = img.naturalWidth * k, dh = img.naturalHeight * k; c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        let lo = 0.05, hi = 0.97, best = null; const first = await toBlob(cv, 0.97); if (first.size <= maxB) best = first; else { for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2, b = await toBlob(cv, mid); if (b.size <= maxB) { best = b; lo = mid; } else hi = mid; } if (!best) best = await toBlob(cv, 0.05); }
        return { bytes: new Uint8Array(await best.arrayBuffer()), filename: `${base(file.name)}_${W}x${H}.jpg`, type: 'image/jpeg', title: `${W}x${H} px, ${(best.size / 1024).toFixed(1)} KB` };
    }
};

DEFS.headerfooter = {
    accept: 'application/pdf', hint: 'Choose a PDF', multiple: false,
    options: () => {
        const row = (p) => `<div style="display:flex;gap:8px"><input id="hf-${p}l" placeholder="Left" style="${inp}"><input id="hf-${p}c" placeholder="Centre" style="${inp}"><input id="hf-${p}r" placeholder="Right" style="${inp}"></div>`;
        return `<p style="font-size:.8rem;color:#94a3b8;margin-bottom:10px">You can use <b>{page}</b> <b>{total}</b> <b>{date}</b> <b>{file}</b> in any box.</p><label style="${lbl}">Header</label>${row('h')}<label style="${lbl}">Footer</label>${row('f')}
        <div style="display:flex;gap:10px"><div style="flex:1"><label style="${lbl}">Font size</label><input id="hf-size" type="number" value="10" min="6" max="30" style="${inp}"></div><div style="flex:1"><label style="${lbl}">Colour</label><input id="hf-color" type="color" value="#333333" style="${inp};padding:3px;height:46px"></div></div>
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:.9rem"><input type="checkbox" id="hf-skip"> Skip the first page</label>
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:.9rem"><input type="checkbox" id="hf-bates"> Add Bates numbers (bottom right)</label>
        <div style="display:flex;gap:8px"><input id="hf-bp" placeholder="Prefix e.g. CASE-" style="${inp}"><input id="hf-bs" type="number" value="1" style="${inp}"><input id="hf-bd" type="number" value="6" min="1" max="10" style="${inp}"></div><p style="font-size:.75rem;color:#94a3b8">Prefix, first number, digits</p>`;
    },
    async run([file], g, ctx) {
        const L = ctx.PDFLIB, doc = await L.PDFDocument.load(await file.arrayBuffer()); const draw = textDrawer(doc, L, await stdFonts(doc, L)); const pages = doc.getPages(), total = pages.length;
        const hex = g('hf-color'), col = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), size = +g('hf-size') || 10, date = new Date().toLocaleDateString('en-GB'), fname = base(file.name);
        const tok = (s, n) => s.replace(/\{page\}/gi, n).replace(/\{total\}/gi, total).replace(/\{date\}/gi, date).replace(/\{file\}/gi, fname);
        const any = ['hl', 'hc', 'hr', 'fl', 'fc', 'fr'].some(k => g('hf-' + k).trim()) || document.getElementById('hf-bates').checked; if (!any) throw new Error('Type something in a header / footer box, or turn on Bates numbers.');
        const m = 28; let bn = parseInt(g('hf-bs')) || 1;
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i]; if (i === 0 && document.getElementById('hf-skip').checked) { bn++; continue; }
            const { width, height } = p.getSize(); const n = i + 1;
            for (const [k, y] of [['h', height - m], ['f', m - size * 0.2 + 6]]) for (const [pos, x, al] of [['l', m, 'left'], ['c', width / 2, 'center'], ['r', width - m, 'right']]) { const t = tok(g(`hf-${k}${pos}`), n); if (t.trim()) await draw(p, t, { x, y: y - (k === 'h' ? size * 0.8 : 0), size, color: col, align: al }); }
            if (document.getElementById('hf-bates').checked) { const t = (g('hf-bp') || '') + String(bn).padStart(Math.max(1, +g('hf-bd') || 6), '0'); await draw(p, t, { x: width - m, y: m - size * 0.2 + 6 + size * 1.5, size, bold: true, color: col, align: 'right' }); }
            bn++;
        }
        return { bytes: await doc.save(), filename: `${fname}_HF.pdf`, type: 'application/pdf', title: 'Headers & Footers Added!' };
    }
};

// ---- bookmarks
function addOutlines(doc, L, items) {
    const c = doc.context, pages = doc.getPages(); const rootRef = c.nextRef(); const roots = []; const stack = [{ level: 0, kids: roots }];
    items.forEach(it => { const node = { ...it, kids: [] }; while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop(); stack[stack.length - 1].kids.push(node); stack.push({ level: it.level, kids: node.kids }); });
    const build = (nodes, parent) => { const refs = nodes.map(() => c.nextRef()); let total = 0;
        nodes.forEach((n, i) => { const d = { Title: L.PDFHexString.fromText(n.title), Parent: parent, Dest: [pages[n.page - 1].ref, 'XYZ', null, null, null] }; if (i > 0) d.Prev = refs[i - 1]; if (i < nodes.length - 1) d.Next = refs[i + 1];
            if (n.kids.length) { const sub = build(n.kids, refs[i]); d.First = sub.first; d.Last = sub.last; d.Count = sub.count; total += sub.count; } total++; c.assign(refs[i], c.obj(d)); });
        return { first: refs[0], last: refs[refs.length - 1], count: total }; };
    const r = build(roots, rootRef); c.assign(rootRef, c.obj({ Type: 'Outlines', First: r.first, Last: r.last, Count: r.count })); doc.catalog.set(L.PDFName.of('Outlines'), rootRef); doc.catalog.set(L.PDFName.of('PageMode'), L.PDFName.of('UseOutlines'));
}
DEFS.bookmarks = {
    accept: 'application/pdf', hint: 'Choose a PDF', multiple: false,
    options: () => `<p style="font-size:.8rem;color:#94a3b8;margin-bottom:8px">One bookmark per line: <b>Title | page number</b>. Start a line with <b>-</b> to make it a sub-item (e.g. <i>- Section 1.1 | 4</i>).</p><textarea id="bm-text" rows="9" placeholder="Introduction | 1&#10;Chapter 1 | 3&#10;- Section 1.1 | 4" style="${inp};resize:vertical"></textarea>
    <button id="bm-auto" type="button" style="background:rgba(255,255,255,.1);color:#fff;border:1px solid var(--glass-border);padding:10px 16px;border-radius:8px;cursor:pointer;margin-bottom:12px"><i class="fas fa-wand-magic-sparkles"></i> Detect headings automatically</button>`,
    init(root, ctx, getFiles) {
        root.querySelector('#bm-auto').onclick = async () => { const f = getFiles()[0]; if (!f) return ctx.showCustomAlert('Choose a PDF first.'); const t = root.querySelector('#bm-text'); t.value = 'Detecting...';
            try { const pdf = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; const out = []; const sizes = []; const per = [];
                for (let i = 1; i <= Math.min(pdf.numPages, 150); i++) { const ex = await extractPage(pdf, i, ctx, { colors: false }); per.push(ex.blocks); ex.blocks.forEach(b => sizes.push(b.size)); }
                const chars = {}; per.forEach(bl => bl.forEach(b => { const k = Math.round(b.size * 2) / 2; chars[k] = (chars[k] || 0) + b.str.length; })); const med = +Object.entries(chars).sort((a, b) => b[1] - a[1])[0][0] || 10; const big = Math.max(...sizes);
                per.forEach((bl, i) => bl.filter(b => b.size >= med * 1.3 && b.str.trim().length > 2 && b.str.trim().length < 80).forEach(b => out.push(`${b.size >= med * 1.3 && b.size >= big * 0.85 ? '' : '- '}${b.str.trim()} | ${i + 1}`)));
                t.value = out.slice(0, 200).join('\n'); if (!out.length) ctx.showCustomAlert('No clear headings found. Type the bookmarks by hand.'); } catch (e) { t.value = ''; ctx.handleError(e); } };
    },
    async run([file], g, ctx) {
        const L = ctx.PDFLIB, doc = await L.PDFDocument.load(await file.arrayBuffer()), n = doc.getPageCount(); const items = [];
        g('bm-text').split('\n').forEach((raw, i) => { let line = raw.trim(); if (!line) return; let level = 1; while (line.startsWith('-')) { level++; line = line.slice(1).trim(); } const k = line.lastIndexOf('|'); if (k < 0) throw new Error(`Line ${i + 1}: use "Title | page".`); const title = line.slice(0, k).trim(), page = parseInt(line.slice(k + 1)); if (!title) throw new Error(`Line ${i + 1}: title is empty.`); if (!(page >= 1 && page <= n)) throw new Error(`Line ${i + 1}: page must be between 1 and ${n}.`); items.push({ title, page, level }); });
        if (!items.length) throw new Error('Add at least one bookmark.'); addOutlines(doc, L, items);
        return { bytes: await doc.save(), filename: `${base(file.name)}_Bookmarked.pdf`, type: 'application/pdf', title: 'Bookmarks Added!' };
    }
};

DEFS.extractimages = {
    accept: 'application/pdf', hint: 'Choose a PDF', multiple: false,
    options: () => `<p style="font-size:.8rem;color:#94a3b8;margin-bottom:12px">Every picture on every page is saved as PNG in a ZIP (rendered at high resolution).</p>`,
    async run([file], g, ctx) {
        const pdf = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const zip = new ctx.JSZip(); let n = 0;
        for (let i = 1; i <= pdf.numPages; i++) { const { cv, page } = await renderPageCanvas(pdf, i, 3); const imgs = await pageImages(page, page.getViewport({ scale: 1 }), cv, 3, ctx.pdfjsLib); imgs.forEach((im, k) => { if (im.w < 40 || im.h < 40) return; zip.file(`Page${i}_Image${k + 1}.png`, im.data); n++; }); cv.width = 0; }
        if (!n) throw new Error('No pictures were found in this PDF.');
        return { bytes: await zip.generateAsync({ type: 'uint8array' }), filename: `${base(file.name)}_images.zip`, type: 'application/zip', title: `${n} image(s) extracted` };
    }
};

DEFS.compare = {
    slots: ['Original PDF', 'Changed PDF'], accept: 'application/pdf',
    options: () => `<label style="${lbl}">Sensitivity</label><select id="cmp-s" style="${inp}"><option value="60">Normal</option><option value="25">High (tiny changes)</option><option value="110">Low (ignore small differences)</option></select>`,
    async run([a, b], g, ctx) {
        const L = ctx.PDFLIB, thr = +g('cmp-s'); const pa = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(await a.arrayBuffer()) }).promise, pb = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise;
        const out = await L.PDFDocument.create(), fonts = await stdFonts(out, L), draw = textDrawer(out, L, fonts); const N = Math.max(pa.numPages, pb.numPages); const rep = []; const diffPages = [];
        for (let i = 1; i <= N; i++) {
            if (i > pa.numPages || i > pb.numPages) { rep.push(`Page ${i}: only in ${i > pa.numPages ? 'changed' : 'original'} PDF`); continue; }
            const A = await renderPageCanvas(pa, i, 1.4), B = await renderPageCanvas(pb, i, 1.4); const w = B.cv.width, h = B.cv.height; const ac = whiteCanvas(w, h); ac.getContext('2d').drawImage(A.cv, 0, 0, w, h);
            const da = ac.getContext('2d').getImageData(0, 0, w, h), db = B.cv.getContext('2d').getImageData(0, 0, w, h); let diff = 0; const mark = new Uint8Array(w * h);
            for (let p = 0, q = 0; p < da.data.length; p += 4, q++) { const d = Math.abs(da.data[p] - db.data[p]) + Math.abs(da.data[p + 1] - db.data[p + 1]) + Math.abs(da.data[p + 2] - db.data[p + 2]); if (d > thr) { mark[q] = 1; diff++; } }
            const pct = diff / (w * h) * 100; if (pct < 0.005) { rep.push(`Page ${i}: identical`); continue; }
            // dilate marks into blocks and tint
            const g2 = B.cv.getContext('2d'); g2.save(); g2.globalAlpha = 0.28; g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, w, h); g2.restore(); g2.fillStyle = 'rgba(239,68,68,0.45)'; const bs = 6;
            for (let y = 0; y < h; y += bs) for (let x = 0; x < w; x += bs) { let hit = false; for (let yy = y; yy < Math.min(h, y + bs) && !hit; yy++) for (let xx = x; xx < Math.min(w, x + bs); xx++) if (mark[yy * w + xx]) { hit = true; break; } if (hit) g2.fillRect(x, y, bs, bs); }
            const img = await out.embedJpg(B.cv.toDataURL('image/jpeg', 0.85)); const pw = w / 1.4, ph = h / 1.4; const pg = out.addPage([pw, ph + 22]); pg.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
            await draw(pg, `Page ${i} - ${pct.toFixed(2)}% changed (red = differences)`, { x: 8, y: ph + 6, size: 10, bold: true, color: [0.8, 0.1, 0.1] }); diffPages.push(i); rep.push(`Page ${i}: ${pct.toFixed(2)}% changed`); A.cv.width = B.cv.width = ac.width = 0;
        }
        const sum = out.insertPage(0, [595, 842]); let y = 800; await draw(sum, 'PDF Comparison Report', { x: 40, y, size: 20, bold: true }); y -= 24; await draw(sum, `${a.name}  vs  ${b.name}`, { x: 40, y, size: 10, color: [0.3, 0.3, 0.3] }); y -= 30;
        for (const line of rep.slice(0, 50)) { await draw(sum, line, { x: 40, y, size: 11 }); y -= 17; }
        if (!diffPages.length && pa.numPages === pb.numPages) await draw(sum, 'No visible differences found.', { x: 40, y: y - 10, size: 12, bold: true, color: [0.05, 0.5, 0.2] });
        return { bytes: await out.save(), filename: 'Comparison_Report.pdf', type: 'application/pdf', title: diffPages.length ? `${diffPages.length} page(s) differ` : 'No differences found' };
    }
};

DEFS.idcard = {
    slots: ['Front side (image)', 'Back side (image, optional)'], accept: 'image/*', optionalSlots: [1],
    options: () => `<label style="${lbl}">Size on paper</label><select id="id-size" style="${inp}"><option value="1">Actual card size (85.6 x 54 mm)</option><option value="1.5">Larger (1.5x)</option><option value="2">Large (2x)</option></select><label style="${lbl}">Enhance</label><select id="id-f" style="${inp}">${FILTER_OPTS}</select><label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:.9rem"><input type="checkbox" id="id-border" checked> Draw a thin cut line</label>`,
    async run([front, back], g, ctx) {
        if (!front) throw new Error('Choose the front side image.'); const L = ctx.PDFLIB, doc = await L.PDFDocument.create(); const page = doc.addPage([595.28, 841.89]); const k = +g('id-size') || 1; const cw = 85.6 * 2.8346 * k, ch = 54 * 2.8346 * k;
        const place = async (f, y) => { const img = await loadImg(f); const s = Math.min(1600 / img.naturalWidth, 1); const cv = whiteCanvas(img.naturalWidth * s, img.naturalHeight * s); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); applyFilter(cv, g('id-f')); const im = await doc.embedJpg(cv.toDataURL('image/jpeg', 0.92)); const x = (595.28 - cw) / 2; page.drawImage(im, { x, y, width: cw, height: ch }); if (document.getElementById('id-border').checked) page.drawRectangle({ x, y, width: cw, height: ch, borderColor: L.rgb(0.6, 0.6, 0.6), borderWidth: 0.5 }); };
        const top = 841.89 - 70 - ch; await place(front, top); if (back) await place(back, top - ch - 30);
        return { bytes: await doc.save(), filename: 'ID_Card.pdf', type: 'application/pdf', title: 'ID Card PDF Ready!' };
    }
};

DEFS.scanenhance = {
    accept: 'image/*', multiple: true, hint: 'Choose photos of documents',
    options: () => `<label style="${lbl}">Enhance</label><select id="se-f" style="${inp}">${FILTER_OPTS.replace('value="original"', 'value="original"').replace('<option value="magic"', '<option value="magic" selected')}</select><label style="${lbl}">Page size</label><select id="se-p" style="${inp}"><option value="fit">Same as photo</option><option value="a4">A4 (fit inside)</option></select>`,
    async run(files, g, ctx) {
        const L = ctx.PDFLIB, doc = await L.PDFDocument.create(); const imgs = files.filter(isImg); if (!imgs.length) throw new Error('Choose at least one image.');
        for (const f of imgs) { const img = await loadImg(f); const s = Math.min(2400 / Math.max(img.naturalWidth, img.naturalHeight), 1); const cv = whiteCanvas(img.naturalWidth * s, img.naturalHeight * s); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); applyFilter(cv, g('se-f')); const im = await doc.embedJpg(cv.toDataURL('image/jpeg', 0.9));
            if (g('se-p') === 'a4') { const pg = doc.addPage([595.28, 841.89]); const k = Math.min(555 / im.width, 800 / im.height); const w = im.width * k, h = im.height * k; pg.drawImage(im, { x: (595.28 - w) / 2, y: (841.89 - h) / 2, width: w, height: h }); } else { const k = Math.min(1, 842 / Math.max(im.width, im.height)); doc.addPage([im.width * k, im.height * k]).drawImage(im, { x: 0, y: 0, width: im.width * k, height: im.height * k }); } cv.width = 0; }
        return { bytes: await doc.save(), filename: 'Scan_Enhanced.pdf', type: 'application/pdf', title: 'Scan PDF Ready!' };
    }
};

// =====================================================================  UI builder
function buildTool(root, id, def, tdef, ctx) {
    const slots = def.slots || ['Select file']; const multi = !!def.multiple; const files = multi ? [] : slots.map(() => null);
    const g = (k) => { const e = root.querySelector('#' + k); return e ? e.value : ''; };
    root.innerHTML = `<div id="${id}-slots"></div><div id="${id}-opts" style="background:rgba(0,0,0,.2);padding:18px;border-radius:12px;border:1px solid var(--glass-border);margin:14px 0;display:none"></div><button id="${id}-run" style="${btnS};display:none"><i class="fas ${tdef.icon}"></i> ${esc(tdef.title)}</button>`;
    const slotsEl = root.querySelector(`#${id}-slots`), opts = root.querySelector(`#${id}-opts`), run = root.querySelector(`#${id}-run`);
    const toks = (def.accept || '').split(',').map(x => x.trim()).filter(Boolean);
    const accepts = (f) => toks.some(t => t.startsWith('.') ? f.name.toLowerCase().endsWith(t.toLowerCase()) : t === 'image/*' ? isImg(f) : t === 'application/pdf' ? isPdf(f) : f.type === t);
    const refresh = () => {
        slotsEl.innerHTML = '';
        if (multi) {
            const box = document.createElement('div'); box.style.cssText = 'border:2px dashed var(--accent);border-radius:14px;padding:26px;text-align:center;cursor:pointer;background:rgba(59,130,246,.05)'; box.innerHTML = `<i class="fas ${tdef.icon}" style="font-size:2.2rem;color:${tdef.color};margin-bottom:8px"></i><h4>${esc(def.hint || 'Choose files')}</h4><input type="file" multiple accept="${def.accept}" style="display:none">`;
            const input = box.querySelector('input'); box.onclick = () => input.click(); input.onchange = (e) => { add(Array.from(e.target.files)); e.target.value = ''; }; ctx.enableDrop(box, add); slotsEl.appendChild(box);
            files.forEach((f, i) => { const r = document.createElement('div'); r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,.05);border-radius:8px;border:1px solid var(--glass-border);margin-top:8px'; r.innerHTML = `<span class="text-ellipsis">${esc(f.name)}</span><button style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer"><i class="fas fa-times"></i></button>`; r.querySelector('button').onclick = () => { files.splice(i, 1); refresh(); }; slotsEl.appendChild(r); });
        } else slots.forEach((label, i) => {
            const box = document.createElement('div'); const f = files[i]; const opt = (def.optionalSlots || []).includes(i);
            box.style.cssText = `border:2px dashed ${f ? '#10b981' : 'var(--accent)'};border-radius:14px;padding:${f ? '14px' : '22px'};text-align:center;cursor:pointer;background:rgba(59,130,246,.05);margin-bottom:10px`;
            box.innerHTML = f ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="text-ellipsis"><i class="fas fa-check-circle" style="color:#10b981"></i> ${esc(f.name)}</span><button style="background:var(--glass-border);color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer"><i class="fas fa-times"></i></button></div>` : `<i class="fas ${tdef.icon}" style="font-size:1.8rem;color:${tdef.color};margin-bottom:6px"></i><h4>${esc(slots.length > 1 ? label : (def.hint || label))}${opt ? ' <small style="color:#94a3b8">(optional)</small>' : ''}</h4><input type="file" accept="${def.accept}" style="display:none">`;
            if (f) box.querySelector('button').onclick = (e) => { e.stopPropagation(); files[i] = null; refresh(); }; else { const input = box.querySelector('input'); box.onclick = () => input.click(); input.onchange = (e) => { put(i, e.target.files[0]); }; ctx.enableDrop(box, (l) => put(i, l[0])); }
            slotsEl.appendChild(box);
        });
        const ready = multi ? files.length > 0 : files.every((f, i) => f || (def.optionalSlots || []).includes(i)); opts.style.display = ready ? 'block' : 'none'; run.style.display = ready ? 'block' : 'none';
    };
    const put = (i, f) => { if (!f) return; if (!accepts(f)) return ctx.showCustomAlert('This file type is not supported for this tool.'); files[i] = f; refresh(); };
    const add = (list) => { const ok = list.filter(accepts); if (ok.length < list.length) ctx.showCustomAlert('Some files were skipped (unsupported type).'); files.push(...ok); refresh(); };
    opts.innerHTML = def.options(); if (def.init) def.init(opts, ctx, () => files.filter(Boolean));
    run.onclick = () => {
        const used = files.filter(Boolean), total = used.reduce((a, f) => a + f.size, 0);
        ctx.simulateLoadingAndProcess(tdef.title, async () => {
            const r = await def.run(multi ? used : files, g, ctx); if (!r) return; window.__pendingShare = r;
            ctx.showSuccessResult(total, r.bytes.length, r.title || 'Done!', async () => { await ctx.AdManager.showInterstitial(); await ctx.processAndDownload(r.bytes, r.filename, r.type); }, true);
            if (multi) files.length = 0; else files.fill(null); refresh();
        });
    };
    refresh();
}

export async function mountTool(id, ctx) {
    const tdef = TOOLS2.find(t => t.id === id), root = document.getElementById(id + '-ui-container'); if (!tdef || !root || root.dataset.ready) return; root.dataset.ready = '1';
    if (id === 'applock') { mountAppLockUI(root); return; }
    if (tdef.visual) { // opens the visual editor
        root.innerHTML = `<div style="border:2px dashed ${tdef.color};border-radius:16px;padding:40px 20px;text-align:center;cursor:pointer;background:rgba(255,255,255,.03)"><i class="fas ${tdef.icon}" style="font-size:3rem;color:${tdef.color};margin-bottom:12px"></i><h3>${tdef.visual === 'maskaadhaar' ? 'Choose Aadhaar (PDF or image)' : 'Choose a PDF'}</h3><p style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">${tdef.visual === 'forms' ? 'Fillable fields are detected automatically' : 'Opens in the visual editor'}</p><input type="file" style="display:none" accept="${tdef.visual === 'maskaadhaar' ? 'application/pdf,image/*' : 'application/pdf'}"></div>`;
        const box = root.firstElementChild, input = box.querySelector('input'); const open = async (f) => { if (!f) return; if (isImg(f)) { if (tdef.visual === 'forms') return ctx.showCustomAlert('Please choose a PDF.'); const bytes = await ctx.ops.imageToPdf(f); f = new File([bytes], base(f.name) + '.pdf', { type: 'application/pdf' }); } else if (!isPdf(f)) return ctx.showCustomAlert('Please choose a PDF' + (tdef.visual === 'maskaadhaar' ? ' or an image.' : '.')); input.value = ''; ctx.openVisualWorkspace(f, tdef.visual); };
        box.onclick = () => input.click(); input.onchange = (e) => open(e.target.files[0]); ctx.enableDrop(box, (l) => open(l[0])); return;
    }
    let def = DEFS[id]; if (!def) { const c = await import('./create.js'); if (c.CUSTOM[id]) return c.CUSTOM[id](root, tdef, ctx); def = c.DEFS[id]; }
    if (def) buildTool(root, id, def, tdef, ctx);
}
