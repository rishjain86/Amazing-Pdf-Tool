// Sejda-style PDF editor: continuous page view, editable existing text, objects, undo/redo, page ops
import { S, uid, esc, CSSFONT, BASELINE, LH, detectFont, sampleBg, sampleFg, buildBlocks, rotateObj90 } from './ed-shared.js';
import { saveEditor } from './editor-save.js';
import { openSignatureDialog } from './signature.js';
import { isLegacyFontName, looksLegacy, legacyToUnicode, looksEnglish } from './legacyhindi.js';

const BL11 = { sans: 0.8965, serif: 0.8875, mono: 0.8165 };
const TOOLDEF = {
    select: ['fa-mouse-pointer', 'Select'], text: ['fa-font', 'Text'], image: ['fa-image', 'Image'], sign: ['fa-signature', 'Sign'],
    date: ['fa-calendar-day', 'Date'], whiteout: ['fa-eraser', 'Whiteout'], draw: ['fa-pen', 'Draw'], highlight: ['fa-highlighter', 'Highlight'],
    underline: ['fa-underline', 'Underline'], strike: ['fa-strikethrough', 'Strike'], rect: ['fa-square', 'Rectangle'], ellipse: ['fa-circle', 'Ellipse'],
    line: ['fa-minus', 'Line'], arrow: ['fa-long-arrow-alt-right', 'Arrow'], link: ['fa-link', 'Link'], box: ['fa-vector-square', 'Select Area'], redact: ['fa-square', 'Redact box']
};
const TOOLSETS = {
    edit: ['select', 'text', 'image', 'sign', 'whiteout', 'draw', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'line', 'arrow', 'link'],
    sign: ['sign', 'text', 'date', 'image', 'select'], watermark: ['text', 'select'], imagewatermark: ['image', 'select'],
    addtext: ['text', 'select'], crop: ['box'], addmargins: ['box'], extract: ['box'], rotate: [], flatten: [], pagenumbers: ['select'], redact: ['redact', 'select'], maskaadhaar: ['redact', 'select'], forms: ['text', 'sign', 'date', 'select']
};
const HELP = {
    edit: 'Click any text to edit it. Use the tools above to add text, images, shapes, highlights & more.',
    sign: 'Draw / type / upload a signature, then drag it into place. Resize using the corner handles.',
    watermark: 'Click on the page to add watermark text. Use the options bar for angle, size and opacity.',
    imagewatermark: 'Choose a logo/image, drag & resize it. Use Opacity to make it subtle.',
    addtext: 'Click anywhere on the page to type new text.',
    crop: 'Drag a box on the page to choose the area to keep.',
    addmargins: 'Drag a box: the gaps between the box and the page edges become the margins added around the page.',
    extract: 'Drag a box around the text you want to extract.',
    rotate: 'Use the rotate buttons on each page, then press Save.',
    flatten: 'Flatten makes form fields & annotations part of the page (no longer editable). Press Save.',
    redact: 'Drag boxes over what must be hidden. On Save those areas are burned in as black and the text underneath is removed for good.',
    maskaadhaar: 'Press "Auto-detect" to hide the first 8 digits of the Aadhaar number, or drag black boxes yourself. Saved pages become pictures so the digits cannot be copied.',
    forms: 'Click the highlighted fields to fill them. Use Text to type anywhere on a flat form, and Sign to add your signature.',
    pagenumbers: 'Drag the blue page number to where you want it. Choose the format in the options bar.'
};
const TITLES = { edit: ['fa-edit', 'Edit PDF'], sign: ['fa-signature', 'Sign PDF'], watermark: ['fa-stamp', 'Watermark'], imagewatermark: ['fa-images', 'Image Watermark'], addtext: ['fa-font', 'Add Text'], crop: ['fa-crop', 'Crop PDF'], addmargins: ['fa-border-all', 'Add Margins'], extract: ['fa-file-alt', 'Extract Text'], rotate: ['fa-sync-alt', 'Rotate Pages'], redact: ['fa-user-secret', 'Redact PDF'], maskaadhaar: ['fa-mask', 'Mask Aadhaar'], forms: ['fa-pen-square', 'Fill Forms'], flatten: ['fa-layer-group', 'Flatten PDF'], pagenumbers: ['fa-sort-numeric-down', 'Page Numbers'] };

let root, scroller, pagesBox, propsBar, toolBar, helpBar, io, gesture = null, zoomTimer = null, uiReady = false;

// ------------------------------------------------------------------ UI
function injectCSS() {
    if (document.getElementById('ed-css')) return;
    const st = document.createElement('style'); st.id = 'ed-css';
    st.textContent = `
    #edit-workspace{display:none;position:fixed;inset:0;background:var(--bg-color);z-index:100000;flex-direction:column;color:#fff}
    .ed-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:max(10px,env(safe-area-inset-top)) 14px 10px;background:var(--surface-color);border-bottom:1px solid var(--glass-border)}
    .ed-head .ed-title{font-weight:600;font-size:1.05rem;white-space:nowrap}
    .ed-btn{background:rgba(255,255,255,.08);color:#fff;border:1px solid var(--glass-border);padding:7px 11px;border-radius:7px;cursor:pointer;font-size:.85rem;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;transition:.15s}
    .ed-btn:hover{background:rgba(255,255,255,.16)} .ed-btn[disabled]{opacity:.35;pointer-events:none}
    .ed-btn.active{background:var(--accent);border-color:var(--accent)} .ed-btn.save{background:#10b981;border-color:#10b981;font-weight:600}
    .ed-btn.danger{color:#fca5a5}
    .ed-help{text-align:center;padding:7px 10px;background:rgba(59,130,246,.12);color:#93c5fd;font-size:.82rem}
    .ed-tools,.ed-props{display:flex;gap:6px;padding:8px 12px;overflow-x:auto;background:#1e293b;border-bottom:1px solid var(--glass-border);align-items:center;scrollbar-width:none}
    .ed-tools::-webkit-scrollbar,.ed-props::-webkit-scrollbar{display:none}
    .ed-props{background:#17202f;min-height:46px} .ed-props label{font-size:.75rem;color:#94a3b8;display:flex;align-items:center;gap:5px;white-space:nowrap}
    .ed-props input[type=number],.ed-props select,.ed-props input[type=text]{background:rgba(0,0,0,.35);color:#fff;border:1px solid var(--glass-border);border-radius:6px;padding:5px 7px;font-size:.82rem;max-width:130px}
    .ed-props input[type=color]{width:30px;height:28px;border:none;padding:0;background:none;cursor:pointer}
    .ed-props input[type=range]{width:90px}
    .ed-sep{width:1px;align-self:stretch;background:var(--glass-border);margin:0 4px;flex:0 0 1px}
    .ed-scroll{flex:1;min-height:0;overflow:auto;background:#0b1220;-webkit-overflow-scrolling:touch;padding:14px 0 120px;text-align:center}
    .ed-scroll.drawing .ed-pg{touch-action:none}
    .ed-pgwrap{display:inline-block;margin:0 auto 18px;text-align:left;vertical-align:top;max-width:none}
    .ed-pghead{display:flex;gap:6px;align-items:center;justify-content:space-between;padding:0 2px 5px;color:#94a3b8;font-size:.75rem}
    .ed-pghead button{background:rgba(255,255,255,.08);border:none;color:#cbd5e1;width:28px;height:26px;border-radius:5px;cursor:pointer}
    .ed-pghead button:hover{background:var(--accent);color:#fff}
    .ed-pg{position:relative;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.7);overflow:hidden;user-select:none;-webkit-user-select:none}
    .ed-cv{position:absolute;left:0;top:0;display:block}
    .ed-fl{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}.ed-fl input,.ed-fl textarea,.ed-fl select{position:absolute;pointer-events:auto;background:rgba(59,130,246,.16);border:1px solid #3b82f6;color:#000;font-family:Arial,sans-serif;padding:0 3px;outline:none;box-sizing:border-box}.ed-fl input:focus,.ed-fl textarea:focus,.ed-fl select:focus{background:rgba(255,255,255,.95);border-color:#10b981}.ed-fl input[type=checkbox],.ed-fl input[type=radio]{padding:0;accent-color:#10b981}
    .ed-tl,.ed-svg,.ed-ol{position:absolute;left:0;top:0;width:100%;height:100%}
    .ed-svg{pointer-events:none;overflow:visible} .ed-ol{pointer-events:none}
    .ed-tb{position:absolute;white-space:pre;color:transparent;cursor:text;pointer-events:auto;margin:0;padding:0;outline:none;overflow:visible}
    .ed-tb:hover{outline:1px dashed #3b82f6} .ed-tb.editing{outline:2px solid #10b981;z-index:5;user-select:text;-webkit-user-select:text}
    .ed-tb.changed{outline:none}
    .ed-o{position:absolute;pointer-events:auto;touch-action:none;box-sizing:border-box}
    .ed-text{white-space:pre;line-height:${LH};cursor:move;padding:0;min-width:6px;min-height:1em}
    .ed-text.editing{cursor:text;outline:2px solid #10b981;user-select:text;-webkit-user-select:text;touch-action:auto}
    .ed-img img{width:100%;height:100%;display:block;pointer-events:none;-webkit-user-drag:none}
    .ed-sel{position:absolute;border:1.5px solid #3b82f6;pointer-events:none;box-sizing:border-box;z-index:20}
    .ed-h{position:absolute;width:14px;height:14px;background:#fff;border:2px solid #3b82f6;border-radius:50%;pointer-events:auto;touch-action:none}
    .ed-h.nw{left:-8px;top:-8px;cursor:nwse-resize}.ed-h.ne{right:-8px;top:-8px;cursor:nesw-resize}.ed-h.se{right:-8px;bottom:-8px;cursor:nwse-resize}.ed-h.sw{left:-8px;bottom:-8px;cursor:nesw-resize}
    .ed-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px calc(8px + env(safe-area-inset-bottom));background:var(--surface-color);border-top:1px solid var(--glass-border);font-size:.85rem}
    .ed-modal{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100010;display:none;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(4px)}
    .ed-modal .box{background:var(--surface-color);border:1px solid var(--glass-border);border-radius:14px;padding:20px;width:100%;max-width:520px;max-height:92vh;overflow:auto}
    @media (max-width:768px){.ed-btn span{display:none}.ed-head .ed-title{font-size:.9rem}}`;
    document.head.appendChild(st);
}

