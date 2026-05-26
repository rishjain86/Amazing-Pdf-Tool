// Import PDF-lib from CDN for client-side processing
import { PDFDocument, degrees } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
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
const mergeContainer = document.getElementById('merge-ui-container');
const splitContainer = document.getElementById('split-ui-container');
const compressContainer = document.getElementById('compress-ui-container');
const rotateContainer = document.getElementById('rotate-ui-container');
const jpgtopdfContainer = document.getElementById('jpgtopdf-ui-container');
const protectContainer = document.getElementById('protect-ui-container');
const unlockContainer = document.getElementById('unlock-ui-container');

// Common CSS for injected elements
const dropZoneStyle = "border: 2px dashed var(--accent); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.05); transition: 0.3s; margin-bottom: 20px;";
const btnStyle = "background: var(--accent); color: white; border: none; padding: 14px 24px; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 15px;";
const fileListStyle = "display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;";
const fileItemStyle = "display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border);";

// Inject UI Elements
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

if (rotateContainer) {
    rotateContainer.innerHTML = `
        <div id="rotate-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#3b82f6')}">
            <i class="fas fa-sync-alt" style="font-size: 3rem; color: #3b82f6; margin-bottom: 15px;"></i>
            <h3>Select PDF to Rotate</h3>
            <input type="file" id="rotate-file-input" accept="application/pdf" style="display: none;">
        </div>
        <div id="rotate-file-info" style="${fileListStyle}"></div>
        <div id="rotate-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <label style="display: block; margin-bottom: 10px; color: var(--text-secondary);">Select Rotation Angle:</label>
            <select id="rotate-angle" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--bg-main); color: white; margin-bottom: 15px;">
                <option value="90">Right 90°</option>
                <option value="180">Upside Down 180°</option>
                <option value="-90">Left -90°</option>
            </select>
            <button id="btn-rotate-action" style="${btnStyle.replace('var(--accent)', '#3b82f6')}"><i class="fas fa-sync-alt"></i> Rotate & Download</button>
        </div>
    `;
}

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

