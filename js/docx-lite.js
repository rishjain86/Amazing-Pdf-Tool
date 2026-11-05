// PDF text blocks -> layout (paragraphs / tables / columns) -> .docx (hand-written OOXML, no external libs)
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
const tw = (pt) => Math.round(pt * 20);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function groupLines(blocks) {
    const bs = [...blocks].sort((a, b) => a.base - b.base || a.x - b.x); const lines = [];
    for (const b of bs) {
        const l = lines[lines.length - 1];
        if (l && Math.abs(l.base - b.base) < Math.min(l.size, b.size) * 0.45) { l.blocks.push(b); l.size = Math.max(l.size, b.size); }
        else lines.push({ base: b.base, size: b.size, blocks: [b] });
    }
    lines.forEach(l => { l.blocks.sort((a, b) => a.x - b.x); l.x = l.blocks[0].x; l.right = Math.max(...l.blocks.map(b => b.x + b.w)); l.base = l.blocks.reduce((s, b) => s + b.base, 0) / l.blocks.length; });
    return lines;
}
// vertical projection profile of multi-block lines -> column ranges
export function columnsFromLines(lines, gap = 5) {
    const iv = []; lines.forEach(l => { if (l.blocks.length > 1) l.blocks.forEach(b => iv.push([b.x, b.x + b.w])); });
    iv.sort((a, b) => a[0] - b[0]); let cols = [];
    iv.forEach(i => { const c = cols[cols.length - 1]; if (c && i[0] - c.x1 < gap) c.x1 = Math.max(c.x1, i[1]); else cols.push({ x0: i[0], x1: i[1] }); });
    // merge neighbours that never appear together on one line (e.g. left-aligned header over right-aligned numbers)
    let changed = true;
    while (changed && cols.length > 1) {
        changed = false;
        for (let i = 0; i < cols.length - 1; i++) {
            let together = false;
            for (const l of lines) { if (l.blocks.length < 2) continue; let a = false, b = false; l.blocks.forEach(bl => { const k = colIndex(cols, bl); if (k === i) a = true; if (k === i + 1) b = true; }); if (a && b) { together = true; break; } }
            if (!together) { cols[i].x1 = cols[i + 1].x1; cols.splice(i + 1, 1); changed = true; break; }
        }
    }
    return cols;
}
export const colIndex = (cols, b) => { const cx = b.x + b.w / 2; let best = 0, bd = 1e9; cols.forEach((c, i) => { const d = cx >= c.x0 && cx <= c.x1 ? 0 : Math.min(Math.abs(cx - c.x0), Math.abs(cx - c.x1)); if (d < bd) { bd = d; best = i; } }); return best; };