function buildUI() {
    injectCSS();
    root = document.getElementById('edit-workspace');
    root.innerHTML = `
    <div class="ed-head">
        <button class="ed-btn" id="ed-close"><i class="fas fa-times"></i><span>Close</span></button>
        <span class="ed-title" id="ed-title"></span>
        <div style="display:flex;gap:6px;align-items:center">
            <select id="edit-apply-mode" class="ed-btn" style="display:none"><option value="current">Current Page</option><option value="all">All Pages</option></select>
            <button class="ed-btn" id="ed-undo" title="Undo (Ctrl+Z)"><i class="fas fa-undo"></i><span>Undo</span></button>
            <button class="ed-btn" id="ed-redo" title="Redo (Ctrl+Y)"><i class="fas fa-redo"></i><span>Redo</span></button>
            <button class="ed-btn save" id="btn-edit-save"><i class="fas fa-check"></i><span>Save</span></button>
        </div>
    </div>
    <div class="ed-help" id="ed-help"></div>
    <div class="ed-tools" id="ed-tools"></div>
    <div class="ed-props" id="ed-props"></div>
    <div class="ed-scroll" id="ed-scroll"><div id="ed-pages"></div></div>
    <div class="ed-foot">
        <div style="display:flex;gap:10px;align-items:center">
            <button class="ed-btn" id="ed-prev"><i class="fas fa-chevron-left"></i></button>
            <span>Page <b id="page-num">1</b> / <b id="page-count">1</b></span>
            <button class="ed-btn" id="ed-next"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
            <button class="ed-btn" id="ed-zout"><i class="fas fa-search-minus"></i></button>
            <span id="ed-zoom" style="min-width:42px;text-align:center">100%</span>
            <button class="ed-btn" id="ed-zfit"><i class="fas fa-expand"></i></button>
            <button class="ed-btn" id="ed-zin"><i class="fas fa-search-plus"></i></button>
        </div>
    </div>
    <input type="file" id="edit-image-input" accept="image/png,image/jpeg,image/webp" style="display:none">
    <div class="ed-modal" id="ed-prompt"><div class="box"><h3 id="ed-prompt-title" style="margin-bottom:12px"></h3>
        <input id="ed-prompt-input" type="text" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--glass-border);background:rgba(0,0,0,.3);color:#fff;margin-bottom:14px">
        <div style="display:flex;gap:10px"><button class="ed-btn" id="ed-prompt-cancel" style="flex:1;justify-content:center">Cancel</button><button class="ed-btn save" id="ed-prompt-ok" style="flex:1;justify-content:center">OK</button></div></div></div>`;
    scroller = root.querySelector('#ed-scroll'); pagesBox = root.querySelector('#ed-pages');
    propsBar = root.querySelector('#ed-props'); toolBar = root.querySelector('#ed-tools'); helpBar = root.querySelector('#ed-help');
    const $ = (id) => root.querySelector('#' + id);
    $('ed-close').onclick = () => closeEditor(true);
    $('ed-undo').onclick = undo; $('ed-redo').onclick = redo;
    $('btn-edit-save').onclick = () => saveEditor();
    $('ed-prev').onclick = () => gotoPage(S.curPage - 1); $('ed-next').onclick = () => gotoPage(S.curPage + 1);
    $('ed-zin').onclick = () => setScale(S.scale * 1.2); $('ed-zout').onclick = () => setScale(S.scale / 1.2); $('ed-zfit').onclick = fitWidth;
    $('edit-image-input').onchange = onImagePicked;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setScale(S.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
    window.addEventListener('pointermove', onGlobalMove, { passive: false });
    window.addEventListener('pointerup', onGlobalUp);
    window.addEventListener('keydown', onKey);
    uiReady = true;
}

// ------------------------------------------------------------------ open / close
export async function openEditor(file, mode, ctx) {
    S.ctx = ctx; S.mode = mode; S.file = file; S.name = file.name;
    if (!uiReady) buildUI();
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength < 100) { ctx.showCustomAlert('File error: this file looks empty or corrupt.'); return; }
    S.bytes = bytes;
    let pdf;
    try { pdf = await ctx.pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; }
    catch (e) { ctx.handleError(e.name === 'PasswordException' ? new Error('password protected') : new Error('Could not open this PDF. It may be corrupt - try the Repair PDF tool.')); return; }
    S.pdf = pdf; S.objs = {}; S.images = {}; S.undo = []; S.redo = []; S.sel = null; S.dirty = false; S.nextId = 1; S.curPage = 0; S.formVals = {}; S.formFlatten = false;
    S.format = (document.getElementById('pagenumbers-format') || {}).value || '1';
    S.pages = [];
    for (let i = 0; i < pdf.numPages; i++) {
        const pg = await pdf.getPage(i + 1);
        const vp = pg.getViewport({ scale: 1 });
        S.pages.push({ id: 'p' + (S.nextId++), src: i, native: pg.rotate % 360, rot: pg.rotate % 360, w: vp.width, h: vp.height, deleted: false, blank: false, token: 0 });
        S.objs[S.pages[i].id] = [];
    }
    const [ic, tt] = TITLES[mode] || TITLES.edit;
    root.querySelector('#ed-title').innerHTML = `<i class="fas ${ic}"></i> ${tt}`;
    helpBar.textContent = HELP[mode] || ''; helpBar.style.display = HELP[mode] ? 'block' : 'none';
    const am = root.querySelector('#edit-apply-mode');
    am.style.display = ['sign', 'watermark', 'imagewatermark', 'addtext', 'crop', 'addmargins', 'extract', 'pagenumbers'].includes(mode) ? '' : 'none';
    am.value = ['pagenumbers', 'watermark', 'imagewatermark'].includes(mode) ? 'all' : 'current';
    buildTools();
    root.style.display = 'flex'; document.body.classList.add('is-editing');
    fitWidth(true);
    buildPages();
    root.querySelector('#page-count').textContent = S.pages.length;
    updateUndoUI();
    const first = (TOOLSETS[mode] || [])[0];
    setTool(mode === 'edit' || mode === 'forms' ? (mode === 'forms' ? 'select' : 'text') : (first || 'none'));
    if (mode === 'pagenumbers') addPageNumberObj();
    if (mode === 'imagewatermark') root.querySelector('#edit-image-input').click();
    if (mode === 'sign') setTimeout(() => pickSignature(), 250);
}

export function closeEditor(ask) {
    if (ask && S.dirty && !confirm('Discard your changes?')) return false;
    if (root) root.style.display = 'none';
    document.body.classList.remove('is-editing');
    if (io) io.disconnect();
    if (pagesBox) pagesBox.innerHTML = '';
    try { S.pdf && S.pdf.destroy(); } catch (e) { }
    S.pdf = null; S.pages = []; S.objs = {}; S.images = {}; S.bytes = null;
    return true;
}
window.__closeEditor = () => closeEditor(true);
export const isEditorOpen = () => !!root && root.style.display === 'flex';

