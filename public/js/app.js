// Import PDF-lib from CDN for client-side processing
import { PDFDocument, degrees, StandardFonts, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
// Import PDF.js for text extraction
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

import { AdManager } from './adManager.js';

// --- GLOBAL ROUTING ---
window.switchView = (viewId) => {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => btn.getAttribute('onclick').includes(viewId));
    if(activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`view-${viewId}`).classList.add('active');
};

// --- DYNAMIC UI INJECTION ---
const views = ['merge', 'split', 'compress', 'rotate', 'pagenumbers', 'jpgtopdf', 'extract', 'watermark', 'sign', 'protect', 'unlock'];
const ui = {};
views.forEach(v => ui[v] = document.getElementById(`${v}-ui-container`));

const dropZoneStyle = "border: 2px dashed var(--accent); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.05); transition: 0.3s; margin-bottom: 20px;";
const btnStyle = "background: var(--accent); color: white; border: none; padding: 14px 24px; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 15px;";
const inputStyle = "width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 15px;";
const fileListStyle = "display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;";
const fileItemStyle = "display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border);";

// Helper for single file UI generation
const generateSingleFileUI = (id, icon, color, title, btnText, extraHtml = "") => `
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Select PDF to ${title}</h3>
        <input type="file" id="${id}-file-input" accept="application/pdf" style="display: none;">
    </div>
    <div id="${id}-file-info" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas ${icon}"></i> ${btnText}</button>
    </div>
`;

// Inject Multi-file UIs
if (ui.merge) {
    ui.merge.innerHTML = `
        <div id="merge-drop-zone" style="${dropZoneStyle}"><i class="fas fa-cloud-upload-alt" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i><h3>Drag & Drop PDFs here</h3><input type="file" id="merge-file-input" multiple accept="application/pdf" style="display: none;"></div>
        <div id="merge-file-list" style="${fileListStyle}"></div><button id="btn-merge-action" style="${btnStyle}; display: none;"><i class="fas fa-object-group"></i> Merge Files Now</button>
    `;
}
if (ui.jpgtopdf) {
    ui.jpgtopdf.innerHTML = `
        <div id="jpgtopdf-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#eab308')}"><i class="fas fa-images" style="font-size: 3rem; color: #eab308; margin-bottom: 15px;"></i><h3>Drag & Drop Images</h3><input type="file" id="jpgtopdf-file-input" multiple accept="image/*" style="display: none;"></div>
        <div id="jpgtopdf-file-list" style="${fileListStyle}"></div><button id="btn-jpgtopdf-action" style="${btnStyle.replace('var(--accent)', '#eab308')}; display: none;"><i class="fas fa-file-pdf"></i> Convert to PDF</button>
    `;
}

// Inject Single-file UIs
if (ui.split) ui.split.innerHTML = generateSingleFileUI('split', 'fa-cut', '#f59e0b', 'Split', 'Split & Download', `<label style="color: var(--text-secondary);">Pages to Extract (e.g., 1-3):</label><input type="text" id="split-ranges" placeholder="e.g. 1-3" style="${inputStyle}">`);
if (ui.compress) ui.compress.innerHTML = generateSingleFileUI('compress', 'fa-compress-arrows-alt', '#10b981', 'Compress', 'Compress PDF');
if (ui.rotate) ui.rotate.innerHTML = generateSingleFileUI('rotate', 'fa-sync-alt', '#3b82f6', 'Rotate', 'Rotate & Download', `<label style="color:var(--text-secondary);">Angle:</label><select id="rotate-angle" style="${inputStyle}"><option value="90">Right 90°</option><option value="180">Upside Down 180°</option><option value="-90">Left -90°</option></select>`);
if (ui.pagenumbers) ui.pagenumbers.innerHTML = generateSingleFileUI('pagenumbers', 'fa-sort-numeric-down', '#6366f1', 'Add Numbers', 'Add Numbers');
if (ui.protect) ui.protect.innerHTML = generateSingleFileUI('protect', 'fa-lock', '#8b5cf6', 'Protect', 'Encrypt PDF', `<input type="password" id="protect-password" placeholder="Set Password" style="${inputStyle}">`);
if (ui.unlock) ui.unlock.innerHTML = generateSingleFileUI('unlock', 'fa-unlock', '#06b6d4', 'Unlock', 'Unlock PDF', `<input type="password" id="unlock-password" placeholder="Current Password" style="${inputStyle}">`);
if (ui.extract) ui.extract.innerHTML = generateSingleFileUI('extract', 'fa-file-alt', '#14b8a6', 'Extract Text', 'Extract & Download TXT');
if (ui.watermark) ui.watermark.innerHTML = generateSingleFileUI('watermark', 'fa-stamp', '#ec4899', 'Watermark', 'Add Watermark', `<input type="text" id="watermark-text" placeholder="Enter Watermark Text (e.g., CONFIDENTIAL)" style="${inputStyle}">`);
if (ui.sign) ui.sign.innerHTML = generateSingleFileUI('sign', 'fa-signature', '#8b5cf6', 'Sign', 'Sign Document', `<input type="text" id="sign-text" placeholder="Type your Full Name to sign" style="${inputStyle}">`);

