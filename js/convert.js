// Document converters: Word->PDF, Excel->PDF, PDF->Word, PDF->Excel (all in the browser)
import { buildBlocks, detectFont, sampleFg, rgbHex } from './ed-shared.js';
import { parseXlsx, parseCsv, sheetFromRows, buildXlsx, formatValue } from './xlsx-lite.js';
import { buildDocx, groupLines, columnsFromLines, colIndex } from './docx-lite.js';

const loaded = {};
export function loadScript(urls, check) {
    urls = [].concat(urls); const key = urls[0];
    if (loaded[key]) return loaded[key];
    return loaded[key] = (async () => {
        if (check && check()) return;
        for (const u of urls) {
            try { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load ' + u)); }; document.head.appendChild(s); }); if (!check || check()) return; } catch (e) { /* try next mirror */ }
        }
        delete loaded[key]; throw new Error('Could not load a required library. Please check your internet connection and try again.');
    })();
}
const PT = 0.75; // css px -> pt
const PAGES = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] };

// ---- searchable (invisible) text layer helper
function safeText(font, s) { try { font.encodeText(s); return s; } catch (e) { return Array.from(s).map(ch => { try { font.encodeText(ch); return ch; } catch (er) { return '?'; } }).join(''); } }
function addTextLayer(page, font, texts, H) {
    texts.forEach(t => { const s = safeText(font, t.text.replace(/[\r\n\t]/g, ' ')); if (!s.trim()) return; try { page.drawText(s, { x: t.x, y: H - t.y, size: Math.max(2, t.size), font, opacity: 0 }); } catch (e) { } });
}
const canvasJpeg = (cv, q = 0.92) => cv.toDataURL('image/jpeg', q);

// =====================================================================  EXCEL -> PDF
function cellText(c) { return c ? c.v : ''; }
function colPx(sh, c) { const w = sh.colW[c] != null ? sh.colW[c] : sh.defW; return w === 0 ? 0 : Math.round(w * 7 + 5); }
function fontStr(xf, scale = 1) { const f = xf.font || {}; return `${f.i ? 'italic ' : ''}${f.b ? 'bold ' : ''}${(f.sz || 11) * 96 / 72 * scale}px ${JSON.stringify(f.name || 'Calibri')}, Carlito, Calibri, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif`; }