function buildTools() {
    toolBar.innerHTML = '';
    const list = TOOLSETS[S.mode] || [];
    toolBar.style.display = list.length ? 'flex' : 'none';
    list.forEach(t => {
        const b = document.createElement('button'); b.className = 'ed-btn'; b.dataset.tool = t;
        b.innerHTML = `<i class="fas ${TOOLDEF[t][0]}"></i><span>${TOOLDEF[t][1]}</span>`;
        b.onclick = () => onToolClick(t); toolBar.appendChild(b);
    });
    if (S.mode === 'flatten') {
        // nothing but Save
    }
}
function onToolClick(t) {
    if (t === 'image') { setTool('image'); root.querySelector('#edit-image-input').click(); return; }
    if (t === 'sign') { setTool('select'); pickSignature(); return; }
    if (t === 'date') { setTool('select'); addDate(); return; }
    setTool(t);
}
export function setTool(t) {
    S.tool = t; select(null);
    toolBar.querySelectorAll('.ed-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    scroller.classList.toggle('drawing', ['draw', 'whiteout', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'line', 'arrow', 'link', 'box', 'redact'].includes(t));
    pagesBox.querySelectorAll('.ed-pg').forEach(el => el.style.cursor = (t === 'select' || t === 'none') ? 'default' : (t === 'text' ? 'text' : 'crosshair'));
    renderProps();
}

// ------------------------------------------------------------------ pages
function buildPages() {
    pagesBox.innerHTML = '';
    if (io) io.disconnect();
    io = new IntersectionObserver((ents) => {
        ents.forEach(en => {
            const p = S.pages.find(x => x.id === en.target.dataset.pid); if (!p) return;
            if (en.isIntersecting) { if (!p.rendered || p.renderedScale !== S.scale) renderPage(p); }
            else if (p.rendered && p.cv) { p.rendered = false; p.cv.width = p.cv.height = 0; p.tl.innerHTML = ''; }
        });
    }, { root: scroller, rootMargin: '700px 0px' });
    const live = S.pages.filter(p => !p.deleted);
    live.forEach((p, idx) => {
        const wrap = document.createElement('div'); wrap.className = 'ed-pgwrap'; wrap.dataset.pid = p.id;
        const canOps = S.mode === 'edit' || S.mode === 'rotate';
        wrap.innerHTML = `<div class="ed-pghead"><span>Page ${idx + 1}</span><span style="display:flex;gap:4px">
            ${canOps ? `<button data-act="rl" title="Rotate left"><i class="fas fa-undo"></i></button><button data-act="rr" title="Rotate right"><i class="fas fa-redo"></i></button>` : ''}
            ${S.mode === 'edit' ? `<button data-act="add" title="Insert blank page after"><i class="fas fa-file-medical"></i></button><button data-act="del" title="Delete page"><i class="fas fa-trash-alt"></i></button>` : ''}</span></div>
            <div class="ed-pg"><canvas class="ed-cv"></canvas><div class="ed-tl"></div><svg class="ed-svg" xmlns="http://www.w3.org/2000/svg"></svg><div class="ed-fl"></div><div class="ed-ol"></div></div>`;
        pagesBox.appendChild(wrap);
        p.el = wrap; p.pg = wrap.querySelector('.ed-pg'); p.cv = wrap.querySelector('.ed-cv'); p.tl = wrap.querySelector('.ed-tl');
        p.svg = wrap.querySelector('.ed-svg'); p.fl = wrap.querySelector('.ed-fl'); p.ol = wrap.querySelector('.ed-ol'); p.rendered = false; p.idx = idx;
        sizePage(p);
        p.pg.addEventListener('pointerdown', (e) => onPagePointerDown(e, p));
        wrap.querySelectorAll('.ed-pghead button').forEach(b => b.onclick = () => pageOp(p, b.dataset.act));
        renderObjs(p);
        io.observe(wrap);
    });
    root.querySelector('#page-count').textContent = live.length;
    root.querySelector('#ed-zoom').textContent = Math.round(S.scale * 100) + '%';
}
function dims(p) { const sw = p.rot % 180 !== 0; return sw ? [p.h, p.w] : [p.w, p.h]; }
function sizePage(p) {
    const [w, h] = dims(p);
    p.pg.style.width = (w * S.scale) + 'px'; p.pg.style.height = (h * S.scale) + 'px';
    p.svg.setAttribute('viewBox', `0 0 ${w} ${h}`); p.svg.setAttribute('width', w * S.scale); p.svg.setAttribute('height', h * S.scale);
}
async function renderPage(p) {
    if (!S.pdf) return;
    sizePage(p);
    if (p.blank) { p.rendered = true; p.renderedScale = S.scale; p.cv.width = p.cv.height = 0; return; }
    const token = ++p.token; p.rendered = true; p.renderedScale = S.scale;
    try {
        const page = await S.pdf.getPage(p.src + 1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: S.scale * dpr, rotation: p.rot });
        p.cv.width = Math.floor(vp.width); p.cv.height = Math.floor(vp.height);
        p.cv.style.width = (vp.width / dpr) + 'px'; p.cv.style.height = (vp.height / dpr) + 'px';
        const ctx = p.cv.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, p.cv.width, p.cv.height);
        if (p.task) { try { p.task.cancel(); } catch (e) { } }
        p.task = page.render({ canvasContext: ctx, viewport: vp });
        await p.task.promise;
        if (token !== p.token) return;
        p.dpr = dpr;
        if (S.mode === 'edit') await buildTextLayer(p, page);
        if (S.mode === 'forms') await buildFormLayer(p, page);
    } catch (e) { if (e && e.name !== 'RenderingCancelledException') console.warn('render', e); }
}

async function buildTextLayer(p, page) {
    const vp1 = page.getViewport({ scale: 1, rotation: p.rot });
    const tc = await page.getTextContent();
    const cache = {};
    const fontInfo = (fn) => {
        if (cache[fn]) return cache[fn];
        let nm = '';
        try { nm = page.commonObjs.get(fn).name || ''; } catch (e) { }
        if (!nm && tc.styles[fn]) nm = tc.styles[fn].fontFamily || '';
        return cache[fn] = { ...detectFont(nm), raw: fn, name: nm };
    };
    p.blocks = buildBlocks(tc.items, tc.styles, vp1, fontInfo);
    markLegacy(p.blocks);
    paintBlocks(p);
}
function markLegacy(blocks) { // old Hindi fonts (Kruti Dev...) look like garbage when read as text
    const byName = {}, byText = {}; blocks.forEach(b => { if (isLegacyFontName(b.name)) byName[b.raw] = true; else if (looksLegacy(b.str)) byText[b.raw] = true; });
    blocks.forEach(b => { b.legacy = !!byName[b.raw] || (!!byText[b.raw] && !looksEnglish(b.str)); });
}
function paintBlocks(p) {
    p.tl.innerHTML = ''; if (!p.blocks) return;
    const edits = (S.objs[p.id] || []).filter(o => o.type === 'edit');
    p.blocks.forEach(b => {
        const key = Math.round(b.x * 10) + '_' + Math.round(b.base * 10);
        const el = document.createElement('div'); el.className = 'ed-tb'; el.dataset.key = key;
        const ed = edits.find(e => e.key === key);
        styleBlock(el, b, ed);
        p.tl.appendChild(el);
    });
}
async function buildFormLayer(p, page) {
    p.fl.innerHTML = ''; const vp = page.getViewport({ scale: 1, rotation: p.rot }); let ann = []; try { ann = await page.getAnnotations({ intent: 'display' }); } catch (e) { }
    ann.filter(a => a.subtype === 'Widget' && a.fieldName && !a.readOnly).forEach(a => {
        const m = vp.transform, pt = (X, Y) => [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]]; const c1 = pt(a.rect[0], a.rect[1]), c2 = pt(a.rect[2], a.rect[3]), x = Math.min(c1[0], c2[0]), y = Math.min(c1[1], c2[1]), w = Math.abs(c2[0] - c1[0]), h = Math.abs(c2[1] - c1[1]); let el; const name = a.fieldName; const cur = S.formVals[name];
        if (a.fieldType === 'Tx') { el = document.createElement(a.multiLine ? 'textarea' : 'input'); if (!a.multiLine) el.type = a.password ? 'password' : 'text'; el.value = cur != null ? cur : (a.fieldValue || ''); if (a.maxLen) el.maxLength = a.maxLen; el.oninput = () => { S.formVals[name] = el.value; S.dirty = true; }; }
        else if (a.fieldType === 'Btn' && a.checkBox) { el = document.createElement('input'); el.type = 'checkbox'; el.checked = cur != null ? !!cur : (a.fieldValue && a.fieldValue !== 'Off'); el.onchange = () => { S.formVals[name] = el.checked; S.dirty = true; }; }
        else if (a.fieldType === 'Btn' && a.radioButton) { el = document.createElement('input'); el.type = 'radio'; el.name = 'rg_' + name; el.checked = cur != null ? cur === a.buttonValue : a.fieldValue === a.buttonValue; el.onchange = () => { if (el.checked) { S.formVals[name] = a.buttonValue; S.dirty = true; } }; }
        else if (a.fieldType === 'Ch') { el = document.createElement('select'); (a.options || []).forEach(o => { const op = document.createElement('option'); op.value = o.exportValue; op.textContent = o.displayValue; el.appendChild(op); }); el.value = cur != null ? cur : (Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue); el.onchange = () => { S.formVals[name] = el.value; S.dirty = true; }; }
        else return;
        el.style.cssText += `left:${x * S.scale}px;top:${y * S.scale}px;width:${w * S.scale}px;height:${h * S.scale}px;font-size:${Math.max(8, Math.min(h * 0.62, 20)) * S.scale}px;`; p.fl.appendChild(el);
    });
}
// find text on every page and add redaction boxes (Aadhaar / PAN / phone / e-mail / custom words)
const AUTO = {
    aadhaar8: { re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, part: (m) => { let n = 0, i = 0; for (; i < m.length; i++) { if (/\d/.test(m[i])) n++; if (n === 8) { i++; break; } } return [0, i]; } },
    aadhaar12: { re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g }, pan: { re: /\b[A-Z]{5}\d{4}[A-Z]\b/g }, phone: { re: /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/g }, email: { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g }
};
async function autoFind(kind, custom) {
    let def = AUTO[kind], re;
    if (kind === 'custom') { const terms = custom.split(',').map(t => t.trim()).filter(Boolean); if (!terms.length) return S.ctx.showCustomAlert('Type the word(s) to hide, separated by commas.'); re = new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'); def = { re }; }
    pushUndo(); let added = 0, scanned = 0;
    for (const p of S.pages.filter(x => !x.deleted && !x.blank)) {
        const page = await S.pdf.getPage(p.src + 1); const vp = page.getViewport({ scale: 1, rotation: p.rot }); const tc = await page.getTextContent(); let blocks = buildBlocks(tc.items, tc.styles, vp, () => ({ family: 'sans', bold: false, italic: false }));
        if (!blocks.length && S.ctx.getOcr) { scanned++; try { const ocr = await S.ctx.getOcr(); const v2 = page.getViewport({ scale: 2, rotation: p.rot }); const cv = document.createElement('canvas'); cv.width = v2.width; cv.height = v2.height; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); await page.render({ canvasContext: g, viewport: v2 }).promise; blocks = await ocr(cv, 2, 'eng'); cv.width = 0; } catch (e) { console.warn('ocr', e); } }
        blocks.forEach(b => { const str = b.str; def.re.lastIndex = 0; let m; while ((m = def.re.exec(str))) { let a = 0, e = m[0].length; if (def.part) [a, e] = def.part(m[0]); const i0 = m.index + a, i1 = m.index + e; const x0 = b.x + b.w * (i0 / str.length), x1 = b.x + b.w * (i1 / str.length); S.objs[p.id].push({ id: uid(), type: 'redact', x: x0 - 1.5, y: b.base - b.size * 0.95, w: x1 - x0 + 3, h: b.size * 1.3 }); added++; if (m[0].length === 0) def.re.lastIndex++; } });
        renderObjs(p);
    }
    if (!added) { S.undo.pop(); updateUndoUI(); S.ctx.showCustomAlert(scanned ? 'Nothing found. For scanned images, draw the boxes by hand.' : 'No matching text found on any page.'); } else { S.dirty = true; updateUndoUI(); }
}
function styleBlock(el, b, ed) {
    const fam = ed ? ed.family : b.family, size = ed ? ed.size : b.size;
    el.style.left = (b.x * S.scale) + 'px';
    el.style.top = ((b.base - BL11[fam] * size) * S.scale) + 'px';
    el.style.fontFamily = CSSFONT[fam]; el.style.fontSize = (size * S.scale) + 'px'; el.style.lineHeight = (1.1 * size * S.scale) + 'px';
    el.style.fontWeight = (ed ? ed.bold : b.bold) ? 'bold' : 'normal'; el.style.fontStyle = (ed ? ed.italic : b.italic) ? 'italic' : 'normal';
    el.style.minWidth = (b.w * S.scale) + 'px'; el.style.minHeight = (1.1 * size * S.scale) + 'px';
    el.style.textDecoration = ed && ed.underline ? 'underline' : 'none';
    if (ed) { el.textContent = ed.text; el.style.color = ed.color; el.style.background = ed.bg; el.classList.add('changed'); }
    else { el.textContent = b.str; el.style.color = 'transparent'; el.style.background = 'transparent'; el.classList.remove('changed'); }
}

