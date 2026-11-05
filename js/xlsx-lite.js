// Minimal, dependency-free .xlsx reader (values + styles) and writer. Uses JSZip + DOMParser.
const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
const INDEXED = { 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00', 12: '0000FF', 13: 'FFFF00', 14: 'FF00FF', 15: '00FFFF', 64: '000000' };
const BUILTIN_FMT = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm', 37: '#,##0;(#,##0)', 38: '#,##0;(#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;(#,##0.00)', 49: '@' };
const X = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (n, tag) => Array.from(n ? n.getElementsByTagName(tag) : []);
const colNum = (ref) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const rowNum = (ref) => parseInt(ref.replace(/[A-Z]/gi, ''), 10) - 1;
function color(el) {
    if (!el) return null; let rgb = el.getAttribute('rgb'), th = el.getAttribute('theme'), ix = el.getAttribute('indexed'), hex = null;
    if (rgb) hex = rgb.slice(-6); else if (th != null) hex = THEME[+th] || '000000'; else if (ix != null) hex = INDEXED[+ix] || '000000'; else return null;
    const tint = parseFloat(el.getAttribute('tint') || '0');
    if (tint) { const c = [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16)).map(v => Math.round(tint > 0 ? v + (255 - v) * tint : v * (1 + tint))); hex = c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''); }
    return '#' + hex;
}

export function excelDate(n) { const ms = Math.round((n - 25569) * 86400000); return new Date(ms); }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = (n) => String(n).padStart(2, '0');