export function renderSheetPages(sh, o) {
    const [pw0, ph0] = PAGES[o.size] || PAGES.A4; const k = o.quality || 2.5;
    const rows = Math.min(sh.rows, 3000), cols = Math.min(sh.cols, 200); if (!rows || !cols) return [];
    const scratch = document.createElement('canvas').getContext('2d');
    const cw = []; let totalW = 0; for (let c = 0; c < cols; c++) {
        cw[c] = colPx(sh, c);
        if (sh.colW[c] == null) for (let r = 0; r < rows; r++) { const cell = sh.cells[r + ',' + c]; if (cell && cell.num && cell.v) { scratch.font = fontStr(cell.xf); cw[c] = Math.max(cw[c], Math.ceil(scratch.measureText(cell.v).width) + 10); } } // Excel auto-widens numeric columns
        totalW += cw[c];
    }
    const merged = {}, covered = new Set(); sh.merges.forEach(m => { merged[m.r1 + ',' + m.c1] = m; for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r + ',' + c); });
    // wrap helper
    const wrapLines = (txt, xf, width) => { scratch.font = fontStr(xf); const out = []; txt.split('\n').forEach(par => { let line = ''; par.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (line && scratch.measureText(t).width > width) { out.push(line); line = w; } else line = t; }); out.push(line); }); return out; };
    const rh = []; for (let r = 0; r < rows; r++) {
        let h = sh.rowH[r] != null ? sh.rowH[r] * 96 / 72 : sh.defH * 96 / 72;
        if (sh.rowH[r] == null) for (let c = 0; c < cols; c++) { const cell = sh.cells[r + ',' + c]; if (cell && cell.v) h = Math.max(h, (cell.xf.font.sz || 11) * 96 / 72 * 1.4); if (cell && cell.xf.wrap && cell.v && !merged[r + ',' + c]) { const n = wrapLines(cell.v, cell.xf, cw[c] - 6).length; h = Math.max(h, n * (cell.xf.font.sz || 11) * 96 / 72 * 1.25 + 4); } }
        rh[r] = h;
    }
    const totalH = rh.reduce((a, b) => a + b, 0);
    let orient = o.orient; const availP = pw0 - 2 * o.margin; if (orient === 'auto') orient = totalW * PT > availP * 1.02 ? 'landscape' : 'portrait';
    const [PW, PH] = orient === 'landscape' ? [ph0, pw0] : [pw0, ph0]; const aw = PW - 2 * o.margin, ah = PH - 2 * o.margin;
    const s = o.fit ? Math.min(1, aw / (totalW * PT)) : 1; const unit = PT * s; // sheet px -> page pt
    // if not fitting, split columns across pages too
    const colGroups = []; if (s < 1 || !o.fit) { let cur = [], w = 0; for (let c = 0; c < cols; c++) { if (cur.length && w + cw[c] * unit > aw) { colGroups.push(cur); cur = []; w = 0; } cur.push(c); w += cw[c] * unit; } if (cur.length) colGroups.push(cur); } else colGroups.push([...Array(cols).keys()]);
    const rowGroups = []; { let cur = [], h = 0; for (let r = 0; r < rows; r++) { if (cur.length && h + rh[r] * unit > ah) { rowGroups.push(cur); cur = []; h = 0; } cur.push(r); h += rh[r] * unit; } if (cur.length) rowGroups.push(cur); }
    const pages = [];
    for (const rg of rowGroups) for (const cg of colGroups) {
        const cv = document.createElement('canvas'); cv.width = Math.ceil(PW * k); cv.height = Math.ceil(PH * k); const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.save(); g.scale(k, k); g.translate(o.margin, o.margin); g.scale(unit, unit);
        const cx = []; let x = 0; cg.forEach(c => { cx[c] = x; x += cw[c]; }); const cy = []; let y = 0; rg.forEach(r => { cy[r] = y; y += rh[r]; });
        const W = x, Hh = y; const texts = [];
        const inView = (r, c) => cx[c] != null && cy[r] != null;
        if (o.grid) { g.strokeStyle = '#d4d4d4'; g.lineWidth = 1; g.beginPath(); cg.forEach(c => { g.moveTo(cx[c] + 0.5, 0); g.lineTo(cx[c] + 0.5, Hh); }); g.moveTo(W + 0.5, 0); g.lineTo(W + 0.5, Hh); rg.forEach(r => { g.moveTo(0, cy[r] + 0.5); g.lineTo(W, cy[r] + 0.5); }); g.moveTo(0, Hh + 0.5); g.lineTo(W, Hh + 0.5); g.stroke(); }
        // fills
        rg.forEach(r => cg.forEach(c => { if (covered.has(r + ',' + c)) return; const cell = sh.cells[r + ',' + c]; if (!cell || !cell.xf.fill) return; const m = merged[r + ',' + c]; let w = cw[c], h = rh[r]; if (m) { w = 0; h = 0; for (let cc = m.c1; cc <= m.c2; cc++) w += cx[cc] != null ? cw[cc] : 0; for (let rr = m.r1; rr <= m.r2; rr++) h += cy[rr] != null ? rh[rr] : 0; } g.fillStyle = cell.xf.fill; g.fillRect(cx[c], cy[r], w, h); }));
        // text + borders
        rg.forEach(r => cg.forEach(c => {
            if (covered.has(r + ',' + c)) return; const cell = sh.cells[r + ',' + c]; if (!cell) return; const m = merged[r + ',' + c];
            let w = cw[c], h = rh[r]; if (m) { w = 0; h = 0; for (let cc = m.c1; cc <= m.c2; cc++) w += cx[cc] != null ? cw[cc] : 0; for (let rr = m.r1; rr <= m.r2; rr++) h += cy[rr] != null ? rh[rr] : 0; }
            const xf = cell.xf, X = cx[c], Y = cy[r], bd = xf.border || {};
            const line = (b, x1, y1, x2, y2) => { if (!b) return; g.strokeStyle = b.color; g.lineWidth = b.style === 'thick' ? 3 : b.style === 'medium' ? 2 : 1; g.setLineDash(/dash/.test(b.style) ? [4, 3] : /dot/i.test(b.style) ? [1.5, 2] : []); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
            line(bd.t, X, Y, X + w, Y); line(bd.b, X, Y + h, X + w, Y + h); line(bd.l, X, Y, X, Y + h); line(bd.r, X + w, Y, X + w, Y + h);
            const txt = cellText(cell); if (!txt) return;
            const fs = (xf.font.sz || 11) * 96 / 72; g.font = fontStr(xf); g.fillStyle = xf.font.color || '#000'; g.textBaseline = 'alphabetic';
            const ha = xf.h && xf.h !== 'general' ? xf.h : (cell.num ? 'right' : 'left'); const pad = 3;
            let lines = xf.wrap || txt.includes('\n') ? wrapLines(txt, xf, w - pad * 2) : [txt]; const lh = fs * 1.2;
            let availL = w - pad * 2, startX = X + pad;
            if (lines.length === 1 && !xf.wrap && ha === 'left') { let extra = 0, cc = c + 1; while (cc < cols && cx[cc] != null && !sh.cells[r + ',' + cc] && g.measureText(txt).width > availL + extra) { extra += cw[cc]; cc++; } availL += extra; }
            g.save(); g.beginPath(); g.rect(X + 1, Y + 1, (lines.length === 1 && !xf.wrap && ha === 'left' ? Math.max(w, availL + pad * 2) : w) - 2, h - 2); g.clip();
            const totalLH = lines.length * lh; let top = xf.v === 'top' ? Y + 2 : xf.v === 'center' ? Y + (h - totalLH) / 2 : Y + h - totalLH - 2;
            lines.forEach((ln, i) => {
                const tw = g.measureText(ln).width; let tx = ha === 'center' || ha === 'centerContinuous' ? X + (w - tw) / 2 : ha === 'right' ? X + w - pad - tw : startX; const by = top + i * lh + fs;
                g.fillText(ln, tx, by); if (xf.font.u) { g.fillRect(tx, by + 1.5, tw, 1); }
                texts.push({ text: ln, x: o.margin + tx * unit, y: o.margin + by * unit, size: fs * unit });
            });
            g.restore();
        }));
        g.restore(); pages.push({ w: PW, h: PH, cv, texts });
    }
    return pages;
}