function startBlockEdit(p, el) {
    if (el.classList.contains('editing')) return;
    const key = el.dataset.key; const b = p.blocks.find(x => Math.round(x.x * 10) + '_' + Math.round(x.base * 10) === key); if (!b) return;
    let ed = S.objs[p.id].find(o => o.type === 'edit' && o.key === key);
    let created = false;
    if (!ed) {
        const sx = b.x * S.scale * p.dpr, sy = (b.base - b.size * 0.95) * S.scale * p.dpr, sw = b.w * S.scale * p.dpr, sh = b.size * 1.2 * S.scale * p.dpr;
        const bg = sampleBg(p.cv, sx, sy, sw, sh), fg = sampleFg(p.cv, sx, sy, sw, sh, bg);
        const shown = b.legacy ? legacyToUnicode(b.str) : b.str;
        ed = { id: uid(), type: 'edit', key, legacy: !!b.legacy, x: b.x, base: b.base, w: b.w, size: b.size, str: shown, text: shown, family: b.legacy ? 'sans' : b.family, bold: b.bold, italic: b.italic, underline: false, color: fg, bg };
        created = true;
    }
    pushUndo();
    if (created) S.objs[p.id].push(ed);
    el.classList.add('editing'); el.contentEditable = 'true'; el.style.background = ed.bg; el.style.color = ed.color; el.style.textDecoration = ed.underline ? 'underline' : 'none';
    el.textContent = ed.text; el.focus();
    const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    S.sel = { pid: p.id, id: ed.id, el, kind: 'edit' }; renderProps();
    el.onpaste = (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); };
    el.oninput = () => { ed.text = el.innerText.replace(/\n$/, ''); S.dirty = true; };
    el.onblur = () => {
        el.contentEditable = 'false'; el.classList.remove('editing');
        ed.text = el.innerText.replace(/\n$/, '');
        const arr = S.objs[p.id];
        if (ed.text === ed.str && ed.family === (b.legacy ? 'sans' : b.family) && ed.bold === b.bold && ed.italic === b.italic && ed.size === b.size && !ed.underline) {
            const i = arr.indexOf(ed); if (i >= 0) arr.splice(i, 1); styleBlock(el, b, null);
            if (created) S.undo.pop();
        } else { S.dirty = true; styleBlock(el, b, ed); }
        if (S.sel && S.sel.el === el) { S.sel = null; renderProps(); }
        updateUndoUI();
    };
}

