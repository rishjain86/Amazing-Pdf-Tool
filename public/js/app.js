// Import PDF-lib from CDN for client-side processing
import { PDFDocument } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import { AdManager } from './adManager.js';

// --- GLOBAL ROUTING ---
window.switchView = (viewId) => {
    // Update active nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Find the button that triggered this and make it active
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
const compressContainer = document.getElementById('compress-ui-container');
const jpgtopdfContainer = document.getElementById('jpgtopdf-ui-container');
const protectContainer = document.getElementById('protect-ui-container');

// Common CSS for injected elements (Using inline styles to ensure it works immediately)
const dropZoneStyle = "border: 2px dashed var(--accent); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.05); transition: 0.3s; margin-bottom: 20px;";
const btnStyle = "background: var(--accent); color: white; border: none; padding: 14px 24px; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 15px;";
const fileListStyle = "display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;";
const fileItemStyle = "display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border);";

// Inject Merge UI
if (mergeContainer) {
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
}

// Inject Split UI
if (splitContainer) {
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
}

// Inject Compress UI
if (compressContainer) {
    compressContainer.innerHTML = `
        <div id="compress-drop-zone" style="${dropZoneStyle}">
            <i class="fas fa-file-archive" style="font-size: 3rem; color: #10b981; margin-bottom: 15px;"></i>
            <h3>Select PDF to Compress</h3>
            <input type="file" id="compress-file-input" accept="application/pdf" style="display: none;">
        </div>
        <div id="compress-file-info" style="${fileListStyle}"></div>
        <div id="compress-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <label style="display: block; margin-bottom: 10px; color: var(--text-secondary);">Select Compression Level:</label>
            <select id="compress-level" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--bg-main); color: white; margin-bottom: 15px;">
                <option value="recommended">Recommended Compression (Good Quality, Smaller Size)</option>
                <option value="extreme">Extreme Compression (Less Quality, Smallest Size)</option>
            </select>
            <button id="btn-compress-action" style="${btnStyle.replace('var(--accent)', '#10b981')}"><i class="fas fa-compress-arrows-alt"></i> Compress PDF</button>
        </div>
    `;
}

// Inject JPG to PDF UI
if (jpgtopdfContainer) {
    jpgtopdfContainer.innerHTML = `
        <div id="jpgtopdf-drop-zone" style="${dropZoneStyle}">
            <i class="fas fa-images" style="font-size: 3rem; color: #eab308; margin-bottom: 15px;"></i>
            <h3>Drag & Drop JPG/PNG Images</h3>
            <p style="color: var(--text-secondary); margin-top: 5px;">or click to select files</p>
            <input type="file" id="jpgtopdf-file-input" multiple accept="image/jpeg, image/png" style="display: none;">
        </div>
        <div id="jpgtopdf-file-list" style="${fileListStyle}"></div>
        <button id="btn-jpgtopdf-action" style="${btnStyle.replace('var(--accent)', '#eab308')}; display: none;"><i class="fas fa-file-pdf"></i> Convert to PDF</button>
    `;
}

// Inject Protect PDF UI
if (protectContainer) {
    protectContainer.innerHTML = `
        <div id="protect-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#8b5cf6')}">
            <i class="fas fa-lock" style="font-size: 3rem; color: #8b5cf6; margin-bottom: 15px;"></i>
            <h3>Select PDF to Protect</h3>
            <input type="file" id="protect-file-input" accept="application/pdf" style="display: none;">
        </div>
        <div id="protect-file-info" style="${fileListStyle}"></div>
        <div id="protect-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <label style="display: block; margin-bottom: 10px; color: var(--text-secondary);">Set Password for PDF:</label>
            <input type="password" id="protect-password" placeholder="Enter secure password" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: transparent; color: white; margin-bottom: 15px;">
            <button id="btn-protect-action" style="${btnStyle.replace('var(--accent)', '#8b5cf6')}"><i class="fas fa-shield-alt"></i> Encrypt PDF</button>
        </div>
    `;
}

// --- MERGE LOGIC ---
let mergeFiles = [];
const mergeDropZone = document.getElementById('merge-drop-zone');
const mergeInput = document.getElementById('merge-file-input');
const mergeList = document.getElementById('merge-file-list');
const btnMergeAction = document.getElementById('btn-merge-action');

if (mergeDropZone) {
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
            
            await AdManager.showInterstitial();
            
            mergeFiles = [];
            renderMergeList();
        } catch (error) {
            alert("Error during merge. File might be encrypted.");
            console.error(error);
        } finally {
            btnMergeAction.innerHTML = '<i class="fas fa-object-group"></i> Merge Files Now';
        }
    });
}