export async function excelToPdf(file, o, ctx) {
    const L = ctx.PDFLIB; const name = file.name.toLowerCase(); let sheets;
    if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) { sheets = [sheetFromRows('Sheet1', parseCsv(await file.text()))]; }
    else if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) sheets = await parseXlsx(await file.arrayBuffer(), ctx.JSZip);
    else { // .xls / .ods via SheetJS (loaded on demand)
        await loadScript(['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'], () => window.XLSX);
        const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        sheets = wb.SheetNames.map(n => sheetFromRows(n, window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })));
    }
    sheets = sheets.filter(s => s.rows && s.cols); if (!sheets.length) throw new Error('This spreadsheet is empty.');
    const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica); let count = 0;
    try { await document.fonts.ready; } catch (e) { }
    for (const sh of sheets) {
        const pages = renderSheetPages(sh, o);
        for (const pg of pages) {
            const img = await doc.embedJpg(canvasJpeg(pg.cv)); const page = doc.addPage([pg.w, pg.h]); page.drawImage(img, { x: 0, y: 0, width: pg.w, height: pg.h });
            addTextLayer(page, font, pg.texts, pg.h); pg.cv.width = pg.cv.height = 0; count++;
        }
    }
    if (!count) throw new Error('Nothing to print in this spreadsheet.');
    doc.setTitle(file.name.replace(/\.[^.]+$/, '')); doc.setProducer('Amazing PDF');
    return await doc.save();
}