// ------------------------------------------------------------------ objects (DOM)
function renderObjs(p) {
    p.ol.innerHTML = ''; p.svg.innerHTML = '';
    (S.objs[p.id] || []).forEach(o => { if (o.type !== 'edit') makeEl(p, o); });
    if (S.sel && S.sel.pid === p.id && S.sel.kind !== 'edit') showSel();
}
const SVGNS = 'http://www.w3.org/2000/svg';
function makeEl(p, o) {
    let el;
    if (['draw', 'line', 'arrow'].includes(o.type)) {
        el = document.createElementNS(SVGNS, 'g'); el.dataset.oid = o.id;
        const vis = document.createElementNS(SVGNS, 'path'), hit = document.createElementNS(SVGNS, 'path');
        hit.setAttribute('stroke', 'transparent'); hit.setAttribute('fill', 'none'); hit.setAttribute('class', 'hit');
        hit.style.pointerEvents = 'stroke'; hit.style.touchAction = 'none';
        vis.setAttribute('fill', 'none'); vis.setAttribute('stroke-linecap', 'round'); vis.setAttribute('stroke-linejoin', 'round'); vis.setAttribute('class', 'vis');
        el.appendChild(vis); el.appendChild(hit); p.svg.appendChild(el);
        hit.addEventListener('pointerdown', (e) => onObjPointerDown(e, p, o));
    } else {
        el = document.createElement('div'); el.dataset.oid = o.id; el.className = 'ed-o';
        el.addEventListener('pointerdown', (e) => onObjPointerDown(e, p, o));
        if (o.type === 'text') el.addEventListener('dblclick', () => startTextEdit(p, o, el));
        if (o.type === 'text' || o.type === 'pagenum') el.classList.add('ed-text');
        if (o.type === 'image') { el.classList.add('ed-img'); el.innerHTML = '<img alt="">'; }
        p.ol.appendChild(el);
    }
    syncEl(p, o, el); return el;
}
function elOf(p, o) { return (['draw', 'line', 'arrow'].includes(o.type) ? p.svg : p.ol).querySelector(`[data-oid="${o.id}"]`); }
function pathOf(o) {
    if (o.type === 'draw') return o.points.map((q, i) => (i ? 'L' : 'M') + q.x.toFixed(2) + ' ' + q.y.toFixed(2)).join(' ') + (o.points.length === 1 ? ` L${o.points[0].x + 0.01} ${o.points[0].y}` : '');
    if (o.type === 'line') return `M${o.x} ${o.y} L${o.x2} ${o.y2}`;
    const a = Math.atan2(o.y2 - o.y, o.x2 - o.x), L = Math.max(8, o.sw * 4), sp = 0.45;
    const hx = (k) => o.x2 - L * Math.cos(a + k * sp), hy = (k) => o.y2 - L * Math.sin(a + k * sp);
    return `M${o.x} ${o.y} L${o.x2} ${o.y2} M${hx(1)} ${hy(1)} L${o.x2} ${o.y2} L${hx(-1)} ${hy(-1)}`;
}
export function syncEl(p, o, el) {
    el = el || elOf(p, o); if (!el) return; const s = S.scale;
    if (['draw', 'line', 'arrow'].includes(o.type)) {
        const d = pathOf(o);
        const vis = el.querySelector('.vis'), hit = el.querySelector('.hit');
        vis.setAttribute('d', d); hit.setAttribute('d', d);
        vis.setAttribute('stroke', o.color); vis.setAttribute('stroke-width', o.sw); vis.setAttribute('opacity', o.opacity == null ? 1 : o.opacity);
        hit.setAttribute('stroke-width', Math.max(14 / s, o.sw)); return;
    }
    el.style.left = (o.x * s) + 'px'; el.style.top = (o.y * s) + 'px';
    if (o.type === 'text' || o.type === 'pagenum') {
        el.style.fontFamily = CSSFONT[o.font || 'sans']; el.style.fontSize = (o.size * s) + 'px';
        el.style.color = o.color; el.style.fontWeight = o.bold ? 'bold' : 'normal'; el.style.fontStyle = o.italic ? 'italic' : 'normal';
        el.style.textDecoration = o.underline ? 'underline' : 'none'; el.style.opacity = o.opacity == null ? 1 : o.opacity;
        el.style.transform = o.rot ? `rotate(${o.rot}deg)` : ''; el.style.transformOrigin = 'center center';
        if (!el.classList.contains('editing')) el.textContent = o.type === 'pagenum' ? pageNumSample() : o.text;
        if (o.type === 'pagenum') { el.style.background = 'rgba(59,130,246,.12)'; el.style.outline = '1px dashed #3b82f6'; }
        if (o.text !== undefined || o.type === 'pagenum') { o.w = (el.offsetWidth || 10) / s; o.h = (el.offsetHeight || o.size * LH) / s; }
        return;
    }
    el.style.width = (o.w * s) + 'px'; el.style.height = (o.h * s) + 'px';
    if (o.type === 'image') { el.querySelector('img').src = S.images[o.img] || ''; el.style.opacity = o.opacity == null ? 1 : o.opacity; return; }
    el.className = 'ed-o ed-box ' + o.type;
    const st = el.style; st.background = 'transparent'; st.border = 'none'; st.borderRadius = '0'; st.mixBlendMode = 'normal'; st.opacity = 1; el.innerHTML = '';
    if (o.type === 'whiteout') { st.background = '#fff'; st.outline = '1px dashed rgba(239,68,68,.35)'; }
    else if (o.type === 'highlight') { st.background = o.color; st.mixBlendMode = 'multiply'; st.opacity = 0.55; }
    else if (o.type === 'underline') { el.innerHTML = `<div style="position:absolute;left:0;right:0;bottom:0;height:${Math.max(1.5, o.sw * s)}px;background:${o.color}"></div>`; }
    else if (o.type === 'strike') { el.innerHTML = `<div style="position:absolute;left:0;right:0;top:50%;height:${Math.max(1.5, o.sw * s)}px;background:${o.color}"></div>`; }
    else if (o.type === 'rect' || o.type === 'ellipse') { st.border = `${Math.max(1, o.sw * s)}px solid ${o.color}`; if (o.type === 'ellipse') st.borderRadius = '50%'; if (o.fill) st.background = o.fill; }
    else if (o.type === 'link') { st.border = '2px dashed #3b82f6'; st.background = 'rgba(59,130,246,.12)'; el.title = o.url || ''; }
    else if (o.type === 'redact') { st.background = '#000'; st.opacity = 0.82; st.outline = '1px solid #ef4444'; }
    else if (o.type === 'rbox') { st.border = '2px dashed #3b82f6'; st.background = 'rgba(59,130,246,.2)'; }
}

function bbox(o, p) {
    if (o.points) { const xs = o.points.map(q => q.x), ys = o.points.map(q => q.y); const m = o.sw / 2; return { x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + o.sw, h: Math.max(...ys) - Math.min(...ys) + o.sw }; }
    if ('x2' in o) return { x: Math.min(o.x, o.x2), y: Math.min(o.y, o.y2), w: Math.abs(o.x2 - o.x), h: Math.abs(o.y2 - o.y) };
    if (o.type === 'text' || o.type === 'pagenum') { const el = elOf(p, o); return { x: o.x, y: o.y, w: el ? el.offsetWidth / S.scale : o.w, h: el ? el.offsetHeight / S.scale : o.h }; }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
}
const pageOfId = (pid) => S.pages.find(p => p.id === pid);
const objOf = (sel) => sel && (S.objs[sel.pid] || []).find(o => o.id === sel.id);

function select(sel) {
    document.querySelectorAll('.ed-sel').forEach(e => e.remove());
    S.sel = sel; if (sel && sel.kind !== 'edit') showSel(); renderProps();
}
function showSel() {
    document.querySelectorAll('.ed-sel').forEach(e => e.remove());
    if (!S.sel || S.sel.kind === 'edit') return;
    const p = pageOfId(S.sel.pid), o = objOf(S.sel); if (!p || !o) return;
    const b = bbox(o, p), s = S.scale;
    const f = document.createElement('div'); f.className = 'ed-sel';
    f.style.cssText = `left:${b.x * s - 2}px;top:${b.y * s - 2}px;width:${b.w * s + 4}px;height:${b.h * s + 4}px`;
    if (o.rot) { f.style.transform = `rotate(${o.rot}deg)`; }
    const resizable = ['image', 'whiteout', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'link', 'rbox', 'redact', 'text'].includes(o.type);
    if (resizable) ['nw', 'ne', 'se', 'sw'].forEach(h => { const d = document.createElement('div'); d.className = 'ed-h ' + h; d.addEventListener('pointerdown', (e) => startResize(e, p, o, h)); f.appendChild(d); });
    p.ol.appendChild(f);
}
function refreshSel() { if (S.sel && S.sel.kind !== 'edit') showSel(); }

// ------------------------------------------------------------------ pointer interactions
function pos(e, p) { const r = p.pg.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale }; }

function onObjPointerDown(e, p, o) {
    if (['draw', 'whiteout', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'line', 'arrow', 'link', 'box', 'redact'].includes(S.tool) && !(S.sel && S.sel.id === o.id)) return; // let creation tools draw over objects
    if (e.target.classList && e.target.classList.contains('ed-h')) return;
    const el = elOf(p, o);
    if (el && el.classList.contains('editing')) return;
    e.stopPropagation(); e.preventDefault();
    const wasSel = !!(S.sel && S.sel.id === o.id);
    select({ pid: p.id, id: o.id, kind: o.type });
    pushUndo();
    gesture = { type: 'move', p, o, start: pos(e, p), orig: JSON.parse(JSON.stringify(o)), moved: false, pid: e.pointerId, wasSel };
}
function startResize(e, p, o, h) {
    e.stopPropagation(); e.preventDefault(); pushUndo();
    gesture = { type: 'resize', p, o, h, start: pos(e, p), orig: { ...o, w: bbox(o, p).w, h: bbox(o, p).h }, moved: false };
}

function onPagePointerDown(e, p) {
    if (gesture) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const tb = e.target.closest && e.target.closest('.ed-tb');
    if (tb && (S.tool === 'text' || S.tool === 'select') && S.mode === 'edit') { e.preventDefault(); startBlockEdit(p, tb); return; }
    if (e.target.closest && (e.target.closest('.ed-o') || e.target.closest('.ed-h'))) return;
    const q = pos(e, p); const t = S.tool;
    const editing = document.querySelector('.ed-tb.editing, .ed-text.editing'); if (editing) editing.blur();
    select(null);
    if (t === 'text') {
        e.preventDefault();
        if (S.mode === 'pagenumbers') return;
        pushUndo();
        const o = { id: uid(), type: 'text', x: q.x, y: q.y - S.d.size * 0.5, text: '', size: S.mode === 'watermark' ? Math.max(S.d.size, 48) : S.d.size, color: (S.mode === 'watermark' && S.d.color === '#000000') ? '#808080' : S.d.color, font: S.d.font, bold: S.d.bold, italic: S.d.italic, underline: S.d.underline, opacity: S.mode === 'watermark' ? (S.d.opacity < 1 ? S.d.opacity : 0.35) : S.d.opacity, rot: S.mode === 'watermark' ? S.d.rot : 0 };
        S.objs[p.id].push(o); S.dirty = true;
        const el = makeEl(p, o); select({ pid: p.id, id: o.id, kind: 'text' }); startTextEdit(p, o, el, true);
        return;
    }
    if (t === 'draw') {
        e.preventDefault(); pushUndo();
        const o = { id: uid(), type: 'draw', color: S.d.strokeC, sw: S.d.strokeW, opacity: 1, points: [{ x: q.x, y: q.y }] };
        S.objs[p.id].push(o); makeEl(p, o); gesture = { type: 'draw', p, o, pid: e.pointerId }; return;
    }
    if (['whiteout', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'link', 'box', 'redact'].includes(t)) {
        e.preventDefault(); pushUndo();
        const type = t === 'box' ? 'rbox' : t;
        if (type === 'rbox') Object.keys(S.objs).forEach(k => S.objs[k] = S.objs[k].filter(x => x.type !== 'rbox'));
        const o = { id: uid(), type, x: q.x, y: q.y, w: 0, h: 0, color: type === 'highlight' ? S.d.hlC : S.d.strokeC, sw: S.d.strokeW, fill: null };
        S.objs[p.id].push(o); if (type === 'rbox') pagesBox.querySelectorAll('.ed-pg').forEach(x => x.querySelectorAll('.ed-box.rbox').forEach(y => y.remove()));
        makeEl(p, o); gesture = { type: 'create', p, o, start: q, pid: e.pointerId }; return;
    }
    if (t === 'line' || t === 'arrow') {
        e.preventDefault(); pushUndo();
        const o = { id: uid(), type: t, x: q.x, y: q.y, x2: q.x, y2: q.y, color: S.d.strokeC, sw: S.d.strokeW, opacity: 1 };
        S.objs[p.id].push(o); makeEl(p, o); gesture = { type: 'create-line', p, o, start: q, pid: e.pointerId }; return;
    }
    if (t === 'image' && S.pendingImg) { placeImage(p, q); }
    if (t === 'sign' && S.pendingImg) { placeImage(p, q); }
}

