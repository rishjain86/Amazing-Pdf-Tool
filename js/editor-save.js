// Applies all editor changes to the real PDF with pdf-lib
import { S, BASELINE, LH, CSSFONT, toUser, hexRgb, buildBlocks, detectFont } from './ed-shared.js';

const FONTMAP = (L, family, bold, italic) => {
    const F = L.StandardFonts;
    if (family === 'serif') return bold && italic ? F.TimesRomanBoldItalic : bold ? F.TimesRomanBold : italic ? F.TimesRomanItalic : F.TimesRoman;
    if (family === 'mono') return bold && italic ? F.CourierBoldOblique : bold ? F.CourierBold : italic ? F.CourierOblique : F.Courier;
    return bold && italic ? F.HelveticaBoldOblique : bold ? F.HelveticaBold : italic ? F.HelveticaOblique : F.Helvetica;
};
const colorOf = (L, hex) => { const c = hexRgb(hex); return L.rgb(c[0] / 255, c[1] / 255, c[2] / 255); };
const dispDims = (p) => (p.rot % 180 !== 0 ? [p.h, p.w] : [p.w, p.h]);

export async function saveEditor() {
    const ctx = S.ctx, L = ctx.PDFLIB, mode = S.mode;
    const live = S.pages.filter(p => !p.deleted);
    const applyMode = (document.getElementById('edit-apply-mode') || {}).value || 'current';
    const curPage = live[Math.min(S.curPage, live.length - 1)];
    const allObjs = Object.values(S.objs).flat();

    // ---- validation before the progress UI starts
    if (['crop', 'addmargins', 'extract'].includes(mode) && !allObjs.some(o => o.type === 'rbox' && o.w > 3)) { ctx.showCustomAlert(mode === 'crop' ? 'Draw a crop box on the page first!' : mode === 'addmargins' ? 'Draw the content box first!' : 'Draw a selection box around the text first!'); return; }
    if (mode === 'pagenumbers' && !allObjs.some(o => o.type === 'pagenum')) { ctx.showCustomAlert('Position the page number first.'); return; }
    if (['sign', 'watermark', 'imagewatermark', 'addtext'].includes(mode) && !allObjs.length) { ctx.showCustomAlert(mode === 'sign' ? 'Add your signature to the page first.' : mode === 'imagewatermark' ? 'Choose an image first.' : 'Add something to the page first.'); return; }
    const active = document.activeElement; if (active && active.blur && active.isContentEditable) active.blur();

    const origSize = S.file.size;
    ctx.simulateLoadingAndProcess('Applying Changes', async () => {
        const doc = await L.PDFDocument.load(S.bytes.slice(0));
        const fontCache = {}, imgCache = {};
        const getFont = async (fam, b, i) => { const k = FONTMAP(L, fam, b, i); return fontCache[k] || (fontCache[k] = await doc.embedFont(k)); };
        const srcPages = {};
        live.forEach(p => { if (!p.blank) srcPages[p.id] = doc.getPage(p.src); });
        const outOrder = live; // final order
        let outName = S.name.replace(/\.pdf$/i, ''), suffix = '_Edited', title = 'PDF Updated!';

        // build per-page drawing helpers
        const env = (p) => {
            const pg = srcPages[p.id]; const cb = pg.getCropBox(); const r = p.rot; const [dw, dh] = dispDims(p);
            const U = (dx, dy) => toUser(r, cb.width, cb.height, cb.x, cb.y, dx, dy);
            return { pg, r, U, dw, dh, cb };
        };
        const disp = (o, lx, ly) => { const w = o.w || 0, h = o.h || 0, cx = o.x + w / 2, cy = o.y + h / 2, X = lx - w / 2, Y = ly - h / 2, t = (o.rot || 0) * Math.PI / 180; return [cx + X * Math.cos(t) - Y * Math.sin(t), cy + X * Math.sin(t) + Y * Math.cos(t)]; };

        async function rasterText(lines, o, family) {
            const k = 4, size = o.size, bold = !!o.bold, italic = !!o.italic;
            const c = document.createElement('canvas'), x = c.getContext('2d');
            const font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size * k}px ${CSSFONT[family]}, "Noto Sans", "Noto Sans Devanagari", "Segoe UI", sans-serif`;
            x.font = font; const wmax = Math.max(1, ...lines.map(l => x.measureText(l).width));
            c.width = Math.ceil(wmax) + 8; c.height = Math.ceil(lines.length * size * LH * k) + 8; x.font = font; x.fillStyle = o.color; x.textBaseline = 'alphabetic';
            lines.forEach((l, i) => x.fillText(l, 4, 4 + (BASELINE[family] * size + i * size * LH) * k));
            return { url: c.toDataURL('image/png'), w: (c.width) / k, h: (c.height) / k };
        }

        async function drawTextObj(e, o, opt) {
            // opt: {x,y: top-left displayed, w,h for rot, family, size,...}
            const { pg, r, U } = e; const L2 = L;
            const family = o.family || o.font || 'sans', size = o.size, lines = String(o.text).split('\n');
            const font = await getFont(family, o.bold, o.italic);
            const rot = o.rot || 0, ang = r - rot; const rad = ang * Math.PI / 180;
            let encodable = true; try { lines.forEach(l => font.encodeText(l)); } catch (er) { encodable = false; }
            const op = o.opacity == null ? 1 : o.opacity;
            if (!encodable) {
                const rt = await rasterText(lines, o, family);
                const img = imgCache['t' + rt.url.length + o.text] || (imgCache['t' + rt.url.length + o.text] = await doc.embedPng(rt.url));
                const [bx, by] = disp({ ...o, w: o.w || rt.w, h: o.h || rt.h }, 0, rt.h);
                const [ux, uy] = U(bx, by);
                e.pg.drawImage(img, { x: ux, y: uy, width: rt.w, height: rt.h, rotate: L2.degrees(ang), opacity: op });
                return;
            }
            const w = o.w || Math.max(...lines.map(l => font.widthOfTextAtSize(l, size))), h = o.h || lines.length * size * LH;
            const oo = { x: o.x, y: o.y, w, h, rot };
            lines.forEach((l, i) => {
                const [bx, by] = disp(oo, 0, BASELINE[family] * size + i * size * LH);
                const [ux, uy] = U(bx, by);
                if (l.length) pg.drawText(l, { x: ux, y: uy, size, font, color: colorOf(L2, o.color), opacity: op, rotate: L2.degrees(ang) });
                if (o.underline && l.length) {
                    const lw = font.widthOfTextAtSize(l, size), dy = size * 0.12;
                    const sx = ux + Math.sin(rad) * dy, sy = uy - Math.cos(rad) * dy;
                    pg.drawLine({ start: { x: sx, y: sy }, end: { x: sx + lw * Math.cos(rad), y: sy + lw * Math.sin(rad) }, thickness: Math.max(0.6, size / 16), color: colorOf(L2, o.color), opacity: op });
                }
            });
        }

        async function drawObj(e, o, rel) {
            const { pg, r, U } = e; const L2 = L;
            const rect = (x, y, w, h, extra) => { const [ux, uy] = U(x, y + h); pg.drawRectangle({ x: ux, y: uy, width: w, height: h, rotate: L2.degrees(r), ...extra }); };
            if (rel) { o = JSON.parse(JSON.stringify(o)); const kx = rel.kx, ky = rel.ky; ['x', 'x2'].forEach(k => { if (k in o) o[k] *= kx; }); ['y', 'y2'].forEach(k => { if (k in o) o[k] *= ky; }); if (o.points) o.points = o.points.map(q => ({ x: q.x * kx, y: q.y * ky })); if ('w' in o && o.type !== 'text') { o.w *= kx; o.h *= ky; } if (o.type === 'image') o.h = o.w * rel.ratio(o); }
            switch (o.type) {
                case 'text': await drawTextObj(e, o); break;
                case 'edit': {
                    const x0 = o.x - 1, y0 = o.base - o.size * 0.9, w0 = o.w + 2, h0 = o.size * 1.15;
                    rect(x0, y0, w0, h0, { color: colorOf(L, o.bg) });
                    if (o.text && o.text.trim()) await drawTextObj(e, { ...o, x: o.x, y: o.base - BASELINE[o.family] * o.size, w: 0, h: 0, rot: 0, opacity: 1 });
                    break;
                }
                case 'whiteout': rect(o.x, o.y, o.w, o.h, { color: L.rgb(1, 1, 1) }); break;
                case 'highlight': rect(o.x, o.y, o.w, o.h, { color: colorOf(L, o.color), opacity: 0.4 }); break;
                case 'rect': rect(o.x, o.y, o.w, o.h, { borderColor: colorOf(L, o.color), borderWidth: o.sw, color: o.fill ? colorOf(L, o.fill) : undefined, opacity: o.fill ? 1 : 0, borderOpacity: 1 }); break;
                case 'ellipse': { const [cx, cy] = U(o.x + o.w / 2, o.y + o.h / 2); const sw = r % 180 !== 0; pg.drawEllipse({ x: cx, y: cy, xScale: (sw ? o.h : o.w) / 2, yScale: (sw ? o.w : o.h) / 2, borderColor: colorOf(L, o.color), borderWidth: o.sw, color: o.fill ? colorOf(L, o.fill) : undefined, opacity: o.fill ? 1 : 0, borderOpacity: 1 }); break; }
                case 'underline': { const a = U(o.x, o.y + o.h), b = U(o.x + o.w, o.y + o.h); pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: o.sw, color: colorOf(L, o.color) }); break; }
                case 'strike': { const a = U(o.x, o.y + o.h / 2), b = U(o.x + o.w, o.y + o.h / 2); pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: o.sw, color: colorOf(L, o.color) }); break; }
                case 'line': case 'arrow': {
                    const a = U(o.x, o.y), b = U(o.x2, o.y2); const col = colorOf(L, o.color);
                    pg.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: o.sw, color: col, lineCap: L.LineCapStyle.Round });
                    if (o.type === 'arrow') {
                        const ang = Math.atan2(o.y2 - o.y, o.x2 - o.x), len = Math.max(8, o.sw * 4);
                        for (const k of [1, -1]) { const hx = o.x2 - len * Math.cos(ang + k * 0.45), hy = o.y2 - len * Math.sin(ang + k * 0.45); const h = U(hx, hy); pg.drawLine({ start: { x: b[0], y: b[1] }, end: { x: h[0], y: h[1] }, thickness: o.sw, color: col, lineCap: L.LineCapStyle.Round }); }
                    }
                    break;
                }
                case 'draw': {
                    const col = colorOf(L, o.color); const pts = o.points.map(q => U(q.x, q.y));
                    for (let k = 0; k < pts.length - 1; k++) pg.drawLine({ start: { x: pts[k][0], y: pts[k][1] }, end: { x: pts[k + 1][0], y: pts[k + 1][1] }, thickness: o.sw, color: col, lineCap: L.LineCapStyle.Round });
                    break;
                }
                case 'image': {
                    const url = S.images[o.img]; if (!url) break;
                    let img = imgCache[o.img]; if (!img) img = imgCache[o.img] = url.startsWith('data:image/png') ? await doc.embedPng(url) : await doc.embedJpg(url);
                    const [ux, uy] = U(o.x, o.y + o.h);
                    pg.drawImage(img, { x: ux, y: uy, width: o.w, height: o.h, rotate: L.degrees(r), opacity: o.opacity == null ? 1 : o.opacity }); break;
                }
                case 'link': {
                    if (!o.url) break; const a = U(o.x, o.y), b = U(o.x + o.w, o.y + o.h); const c = doc.context;
                    const annot = c.obj({ Type: 'Annot', Subtype: 'Link', Rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], Border: [0, 0, 0], A: c.obj({ Type: 'Action', S: 'URI', URI: L.PDFString.of(o.url) }) });
                    const ref = c.register(annot); const ex = pg.node.Annots(); if (ex) ex.push(ref); else pg.node.set(L.PDFName.of('Annots'), c.obj([ref]));
                    break;
                }
            }
        }

        let extractedText = null;
        if (['edit', 'sign', 'watermark', 'imagewatermark', 'addtext'].includes(mode)) {
            const replicate = applyMode === 'all' && mode !== 'edit';
            for (const p of live) {
                if (p.blank) continue; const e = env(p);
                let list = S.objs[p.id] || [], rel = null;
                if (replicate) {
                    list = S.objs[curPage.id] || []; const [sw, sh] = dispDims(curPage);
                    rel = { kx: e.dw / sw, ky: e.dh / sh, ratio: (o) => { const orig = list.find(x => x.id === o.id) || o; return orig.h / orig.w; } };
                }
                for (const o of list) { if (o.type === 'rbox' || o.type === 'pagenum') continue; await drawObj(e, o, rel); }
            }
            suffix = mode === 'sign' ? '_Signed' : mode.includes('watermark') ? '_Watermark' : mode === 'addtext' ? '_Text' : '_Edited';
        } else if (mode === 'pagenumbers') {
            const pn = allObjs.find(o => o.type === 'pagenum'); const src = S.pages.find(p => (S.objs[p.id] || []).includes(pn)); const [sw, sh] = dispDims(src);
            const font = await getFont(pn.font || 'sans', pn.bold, pn.italic); const total = live.length;
            live.forEach((p, idx) => {
                if (p.blank || (applyMode === 'current' && p !== curPage)) return; const e = env(p);
                const n = idx + 1; const txt = { '1': `${n}`, 'Page 1': `Page ${n}`, 'Page 1 of 10': `Page ${n} of ${total}`, '1 / 10': `${n} / ${total}` }[S.format] || `${n}`;
                const x = pn.x / sw * e.dw, y = pn.y / sh * e.dh + BASELINE[pn.font || 'sans'] * pn.size; const [ux, uy] = e.U(x, y);
                e.pg.drawText(txt, { x: ux, y: uy, size: pn.size, font, color: colorOf(L, pn.color), rotate: L.degrees(e.r) });
            });
            suffix = '_Numbered'; title = 'Numbers Added!';
        } else if (mode === 'crop' || mode === 'addmargins') {
            const bx = allObjs.find(o => o.type === 'rbox'); const bp = S.pages.find(p => (S.objs[p.id] || []).includes(bx)); const [sw, sh] = dispDims(bp);
            for (const p of live) {
                if (p.blank || (applyMode === 'current' && p !== bp)) continue; const e = env(p);
                const k = { x: bx.x / sw * e.dw, y: bx.y / sh * e.dh, w: bx.w / sw * e.dw, h: bx.h / sh * e.dh };
                if (mode === 'crop') {
                    const a = e.U(k.x, k.y), b = e.U(k.x + k.w, k.y + k.h);
                    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]); e.pg.setCropBox(x0, y0, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
                } else {
                    const mL = k.x, mT = k.y, mR = e.dw - (k.x + k.w), mB = e.dh - (k.y + k.h); // displayed margins
                    // convert to user space (rotate the tuple)
                    let t = [mL, mB, mR, mT]; // user-space order for r=0: left,bottom,right,top
                    const rr = ((e.r % 360) + 360) % 360;
                    if (rr === 90) t = [mT, mL, mB, mR]; else if (rr === 180) t = [mR, mT, mL, mB]; else if (rr === 270) t = [mB, mR, mT, mL];
                    const cb = e.cb; const nw = cb.width + t[0] + t[2], nh = cb.height + t[1] + t[3];
                    e.pg.translateContent(t[0], t[1]);
                    e.pg.setMediaBox(cb.x, cb.y, nw, nh); e.pg.setCropBox(cb.x, cb.y, nw, nh);
                }
            }
            suffix = mode === 'crop' ? '_Cropped' : '_Margined'; title = mode === 'crop' ? 'PDF Cropped!' : 'Margins Added!';
        } else if (mode === 'extract') {
            const bx = allObjs.find(o => o.type === 'rbox'); const bp = S.pages.find(p => (S.objs[p.id] || []).includes(bx)); const [sw, sh] = dispDims(bp);
            const pdf = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(S.bytes.slice(0)) }).promise; let txt = '';
            for (const p of live) {
                if (p.blank || (applyMode === 'current' && p !== bp)) continue;
                const page = await pdf.getPage(p.src + 1), vp = page.getViewport({ scale: 1, rotation: p.rot }); const [dw, dh] = dispDims(p);
                const k = { x: bx.x / sw * dw, y: bx.y / sh * dh, w: bx.w / sw * dw, h: bx.h / sh * dh };
                const tc = await page.getTextContent(); const hits = [];
                tc.items.forEach(it => {
                    if (!it.str) return; const m = vp.transform, t = it.transform;
                    const x = m[0] * t[4] + m[2] * t[5] + m[4], y = m[1] * t[4] + m[3] * t[5] + m[5], w = it.width * vp.scale;
                    const cx = x + w / 2; if (cx >= k.x && cx <= k.x + k.w && y >= k.y && y <= k.y + k.h + 4) hits.push({ x, y, s: it.str });
                });
                hits.sort((a, b) => Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x);
                let line = '', ly = null, out = [];
                hits.forEach(h => { if (ly !== null && Math.abs(h.y - ly) > 3) { out.push(line); line = ''; } line += (line && !/\s$/.test(line) ? ' ' : '') + h.s; ly = h.y; });
                if (line) out.push(line);
                if (out.length) txt += `--- Page ${live.indexOf(p) + 1} ---\n${out.join('\n')}\n\n`;
            }
            if (!txt.trim()) { ctx.hideProcessingUI(); ctx.showCustomAlert('No selectable text found in that area. If this is a scanned PDF, use the OCR Scanner tool.'); return; }
            extractedText = new TextEncoder().encode(txt);
        } else if (mode === 'rotate') { suffix = '_Rotated'; title = 'PDF Rotated!'; }
        else if (mode === 'flatten') {
            try { doc.getForm().flatten(); } catch (er) { console.warn('flatten', er); }
            suffix = '_Flattened'; title = 'PDF Flattened!';
        }

        if (extractedText) {
            ctx.showSuccessResult(0, extractedText.length, 'Text Extracted!', async () => { await ctx.AdManager.showInterstitial(); await ctx.processAndDownload(extractedText, outName + '_Extracted.txt', 'text/plain'); }, false);
            finish(); return;
        }

        // page rotation + deletions + blank pages (in edit / rotate mode only)
        live.forEach(p => { if (!p.blank && (mode === 'edit' || mode === 'rotate') && p.rot !== p.native) srcPages[p.id].setRotation(L.degrees(p.rot)); });
        if (mode === 'edit') {
            S.pages.filter(p => p.deleted && !p.blank).map(p => p.src).sort((a, b) => b - a).forEach(i => doc.removePage(i));
            live.forEach((p, idx) => { if (p.blank) doc.insertPage(idx, [p.w, p.h]); });
        }
        const bytes = await doc.save();
        ctx.showSuccessResult(origSize, bytes.length, title, async () => { await ctx.AdManager.showInterstitial(); await ctx.processAndDownload(bytes, outName + suffix + '.pdf', 'application/pdf'); }, true);
        finish();
    });
    function finish() { S.dirty = false; S.ctx.closeEditor(false); }
}
