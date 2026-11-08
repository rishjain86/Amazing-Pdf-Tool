// Pro tools: OCR Scanner, Batch Processing, Smart Vault (all run on-device except OCR language data download)
import { loadScript } from './convert.js';
import { drawInvisibleUnicode, needsUnicode } from './unifont.js';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const card = 'background:rgba(0,0,0,.2);padding:20px;border-radius:12px;border:1px solid var(--glass-border);margin-bottom:16px';
const inp = 'width:100%;padding:12px;border-radius:8px;border:1px solid var(--glass-border);background:rgba(0,0,0,.3);color:white;margin-bottom:12px';
const btn = (c) => `background:${c};color:white;border:none;padding:13px 22px;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;width:100%;margin-top:6px`;
const fileRow = (name, extra = '') => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(255,255,255,.05);border-radius:8px;border:1px solid var(--glass-border);margin-bottom:8px;gap:8px"><span class="text-ellipsis">${esc(name)}</span>${extra}</div>`;
const sizeOk = (f, mb) => f.size <= mb * 1048576;
const b64u8 = (url) => Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));

// =============================================================== OCR
let tessWorker = null, tessLang = null;
async function getWorker(lang, onStatus) {
    await loadScript(['https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js'], () => window.Tesseract);
    if (tessWorker && tessLang === lang) return tessWorker;
    if (tessWorker) { try { await tessWorker.terminate(); } catch (e) { } tessWorker = null; }
    tessWorker = await window.Tesseract.createWorker(lang, 1, { logger: m => { if (onStatus && m.status) onStatus(m.status, m.progress); } });
    tessLang = lang; return tessWorker;
}
// -> blocks in PDF points (scale = canvas px per pt)
export async function ocrCanvas(cv, scale, lang = 'eng', onStatus) {
    const w = await getWorker(lang, onStatus); const { data } = await w.recognize(cv, {}, { blocks: true });
    const out = []; const lines = [];
    (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => lines.push(l))));
    if (!lines.length && data.lines) data.lines.forEach(l => lines.push(l));
    lines.forEach(l => { const t = (l.text || '').replace(/\s+$/, ''); if (!t.trim()) return; const bb = l.bbox, bl = l.baseline; const h = (bb.y1 - bb.y0) / scale; out.push({ str: t, x: bb.x0 / scale, base: bb.y1 / scale - h * 0.2, size: Math.max(6, h * 0.8), w: (bb.x1 - bb.x0) / scale, family: 'sans', bold: false, italic: false, fontName: 'Arial', color: '#000000' }); });
    return out;
}