function onGlobalMove(e) {
    if (!gesture) return;
    if (gesture.pid != null && e.pointerId !== gesture.pid) return;
    const g = gesture, p = g.p; const q = pos(e, p); e.preventDefault();
    if (g.type === 'draw') { g.o.points.push({ x: q.x, y: q.y }); syncEl(p, g.o); return; }
    if (g.type === 'create') { const o = g.o; o.x = Math.min(g.start.x, q.x); o.y = Math.min(g.start.y, q.y); o.w = Math.abs(q.x - g.start.x); o.h = Math.abs(q.y - g.start.y); syncEl(p, o); return; }
    if (g.type === 'create-line') { g.o.x2 = q.x; g.o.y2 = q.y; syncEl(p, g.o); return; }
    const dx = q.x - g.start.x, dy = q.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) * S.scale < 3) return;
    g.moved = true; S.dirty = true;
    const o = g.o, orig = g.orig;
    if (g.type === 'move') {
        if (o.points) o.points = orig.points.map(a => ({ x: a.x + dx, y: a.y + dy }));
        else if ('x2' in o) { o.x = orig.x + dx; o.y = orig.y + dy; o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy; }
        else { o.x = orig.x + dx; o.y = orig.y + dy; }
        const [dw, dh] = dims(p);
        if (!o.points && !('x2' in o)) { const b = bbox(o, p); o.x = Math.max(-b.w + 10, Math.min(dw - 10, o.x)); o.y = Math.max(-b.h + 10, Math.min(dh - 10, o.y)); }
    } else if (g.type === 'resize') {
        const h = g.h; let x = orig.x, y = orig.y, w = orig.w, hh = orig.h;
        if (o.type === 'text') {
            const k = Math.max(0.2, (h.includes('e') ? orig.w + dx : orig.w - dx) / orig.w);
            o.size = Math.max(4, Math.round(orig.size * k * 10) / 10); syncEl(p, o); refreshSel(); renderPropsSoft(); return;
        }
        if (h.includes('e')) w = orig.w + dx; if (h.includes('s')) hh = orig.h + dy;
        if (h.includes('w')) { x = orig.x + dx; w = orig.w - dx; } if (h.includes('n')) { y = orig.y + dy; hh = orig.h - dy; }
        if (o.type === 'image' && !e.shiftKey && orig.w > 0) { const ratio = orig.h / orig.w; hh = w * ratio; if (h.includes('n')) y = orig.y + orig.h - hh; }
        if (w >= 6) { o.x = x; o.w = w; } if (hh >= 6) { o.y = y; o.h = hh; }
    }
    syncEl(p, o); refreshSel();
}
function onGlobalUp(e) {
    if (!gesture) return;
    if (gesture.pid != null && e.pointerId !== gesture.pid) return;
    const g = gesture; gesture = null; const o = g.o, p = g.p;
    if ((g.type === 'move' || g.type === 'resize') && !g.moved) { S.undo.pop(); updateUndoUI(); if (g.type === 'move' && o.type === 'text') { /* click on selected text => edit */ if (g.wasSel) startTextEdit(p, o, elOf(p, o)); } return; }
    if (g.type === 'create') {
        if (o.w < 4 || o.h < 4) { S.objs[p.id] = S.objs[p.id].filter(x => x !== o); const el = elOf(p, o); el && el.remove(); S.undo.pop(); updateUndoUI(); return; }
        S.dirty = true; if (o.type === 'link') { promptText('Link URL', 'https://', (v) => { if (v) { o.url = v.startsWith('http') || v.startsWith('mailto:') ? v : 'https://' + v; syncEl(p, o); } else { S.objs[p.id] = S.objs[p.id].filter(x => x !== o); renderObjs(p); } }); }
        if (o.type !== 'rbox' && o.type !== 'redact') setTool('select'); select({ pid: p.id, id: o.id, kind: o.type });
    }
    if (g.type === 'create-line') {
        if (Math.hypot(o.x2 - o.x, o.y2 - o.y) < 4) { S.objs[p.id] = S.objs[p.id].filter(x => x !== o); renderObjs(p); S.undo.pop(); updateUndoUI(); return; }
        S.dirty = true; setTool('select'); select({ pid: p.id, id: o.id, kind: o.type });
    }
    if (g.type === 'draw') { S.dirty = true; if (o.points.length < 2) o.points.push({ x: o.points[0].x + 0.1, y: o.points[0].y }); syncEl(p, o); }
    updateUndoUI();
}

function startTextEdit(p, o, el, isNew) {
    if (!el) return; if (el.classList.contains('editing')) return;
    if (!isNew) pushUndo();
    el.classList.add('editing'); el.contentEditable = 'true'; el.style.minWidth = (S.d.size * S.scale) + 'px'; el.focus();
    const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); if (!isNew) { s.removeAllRanges(); s.addRange(r); }
    el.onpaste = (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); };
    el.oninput = () => { o.text = el.innerText.replace(/\n$/, ''); S.dirty = true; refreshSel(); };
    el.onblur = () => {
        el.contentEditable = 'false'; el.classList.remove('editing'); o.text = el.innerText.replace(/\n$/, '');
        if (!o.text.trim()) { S.objs[p.id] = S.objs[p.id].filter(x => x !== o); el.remove(); select(null); }
        else { syncEl(p, o, el); select({ pid: p.id, id: o.id, kind: 'text' }); if (S.mode !== 'edit' && S.mode !== 'sign' && S.mode !== 'watermark') { } }
        if (S.tool === 'text' && S.mode === 'edit') { /* stay on text tool */ }
        updateUndoUI();
    };
}

// ------------------------------------------------------------------ images / signature / date
async function onImagePicked(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { S.ctx.showCustomAlert('Please choose a PNG, JPG or WEBP image.'); return; }
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    await setPendingImage(url, S.mode === 'imagewatermark' ? 'wm' : 'img');
}
export async function setPendingImage(dataUrl) {
    // normalise webp / odd formats to PNG/JPEG for pdf-lib
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    let url = dataUrl;
    if (!/^data:image\/(png|jpeg)/.test(dataUrl)) { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); url = c.toDataURL('image/png'); }
    const id = 'i' + (S.nextId++); S.images[id] = url;
    S.pendingImg = { id, w: img.naturalWidth, h: img.naturalHeight };
    const p = S.pages.filter(x => !x.deleted)[S.curPage] || S.pages[0];
    const [pw, ph] = dims(p);
    placeImage(p, { x: pw / 2, y: Math.min(ph / 2, (scroller.scrollTop / S.scale - p.el.offsetTop / S.scale) + ph / 3) });
}
function placeImage(p, q) {
    const pi = S.pendingImg; if (!pi) return; S.pendingImg = null;
    const [pw] = dims(p); let w = Math.min(pi.w, pw * (S.mode === 'sign' ? 0.28 : 0.4)), h = w * pi.h / pi.w;
    if (S.mode === 'imagewatermark') { w = Math.min(pi.w, pw * 0.5); h = w * pi.h / pi.w; }
    pushUndo();
    const o = { id: uid(), type: 'image', x: q.x - w / 2, y: Math.max(0, q.y - h / 2), w, h, img: pi.id, opacity: S.mode === 'imagewatermark' ? 0.5 : 1 };
    S.objs[p.id].push(o); S.dirty = true; makeEl(p, o); setTool('select'); select({ pid: p.id, id: o.id, kind: 'image' });
}
async function pickSignature() { const url = await openSignatureDialog(root); if (url) await setPendingImage(url); }
function addDate() {
    const p = S.pages.filter(x => !x.deleted)[S.curPage] || S.pages[0]; const [pw, ph] = dims(p);
    pushUndo();
    const o = { id: uid(), type: 'text', x: pw * 0.55, y: ph * 0.8, text: new Date().toLocaleDateString('en-GB'), size: 14, color: '#000000', font: 'sans', bold: false, italic: false, underline: false, opacity: 1, rot: 0 };
    S.objs[p.id].push(o); S.dirty = true; makeEl(p, o); select({ pid: p.id, id: o.id, kind: 'text' });
}
function addPageNumberObj() {
    const p = S.pages[0]; const [pw, ph] = dims(p);
    const o = { id: uid(), type: 'pagenum', x: pw / 2 - 20, y: ph - 40, size: 14, color: '#000000', font: 'sans', bold: false, italic: false, opacity: 1, text: '' };
    S.objs[p.id].push(o); makeEl(p, o); select({ pid: p.id, id: o.id, kind: 'pagenum' });
}
const pageNumSample = () => ({ '1': '1', 'Page 1': 'Page 1', 'Page 1 of 10': 'Page 1 of 10', '1 / 10': '1 / 10' }[S.format] || '1');