// --- SPLIT LOGIC ---
let splitFile = null;
const splitDropZone = document.getElementById('split-drop-zone');
const splitInput = document.getElementById('split-file-input');
const splitInfo = document.getElementById('split-file-info');
const splitControls = document.getElementById('split-controls');
const btnSplitAction = document.getElementById('btn-split-action');

if (splitDropZone) {
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
            
            await AdManager.showInterstitial();
            
            resetSplit();
            document.getElementById('split-ranges').value = '';
        } catch (error) {
            alert("Error extracting pages. Ensure page numbers are correct.");
            console.error(error);
        } finally {
            btnSplitAction.innerHTML = '<i class="fas fa-cut"></i> Split & Download';
        }
    });
}

// --- COMPRESS LOGIC ---
let compressFile = null;
const compressDropZone = document.getElementById('compress-drop-zone');
const compressInput = document.getElementById('compress-file-input');
const compressInfo = document.getElementById('compress-file-info');
const compressControls = document.getElementById('compress-controls');
const btnCompressAction = document.getElementById('btn-compress-action');

if (compressDropZone) {
    compressDropZone.addEventListener('click', () => compressInput.click());
    compressInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            compressFile = file;
            compressDropZone.style.display = 'none';
            compressInfo.innerHTML = `
                <div style="${fileItemStyle}">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                        <div>
                            <div style="font-weight: 600;">${file.name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Original: ${(file.size/1024/1024).toFixed(2)} MB</div>
                        </div>
                    </div>
                    <button onclick="resetCompress()" style="background: var(--glass-border); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
                </div>
            `;
            compressControls.style.display = 'block';
        }
    });

    window.resetCompress = () => {
        compressFile = null;
        compressInput.value = '';
        compressDropZone.style.display = 'block';
        compressInfo.innerHTML = '';
        compressControls.style.display = 'none';
    };

    btnCompressAction.addEventListener('click', async () => {
        if (!compressFile) return;
        btnCompressAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compressing...';
        
        try {
            const arrayBuffer = await compressFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
            
            const newPdf = await PDFDocument.create();
            const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => newPdf.addPage(page));
            
            const pdfBytes = await newPdf.save({ useObjectStreams: true });
            
            downloadBlob(pdfBytes, 'Amazing_Compressed.pdf', 'application/pdf');
            
            await AdManager.showInterstitial();
            
            resetCompress();
        } catch (error) {
            alert("Error compressing PDF. File might be encrypted.");
            console.error(error);
        } finally {
            btnCompressAction.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Compress PDF';
        }
    });
}

// --- JPG TO PDF LOGIC ---
let imageFiles = [];
const imgDropZone = document.getElementById('jpgtopdf-drop-zone');
const imgInput = document.getElementById('jpgtopdf-file-input');
const imgList = document.getElementById('jpgtopdf-file-list');
const btnImgAction = document.getElementById('btn-jpgtopdf-action');

