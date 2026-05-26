import { PDFDocument, degrees, StandardFonts, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
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
const views = ['merge', 'split', 'delete', 'compress', 'rotate', 'pdftojpg', 'pagenumbers', 'jpgtopdf', 'extract', 'watermark', 'sign', 'protect', 'unlock', 'flatten', 'crop', 'metadata', 'repair'];
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
if (ui.merge) ui.merge.innerHTML = `<div id="merge-drop-zone" style="${dropZoneStyle}"><i class="fas fa-cloud-upload-alt" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i><h3>Drag & Drop PDFs here</h3><input type="file" id="merge-file-input" multiple accept="application/pdf" style="display: none;"></div><div id="merge-file-list" style="${fileListStyle}"></div><button id="btn-merge-action" style="${btnStyle}; display: none;"><i class="fas fa-object-group"></i> Merge Files Now</button>`;
if (ui.jpgtopdf) ui.jpgtopdf.innerHTML = `<div id="jpgtopdf-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#eab308')}"><i class="fas fa-images" style="font-size: 3rem; color: #eab308; margin-bottom: 15px;"></i><h3>Drag & Drop Images</h3><input type="file" id="jpgtopdf-file-input" multiple accept="image/*" style="display: none;"></div><div id="jpgtopdf-file-list" style="${fileListStyle}"></div><button id="btn-jpgtopdf-action" style="${btnStyle.replace('var(--accent)', '#eab308')}; display: none;"><i class="fas fa-file-pdf"></i> Convert to PDF</button>`;

// Inject Single-file UIs
if (ui.split) ui.split.innerHTML = generateSingleFileUI('split', 'fa-cut', '#f59e0b', 'Split', 'Split & Download', `<label style="color: var(--text-secondary);">Pages to Extract (e.g., 1-3):</label><input type="text" id="split-ranges" placeholder="e.g. 1-3" style="${inputStyle}">`);
if (ui.delete) ui.delete.innerHTML = generateSingleFileUI('delete', 'fa-trash-alt', '#ef4444', 'Delete Pages', 'Remove Pages', `<label style="color: var(--text-secondary);">Pages to Delete (e.g., 2, 4-6):</label><input type="text" id="delete-ranges" placeholder="e.g. 2, 4-6" style="${inputStyle}">`);
if (ui.compress) ui.compress.innerHTML = generateSingleFileUI('compress', 'fa-compress-arrows-alt', '#10b981', 'Compress', 'Compress PDF');
if (ui.rotate) ui.rotate.innerHTML = generateSingleFileUI('rotate', 'fa-sync-alt', '#3b82f6', 'Rotate', 'Rotate & Download', `<select id="rotate-angle" style="${inputStyle}"><option value="90">Right 90°</option><option value="180">Upside Down 180°</option><option value="-90">Left -90°</option></select>`);
if (ui.pdftojpg) ui.pdftojpg.innerHTML = generateSingleFileUI('pdftojpg', 'fa-file-archive', '#eab308', 'Convert to JPG', 'Download ZIP of Images');
if (ui.pagenumbers) ui.pagenumbers.innerHTML = generateSingleFileUI('pagenumbers', 'fa-sort-numeric-down', '#6366f1', 'Add Numbers', 'Add Numbers');
if (ui.protect) ui.protect.innerHTML = generateSingleFileUI('protect', 'fa-lock', '#8b5cf6', 'Protect', 'Encrypt PDF', `<input type="password" id="protect-password" placeholder="Set Password" style="${inputStyle}">`);
if (ui.unlock) ui.unlock.innerHTML = generateSingleFileUI('unlock', 'fa-unlock', '#06b6d4', 'Unlock', 'Unlock PDF', `<input type="password" id="unlock-password" placeholder="Current Password" style="${inputStyle}">`);
if (ui.extract) ui.extract.innerHTML = generateSingleFileUI('extract', 'fa-file-alt', '#14b8a6', 'Extract Text', 'Extract & Download TXT');
if (ui.watermark) ui.watermark.innerHTML = generateSingleFileUI('watermark', 'fa-stamp', '#ec4899', 'Watermark', 'Add Watermark', `<input type="text" id="watermark-text" placeholder="Enter Watermark Text (e.g., CONFIDENTIAL)" style="${inputStyle}">`);
if (ui.sign) ui.sign.innerHTML = generateSingleFileUI('sign', 'fa-signature', '#8b5cf6', 'Sign', 'Sign Document', `<input type="text" id="sign-text" placeholder="Type your Full Name to sign" style="${inputStyle}">`);
if (ui.flatten) ui.flatten.innerHTML = generateSingleFileUI('flatten', 'fa-layer-group', '#64748b', 'Flatten', 'Flatten Document');
if (ui.crop) ui.crop.innerHTML = generateSingleFileUI('crop', 'fa-crop', '#3b82f6', 'Crop PDF', 'Crop Pages', `<label style="color: var(--text-secondary);">Margin trim (in points):</label><input type="number" id="crop-margin" placeholder="e.g. 20" style="${inputStyle}">`);
if (ui.metadata) ui.metadata.innerHTML = generateSingleFileUI('metadata', 'fa-info-circle', '#eab308', 'Edit Metadata', 'Update Metadata', `<input type="text" id="meta-title" placeholder="New Document Title" style="${inputStyle}"><input type="text" id="meta-author" placeholder="New Author Name" style="${inputStyle}">`);
if (ui.repair) ui.repair.innerHTML = generateSingleFileUI('repair', 'fa-tools', '#10b981', 'Repair PDF', 'Attempt Repair');

// --- UTILITIES & COMMON SINGLE FILE HANDLER ---
function downloadBlob(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function parseRange(rangeStr) {
    let pages = [];
    rangeStr.split(',').forEach(part => {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1);
            for (let i = start; i <= end; i++) pages.push(i);
        } else {
            pages.push(parseInt(part.trim()) - 1);
        }
    });
    return [...new Set(pages)].sort((a, b) => a - b);
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

// Delete Pages
setupSingleFileLogic('delete', async (file) => {
    const rangeStr = document.getElementById('delete-ranges').value;
    if (!rangeStr) throw new Error("Range required");
    const pagesToDelete = parseRange(rangeStr);
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    pagesToDelete.sort((a, b) => b - a).forEach(index => {
        if (index >= 0 && index < pdfDoc.getPageCount()) pdfDoc.removePage(index);
    });
    downloadBlob(await pdfDoc.save(), 'Amazing_Deleted.pdf', 'application/pdf');
});

// PDF to JPG
setupSingleFileLogic('pdftojpg', async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const zip = new JSZip();
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height; canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        zip.file(`Page_${i}.jpg`, canvas.toDataURL('image/jpeg', 0.9).split(',')[1], {base64: true});
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'Amazing_Images.zip', 'application/zip');
});

