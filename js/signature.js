// Signature dialog: draw / type / upload, with saved signatures (stored only on this device)
const KEY = 'amazingpdf_signatures';
const FONTS = ['Dancing Script', 'Great Vibes', 'Caveat', 'Satisfy'];
let fontsLinked = false;

function loadSaved() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
function saveList(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 6))); } catch (e) { } }

function trim(canvas) {
    const ctx = canvas.getContext('2d'); const { width: w, height: h } = canvas;
    const d = ctx.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    const pad = 6, out = document.createElement('canvas'); out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
    out.getContext('2d').drawImage(canvas, x0, y0, x1 - x0, y1 - y0, pad, pad, x1 - x0, y1 - y0);
    return out.toDataURL('image/png');
}

export function openSignatureDialog(host) {
    return new Promise((resolve) => {
        if (!fontsLinked) {
            fontsLinked = true; const l = document.createElement('link'); l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Caveat:wght@600&family=Satisfy&display=swap'; document.head.appendChild(l);
        }
        let color = '#111827', tab = 'draw', typedFont = FONTS[0], uploaded = null, drawn = false;
        const m = document.createElement('div'); m.className = 'ed-modal'; m.style.display = 'flex';
        const saved = loadSaved();
        m.innerHTML = `<div class="box">
            <h3 style="margin-bottom:12px"><i class="fas fa-signature"></i> Your signature</h3>
            ${saved.length ? `<div style="margin-bottom:12px"><div style="font-size:.78rem;color:#94a3b8;margin-bottom:6px">Saved signatures (stored only on this device)</div><div id="sg-saved" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>` : ''}
            <div style="display:flex;gap:6px;margin-bottom:10px">
                <button class="ed-btn active" data-t="draw">Draw</button><button class="ed-btn" data-t="type">Type</button><button class="ed-btn" data-t="upload">Upload</button>
                <span style="flex:1"></span><input type="color" id="sg-color" value="${color}" style="width:34px;height:32px;border:none;background:none">
            </div>
            <div id="sg-draw"><canvas id="sg-pad" width="900" height="300" style="width:100%;height:150px;background:#fff;border-radius:8px;touch-action:none;cursor:crosshair"></canvas>
                <button class="ed-btn" id="sg-clear" style="margin-top:6px"><i class="fas fa-eraser"></i> Clear</button></div>
            <div id="sg-type" style="display:none"><input id="sg-text" type="text" placeholder="Type your name" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--glass-border);background:rgba(0,0,0,.3);color:#fff;margin-bottom:8px">
                <div id="sg-fonts" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div></div>
            <div id="sg-upload" style="display:none"><input id="sg-file" type="file" accept="image/*" style="color:#cbd5e1"><div style="font-size:.78rem;color:#94a3b8;margin-top:8px">Tip: sign on white paper and take a clear photo. The white background is removed automatically.</div>
                <img id="sg-prev" style="max-width:100%;max-height:120px;margin-top:10px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px;border-radius:6px;display:none"></div>
            <label style="display:flex;gap:8px;align-items:center;margin:12px 0;font-size:.85rem;color:#cbd5e1"><input type="checkbox" id="sg-remember" checked> Remember this signature on this device</label>
            <div style="display:flex;gap:10px"><button class="ed-btn" id="sg-cancel" style="flex:1;justify-content:center">Cancel</button><button class="ed-btn save" id="sg-ok" style="flex:1;justify-content:center">Use signature</button></div></div>`;
        host.appendChild(m);
        const $ = (s) => m.querySelector(s);
        const done = (v) => { m.remove(); resolve(v); };
        $('#sg-cancel').onclick = () => done(null);
        const sw = $('#sg-saved');
        if (sw) saved.forEach((u, i) => {
            const b = document.createElement('button'); b.className = 'ed-btn'; b.style.cssText = 'padding:4px;background:#fff'; b.innerHTML = `<img src="${u}" style="height:38px;max-width:110px">`;
            b.onclick = () => done(u);
            const x = document.createElement('span'); x.style.cssText = 'position:relative;display:inline-block'; x.appendChild(b);
            const del = document.createElement('i'); del.className = 'fas fa-times-circle'; del.style.cssText = 'position:absolute;right:-5px;top:-6px;color:#ef4444;cursor:pointer;background:#fff;border-radius:50%';
            del.onclick = (ev) => { ev.stopPropagation(); const a = loadSaved(); a.splice(i, 1); saveList(a); x.remove(); }; x.appendChild(del); sw.appendChild(x);
        });
        // tabs
        m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
            tab = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('active', x === b));
            ['draw', 'type', 'upload'].forEach(t => $('#sg-' + t).style.display = t === tab ? 'block' : 'none'); if (tab === 'type') renderFonts();
        });
        $('#sg-color').oninput = (e) => { color = e.target.value; if (tab === 'type') renderFonts(); };
        // draw pad
        const pad = $('#sg-pad'), pc = pad.getContext('2d'); let down = false, last = null;
        const pp = (e) => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height }; };
        pad.onpointerdown = (e) => { down = true; last = pp(e); pad.setPointerCapture(e.pointerId); drawn = true; pc.fillStyle = color; pc.beginPath(); pc.arc(last.x, last.y, 3, 0, 7); pc.fill(); };
        pad.onpointermove = (e) => { if (!down) return; const q = pp(e); pc.strokeStyle = color; pc.lineWidth = 6; pc.lineCap = pc.lineJoin = 'round'; pc.beginPath(); pc.moveTo(last.x, last.y); pc.quadraticCurveTo(last.x, last.y, (last.x + q.x) / 2, (last.y + q.y) / 2); pc.stroke(); last = q; };
        pad.onpointerup = pad.onpointercancel = () => { down = false; };
        $('#sg-clear').onclick = () => { pc.clearRect(0, 0, pad.width, pad.height); drawn = false; };
        // type
        function renderFonts() {
            const box = $('#sg-fonts'); box.innerHTML = ''; const txt = $('#sg-text').value || 'Your Name';
            FONTS.forEach(f => {
                const b = document.createElement('button'); b.className = 'ed-btn' + (f === typedFont ? ' active' : ''); b.style.cssText = `background:#fff;color:${color};font:600 26px "${f}",cursive;justify-content:center;padding:8px;overflow:hidden;white-space:nowrap`;
                b.textContent = txt; b.onclick = () => { typedFont = f; renderFonts(); }; box.appendChild(b);
            });
        }
        $('#sg-text').oninput = renderFonts;
        // upload
        $('#sg-file').onchange = (e) => {
            const f = e.target.files[0]; if (!f) return; const fr = new FileReader();
            fr.onload = () => { const img = new Image(); img.onload = () => {
                const max = 900, k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
                const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, c.width, c.height); const id = cx.getImageData(0, 0, c.width, c.height), d = id.data;
                for (let i = 0; i < d.length; i += 4) { const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; if (lum > 225) d[i + 3] = 0; else if (lum > 170) d[i + 3] = Math.round((225 - lum) / 55 * 255); }
                cx.putImageData(id, 0, 0); uploaded = trim(c); const pv = $('#sg-prev'); if (uploaded) { pv.src = uploaded; pv.style.display = 'block'; }
            }; img.src = fr.result; }; fr.readAsDataURL(f);
        };
        $('#sg-ok').onclick = async () => {
            let url = null;
            if (tab === 'draw') { if (!drawn) { alert('Please draw your signature first.'); return; } url = trim(pad); }
            else if (tab === 'type') {
                const t = $('#sg-text').value.trim(); if (!t) { alert('Please type your name.'); return; }
                try { await document.fonts.load(`60px "${typedFont}"`); } catch (e) { }
                const c = document.createElement('canvas'); c.width = 1400; c.height = 360; const cx = c.getContext('2d');
                cx.font = `600 150px "${typedFont}", cursive`; cx.fillStyle = color; cx.textBaseline = 'middle'; cx.fillText(t, 40, 180, 1320); url = trim(c);
            } else { if (!uploaded) { alert('Please choose an image first.'); return; } url = uploaded; }
            if (!url) { alert('Nothing to use - please try again.'); return; }
            if ($('#sg-remember').checked) { const a = loadSaved().filter(x => x !== url); a.unshift(url); saveList(a); }
            done(url);
        };
    });
}