if (imgDropZone) {
    imgDropZone.addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', (e) => handleImageFiles(e.target.files));

    function handleImageFiles(files) {
        const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
        imageFiles = [...imageFiles, ...imgs];
        renderImageList();
    }

    function renderImageList() {
        imgList.innerHTML = '';
        imageFiles.forEach((file, index) => {
            const div = document.createElement('div');
            div.style = fileItemStyle;
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-image" style="color: #eab308; font-size: 1.5rem;"></i>
                    <div>
                        <div style="font-weight: 600;">${file.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${(file.size/1024/1024).toFixed(2)} MB</div>
                    </div>
                </div>
                <button onclick="removeImageFile(${index})" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
            `;
            imgList.appendChild(div);
        });

        btnImgAction.style.display = imageFiles.length > 0 ? 'block' : 'none';
        imgDropZone.style.padding = imageFiles.length > 0 ? '20px' : '40px 20px';
    }

    window.removeImageFile = (index) => {
        imageFiles.splice(index, 1);
        renderImageList();
    };

    btnImgAction.addEventListener('click', async () => {
        if (imageFiles.length === 0) return;
        btnImgAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';
        
        try {
            const pdfDoc = await PDFDocument.create();
            
            for (const file of imageFiles) {
                const arrayBuffer = await file.arrayBuffer();
                let pdfImage;
                
                if (file.type === 'image/png') {
                    pdfImage = await pdfDoc.embedPng(arrayBuffer);
                } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                    pdfImage = await pdfDoc.embedJpg(arrayBuffer);
                } else {
                    continue; // Skip unsupported
                }

                const imgDims = pdfImage.scale(1);
                const page = pdfDoc.addPage([imgDims.width, imgDims.height]);
                page.drawImage(pdfImage, {
                    x: 0,
                    y: 0,
                    width: imgDims.width,
                    height: imgDims.height,
                });
            }
            
            const pdfBytes = await pdfDoc.save();
            downloadBlob(pdfBytes, 'Amazing_Images.pdf', 'application/pdf');
            
            await AdManager.showInterstitial();
            
            imageFiles = [];
            renderImageList();
        } catch (error) {
            alert("Error converting images to PDF.");
            console.error(error);
        } finally {
            btnImgAction.innerHTML = '<i class="fas fa-file-pdf"></i> Convert to PDF';
        }
    });
}

// --- PROTECT PDF LOGIC ---
let protectFile = null;
const protectDropZone = document.getElementById('protect-drop-zone');
const protectInput = document.getElementById('protect-file-input');
const protectInfo = document.getElementById('protect-file-info');
const protectControls = document.getElementById('protect-controls');
const btnProtectAction = document.getElementById('btn-protect-action');

if (protectDropZone) {
    protectDropZone.addEventListener('click', () => protectInput.click());
    protectInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            protectFile = file;
            protectDropZone.style.display = 'none';
            
            protectInfo.innerHTML = `
                <div style="${fileItemStyle}">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                        <div style="font-weight: 600;">${file.name}</div>
                    </div>
                    <button onclick="resetProtect()" style="background: var(--glass-border); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
                </div>
            `;
            protectControls.style.display = 'block';
        }
    });

    window.resetProtect = () => {
        protectFile = null;
        protectInput.value = '';
        protectDropZone.style.display = 'block';
        protectInfo.innerHTML = '';
        protectControls.style.display = 'none';
        document.getElementById('protect-password').value = '';
    };

    btnProtectAction.addEventListener('click', async () => {
        const password = document.getElementById('protect-password').value;
        if (!protectFile || !password) return alert("Please enter a valid password.");
        
        btnProtectAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encrypting...';
        try {
            const arrayBuffer = await protectFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            
            // Encrypting the document with AES encryption via pdf-lib
            await pdfDoc.encrypt({
                userPassword: password,
                ownerPassword: password,
                permissions: {
                    printing: 'highResolution',
                    modifying: false,
                    copying: false,
                    annotating: false,
                    fillingForms: false,
                    documentAssembly: false,
                },
            });
            
            const pdfBytes = await pdfDoc.save();
            downloadBlob(pdfBytes, 'Amazing_Protected.pdf', 'application/pdf');
            
            await AdManager.showInterstitial();
            
            resetProtect();
        } catch (error) {
            alert("Error encrypting PDF. Ensure the file is valid and not already protected.");
            console.error(error);
        } finally {
            btnProtectAction.innerHTML = '<i class="fas fa-shield-alt"></i> Encrypt PDF';
        }
    });
}

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