// =====================================================================  WORD -> PDF
export async function wordToPdf(file, ctx, onProgress) {
    if (!/\.docx$/i.test(file.name)) throw new Error('Please choose a .docx file. (Old .doc files: open them in Word and "Save As" .docx first.)');
    window.JSZip = window.JSZip || ctx.JSZip;
    await loadScript(['https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js', 'https://unpkg.com/docx-preview@0.3.5/dist/docx-preview.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview/dist/docx-preview.min.js'], () => window.docx && window.docx.renderAsync);
    const preview = window.docx;
    await loadScript(['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'], () => window.html2canvas);
    const L = ctx.PDFLIB; const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;z-index:-99999;background:#fff;pointer-events:none;width:max-content;';
    const st = document.createElement('style'); st.textContent = '.aw-host .docx-wrapper{background:#fff!important;padding:0!important;display:block!important}.aw-host .docx-wrapper>section.docx{box-shadow:none!important;margin:0!important;color:#000}'; host.className = 'aw-host'; host.appendChild(st);
    document.body.appendChild(host);
    try {
        await preview.renderAsync(await file.arrayBuffer(), host, null, { className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, useBase64URL: true });
        try { await document.fonts.ready; } catch (e) { }
        const imgs = Array.from(host.querySelectorAll('img')); await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
        await new Promise(r => setTimeout(r, 150));
        const secs = Array.from(host.querySelectorAll('section.docx')); if (!secs.length) throw new Error('Could not read this Word document.');
        const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica); const k = secs.length > 40 ? 1.5 : 2;
        for (let i = 0; i < secs.length; i++) {
            const sec = secs[i]; const r = sec.getBoundingClientRect(); const W = r.width * PT, H = r.height * PT; if (onProgress) onProgress(i + 1, secs.length);
            const texts = []; const tw = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
            while (tw.nextNode()) { const n = tw.currentNode; if (!n.nodeValue.trim() || !n.parentElement) continue; const fsz = parseFloat(getComputedStyle(n.parentElement).fontSize) || 12; const re = /\S+/g; let m; while ((m = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); const b = rg.getBoundingClientRect(); if (b.width < 1) continue; texts.push({ text: m[0], x: (b.left - r.left) * PT, y: (b.top - r.top + b.height * 0.8) * PT, size: fsz * PT }); } }
            const cv = await window.html2canvas(sec, { scale: k, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const img = await doc.embedJpg(canvasJpeg(cv, 0.93)); const page = doc.addPage([W, H]); page.drawImage(img, { x: 0, y: 0, width: W, height: H }); addTextLayer(page, font, texts, H); cv.width = cv.height = 0;
        }
        doc.setTitle(file.name.replace(/\.docx$/i, '')); doc.setProducer('Amazing PDF'); return await doc.save();
    } finally { host.remove(); }
}

// =====================================================================  PDF text extraction (shared)
export async function extractPage(pdf, pageNum, ctx, opt = {}) {
    const page = await pdf.getPage(pageNum); const vp = page.getViewport({ scale: 1 }); let raster = null, scale = 1.6;
    const renderRaster = async () => { raster = document.createElement('canvas'); const v2 = page.getViewport({ scale }); raster.width = Math.floor(v2.width); raster.height = Math.floor(v2.height); const c = raster.getContext('2d', { willReadFrequently: true }); c.fillStyle = '#fff'; c.fillRect(0, 0, raster.width, raster.height); await page.render({ canvasContext: c, viewport: v2 }).promise; };
    if (opt.raster) await renderRaster(); // rendering loads the real font names (bold/italic detection)
    const tc = await page.getTextContent(); const cache = {};
    const fontInfo = (fn) => { if (cache[fn]) return cache[fn]; let nm = ''; try { nm = page.commonObjs.get(fn).name || ''; } catch (e) { } if (!nm && tc.styles[fn]) nm = tc.styles[fn].fontFamily || ''; return cache[fn] = { ...detectFont(nm), fontName: nm }; };
    let blocks = buildBlocks(tc.items, tc.styles, vp, fontInfo);
    if (!raster && !blocks.length && opt.ocr) await renderRaster();
    let ocred = false;
    if (!blocks.length && opt.ocr && ctx.ocrCanvas) { blocks = await ctx.ocrCanvas(raster, scale, opt.lang); ocred = true; }
    if (raster && opt.colors !== false) blocks.forEach(b => { const bg = '#ffffff'; b.color = ocred ? '#000000' : sampleFg(raster, b.x * scale, (b.base - b.size * 0.85) * scale, b.w * scale, b.size * scale, bg); });
    return { page, vp, blocks, raster, scale, hasText: tc.items.some(i => i.str && i.str.trim()) || ocred };
}

export async function pageImages(page, vp, raster, scale, pdfjs) {
    const out = []; if (!raster) return out; const OPS = pdfjs.OPS; const ol = await page.getOperatorList(); const stack = []; let ctm = [1, 0, 0, 1, 0, 0];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    for (let i = 0; i < ol.fnArray.length; i++) {
        const fn = ol.fnArray[i], a = ol.argsArray[i];
        if (fn === OPS.save) stack.push(ctm.slice()); else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; else if (fn === OPS.transform) ctm = mul(ctm, a);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
            const m = mul(vp.transform, ctm); const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]], ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
            const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y; if (w < 8 || h < 8) continue; out.push({ x, y, w, h });
        }
    }
    const res = [];
    for (const b of out.slice(0, 40)) { const sx = Math.max(0, Math.floor(b.x * scale)), sy = Math.max(0, Math.floor(b.y * scale)), sw = Math.min(raster.width - sx, Math.ceil(b.w * scale)), sh = Math.min(raster.height - sy, Math.ceil(b.h * scale)); if (sw < 4 || sh < 4) continue; const c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').drawImage(raster, sx, sy, sw, sh, 0, 0, sw, sh); const url = c.toDataURL('image/png'); res.push({ ...b, ext: 'png', data: Uint8Array.from(atob(url.split(',')[1]), ch => ch.charCodeAt(0)) }); }
    return res;
}