// ------------------------------------------------------------------ page operations
function pageOp(p, act) {
    pushUndo(true);
    const live = S.pages.filter(x => !x.deleted);
    if (act === 'rl' || act === 'rr') {
        const times = act === 'rr' ? 1 : 3;
        for (let k = 0; k < times; k++) { const [, hd] = dims(p); (S.objs[p.id] || []).forEach(o => rotateObj90(o, hd)); p.rot = (p.rot + 90) % 360; }
        (S.objs[p.id] || []).forEach(o => { if (o.type === 'edit') { /* geometry kept; block rebuilt on render */ } });
        S.dirty = true; p.rendered = false; sizePage(p); renderObjs(p); renderPage(p);
    } else if (act === 'del') {
        if (live.length <= 1) { S.ctx.showCustomAlert('A PDF needs at least one page.'); S.undo.pop(); return; }
        p.deleted = true; S.dirty = true; buildPages();
    } else if (act === 'add') {
        const [w, h] = dims(p); const id = 'p' + (S.nextId++);
        const np = { id, src: -1, native: 0, rot: 0, w, h, deleted: false, blank: true, token: 0 };
        S.pages.splice(S.pages.indexOf(p) + 1, 0, np); S.objs[id] = []; S.dirty = true; buildPages();
    }
    updateUndoUI();
}

// ------------------------------------------------------------------ undo / redo
const snapshot = () => JSON.stringify({ objs: S.objs, pages: S.pages.map(p => ({ id: p.id, src: p.src, native: p.native, rot: p.rot, w: p.w, h: p.h, deleted: p.deleted, blank: p.blank })) });
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 80) S.undo.shift(); S.redo = []; updateUndoUI(); }
function restore(js) {
    const st = JSON.parse(js); const same = st.pages.length === S.pages.length && st.pages.every((d, i) => { const p = S.pages[i]; return p.id === d.id && p.rot === d.rot && p.deleted === d.deleted && p.blank === d.blank; });
    if (same) { // only objects changed: repaint in place (no flicker / no page re-render)
        S.objs = st.objs; S.sel = null; document.querySelectorAll('.ed-sel').forEach(e => e.remove());
        S.pages.forEach(p => { if (p.deleted || !p.ol) return; renderObjs(p); paintBlocks(p); }); renderProps(); updateUndoUI(); return;
    }
    S.objs = st.objs;
    S.pages = st.pages.map(d => { const old = S.pages.find(p => p.id === d.id); return Object.assign(old || { token: 0 }, d); });
    S.sel = null; document.querySelectorAll('.ed-sel').forEach(e => e.remove()); buildPages(); renderProps(); updateUndoUI();
}
function toast(msg) { let t = document.getElementById('ed-toast'); if (!t) { t = document.createElement('div'); t.id = 'ed-toast'; t.style.cssText = 'position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:rgba(15,23,42,.95);color:#fff;padding:9px 18px;border-radius:24px;font-size:.85rem;z-index:100030;border:1px solid rgba(255,255,255,.2);pointer-events:none;transition:opacity .25s'; document.body.appendChild(t); } t.textContent = msg; t.style.opacity = 1; clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = 0, 1200); }
function undo() { const typing = document.querySelector('.ed-tb.editing, .ed-text.editing'); if (typing) typing.blur(); if (!S.undo.length) return toast('Nothing to undo'); S.redo.push(snapshot()); restore(S.undo.pop()); S.dirty = true; toast('Undone (' + S.undo.length + ' more)'); }
function redo() { if (!S.redo.length) return toast('Nothing to redo'); S.undo.push(snapshot()); restore(S.redo.pop()); S.dirty = true; toast('Redone'); }
function updateUndoUI() { if (!root) return; root.querySelector('#ed-undo').disabled = !S.undo.length; root.querySelector('#ed-redo').disabled = !S.redo.length; }
function onKey(e) {
    if (!isEditorOpen()) return;
    const typing = document.activeElement && (document.activeElement.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if ((e.ctrlKey || e.metaKey) && !typing) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); } }
    if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && S.sel && S.sel.kind !== 'edit') { e.preventDefault(); deleteSel(); }
    if (e.key === 'Escape') { const ed = document.querySelector('.ed-tb.editing, .ed-text.editing'); if (ed) ed.blur(); else select(null); }
}
function deleteSel() {
    if (!S.sel) return; pushUndo();
    if (S.sel.kind === 'edit') { const arr = S.objs[S.sel.pid]; const i = arr.findIndex(o => o.id === S.sel.id); if (i >= 0) arr.splice(i, 1); const p = pageOfId(S.sel.pid); p.rendered = false; renderPage(p); }
    else { S.objs[S.sel.pid] = S.objs[S.sel.pid].filter(o => o.id !== S.sel.id); renderObjs(pageOfId(S.sel.pid)); }
    S.dirty = true; select(null); updateUndoUI();
}