// --- UTILITIES & COMMON SINGLE FILE HANDLER ---
function downloadBlob(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function setupSingleFileLogic(id, actionCallback) {
    const dropZone = document.getElementById(`${id}-drop-zone`);
    const input = document.getElementById(`${id}-file-input`);
    const info = document.getElementById(`${id}-file-info`);
    const controls = document.getElementById(`${id}-controls`);
    const btn = document.getElementById(`btn-${id}-action`);
    let currentFile = null;

    if (!dropZone) return;

    dropZone.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            currentFile = file;
            dropZone.style.display = 'none';
            info.innerHTML = `<div style="${fileItemStyle}">
                <div style="display:flex; align-items:center; gap:15px;"><i class="fas fa-file-pdf" style="color:#ef4444; font-size:1.5rem;"></i><b>${file.name}</b></div>
                <button id="reset-${id}" style="background:var(--glass-border); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;"><i class="fas fa-times"></i></button>
            </div>`;
            controls.style.display = 'block';
            
            document.getElementById(`reset-${id}`).addEventListener('click', () => {
                currentFile = null; input.value = '';
                dropZone.style.display = 'block'; info.innerHTML = ''; controls.style.display = 'none';
            });
        }
    });

    btn.addEventListener('click', async () => {
        if (!currentFile) return;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        try {
            await actionCallback(currentFile);
            await AdManager.showInterstitial();
            document.getElementById(`reset-${id}`).click();
        } catch (error) {
            alert(`Error processing PDF: ${error.message}`);
            console.error(error);
        } finally {
            btn.innerHTML = originalText;
        }
    });
}

// --- LOGIC IMPLEMENTATIONS ---

// Extract Text
setupSingleFileLogic('extract', async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    const encoder = new TextEncoder();
    downloadBlob(encoder.encode(fullText), 'Amazing_Extracted.txt', 'text/plain');
});

// Watermark PDF
setupSingleFileLogic('watermark', async (file) => {
    const text = document.getElementById('watermark-text').value || "CONFIDENTIAL";
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    pdfDoc.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        const textSize = 60;
        const textWidth = font.widthOfTextAtSize(text, textSize);
        page.drawText(text, {
            x: width / 2 - textWidth / 2,
            y: height / 2,
            size: textSize,
            font: font,
            color: rgb(0.75, 0.75, 0.75), // Light Gray
            opacity: 0.5,
            rotate: degrees(45),
        });
    });
    
    const pdfBytes = await pdfDoc.save();
    downloadBlob(pdfBytes, 'Amazing_Watermarked.pdf', 'application/pdf');
});

// Sign PDF
setupSingleFileLogic('sign', async (file) => {
    const name = document.getElementById('sign-text').value;
    if (!name) throw new Error("Please type a name to sign.");
    
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic); // Cursive-like standard font
    
    const page = pdfDoc.getPages()[0]; // Sign on first page
    const { width } = page.getSize();
    
    page.drawText(`Signed by: ${name}`, {
        x: width - 200,
        y: 50, // Bottom right corner
        size: 18,
        font: font,
        color: rgb(0, 0, 0.8), // Dark blue ink
    });
    
    const pdfBytes = await pdfDoc.save();
    downloadBlob(pdfBytes, 'Amazing_Signed.pdf', 'application/pdf');
});