export function layoutPage(blocks, W, H, flow) {
    const lines = groupLines(blocks); const m = { l: 36, r: 36, t: 36, b: 12 };
    if (blocks.length) {
        m.l = clamp(Math.min(...blocks.map(b => b.x)), 14, 110); m.r = clamp(W - Math.max(...blocks.map(b => b.x + b.w)), 14, 110);
        m.t = clamp(Math.min(...blocks.map(b => b.base - b.size)), 10, 110);
    }
    const areaW = W - m.l - m.r, els = []; let cursor = m.t;
    const pushPara = (runsBlocks, line, para) => {
        const size = Math.max(...runsBlocks.map(b => b.size)); const H1 = Math.max(size * 1.2, para.pitch || 0);
        const top = line.base - size * 0.8 - (H1 - size * 1.2) * 0.5; let before = Math.max(0, top - cursor); cursor = Math.max(cursor, top) + H1;
        els.push({ kind: 'p', before, line: H1, blocks: runsBlocks, ind: para.ind, jc: para.jc, tabs: para.tabs || [], lines: para.lines });
    };
    let i = 0;
    while (i < lines.length) {
        // table run?
        if (lines[i].blocks.length > 1) {
            let j = i; while (j + 1 < lines.length && lines[j + 1].blocks.length > 1 && lines[j + 1].base - lines[j].base < Math.max(lines[j].size, lines[j + 1].size) * 3) j++;
            const run = lines.slice(i, j + 1); const cols = columnsFromLines(run, 5);
            if (run.length >= 2 && cols.length >= 2) {
                // include single-block lines that sit between table rows? keep simple: only the run
                const starts = cols.map((c, k) => k === 0 ? c.x0 : (cols[k - 1].x1 + c.x0) / 2); starts.push(Math.max(...run.map(l => l.right)) + 4);
                const widths = starts.slice(0, -1).map((s, k) => starts[k + 1] - s);
                const rows = run.map(l => { const cells = cols.map(() => []); l.blocks.forEach(b => cells[colIndex(cols, b)].push(b)); return { cells, size: l.size, base: l.base }; });
                const size0 = run[0].size, top = run[0].base - size0 * 0.8; const before = Math.max(0, top - cursor);
                let rowsH = 0; const rowDefs = rows.map((r, k) => { const next = rows[k + 1]; const h = next ? Math.max(r.size * 1.2, next.base - r.base) : r.size * 1.3; rowsH += h; return { cells: r.cells, h }; });
                els.push({ kind: 'tbl', before, ind: starts[0] - m.l, widths, rows: rowDefs }); cursor = Math.max(cursor, top) + rowsH; i = j + 1; continue;
            }
        }
        const L = lines[i], first = L.blocks[0]; const centre = (L.x + L.right) / 2, pageC = W / 2;
        let jc = null, ind = L.x - m.l, tabs = [];
        if (L.blocks.length === 1) {
            if (Math.abs(centre - pageC) < 8 && L.x - m.l > 24 && (W - L.right) - m.r > 24) { jc = 'center'; ind = 0; }
            else if (Math.abs(L.right - (W - m.r)) < 6 && L.x - m.l > areaW * 0.35) { jc = 'right'; ind = 0; }
        } else tabs = L.blocks.slice(1).map(b => b.x - m.l);
        const para = { ind: Math.max(0, ind), jc, tabs, lines: 1 };
        let blocksOfPara = L.blocks;
        if (flow && L.blocks.length === 1 && !jc) {
            let k = i; const texts = [first]; let lastSize = first.size;
            while (k + 1 < lines.length && lines[k + 1].blocks.length === 1 && Math.abs(lines[k + 1].x - L.x) < 6 && Math.abs(lines[k + 1].blocks[0].size - first.size) < 0.6 && lines[k + 1].base - lines[k].base < first.size * 1.6 && lines[k + 1].base - lines[k].base > first.size * 0.9) {
                const nb = lines[k + 1].blocks[0]; const prev = texts[texts.length - 1];
                texts.push({ ...nb, str: (/-$/.test(prev.str) ? '' : ' ') + nb.str }); k++;
            }
            if (k > i) { const merged = texts.map((t, ti) => ti === 0 ? t : t); const o = { ...first, str: texts.map(t => t.str).join('').replace(/-\s?(?=\S)/g, (mm) => mm) }; blocksOfPara = [o]; para.pitch = lines[i + 1].base - lines[i].base; para.flowLines = k - i + 1; pushFlow(); i = k + 1; continue; }
        }
        function pushFlow() { const size = first.size; const H1 = Math.max(size * 1.2, para.pitch); const top = L.base - size * 0.8 - (H1 - size * 1.2) * 0.5; const before = Math.max(0, top - cursor); els.push({ kind: 'p', before, line: H1, blocks: blocksOfPara, ind: para.ind, jc: null, tabs: [], flow: true }); cursor = Math.max(cursor, top) + H1 * para.flowLines; }
        pushPara(blocksOfPara, L, para); i++;
    }
    return { m, els };
}