export function formatValue(v, code) {
    if (typeof v !== 'number') return String(v == null ? '' : v);
    if (!code || code === 'General') { if (Number.isInteger(v)) return String(v); const s = String(+v.toPrecision(10)); return s; }
    let sec = code.split(';'); let c = sec[0]; if (v < 0 && sec[1]) { c = sec[1]; v = -v; } else if (v === 0 && sec[2]) c = sec[2];
    c = c.replace(/\[(?!h|m|s)[^\]]*\]/gi, '').replace(/_./g, ' ').replace(/\\(.)/g, '$1').replace(/\*./g, '');
    const lit = []; c = c.replace(/"([^"]*)"/g, (m, t) => { lit.push(t); return '\u0001' + (lit.length - 1) + '\u0001'; });
    const restore = (s) => s.replace(/\u0001(\d+)\u0001/g, (m, i) => lit[+i]);
    if (/[ymdhs]/i.test(c.replace(/\u0001\d+\u0001/g, '').replace(/e\+?0+/i, '')) && !/[#0]/.test(c.replace(/\u0001\d+\u0001/g, '').replace(/[ymdhs]+/gi, ''))) {
        const d = excelDate(v); let h = d.getUTCHours(); const ampm = /am\/pm/i.test(c);
        let out = c.replace(/am\/pm/i, h >= 12 ? 'PM' : 'AM');
        out = out.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s/gi, (t) => {
            const T = t.toLowerCase();
            if (T === 'yyyy') return d.getUTCFullYear(); if (T === 'yy') return p2(d.getUTCFullYear() % 100);
            if (T === 'mmmm') return MONF[d.getUTCMonth()]; if (T === 'mmm') return MON[d.getUTCMonth()];
            if (T === 'dddd') return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]; if (T === 'ddd') return DAY[d.getUTCDay()];
            if (T === 'dd') return p2(d.getUTCDate()); if (T === 'd') return d.getUTCDate();
            if (T === 'hh' || T === 'h') { let hh = ampm ? (h % 12 || 12) : h; return T === 'hh' ? p2(hh) : hh; }
            if (T === 'ss') return p2(d.getUTCSeconds()); if (T === 's') return d.getUTCSeconds();
            return t;
        });
        // minutes: 'mm'/'m' after h or before s mean minutes
        if (/h/i.test(c) || /s/i.test(c)) { out = out.replace(/(\d{1,2}):(\w+)/, (m, a, b) => m); }
        return restore(out);
    }
    const pct = /%/.test(c); if (pct) v *= 100;
    const m = c.match(/0\.(0+)/) || c.match(/#\.(#*0+)/); const dec = m ? m[1].length : 0;
    const comma = /#,#|0,0/.test(c);
    let s = Math.abs(v).toFixed(dec); if (/E\+?0/i.test(c)) s = v.toExponential(dec).replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2');
    else if (comma) { const [i, f] = s.split('.'); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); }
    if (v < 0) s = '-' + s;
    const body = c.match(/[#0.,%]+(?:E[+-]?0+)?/i);
    let res = body ? c.replace(body[0], '\u0002') : '\u0002'; res = res.replace('\u0002', s.replace(/^-/, '') ).replace(/[#?]/g, '');
    if (v < 0 && !sec[1]) res = '-' + res; else if (v < 0 && sec[1] && !/\(/.test(sec[1])) res = '-' + res;
    res = restore(res).replace(/%+/g, ''); return pct ? res + '%' : res;
}

export async function parseXlsx(buf, JSZip) {
    const zip = await JSZip.loadAsync(buf); const rd = async (p) => { const f = zip.file(p); return f ? X(await f.async('string')) : null; };
    const wb = await rd('xl/workbook.xml'); if (!wb) throw new Error('This is not a valid .xlsx file.');
    const rels = await rd('xl/_rels/workbook.xml.rels'); const relMap = {}; kids(rels, 'Relationship').forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
    const sst = await rd('xl/sharedStrings.xml'); const strings = kids(sst, 'si').map(si => kids(si, 't').filter(t => !t.parentNode || t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join(''));
    const st = await rd('xl/styles.xml'); const numFmts = {}; kids(st, 'numFmt').forEach(n => numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'));
    const fontsEl = st ? st.getElementsByTagName('fonts')[0] : null, fillsEl = st ? st.getElementsByTagName('fills')[0] : null, bordersEl = st ? st.getElementsByTagName('borders')[0] : null, xfsEl = st ? st.getElementsByTagName('cellXfs')[0] : null;
    const fonts = Array.from(fontsEl ? fontsEl.children : []).map(f => ({ b: !!f.getElementsByTagName('b')[0], i: !!f.getElementsByTagName('i')[0], u: !!f.getElementsByTagName('u')[0], sz: parseFloat((f.getElementsByTagName('sz')[0] || { getAttribute: () => 11 }).getAttribute('val')), name: (f.getElementsByTagName('name')[0] || { getAttribute: () => 'Calibri' }).getAttribute('val'), color: color(f.getElementsByTagName('color')[0]) }));
    const fills = Array.from(fillsEl ? fillsEl.children : []).map(f => { const pf = f.getElementsByTagName('patternFill')[0]; if (!pf || pf.getAttribute('patternType') === 'none') return null; return color(pf.getElementsByTagName('fgColor')[0]) || null; });
    const borders = Array.from(bordersEl ? bordersEl.children : []).map(b => { const o = {}; ['left', 'right', 'top', 'bottom'].forEach(k => { const e = b.getElementsByTagName(k)[0]; if (e && e.getAttribute('style')) o[k[0]] = { style: e.getAttribute('style'), color: color(e.getElementsByTagName('color')[0]) || '#000000' }; }); return o; });
    const xfs = Array.from(xfsEl ? xfsEl.children : []).map(x => { const al = x.getElementsByTagName('alignment')[0]; return { fmt: numFmts[x.getAttribute('numFmtId')] || BUILTIN_FMT[x.getAttribute('numFmtId')] || 'General', font: fonts[+x.getAttribute('fontId')] || fonts[0] || {}, fill: fills[+x.getAttribute('fillId')] || null, border: borders[+x.getAttribute('borderId')] || {}, h: al ? al.getAttribute('horizontal') : null, v: al ? al.getAttribute('vertical') : null, wrap: al ? al.getAttribute('wrapText') === '1' : false }; });
    const sheets = [];
    for (const s of kids(wb, 'sheet')) {
        const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
        let target = relMap[rid]; if (!target) continue; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
        const doc = await rd(target); if (!doc) continue;
        const fp = doc.getElementsByTagName('sheetFormatPr')[0]; const defW = fp && fp.getAttribute('defaultColWidth') ? parseFloat(fp.getAttribute('defaultColWidth')) : 8.43; const defH = fp && fp.getAttribute('defaultRowHeight') ? parseFloat(fp.getAttribute('defaultRowHeight')) : 15;
        const colW = {}; kids(doc, 'col').forEach(c => { const w = parseFloat(c.getAttribute('width')); const hid = c.getAttribute('hidden') === '1'; for (let i = +c.getAttribute('min') - 1; i < Math.min(+c.getAttribute('max'), 300); i++) colW[i] = hid ? 0 : w; });
        const cells = {}, rowH = {}; let maxR = -1, maxC = -1;
        kids(doc, 'row').forEach(r => {
            const ri = parseInt(r.getAttribute('r'), 10) - 1; if (r.getAttribute('hidden') === '1') rowH[ri] = 0; else if (r.getAttribute('ht')) rowH[ri] = parseFloat(r.getAttribute('ht'));
            Array.from(r.children).forEach((c, idx) => {
                if (c.nodeName !== 'c') return; const ref = c.getAttribute('r'); const ci = ref ? colNum(ref) : idx; const t = c.getAttribute('t'); const xf = xfs[+(c.getAttribute('s') || 0)] || xfs[0] || { fmt: 'General', font: {}, border: {} };
                const vEl = c.getElementsByTagName('v')[0]; let val = null, raw = null;
                if (t === 's') val = strings[+vEl.textContent]; else if (t === 'inlineStr') val = kids(c, 't').map(x => x.textContent).join(''); else if (t === 'b') val = vEl && vEl.textContent === '1' ? 'TRUE' : 'FALSE'; else if (t === 'str' || t === 'e') val = vEl ? vEl.textContent : ''; else if (vEl && vEl.textContent !== '') { raw = parseFloat(vEl.textContent); val = formatValue(raw, xf.fmt); }
                const hasStyle = xf.fill || Object.keys(xf.border).length;
                if (val == null && !hasStyle) return;
                cells[ri + ',' + ci] = { v: val == null ? '' : String(val), num: raw != null, xf }; if (ri > maxR) maxR = ri; if (ci > maxC) maxC = ci;
            });
        });
        const merges = kids(doc, 'mergeCell').map(m => { const [a, b] = m.getAttribute('ref').split(':'); return { r1: rowNum(a), c1: colNum(a), r2: rowNum(b || a), c2: colNum(b || a) }; });
        merges.forEach(m => { if (m.r2 > maxR) maxR = m.r2; if (m.c2 > maxC) maxC = m.c2; });
        sheets.push({ name: s.getAttribute('name'), cells, merges, colW, rowH, defW, defH, rows: maxR + 1, cols: maxC + 1 });
    }
    return sheets;
}

export function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false; text = text.replace(/^\uFEFF/, '');
    const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',');
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === delim) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); } return rows;
}
export function sheetFromRows(name, rows) {
    const cells = {}; let mc = 0; rows.forEach((r, ri) => r.forEach((v, ci) => { if (v === '' || v == null) return; const isNum = typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)); cells[ri + ',' + ci] = { v: String(v), num: isNum, xf: { fmt: 'General', font: {}, border: {} } }; mc = Math.max(mc, ci); }));
    return { name, cells, merges: [], colW: {}, rowH: {}, defW: 12, defH: 15, rows: rows.length, cols: mc + 1 };
}

// ---------------- writer ----------------
const xe = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
// sheets: [{name, rows:[[{v, n?:number, pct?:bool, bold?:bool}|string|number|null]], widths:[chars]}]
export async function buildXlsx(sheets, JSZip) {
    const z = new JSZip();
    z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31) || 'Sheet' + (i + 1))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`);
    sheets.forEach((s, i) => {
        const cols = (s.widths || []).map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${Math.max(6, Math.min(80, w)).toFixed(1)}" customWidth="1"/>`).join('');
        const rows = s.rows.map((r, ri) => { const cs = r.map((c, ci) => {
            if (c == null || c === '') return ''; if (typeof c !== 'object') c = { v: c }; const ref = colName(ci) + (ri + 1);
            if (typeof c.n === 'number') return `<c r="${ref}" s="${c.pct ? 1 : (c.dec ? 3 : 0)}"><v>${c.n}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${c.bold ? ' s="2"' : ''}><is><t xml:space="preserve">${xe(c.v)}</t></is></c>`; }).join(''); return cs ? `<row r="${ri + 1}">${cs}</row>` : ''; }).join('');
        z.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`);
    });
    return await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