if (unlockContainer) {
    unlockContainer.innerHTML = `
        <div id="unlock-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#06b6d4')}">
            <i class="fas fa-unlock" style="font-size: 3rem; color: #06b6d4; margin-bottom: 15px;"></i>
            <h3>Select PDF to Unlock</h3>
            <input type="file" id="unlock-file-input" accept="application/pdf" style="display: none;">
        </div>
        <div id="unlock-file-info" style="${fileListStyle}"></div>
        <div id="unlock-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <label style="display: block; margin-bottom: 10px; color: var(--text-secondary);">Enter current password to remove it:</label>
            <input type="password" id="unlock-password" placeholder="Enter current PDF password" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: transparent; color: white; margin-bottom: 15px;">
            <button id="btn-unlock-action" style="${btnStyle.replace('var(--accent)', '#06b6d4')}"><i class="fas fa-unlock"></i> Unlock & Download</button>
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
    mergeInput.addEventListener('change', (e) => {
        const pdfs = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
        mergeFiles = [...mergeFiles, ...pdfs];
        renderMergeList();
    });

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
            alert("Error compressing PDF.");
        } finally {
            btnCompressAction.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Compress PDF';
        }
    });
}

// --- ROTATE PDF LOGIC ---
let rotateFile = null;
const rotateDropZone = document.getElementById('rotate-drop-zone');
const rotateInput = document.getElementById('rotate-file-input');
const rotateInfo = document.getElementById('rotate-file-info');
const rotateControls = document.getElementById('rotate-controls');
const btnRotateAction = document.getElementById('btn-rotate-action');

if (rotateDropZone) {
    rotateDropZone.addEventListener('click', () => rotateInput.click());
    rotateInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            rotateFile = file;
            rotateDropZone.style.display = 'none';
            rotateInfo.innerHTML = `
                <div style="${fileItemStyle}">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                        <div style="font-weight: 600;">${file.name}</div>
                    </div>
                    <button onclick="resetRotate()" style="background: var(--glass-border); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
                </div>
            `;
            rotateControls.style.display = 'block';
        }
    });

    window.resetRotate = () => {
        rotateFile = null;
        rotateInput.value = '';
        rotateDropZone.style.display = 'block';
        rotateInfo.innerHTML = '';
        rotateControls.style.display = 'none';
    };

    btnRotateAction.addEventListener('click', async () => {
        if (!rotateFile) return;
        const angleStr = document.getElementById('rotate-angle').value;
        const rotationAngle = parseInt(angleStr);
        
        btnRotateAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rotating...';
        try {
            const arrayBuffer = await rotateFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            
            const pages = pdfDoc.getPages();
            pages.forEach((page) => {
                const currentRotation = page.getRotation().angle;
                page.setRotation(degrees(currentRotation + rotationAngle));
            });
            
            const pdfBytes = await pdfDoc.save();
            downloadBlob(pdfBytes, 'Amazing_Rotated.pdf', 'application/pdf');
            await AdManager.showInterstitial();
            resetRotate();
        } catch (error) {
            alert("Error rotating PDF. The file might be protected.");
            console.error(error);
        } finally {
            btnRotateAction.innerHTML = '<i class="fas fa-sync-alt"></i> Rotate & Download';
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
    imgInput.addEventListener('change', (e) => {
        const imgs = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        imageFiles = [...imageFiles, ...imgs];
        renderImageList();
    });

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
                } else continue;

                const imgDims = pdfImage.scale(1);
                const page = pdfDoc.addPage([imgDims.width, imgDims.height]);
                page.drawImage(pdfImage, { x: 0, y: 0, width: imgDims.width, height: imgDims.height });
            }
            const pdfBytes = await pdfDoc.save();
            downloadBlob(pdfBytes, 'Amazing_Images.pdf', 'application/pdf');
            await AdManager.showInterstitial();
            imageFiles = [];
            renderImageList();
        } catch (error) {
            alert("Error converting images to PDF.");
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
        if (!protectFile || !password) return alert("Please enter a password.");
        
        btnProtectAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encrypting...';
        try {
            const arrayBuffer = await protectFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            await pdfDoc.encrypt({
                userPassword: password,
                ownerPassword: password,
                permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false, fillingForms: false, documentAssembly: false },
            });
            const pdfBytes = await pdfDoc.save();
            downloadBlob(pdfBytes, 'Amazing_Protected.pdf', 'application/pdf');
            await AdManager.showInterstitial();
            resetProtect();
        } catch (error) {
            alert("Error encrypting PDF. File might be already protected.");
        } finally {
            btnProtectAction.innerHTML = '<i class="fas fa-shield-alt"></i> Encrypt PDF';
        }
    });
}

// --- UNLOCK PDF LOGIC ---
let unlockFile = null;
const unlockDropZone = document.getElementById('unlock-drop-zone');
const unlockInput = document.getElementById('unlock-file-input');
const unlockInfo = document.getElementById('unlock-file-info');
const unlockControls = document.getElementById('unlock-controls');
const btnUnlockAction = document.getElementById('btn-unlock-action');

if (unlockDropZone) {
    unlockDropZone.addEventListener('click', () => unlockInput.click());
    unlockInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            unlockFile = file;
            unlockDropZone.style.display = 'none';
            unlockInfo.innerHTML = `
                <div style="${fileItemStyle}">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.5rem;"></i>
                        <div style="font-weight: 600;">${file.name}</div>
                    </div>
                    <button onclick="resetUnlock()" style="background: var(--glass-border); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;"><i class="fas fa-times"></i></button>
                </div>
            `;
            unlockControls.style.display = 'block';
        }
    });

    window.resetUnlock = () => {
        unlockFile = null;
        unlockInput.value = '';
        unlockDropZone.style.display = 'block';
        unlockInfo.innerHTML = '';
        unlockControls.style.display = 'none';
        document.getElementById('unlock-password').value = '';
    };

    btnUnlockAction.addEventListener('click', async () => {
        const password = document.getElementById('unlock-password').value;
        if (!unlockFile || !password) return alert("Please enter the current password to unlock.");
        
        btnUnlockAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unlocking...';
        try {
            const arrayBuffer = await unlockFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { password: password });
            
            const pdfBytes = await pdfDoc.save();
            downloadBlob(pdfBytes, 'Amazing_Unlocked.pdf', 'application/pdf');
            
            await AdManager.showInterstitial();
            resetUnlock();
        } catch (error) {
            alert("Error unlocking PDF. The password might be incorrect.");
            console.error(error);
        } finally {
            btnUnlockAction.innerHTML = '<i class="fas fa-unlock"></i> Unlock & Download';
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