// Flatten PDF
setupSingleFileLogic('flatten', async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const form = pdfDoc.getForm();
    if(form) form.flatten();
    downloadBlob(await pdfDoc.save(), 'Amazing_Flattened.pdf', 'application/pdf');
});

// Crop PDF
setupSingleFileLogic('crop', async (file) => {
    const margin = parseInt(document.getElementById('crop-margin').value) || 20;
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    pdfDoc.getPages().forEach(page => {
        const { x, y, width, height } = page.getCropBox() || page.getMediaBox();
        page.setCropBox(x + margin, y + margin, width - (margin * 2), height - (margin * 2));
    });
    downloadBlob(await pdfDoc.save(), 'Amazing_Cropped.pdf', 'application/pdf');
});

// Edit Metadata
setupSingleFileLogic('metadata', async (file) => {
    const title = document.getElementById('meta-title').value;
    const author = document.getElementById('meta-author').value;
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    if(title) pdfDoc.setTitle(title);
    if(author) pdfDoc.setAuthor(author);
    downloadBlob(await pdfDoc.save(), 'Amazing_Metadata.pdf', 'application/pdf');
});

// Repair PDF
setupSingleFileLogic('repair', async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    downloadBlob(await pdfDoc.save(), 'Amazing_Repaired.pdf', 'application/pdf');
});

// Extract Text
setupSingleFileLogic('extract', async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += `--- Page ${i} ---\n${textContent.items.map(item => item.str).join(" ")}\n\n`;
    }
    downloadBlob(new TextEncoder().encode(fullText), 'Amazing_Extracted.txt', 'text/plain');
});

// Watermark PDF
setupSingleFileLogic('watermark', async (file) => {
    const text = document.getElementById('watermark-text').value || "CONFIDENTIAL";
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    pdfDoc.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        page.drawText(text, { x: width / 2 - (font.widthOfTextAtSize(text, 60) / 2), y: height / 2, size: 60, font: font, color: rgb(0.75, 0.75, 0.75), opacity: 0.5, rotate: degrees(45) });
    });
    downloadBlob(await pdfDoc.save(), 'Amazing_Watermarked.pdf', 'application/pdf');
});

// Sign PDF
setupSingleFileLogic('sign', async (file) => {
    const name = document.getElementById('sign-text').value;
    if (!name) throw new Error("Please type a name to sign.");
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const page = pdfDoc.getPages()[0];
    page.drawText(`Signed by: ${name}`, { x: page.getSize().width - 200, y: 50, size: 18, font: font, color: rgb(0, 0, 0.8) });
    downloadBlob(await pdfDoc.save(), 'Amazing_Signed.pdf', 'application/pdf');
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
    const pagesToExtract = parseRange(document.getElementById('split-ranges').value);
    if (!pagesToExtract.length) throw new Error("Range required");
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

// JPG to PDF Logic (Multi-file)
let imageFiles = [];
if (ui.jpgtopdf) {
    const imgInput = document.getElementById('jpgtopdf-file-input');
    document.getElementById('jpgtopdf-drop-zone').addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', (e) => {
        imageFiles = [...imageFiles, ...Array.from(e.target.files).filter(f => f.type.startsWith('image/'))];
        renderImgList();
    });
    function renderImgList() {
        const list = document.getElementById('jpgtopdf-file-list');
        list.innerHTML = '';
        imageFiles.forEach((file, i) => {
            list.innerHTML += `<div style="${fileItemStyle}"><div><b>${file.name}</b></div><button onclick="removeImg(${i})" style="background:#ef4444; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer;">X</button></div>`;
        });
        document.getElementById('btn-jpgtopdf-action').style.display = imageFiles.length > 0 ? 'block' : 'none';
    }
    window.removeImg = (i) => { imageFiles.splice(i, 1); renderImgList(); };
    
    document.getElementById('btn-jpgtopdf-action').addEventListener('click', async () => {
        const btn = document.getElementById('btn-jpgtopdf-action');
        btn.innerHTML = 'Converting...';
        try {
            const pdfDoc = await PDFDocument.create();
            for (const file of imageFiles) {
                const arrayBuffer = await file.arrayBuffer();
                let pdfImage = file.type === 'image/png' ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
                const dims = pdfImage.scale(1);
                const page = pdfDoc.addPage([dims.width, dims.height]);
                page.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
            }
            downloadBlob(await pdfDoc.save(), 'Amazing_Images.pdf', 'application/pdf');
            await AdManager.showInterstitial();
            imageFiles = []; renderImgList();
        } catch (e) { alert("Error converting"); }
        finally { btn.innerHTML = 'Convert to PDF'; }
    });
}
