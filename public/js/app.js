// Import PDF-lib from CDN for client-side processing
import { PDFDocument } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';

// --- GLOBAL ROUTING ---
window.switchView = (viewId) => {
    // Update active nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Find the button that triggered this (if any) and make it active
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => btn.getAttribute('onclick').includes(viewId));
    if(activeBtn) activeBtn.classList.add('active');

    // Switch section visibility
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`view-${viewId}`).classList.add('active');
};

// --- DYNAMIC UI INJECTION ---
const mergeContainer = document.getElementById('merge-ui-container');
const splitContainer = document.getElementById('split-ui-container');

// Common CSS for injected elements (Using inline styles to ensure it works immediately)
const dropZoneStyle = "border: 2px dashed var(--accent); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.05); transition: 0.3s; margin-bottom: 20px;";
const btnStyle = "background: var(--accent); color: white; border: none; padding: 14px 24px; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 15px;";
const fileListStyle = "display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;";
const fileItemStyle = "display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border);";

// Inject Merge UI
mergeContainer.innerHTML = `
    <div id="merge-drop-zone" style="${dropZoneStyle}">
        <i class="fas fa-cloud-upload-alt" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i>
        <h3>Drag & Drop PDFs here</h3>
        <p style="color: var(--text-secondary); margin-top: 5px;">or click to select files</p>
        <input type="file" id="merge-file-input" multiple accept="application/pdf" style="display: none;">
    </div>
    <div id="merge-file-list" style="${fileListStyle}"></div>
    <button id="btn-merge-action" style="${btnStyle}; display: none;"><i class="fas fa-object-group"></i> Merge Files Now</button>
`;

// Inject Split UI
splitContainer.innerHTML = `
    <div id="split-drop-zone" style="${dropZoneStyle}">
        <i class="fas fa-file-import" style="font-size: 3rem; color: #f59e0b; margin-bottom: 15px;"></i>
        <h3>Select ONE PDF to Split</h3>
        <input type="file" id="split-file-input" accept="application/pdf" style="display: none;">
    </div>
    <div id="split-file-info" style="${fileListStyle}"></div>
    <div id="split-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        <label style="display: block; margin-bottom: 10px; color: var(--text-secondary);">Pages to Extract (e.g., 1-3 or 1,4,5):</label>
        <input type="text" id="split-ranges" placeholder="e.g. 1-3" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: transparent; color: white; margin-bottom: 15px;">
        <button id="btn-split-action" style="${btnStyle.replace('var(--accent)', '#f59e0b')}"><i class="fas fa-cut"></i> Split & Download</button>
    </div>
`;

// --- MERGE LOGIC ---
let mergeFiles = [];
const mergeDropZone = document.getElementById('merge-drop-zone');
const mergeInput = document.getElementById('merge-file-input');
const mergeList = document.getElementById('merge-file-list');
const btnMergeAction = document.getElementById('btn-merge-action');

mergeDropZone.addEventListener('click', () => mergeInput.click());
mergeInput.addEventListener('change', (e) => handleMergeFiles(e.target.files));

function handleMergeFiles(files) {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    mergeFiles = [...mergeFiles, ...pdfs];
    renderMergeList();
}

function renderMergeList() {
    mergeList.innerHTML = '';
    mergeFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.style = fileItemStyle;
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                <div>
                    <div style="font-weight: 600;">${file.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${(file.size/1024/1024).toFixed(2)} MB</div>
                </div>
            </div>
            <button onclick="removeMergeFile(${index})" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
        `;
        mergeList.appendChild(div);
    });

    btnMergeAction.style.display = mergeFiles.length > 1 ? 'block' : 'none';
    mergeDropZone.style.padding = mergeFiles.length > 0 ? '20px' : '40px 20px';
}

window.removeMergeFile = (index) => {
    mergeFiles.splice(index, 1);
    renderMergeList();
};

btnMergeAction.addEventListener('click', async () => {
    if (mergeFiles.length < 2) return;
    btnMergeAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of mergeFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        
        const pdfBytes = await mergedPdf.save();
        downloadBlob(pdfBytes, 'Amazing_Merged.pdf', 'application/pdf');
        
        mergeFiles = [];
        renderMergeList();
    } catch (error) {
        alert("Error during merge. File might be encrypted.");
    } finally {
        btnMergeAction.innerHTML = '<i class="fas fa-object-group"></i> Merge Files Now';
    }
});

// --- SPLIT LOGIC ---
let splitFile = null;
const splitDropZone = document.getElementById('split-drop-zone');
const splitInput = document.getElementById('split-file-input');
const splitInfo = document.getElementById('split-file-info');
const splitControls = document.getElementById('split-controls');
const btnSplitAction = document.getElementById('btn-split-action');

splitDropZone.addEventListener('click', () => splitInput.click());
splitInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        splitFile = file;
        splitDropZone.style.display = 'none';
        
        splitInfo.innerHTML = `
            <div style="${fileItemStyle}">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                    <div style="font-weight: 600;">${file.name}</div>
                </div>
                <button onclick="resetSplit()" style="background: var(--glass-border); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
            </div>
        `;
        splitControls.style.display = 'block';
    }
});

window.resetSplit = () => {
    splitFile = null;
    splitInput.value = '';
    splitDropZone.style.display = 'block';
    splitInfo.innerHTML = '';
    splitControls.style.display = 'none';
};

btnSplitAction.addEventListener('click', async () => {
    const rangeStr = document.getElementById('split-ranges').value;
    if (!splitFile || !rangeStr) return alert("Please enter a valid page range.");
    
    btnSplitAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting...';
    try {
        let pagesToExtract = [];
        const parts = rangeStr.split(',');
        for (let part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1);
                for (let i = start; i <= end; i++) pagesToExtract.push(i);
            } else {
                pagesToExtract.push(parseInt(part.trim()) - 1);
            }
        }

        const arrayBuffer = await splitFile.arrayBuffer();
        const sourcePdf = await PDFDocument.load(arrayBuffer);
        const newPdf = await PDFDocument.create();
        
        const copiedPages = await newPdf.copyPages(sourcePdf, pagesToExtract);
        copiedPages.forEach((page) => newPdf.addPage(page));
        
        const pdfBytes = await newPdf.save();
        downloadBlob(pdfBytes, 'Amazing_Split.pdf', 'application/pdf');
        
        resetSplit();
        document.getElementById('split-ranges').value = '';
    } catch (error) {
        alert("Error extracting pages. Ensure page numbers are correct.");
    } finally {
        btnSplitAction.innerHTML = '<i class="fas fa-cut"></i> Split & Download';
    }
});

// --- UTILITIES ---
function downloadBlob(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