// ------------------------------------------------------------------ properties bar
let propsLock = false;
function renderPropsSoft() { const n = propsBar.querySelector('[data-k="size"]'); const o = objOf(S.sel); if (n && o) n.value = Math.round(o.size); }
function renderProps() {
    if (!propsBar) return; propsBar.innerHTML = ''; const o = objOf(S.sel);
    const t = o ? o.type : S.tool; const isText = ['text', 'edit', 'pagenum'].includes(t);
    const add = (html) => { const d = document.createElement('span'); d.style.cssText = 'display:inline-flex;gap:6px;align-items:center'; d.innerHTML = html; propsBar.appendChild(d); return d; };
    const set = (k, v) => {
        const tgt = o || null; if (tgt) { if (Date.now() - (set.t || 0) > 900) pushUndo(); set.t = Date.now(); tgt[k] = v; S.dirty = true; if (S.sel.kind === 'edit') { const p = pageOfId(S.sel.pid); const el = S.sel.el; const b = p.blocks.find(x => Math.round(x.x * 10) + '_' + Math.round(x.base * 10) === tgt.key); styleBlock(el, b, tgt); el.style.background = tgt.bg; el.style.color = tgt.color; } else { syncEl(pageOfId(S.sel.pid), tgt); refreshSel(); } }
        const map = { size: 'size', color: isText ? 'color' : 'strokeC', font: 'font', bold: 'bold', italic: 'italic', underline: 'underline', opacity: 'opacity', sw: 'strokeW', rot: 'rot' };
        if (!o || S.sel.kind !== 'edit') { if (k === 'color' && !isText) S.d[t === 'highlight' ? 'hlC' : 'strokeC'] = v; else if (map[k]) S.d[map[k]] = v; }
    };
    if (o && o.type === 'edit' && o.legacy) add('<span style="color:#fbbf24;font-size:.78rem"><i class="fas fa-info-circle"></i> Old Hindi font (Kruti Dev) detected - converted to Unicode. Please check the spelling.</span>');
    if (S.mode === 'redact' || S.mode === 'maskaadhaar') {
        const d = add(S.mode === 'maskaadhaar' ? `<button class="ed-btn save" data-k="a8"><i class="fas fa-magic"></i> Auto-detect Aadhaar (hide first 8 digits)</button>` : `<select data-k="kind"><option value="custom">Words I type</option><option value="aadhaar12">Aadhaar number</option><option value="pan">PAN number</option><option value="phone">Phone numbers</option><option value="email">E-mail addresses</option></select><input type="text" data-k="terms" placeholder="word1, word2" style="width:150px"><button class="ed-btn" data-k="find"><i class="fas fa-search"></i> Find & mark</button>`);
        const a8 = d.querySelector('[data-k=a8]'); if (a8) a8.onclick = () => autoFind('aadhaar8');
        const f = d.querySelector('[data-k=find]'); if (f) { const kind = d.querySelector('[data-k=kind]'), terms = d.querySelector('[data-k=terms]'); kind.onchange = () => { terms.style.display = kind.value === 'custom' ? '' : 'none'; }; f.onclick = () => autoFind(kind.value, terms.value); }
        if (o) { propsBar.appendChild(Object.assign(document.createElement('span'), { className: 'ed-sep' })); const b = document.createElement('button'); b.className = 'ed-btn danger'; b.innerHTML = '<i class="fas fa-trash-alt"></i><span>Remove box</span>'; b.onmousedown = (e) => e.preventDefault(); b.onclick = deleteSel; propsBar.appendChild(b); }
        return;
    }
    if (S.mode === 'forms' && !isText && t !== 'image') { add(`<label><input type="checkbox" data-k="flat" ${S.formFlatten ? 'checked' : ''}> Flatten after filling (cannot be edited again)</label><span style="color:#64748b;font-size:.78rem">Fields are highlighted in blue. Use Text to type anywhere.</span>`).querySelector('[data-k=flat]').onchange = (e) => { S.formFlatten = e.target.checked; }; if (!o) return; }
    if (S.mode === 'pagenumbers') {
        const d = add(`<label>Format <select data-k="fmt"><option value="1">1, 2, 3</option><option value="Page 1">Page 1</option><option value="Page 1 of 10">Page 1 of N</option><option value="1 / 10">1 / N</option></select></label><label>Size <input type="number" data-k="size" min="6" max="48" value="${o ? o.size : 14}"></label><label>Color <input type="color" data-k="color" value="${o ? o.color : '#000000'}"></label>`);
        d.querySelector('[data-k=fmt]').value = S.format;
        d.querySelector('[data-k=fmt]').onchange = (e) => { S.format = e.target.value; S.pages.forEach(p => p.ol && (S.objs[p.id] || []).forEach(x => x.type === 'pagenum' && syncEl(p, x))); refreshSel(); };
        const n = d.querySelector('[data-k=size]'); n.onchange = () => { const pn = Object.values(S.objs).flat().find(x => x.type === 'pagenum'); if (pn) { pn.size = +n.value || 14; syncEl(S.pages.find(p => (S.objs[p.id] || []).includes(pn)), pn); refreshSel(); } };
        const c = d.querySelector('[data-k=color]'); c.oninput = () => { const pn = Object.values(S.objs).flat().find(x => x.type === 'pagenum'); if (pn) { pn.color = c.value; syncEl(S.pages.find(p => (S.objs[p.id] || []).includes(pn)), pn); } };
        return;
    }
    if (isText) {
        const v = o || { size: S.d.size, color: S.d.color, font: S.d.font, bold: S.d.bold, italic: S.d.italic, underline: S.d.underline, opacity: S.d.opacity, rot: S.d.rot, family: S.d.font };
        const fam = o && o.type === 'edit' ? o.family : v.font;
        const d = add(`<label>Font <select data-k="font"><option value="sans">Sans (Helvetica)</option><option value="serif">Serif (Times)</option><option value="mono">Mono (Courier)</option></select></label>
            <label>Size <input type="number" data-k="size" min="4" max="300" value="${Math.round(v.size)}" style="width:62px"></label>
            <button class="ed-btn ${v.bold ? 'active' : ''}" data-k="bold"><b>B</b></button><button class="ed-btn ${v.italic ? 'active' : ''}" data-k="italic"><i>I</i></button><button class="ed-btn ${v.underline ? 'active' : ''}" data-k="underline"><u>U</u></button>
            <label>Color <input type="color" data-k="color" value="${v.color}"></label>
            ${o && o.type === 'edit' ? '' : `<label>Opacity <input type="range" data-k="opacity" min="0.1" max="1" step="0.05" value="${v.opacity == null ? 1 : v.opacity}"></label>`}
            ${S.mode === 'watermark' && !(o && o.type === 'edit') ? `<label>Angle <select data-k="rot"><option value="0">0°</option><option value="45">-45° (diagonal)</option><option value="-45">45°</option><option value="90">90°</option></select></label>` : ''}`);
        const fs = d.querySelector('[data-k=font]'); fs.value = fam; fs.onchange = () => { if (o && o.type === 'edit') set('family', fs.value); else set('font', fs.value); };
        d.querySelector('[data-k=size]').onchange = (e) => set('size', Math.max(4, +e.target.value || 12));
        ['bold', 'italic', 'underline'].forEach(k => d.querySelector(`[data-k=${k}]`).onmousedown = (e) => { e.preventDefault(); const nv = !(o ? o[k] : S.d[k]); set(k, nv); e.currentTarget.classList.toggle('active', nv); });
        d.querySelector('[data-k=color]').oninput = (e) => set('color', e.target.value);
        const op = d.querySelector('[data-k=opacity]'); if (op) op.oninput = () => set('opacity', +op.value);
        const rt = d.querySelector('[data-k=rot]'); if (rt) { rt.value = String(o ? (o.rot || 0) : S.d.rot); rt.onchange = () => set('rot', +rt.value); }
    } else if (['draw', 'line', 'arrow', 'rect', 'ellipse', 'underline', 'strike'].includes(t)) {
        const v = o || { color: S.d.strokeC, sw: S.d.strokeW };
        const d = add(`<label>Color <input type="color" data-k="color" value="${v.color}"></label><label>Width <input type="range" data-k="sw" min="0.5" max="24" step="0.5" value="${v.sw}"></label>${(t === 'rect' || t === 'ellipse') ? `<label><input type="checkbox" data-k="fillon" ${o && o.fill ? 'checked' : ''}> Fill</label><input type="color" data-k="fill" value="${(o && o.fill) || '#ffff00'}">` : ''}`);
        d.querySelector('[data-k=color]').oninput = (e) => set('color', e.target.value); d.querySelector('[data-k=sw]').oninput = (e) => set('sw', +e.target.value);
        const fo = d.querySelector('[data-k=fillon]'); if (fo) { const f = d.querySelector('[data-k=fill]'); fo.onchange = f.oninput = () => { if (o) { o.fill = fo.checked ? f.value : null; syncEl(pageOfId(S.sel.pid), o); } }; }
    } else if (t === 'highlight') {
        const v = o ? o.color : S.d.hlC; const d = add(`<label>Highlight <input type="color" data-k="color" value="${v}"></label>`);
        d.querySelector('input').oninput = (e) => { if (o) { o.color = e.target.value; syncEl(pageOfId(S.sel.pid), o); } S.d.hlC = e.target.value; };
    } else if (t === 'image') {
        const d = add(`<label>Opacity <input type="range" data-k="opacity" min="0.05" max="1" step="0.05" value="${o ? (o.opacity == null ? 1 : o.opacity) : 1}"></label>`);
        d.querySelector('input').oninput = (e) => { if (o) { o.opacity = +e.target.value; syncEl(pageOfId(S.sel.pid), o); S.dirty = true; } };
    } else if (t === 'link' && o) {
        const d = add(`<label>URL <input type="text" data-k="url" value="${esc(o.url || '')}" style="width:200px"></label>`);
        d.querySelector('input').onchange = (e) => { o.url = e.target.value; S.dirty = true; };
    } else { const d = add('<span style="color:#64748b;font-size:.8rem">Select an object or pick a tool to see its options</span>'); }
    if (o) { propsBar.appendChild(Object.assign(document.createElement('span'), { className: 'ed-sep' })); const b = document.createElement('button'); b.className = 'ed-btn danger'; b.innerHTML = '<i class="fas fa-trash-alt"></i><span>Delete</span>'; b.onmousedown = (e) => e.preventDefault(); b.onclick = deleteSel; propsBar.appendChild(b); }
}
export function promptText(title, def, cb) {
    const m = root.querySelector('#ed-prompt'); root.querySelector('#ed-prompt-title').textContent = title;
    const inp = root.querySelector('#ed-prompt-input'); inp.value = def || ''; m.style.display = 'flex'; setTimeout(() => inp.focus(), 50);
    const done = (v) => { m.style.display = 'none'; cb(v); };
    root.querySelector('#ed-prompt-ok').onclick = () => done(inp.value.trim()); root.querySelector('#ed-prompt-cancel').onclick = () => done(null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim()); };
}

// ------------------------------------------------------------------ zoom / navigation
function setScale(s) {
    S.scale = Math.max(0.3, Math.min(5, s));
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => {
        const ratio = scroller.scrollTop / Math.max(1, scroller.scrollHeight);
        S.pages.forEach(p => { if (p.deleted || !p.el) return; sizePage(p); p.rendered = false; renderObjs(p); });
        scroller.scrollTop = ratio * scroller.scrollHeight;
        pagesBox.querySelectorAll('.ed-pgwrap').forEach(w => { if (io) { io.unobserve(w); io.observe(w); } });
        root.querySelector('#ed-zoom').textContent = Math.round(S.scale * 100) + '%';
    }, 80);
    // instant visual feedback
    S.pages.forEach(p => { if (!p.deleted && p.pg) { const [w, h] = dims(p); p.pg.style.width = w * S.scale + 'px'; p.pg.style.height = h * S.scale + 'px'; } });
}
function fitWidth(initial) {
    const p0 = S.pages.find(p => !p.deleted); if (!p0) return;
    const [w] = dims(p0); const avail = Math.max(240, (scroller ? scroller.clientWidth : window.innerWidth) - 24);
    const s = Math.min(avail / w, 2.2);
    if (initial === true) S.scale = s; else setScale(s);
}
function onScroll() {
    const mid = scroller.scrollTop + scroller.clientHeight * 0.4; let cur = 0;
    pagesBox.querySelectorAll('.ed-pgwrap').forEach((w, i) => { if (w.offsetTop <= mid) cur = i; });
    S.curPage = cur; root.querySelector('#page-num').textContent = cur + 1;
}
function gotoPage(i) {
    const ws = pagesBox.querySelectorAll('.ed-pgwrap'); if (i < 0 || i >= ws.length) return;
    scroller.scrollTo({ top: ws[i].offsetTop - 8, behavior: 'smooth' }); S.curPage = i; root.querySelector('#page-num').textContent = i + 1;
}
export const edHelpers = { dims, pageOfId };