const cleanFont = (n = '') => {
    n = String(n).replace(/^[A-Z]{6}\+/, ''); const f = n.split(/[-,]/)[0].replace(/(MT|PS|PSMT)$/, '');
    if (/times/i.test(f)) return 'Times New Roman'; if (/arial|helvet/i.test(f)) return 'Arial'; if (/courier/i.test(f)) return 'Courier New'; if (/calibri/i.test(f)) return 'Calibri'; if (/cambria/i.test(f)) return 'Cambria'; if (/verdana/i.test(f)) return 'Verdana'; if (/tahoma/i.test(f)) return 'Tahoma';
    if (!f || /^g_d|^f\d|^font/i.test(f)) return 'Arial'; return f.replace(/([a-z])([A-Z])/g, '$1 $2');
};
const runXml = (b) => {
    const sz = Math.max(2, Math.round(b.size * 2)); const fn = esc(b.fontName ? cleanFont(b.fontName) : (b.family === 'serif' ? 'Times New Roman' : b.family === 'mono' ? 'Courier New' : 'Arial'));
    return `<w:r><w:rPr><w:rFonts w:ascii="${fn}" w:hAnsi="${fn}" w:cs="${fn}" w:eastAsia="${fn}"/>${b.bold ? '<w:b/><w:bCs/>' : ''}${b.italic ? '<w:i/><w:iCs/>' : ''}${b.color && b.color !== '#000000' ? `<w:color w:val="${b.color.slice(1)}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(b.str)}</w:t></w:r>`;
};
const sect = (pg) => `<w:sectPr><w:pgSz w:w="${tw(pg.w)}" w:h="${tw(pg.h)}"/><w:pgMar w:top="${tw(pg.lay.m.t)}" w:right="${tw(pg.lay.m.r)}" w:bottom="${tw(pg.lay.m.b)}" w:left="${tw(pg.lay.m.l)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;

export async function buildDocx(pages, JSZip, flow) {
    const z = new JSZip(); const rels = []; const media = []; let rid = 10, docId = 1;
    const body = [];
    pages.forEach((pg, pi) => {
        pg.lay = layoutPage(pg.blocks, pg.w, pg.h, flow); const last = pi === pages.length - 1;
        // host paragraph for floating images
        const imgRuns = (pg.images || []).map(im => {
            const id = 'rId' + (rid++); const name = `image${media.length + 1}.${im.ext || 'png'}`; media.push({ name, data: im.data }); rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
            const cx = Math.round(im.w * 12700), cy = Math.round(im.h * 12700);
            return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${docId}" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(im.x * 12700)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(im.y * 12700)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${docId++}" name="Picture ${docId}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
        }).join('');
        if (imgRuns) body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${imgRuns}</w:p>`);
        pg.lay.els.forEach(el => {
            if (el.kind === 'p') {
                const tabs = el.tabs.length ? `<w:tabs>${el.tabs.map(t => `<w:tab w:val="left" w:pos="${tw(t)}"/>`).join('')}</w:tabs>` : '';
                const runs = el.blocks.map((b, k) => (k ? '<w:r><w:tab/></w:r>' : '') + runXml(b)).join('');
                body.push(`<w:p><w:pPr>${tabs}<w:spacing w:before="${tw(el.before)}" w:after="0" w:line="${tw(el.line)}" w:lineRule="exact"/><w:ind w:left="${tw(el.ind)}" w:right="0"/>${el.jc ? `<w:jc w:val="${el.jc}"/>` : ''}</w:pPr>${runs}</w:p>`);
            } else {
                if (el.before > 1) body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.max(20, tw(el.before))}" w:lineRule="exact"/></w:pPr></w:p>`);
                const total = el.widths.reduce((a, b) => a + b, 0); const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join('');
                body.push(`<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="${tw(el.ind)}" w:type="dxa"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${el.widths.map(w => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>${el.rows.map(r => `<w:tr><w:trPr><w:trHeight w:val="${tw(r.h)}" w:hRule="atLeast"/></w:trPr>${r.cells.map((c, k) => `<w:tc><w:tcPr><w:tcW w:w="${tw(el.widths[k])}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${c.map((b, q) => (q ? runXml({ ...b, str: ' ' }) : '') + runXml(b)).join('')}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`);
            }
        });
        const sp = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${last ? '' : sect(pg)}</w:pPr></w:p>`;
        body.push(sp);
    });
    const lastPg = pages[pages.length - 1];
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}${sect(lastPg)}</w:body></w:document>`;
    z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`);
    z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`);
    z.file('word/document.xml', doc);
    media.forEach(m => z.file('word/media/' + m.name, m.data));
    return await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