function initOCR(ctx, root) {
    const { PDFLIB: L, pdfjsLib } = ctx; let files = [];
    root.innerHTML = `
    <div id="ocr-drop" style="border:2px dashed #10b981;border-radius:16px;padding:36px 20px;text-align:center;cursor:pointer;background:rgba(16,185,129,.05);margin-bottom:16px">
        <i class="fas fa-eye" style="font-size:3rem;color:#10b981;margin-bottom:12px"></i><h3>Select scanned images or a PDF</h3>
        <p style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">JPG, PNG, WEBP or PDF - multiple files allowed</p>
        <input type="file" id="ocr-file" multiple accept="image/*,application/pdf,.pdf" style="display:none"></div>
    <div id="ocr-list"></div>
    <div id="ocr-opts" style="${card};display:none">
        <label style="color:var(--text-secondary);font-size:.9rem">Document language</label>
        <select id="ocr-lang" style="${inp}"><option value="eng">English</option><option value="hin">Hindi (Devanagari)</option><option value="eng+hin">English + Hindi</option><option value="guj">Gujarati</option><option value="mar">Marathi</option><option value="ben">Bengali</option><option value="tam">Tamil</option><option value="tel">Telugu</option><option value="urd">Urdu</option><option value="spa">Spanish</option><option value="fra">French</option><option value="deu">German</option></select>
        <label style="color:var(--text-secondary);font-size:.9rem">Output</label>
        <select id="ocr-out" style="${inp}"><option value="pdf">Searchable PDF (looks the same, text can be selected)</option><option value="txt">Plain text (.txt)</option><option value="docx">Editable Word (.docx)</option></select>
        <p style="font-size:.75rem;color:#94a3b8;margin-bottom:8px">First use downloads the language data (a few MB). Your files are processed on this device.</p>
        <button id="ocr-go" style="${btn('#10b981')}"><i class="fas fa-eye"></i> Start OCR</button></div>`;
    const $ = (id) => root.querySelector('#' + id);
    const render = () => { $('ocr-list').innerHTML = files.map((f, i) => fileRow(f.name, `<button data-i="${i}" style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer"><i class="fas fa-times"></i></button>`)).join(''); $('ocr-opts').style.display = files.length ? 'block' : 'none'; $('ocr-drop').style.display = files.length ? 'none' : 'block'; $('ocr-list').querySelectorAll('button').forEach(b => b.onclick = () => { files.splice(+b.dataset.i, 1); render(); }); };
    const add = (fl) => { files.push(...Array.from(fl).filter(f => /^image\//.test(f.type) || /\.(pdf|jpe?g|png|webp|bmp)$/i.test(f.name))); render(); };
    $('ocr-drop').onclick = () => $('ocr-file').click(); $('ocr-file').onchange = (e) => { add(e.target.files); e.target.value = ''; };
    ctx.enableDrop($('ocr-drop'), add);
    $('ocr-go').onclick = () => ctx.simulateLoadingAndProcess('Running OCR', async () => {
        const lang = $('ocr-lang').value, mode = $('ocr-out').value; const status = (s, p) => { const t = document.getElementById('action-title'); if (t) t.textContent = `OCR: ${s}${p != null ? ' ' + Math.round(p * 100) + '%' : ''}`; };
        const pagesRaster = []; // {canvas, w, h (pt)}
        for (const f of files) {
            if (/pdf$/i.test(f.name) || f.type === 'application/pdf') {
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
                for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const vp1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 2.2 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); await pg.render({ canvasContext: c, viewport: vp }).promise; pagesRaster.push({ cv, w: vp1.width, h: vp1.height, scale: 2.2 }); }
            } else {
                const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read image ' + f.name)); i.src = url; });
                const k = Math.min(1, 2600 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height);
                const w = 595.28, sc = cv.width / w; pagesRaster.push({ cv, w, h: cv.height / sc, scale: sc });
            }
        }
        const results = []; let n = 0;
        for (const pr of pagesRaster) { n++; status(`page ${n}/${pagesRaster.length}`); results.push(await ocrCanvas(pr.cv, pr.scale, lang, (s, p) => status(`page ${n}/${pagesRaster.length} - ${s}`, p))); }
        const base = (files[0].name.replace(/\.[^.]+$/, '') || 'Scanned') + '_OCR'; const totalChars = results.flat().reduce((a, b) => a + b.str.length, 0);
        if (!totalChars) { ctx.hideProcessingUI(); ctx.showCustomAlert('No text could be recognised. Try a clearer / straighter scan, or choose the correct language.'); return; }
        let bytes, name, type;
        if (mode === 'txt') { bytes = new TextEncoder().encode(results.map((r, i) => `--- Page ${i + 1} ---\n` + r.map(b => b.str).join('\n')).join('\n\n')); name = base + '.txt'; type = 'text/plain'; }
        else if (mode === 'docx') { const { buildDocx } = await import('./docx-lite.js'); bytes = await buildDocx(pagesRaster.map((pr, i) => ({ w: pr.w, h: pr.h, blocks: results[i], images: [] })), ctx.JSZip, true); name = base + '.docx'; type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
        else {
            const doc = await L.PDFDocument.create(); const font = await doc.embedFont(L.StandardFonts.Helvetica);
            for (let i = 0; i < pagesRaster.length; i++) { const pr = pagesRaster[i]; const img = await doc.embedJpg(pr.cv.toDataURL('image/jpeg', 0.85)); const page = doc.addPage([pr.w, pr.h]); page.drawImage(img, { x: 0, y: 0, width: pr.w, height: pr.h });
                for (const b of results[i]) { let s = b.str; const size = Math.max(4, b.size); if (needsUnicode(s) && await drawInvisibleUnicode(doc, L, page, s, b.x, pr.h - b.base, size, font)) continue; try { font.encodeText(s); } catch (e) { s = Array.from(s).map(ch => { try { font.encodeText(ch); return ch; } catch (er) { return ''; } }).join(''); } if (!s.trim()) continue; const wd = font.widthOfTextAtSize(s, size); const sx = wd > 0 ? b.w / wd : 1; try { page.drawText(s, { x: b.x, y: pr.h - b.base, size: size * Math.min(1.6, Math.max(0.5, sx)), font, opacity: 0 }); } catch (e) { } } }
            bytes = await doc.save(); name = base + '.pdf'; type = 'application/pdf';
        }
        pagesRaster.forEach(p => { p.cv.width = p.cv.height = 0; }); const total = files.reduce((a, f) => a + f.size, 0); files = []; render();
        window.__pendingShare = { bytes, filename: name, type };
        ctx.showSuccessResult(total, bytes.length, 'OCR Complete!', async () => { await ctx.AdManager.showInterstitial(); await ctx.processAndDownload(bytes, name, type); }, true);
    });
}

// =============================================================== BATCH
function initBatch(ctx, root) {
    const { PDFLIB: L, JSZip, pdfjsLib, ops, convert } = ctx; let files = [];
    const OPS = {
        compress: { label: 'Compress PDFs', accept: 'pdf', run: (f) => ops.compressPdf(f) },
        pdf2jpg: { label: 'PDF to JPG (ZIP of images per file)', accept: 'pdf', run: null },
        rotate: { label: 'Rotate all pages', accept: 'pdf', opt: `<select id="b-rot" style="${inp}"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counter-clockwise</option></select>`, run: async (f, g) => { const d = await L.PDFDocument.load(await f.arrayBuffer()); d.getPages().forEach(p => p.setRotation(L.degrees((p.getRotation().angle + +g('b-rot')) % 360))); return d.save(); } },
        numbers: { label: 'Add page numbers (bottom centre)', accept: 'pdf', run: async (f) => { const d = await L.PDFDocument.load(await f.arrayBuffer()); const font = await d.embedFont(L.StandardFonts.Helvetica); const pgs = d.getPages(); pgs.forEach((p, i) => { const { width } = p.getSize(); const t = `${i + 1} / ${pgs.length}`; p.drawText(t, { x: width / 2 - font.widthOfTextAtSize(t, 10) / 2, y: 22, size: 10, font, color: L.rgb(0.2, 0.2, 0.2) }); }); return d.save(); } },
        watermark: { label: 'Add text watermark (diagonal)', accept: 'pdf', opt: `<input id="b-wm" style="${inp}" placeholder="Watermark text, e.g. CONFIDENTIAL" value="CONFIDENTIAL">`, run: async (f, g) => { const d = await L.PDFDocument.load(await f.arrayBuffer()); const font = await d.embedFont(L.StandardFonts.HelveticaBold); const txt = (g('b-wm') || 'CONFIDENTIAL').replace(/[^\x20-\x7E]/g, ''); d.getPages().forEach(p => { const { width, height } = p.getSize(); const size = Math.min(width, height) / 9; const w = font.widthOfTextAtSize(txt, size); const a = Math.PI / 4; p.drawText(txt, { x: width / 2 - (w / 2) * Math.cos(a) + size * 0.35 * Math.sin(a), y: height / 2 - (w / 2) * Math.sin(a) - size * 0.35 * Math.cos(a), size, font, color: L.rgb(0.6, 0.6, 0.6), opacity: 0.3, rotate: L.degrees(45) }); }); return d.save(); } },
        flatten: { label: 'Flatten forms', accept: 'pdf', run: async (f) => { const d = await L.PDFDocument.load(await f.arrayBuffer()); try { d.getForm().flatten(); } catch (e) { } return d.save(); } },
        cleanannots: { label: 'Remove annotations', accept: 'pdf', run: async (f) => { const d = await L.PDFDocument.load(await f.arrayBuffer()); d.getPages().forEach(p => p.node.delete(L.PDFName.of('Annots'))); return d.save(); } },
        metadata: { label: 'Clear metadata (title/author/etc.)', accept: 'pdf', run: async (f) => { const d = await L.PDFDocument.load(await f.arrayBuffer(), { updateMetadata: false }); d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]); d.setCreator(''); d.setProducer('Amazing PDF'); return d.save({ updateFieldAppearances: false }); } },
        a4: { label: 'Resize pages to A4', accept: 'pdf', run: (f) => ops.resizePdf(f, 'A4') },
        pdf2word: { label: 'PDF to Word', accept: 'pdf', run: async (f) => (await convert.pdfToWord(f, { mode: 'layout' }, ctx)).bytes, ext: '.docx' },
        pdf2excel: { label: 'PDF to Excel', accept: 'pdf', run: (f) => convert.pdfToExcel(f, { perPage: true }, ctx), ext: '.xlsx' },
        word2pdf: { label: 'Word to PDF', accept: 'docx', run: (f) => convert.wordToPdf(f, ctx), ext: '.pdf' },
        excel2pdf: { label: 'Excel to PDF', accept: 'xlsx', run: (f) => convert.excelToPdf(f, { size: 'A4', orient: 'auto', margin: 28, fit: true, grid: true, quality: 2 }, ctx), ext: '.pdf' },
        img2pdf: { label: 'Images to PDF (one PDF per image)', accept: 'img', run: (f) => ops.imageToPdf(f), ext: '.pdf' }
    };
    const accepts = { pdf: '.pdf,application/pdf', docx: '.docx', xlsx: '.xlsx,.xls,.csv,.ods', img: 'image/*' };
    root.innerHTML = `<div style="${card}"><label style="color:var(--text-secondary);font-size:.9rem">What should be done to every file?</label>
        <select id="b-op" style="${inp}">${Object.entries(OPS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select><div id="b-opt"></div></div>
        <div id="b-drop" style="border:2px dashed #f59e0b;border-radius:16px;padding:30px 20px;text-align:center;cursor:pointer;background:rgba(245,158,11,.05);margin-bottom:16px"><i class="fas fa-layer-group" style="font-size:2.6rem;color:#f59e0b;margin-bottom:10px"></i><h3>Add files (or a ZIP)</h3><input type="file" id="b-file" multiple style="display:none"></div>
        <div id="b-list"></div><button id="b-go" style="${btn('#f59e0b')};display:none"><i class="fas fa-play"></i> Process all files</button>`;
    const $ = (id) => root.querySelector('#' + id); const g = (id) => { const e = root.querySelector('#' + id); return e ? e.value : ''; };
    const op = () => OPS[$('b-op').value];
    const match = (f) => { const a = op().accept, n = f.name.toLowerCase(); return a === 'pdf' ? /\.pdf$/.test(n) : a === 'docx' ? /\.docx$/.test(n) : a === 'xlsx' ? /\.(xlsx|xls|csv|ods)$/.test(n) : /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/.test(n); };
    const refresh = () => { $('b-opt').innerHTML = op().opt || ''; $('b-file').accept = accepts[op().accept] + ',.zip'; draw(); };
    const draw = () => { $('b-list').innerHTML = files.map((f, i) => fileRow(f.name, `<span style="color:${match(f) ? '#10b981' : '#ef4444'};font-size:.75rem;flex-shrink:0">${match(f) ? (f.size / 1048576).toFixed(1) + ' MB' : 'wrong type'}</span><button data-i="${i}" style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer"><i class="fas fa-times"></i></button>`)).join(''); $('b-go').style.display = files.length ? 'block' : 'none'; $('b-list').querySelectorAll('button').forEach(b => b.onclick = () => { files.splice(+b.dataset.i, 1); draw(); }); };
    $('b-op').onchange = refresh; refresh();
    const add = async (fl) => { for (const f of Array.from(fl)) { if (/\.zip$/i.test(f.name)) { const z = await new JSZip().loadAsync(f); for (const n of Object.keys(z.files)) { if (z.files[n].dir) continue; const bn = n.split('/').pop(); if (bn.startsWith('.') || bn.startsWith('__')) continue; files.push(new File([await z.files[n].async('blob')], bn)); } } else files.push(f); } draw(); };
    $('b-drop').onclick = () => $('b-file').click(); $('b-file').onchange = (e) => { add(e.target.files); e.target.value = ''; }; ctx.enableDrop($('b-drop'), add);
    $('b-go').onclick = () => {
        const sel = op(); const todo = files.filter(match); if (!todo.length) { ctx.showCustomAlert('None of the added files match this operation.'); return; }
        ctx.simulateLoadingAndProcess(`Batch: ${sel.label}`, async () => {
            const zip = new JSZip(); const failed = []; const used = {}; let done = 0; const title = document.getElementById('action-title');
            for (const f of todo) {
                if (title) title.textContent = `Batch ${++done}/${todo.length}: ${f.name.slice(0, 28)}`;
                try {
                    const base = f.name.replace(/\.[^.]+$/, '');
                    if ($('b-op').value === 'pdf2jpg') { const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 2 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); await pg.render({ canvasContext: c, viewport: vp }).promise; zip.file(`${base}/Page_${i}.jpg`, cv.toDataURL('image/jpeg', 0.9).split(',')[1], { base64: true }); cv.width = 0; } continue; }
                    const out = await sel.run(f, g); let nm = base + '_' + ($('b-op').value) + (sel.ext || '.pdf'); used[nm] = (used[nm] || 0) + 1; if (used[nm] > 1) nm = nm.replace(/(\.[^.]+)$/, `_${used[nm]}$1`); zip.file(nm, out);
                } catch (e) { failed.push(f.name + ' (' + (e.message || 'error') + ')'); }
            }
            if (failed.length === todo.length) throw new Error('All files failed: ' + failed[0]);
            const bytes = await zip.generateAsync({ type: 'uint8array' }); const total = todo.reduce((a, f) => a + f.size, 0); files = []; draw();
            if (failed.length) ctx.showCustomAlert(`${failed.length} file(s) could not be processed:<br>${failed.slice(0, 5).map(esc).join('<br>')}`);
            window.__pendingShare = { bytes, filename: 'Amazing_Batch_' + $('b-op').value + '.zip', type: 'application/zip' };
            ctx.showSuccessResult(total, bytes.length, `Batch complete (${todo.length - failed.length}/${todo.length})`, async () => { await ctx.AdManager.showInterstitial(); await ctx.processAndDownload(bytes, 'Amazing_Batch_' + $('b-op').value + '.zip', 'application/zip'); }, false);
        });
    };
}