// Protect PDF
setupSingleFileLogic('protect', async (file) => {
    const password = document.getElementById('protect-password').value;
    if (!password) throw new Error("Password required");
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    await pdfDoc.encrypt({ userPassword: password, ownerPassword: password });
    downloadBlob(await pdfDoc.save(), 'Amazing_Protected.pdf', 'application/pdf');
});

// Unlock PDF
setupSingleFileLogic('unlock', async (file) => {
    const password = document.getElementById('unlock-password').value;
    if (!password) throw new Error("Current password required");
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { password: password });
    downloadBlob(await pdfDoc.save(), 'Amazing_Unlocked.pdf', 'application/pdf');
});

// Compress PDF
setupSingleFileLogic('compress', async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach(p => newPdf.addPage(p));
    downloadBlob(await newPdf.save({ useObjectStreams: true }), 'Amazing_Compressed.pdf', 'application/pdf');
});

// Rotate PDF
setupSingleFileLogic('rotate', async (file) => {
    const angle = parseInt(document.getElementById('rotate-angle').value);
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    pdfDoc.getPages().forEach(p => p.setRotation(degrees(p.getRotation().angle + angle)));
    downloadBlob(await pdfDoc.save(), 'Amazing_Rotated.pdf', 'application/pdf');
});

// Split PDF
setupSingleFileLogic('split', async (file) => {
    const rangeStr = document.getElementById('split-ranges').value;
    if (!rangeStr) throw new Error("Range required");
    let pagesToExtract = [];
    rangeStr.split(',').forEach(part => {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1);
            for (let i = start; i <= end; i++) pagesToExtract.push(i);
        } else {
            pagesToExtract.push(parseInt(part.trim()) - 1);
        }
    });
    const arrayBuffer = await file.arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer);
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pagesToExtract);
    copiedPages.forEach(p => newPdf.addPage(p));
    downloadBlob(await newPdf.save(), 'Amazing_Split.pdf', 'application/pdf');
});

// Merge PDF Logic (Multi-file)
let mergeFiles = [];
if (ui.merge) {
    const mergeInput = document.getElementById('merge-file-input');
    document.getElementById('merge-drop-zone').addEventListener('click', () => mergeInput.click());
    mergeInput.addEventListener('change', (e) => {
        mergeFiles = [...mergeFiles, ...Array.from(e.target.files).filter(f => f.type === 'application/pdf')];
        renderMergeList();
    });
    
    function renderMergeList() {
        const list = document.getElementById('merge-file-list');
        list.innerHTML = '';
        mergeFiles.forEach((file, i) => {
            list.innerHTML += `<div style="${fileItemStyle}"><div><b>${file.name}</b></div><button onclick="removeMerge(${i})" style="background:#ef4444; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer;">X</button></div>`;
        });
        document.getElementById('btn-merge-action').style.display = mergeFiles.length > 1 ? 'block' : 'none';
    }
    window.removeMerge = (i) => { mergeFiles.splice(i, 1); renderMergeList(); };
    
    document.getElementById('btn-merge-action').addEventListener('click', async () => {
        const btn = document.getElementById('btn-merge-action');
        btn.innerHTML = 'Processing...';
        try {
            const mergedPdf = await PDFDocument.create();
            for (const file of mergeFiles) {
                const pdf = await PDFDocument.load(await file.arrayBuffer());
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(p => mergedPdf.addPage(p));
            }
            downloadBlob(await mergedPdf.save(), 'Amazing_Merged.pdf', 'application/pdf');
            await AdManager.showInterstitial();
            mergeFiles = []; renderMergeList();
        } catch (e) { alert("Error merging"); }
        finally { btn.innerHTML = 'Merge Files Now'; }
    });
}