// =====================================================================  PDF -> WORD
export async function pdfToWord(file, o, ctx, onProgress) {
    const pdf = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const pages = []; let scannedNoOcr = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
        if (onProgress) onProgress(i, pdf.numPages);
        if (o.mode === 'exact') { // each page as a picture, exact look
            const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 1 }); const v2 = page.getViewport({ scale: 2 }); const cv = document.createElement('canvas'); cv.width = v2.width; cv.height = v2.height; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); await page.render({ canvasContext: c, viewport: v2 }).promise;
            const url = cv.toDataURL('image/jpeg', 0.9); pages.push({ w: vp.width, h: vp.height, blocks: [], images: [{ x: 0, y: 0, w: vp.width, h: vp.height, ext: 'jpeg', data: Uint8Array.from(atob(url.split(',')[1]), ch => ch.charCodeAt(0)) }] }); cv.width = cv.height = 0; continue;
        }
        const ex = await extractPage(pdf, i, ctx, { raster: true, ocr: o.ocr, lang: o.lang });
        let images = []; if (ex.blocks.length || !o.ocr) { try { images = await pageImages(ex.page, ex.vp, ex.raster, ex.scale, ctx.pdfjsLib); } catch (e) { console.warn('img', e); } }
        if (!ex.hasText) { scannedNoOcr++; const url = ex.raster.toDataURL('image/jpeg', 0.9); images = [{ x: 0, y: 0, w: ex.vp.width, h: ex.vp.height, ext: 'jpeg', data: Uint8Array.from(atob(url.split(',')[1]), ch => ch.charCodeAt(0)) }]; }
        pages.push({ w: ex.vp.width, h: ex.vp.height, blocks: ex.blocks, images }); if (ex.raster) ex.raster.width = ex.raster.height = 0;
    }
    return { bytes: await buildDocx(pages, ctx.JSZip, o.mode === 'flow'), scanned: scannedNoOcr };
}

// =====================================================================  PDF -> EXCEL
const NUM = /^\(?[-+]?[$₹€£¥]?\s?\d[\d,]*(\.\d+)?\s?%?\)?$/;
export function toCell(s, bold) {
    const t = s.trim(); if (NUM.test(t) && !/^0\d+$/.test(t) && !(t.length > 15)) { let neg = /^\(.*\)$/.test(t) || t.includes('-'); const pct = t.includes('%'); let n = parseFloat(t.replace(/[^\d.]/g, '')); if (!isNaN(n)) { if (neg) n = -n; if (pct) n /= 100; return { n, pct, dec: /\.\d/.test(t) }; } }
    return { v: s, bold };
}
export function blocksToRows(blocks) {
    const lines = groupLines(blocks); const cols = columnsFromLines(lines, 4); const rows = [];
    lines.forEach(l => { const row = []; l.blocks.forEach(b => { let ci = l.blocks.length > 1 || cols.length ? colIndex(cols.length ? cols : [{ x0: b.x, x1: b.x + b.w }], b) : 0; if (l.blocks.length === 1 && cols.length) { ci = 0; for (let i = 0; i < cols.length; i++) if (b.x >= cols[i].x0 - 3) ci = i; } if (row[ci]) row[ci] = { v: row[ci].v + ' ' + b.str }; else row[ci] = toCell(b.str, b.bold); }); rows.push(row); });
    return { rows, cols };
}
export async function pdfToExcel(file, o, ctx, onProgress) {
    const pdf = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const sheets = []; let any = false;
    for (let i = 1; i <= pdf.numPages; i++) {
        if (onProgress) onProgress(i, pdf.numPages); const ex = await extractPage(pdf, i, ctx, { raster: !!o.ocr, ocr: o.ocr, lang: o.lang, colors: false }); if (ex.raster) ex.raster.width = ex.raster.height = 0;
        if (!ex.blocks.length) { sheets.push({ name: 'Page ' + i, rows: [], widths: [] }); continue; } any = true;
        const { rows, cols } = blocksToRows(ex.blocks); sheets.push({ name: 'Page ' + i, rows, widths: cols.length ? cols.map(c => (c.x1 - c.x0) / 5.2 + 2) : [60] });
    }
    if (!any) throw new Error('No selectable text was found in this PDF (it looks scanned). Tick "Scanned PDF (OCR)" and try again.');
    let out = sheets; if (!o.perPage) { const rows = [], widths = []; sheets.forEach((s, i) => { if (i && rows.length) rows.push([]); s.rows.forEach(r => rows.push(r)); s.widths.forEach((w, k) => widths[k] = Math.max(widths[k] || 0, w)); }); out = [{ name: 'Sheet1', rows, widths }]; }
    else out = sheets.filter(s => s.rows.length);
    return await buildXlsx(out, ctx.JSZip);
}