// =============================================================== SMART VAULT
const VDB = 'AmazingPDFVault', VMETA = 'meta', VDOCS = 'docs';
const vopen = () => new Promise((res, rej) => { const r = indexedDB.open(VDB, 1); r.onupgradeneeded = () => { r.result.createObjectStore(VMETA); r.result.createObjectStore(VDOCS, { keyPath: 'id', autoIncrement: true }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const vreq = (db, store, mode, fn) => new Promise((res, rej) => { const tx = db.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const kdf = async (pass, salt) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); };
const enc = async (key, data) => { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; };
const dec = async (key, buf) => { const u = new Uint8Array(buf); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))); };
const CATS = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID', 'Bank / Cheque', 'Certificate', 'Other'];

function initVault(ctx, root) {
    let key = null, db = null, timer = null; const AUTO = 3 * 60 * 1000;
    const $ = (s) => root.querySelector(s);
    const lock = () => { key = null; clearTimeout(timer); showLogin(); };
    const touch = () => { clearTimeout(timer); timer = setTimeout(lock, AUTO); };
    root.addEventListener('pointerdown', () => { if (key) touch(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && key) lock(); });
    async function showLogin() {
        db = db || await vopen(); const meta = await vreq(db, VMETA, 'readonly', s => s.get('verifier'));
        if (!(window.crypto && crypto.subtle)) { root.innerHTML = `<div style="${card}">Secure storage is not available in this browser.</div>`; return; }
        if (!meta) {
            root.innerHTML = `<div style="${card}"><h3 style="margin-bottom:8px"><i class="fas fa-user-shield" style="color:#14b8a6"></i> Create your Smart Vault</h3>
            <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:14px">Store Aadhaar, PAN and other documents encrypted on this device only. Nothing is uploaded. Choose a strong passphrase (at least 6 characters, a mix of letters and numbers is best).</p>
            <input id="v-p1" type="password" placeholder="Passphrase" style="${inp}" autocomplete="new-password"><input id="v-p2" type="password" placeholder="Repeat passphrase" style="${inp}" autocomplete="new-password">
            <p style="color:#fbbf24;font-size:.8rem;margin-bottom:10px"><i class="fas fa-exclamation-triangle"></i> If you forget the passphrase the documents cannot be recovered. Clearing the app data or browser data also deletes the vault.</p>
            <button id="v-create" style="${btn('#14b8a6')}">Create Vault</button></div>`;
            $('#v-create').onclick = async () => { const a = $('#v-p1').value, b = $('#v-p2').value; if (a.length < 6) return ctx.showCustomAlert('Passphrase must be at least 6 characters.'); if (a !== b) return ctx.showCustomAlert('Passphrases do not match.'); const salt = crypto.getRandomValues(new Uint8Array(16)); const k = await kdf(a, salt); const ver = await enc(k, new TextEncoder().encode('amazing-vault-ok')); await vreq(db, VMETA, 'readwrite', s => s.put({ salt, ver }, 'verifier')); key = k; touch(); showMain(); };
        } else {
            root.innerHTML = `<div style="${card}"><h3 style="margin-bottom:12px"><i class="fas fa-lock" style="color:#14b8a6"></i> Smart Vault is locked</h3><input id="v-pass" type="password" placeholder="Enter passphrase" style="${inp}" autocomplete="current-password"><button id="v-open" style="${btn('#14b8a6')}">Unlock</button>
            <div style="text-align:center;margin-top:14px"><a id="v-reset" style="color:#ef4444;font-size:.8rem;cursor:pointer">Forgot passphrase? Erase the vault</a></div></div>`;
            const go = async () => { try { const k = await kdf($('#v-pass').value, meta.salt); const t = new TextDecoder().decode(await dec(k, meta.ver)); if (t !== 'amazing-vault-ok') throw 0; key = k; touch(); showMain(); } catch (e) { ctx.showCustomAlert('Wrong passphrase.'); } };
            $('#v-open').onclick = go; $('#v-pass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
            $('#v-reset').onclick = async () => { if (!confirm('This permanently deletes ALL documents in the vault. Continue?')) return; await vreq(db, VDOCS, 'readwrite', s => s.clear()); await vreq(db, VMETA, 'readwrite', s => s.clear()); showLogin(); };
        }
    }
    async function showMain() {
        const docs = await vreq(db, VDOCS, 'readonly', s => s.getAll());
        const rows = [];
        for (const d of docs.sort((a, b) => b.date - a.date)) { let nm = '?'; try { nm = new TextDecoder().decode(await dec(key, d.name)); } catch (e) { } rows.push({ ...d, nm }); }
        root.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span style="color:#14b8a6;font-weight:600"><i class="fas fa-unlock"></i> Vault unlocked <small style="color:#94a3b8;font-weight:400">(auto-locks in 3 min)</small></span><button id="v-lock" style="background:rgba(255,255,255,.1);color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer"><i class="fas fa-lock"></i> Lock</button></div>
        <div style="${card}"><h4 style="margin-bottom:10px">Add document</h4><select id="v-cat" style="${inp}">${CATS.map(c => `<option>${c}</option>`).join('')}</select><input id="v-label" placeholder="Label (optional), e.g. Rishit - front" style="${inp}">
        <input id="v-file" type="file" accept="image/*,application/pdf" multiple style="display:none"><button id="v-add" style="${btn('#14b8a6')}"><i class="fas fa-plus"></i> Choose file(s) to encrypt</button></div>
        <div id="v-docs">${rows.length ? '' : '<p style="color:var(--text-secondary)">No documents yet.</p>'}</div>`;
        $('#v-lock').onclick = lock; $('#v-add').onclick = () => $('#v-file').click();
        $('#v-file').onchange = async (e) => { const fl = Array.from(e.target.files); e.target.value = ''; for (const f of fl) { if (!sizeOk(f, 25)) { ctx.showCustomAlert(esc(f.name) + ' is larger than 25 MB.'); continue; } const data = new Uint8Array(await f.arrayBuffer()); const label = ($('#v-label').value.trim() || f.name); const nameEnc = await enc(key, new TextEncoder().encode(label)); const dataEnc = await enc(key, data); const cat = $('#v-cat').value; await vreq(db, VDOCS, 'readwrite', s => s.add({ cat, name: nameEnc, mime: f.type || 'application/octet-stream', size: f.size, date: Date.now(), data: dataEnc })); } showMain(); };
        const list = $('#v-docs');
        rows.forEach(d => { const el = document.createElement('div'); el.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:rgba(255,255,255,.05);border:1px solid var(--glass-border);border-radius:8px;margin-bottom:8px'; el.innerHTML = `<div style="min-width:0;flex:1"><b class="text-ellipsis">${esc(d.nm)}</b><small style="color:var(--text-secondary)">${esc(d.cat)} · ${(d.size / 1024).toFixed(0)} KB · ${new Date(d.date).toLocaleDateString()}</small></div><button data-a="v" style="background:var(--accent);color:#fff;border:none;padding:8px 11px;border-radius:6px;cursor:pointer"><i class="fas fa-eye"></i></button><button data-a="s" style="background:#10b981;color:#fff;border:none;padding:8px 11px;border-radius:6px;cursor:pointer"><i class="fas fa-share-alt"></i></button><button data-a="d" style="background:#ef4444;color:#fff;border:none;padding:8px 11px;border-radius:6px;cursor:pointer"><i class="fas fa-trash"></i></button>`; list.appendChild(el);
            el.querySelector('[data-a=v]').onclick = async () => { const plain = await dec(key, d.data); const url = URL.createObjectURL(new Blob([plain], { type: d.mime })); const w = document.createElement('div'); w.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:100020;display:flex;flex-direction:column'; w.innerHTML = `<div style="padding:12px;text-align:right"><button style="background:#ef4444;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer">Close</button></div>${d.mime.startsWith('image/') ? `<img src="${url}" style="flex:1;min-height:0;object-fit:contain">` : `<iframe src="${url}" style="flex:1;border:none;background:#fff"></iframe>`}`; w.querySelector('button').onclick = () => { w.remove(); URL.revokeObjectURL(url); }; document.body.appendChild(w); };
            el.querySelector('[data-a=s]').onclick = async () => { const plain = await dec(key, d.data); const ext = d.mime === 'application/pdf' ? '.pdf' : d.mime.startsWith('image/') ? '.' + d.mime.split('/')[1].replace('jpeg', 'jpg') : ''; await ctx.processAndDownload(plain, d.nm.replace(/[\\/:*?"<>|]/g, '_').replace(/(\.[a-z0-9]{2,4})?$/i, '') + ext, d.mime, false); };
            el.querySelector('[data-a=d]').onclick = async () => { if (!confirm('Delete this document from the vault?')) return; await vreq(db, VDOCS, 'readwrite', s => s.delete(d.id)); showMain(); };
        });
    }
    showLogin();
    return { lock };
}

export function initPro(ctx) {
    const c = (id) => document.getElementById(id);
    if (c('ocr-ui-container')) initOCR(ctx, c('ocr-ui-container'));
    if (c('batch-ui-container')) initBatch(ctx, c('batch-ui-container'));
    let vault = null; window.__openVault = () => { if (!vault && c('vault-ui-container')) vault = initVault(ctx, c('vault-ui-container')); };
    window.__lockVault = () => vault && vault.lock();
}
