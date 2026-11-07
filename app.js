import { PDFDocument, degrees, StandardFonts, rgb, PDFName } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import * as PDFLIB from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import { injectTools2, TOOLS2 } from './js/registry.js';
import { initAppLock } from './js/applock.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
window.JSZip = JSZip;
import { AdManager } from './adManager.js';
import { Filesystem, Directory } from 'https://cdn.jsdelivr.net/npm/@capacitor/filesystem@6.0.0/+esm';
import { Share } from 'https://cdn.jsdelivr.net/npm/@capacitor/share@6.0.0/+esm';
import { App } from 'https://cdn.jsdelivr.net/npm/@capacitor/app@6.0.0/+esm';

// ==========================================
// FORCE SCROLL PATCH (Overrides any CSS bugs)
// ==========================================
const forceScrollStyle = document.createElement('style');
forceScrollStyle.innerHTML = `
    body.is-editing { touch-action: auto !important; }
`;
document.head.appendChild(forceScrollStyle);

// ==========================================
// APP VERSION CHECKER
// ==========================================
const CURRENT_APP_VERSION = 2.3;

function checkForUpdates() {
    const versionUrl = 'https://amazingpdf.in/version.json?time=' + new Date().getTime();
    
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return; // website visitors always get the latest version
    fetch(versionUrl)
        .then(response => response.json())
        .then(data => {
            const liveVersion = parseFloat(data.version);
            if (liveVersion > CURRENT_APP_VERSION) {
                let userWantsToUpdate = confirm(data.message || "New update available! Please update the app to use new features.");
                if (userWantsToUpdate) {
                    window.location.href = data.download_url || "https://amazingpdf.in";
                }
            }
        })
        .catch(error => console.log("Update check failed:", error));
}
checkForUpdates();

// ==========================================
// UTILITY & ALERT FUNCTIONS
// ==========================================
function showCustomAlert(message) {
    let alertBox = document.getElementById('custom-alert-box');
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'custom-alert-box';
        alertBox.style = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.8); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(5px); opacity: 0; transition: opacity 0.3s ease; pointer-events: none;";
        alertBox.innerHTML = `
            <div style="background: var(--surface-color); padding: 30px; border-radius: 16px; border: 1px solid var(--glass-border); box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; max-width: 85%; width: 320px; transform: translateY(20px); transition: transform 0.3s ease;">
                <i class="fas fa-shield-alt" style="font-size: 3rem; color: #f59e0b; margin-bottom: 15px;"></i>
                <h3 style="margin-bottom: 10px; color: white; font-size: 1.2rem;">Notice</h3>
                <p id="custom-alert-msg" style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.95rem; line-height: 1.5;"></p>
                <button id="custom-alert-btn" style="background: var(--accent); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; font-size: 1rem; transition: 0.2s;">Got it</button>
            </div>
        `;
        document.body.appendChild(alertBox);
        document.getElementById('custom-alert-btn').addEventListener('click', () => {
            alertBox.style.opacity = '0';
            alertBox.style.pointerEvents = 'none';
            alertBox.children[0].style.transform = 'translateY(20px)';
        });
    }
    document.getElementById('custom-alert-msg').innerHTML = message;
    alertBox.style.pointerEvents = 'auto';
    alertBox.style.opacity = '1';
    alertBox.children[0].style.transform = 'translateY(0)';
}

function handleError(error) {
    const msg = error.message ? error.message.toLowerCase() : 'unknown error';
    const activeViewElement = document.querySelector('.view-section.active');
    const activeView = activeViewElement ? activeViewElement.id : '';

    if (msg.includes('encrypted') || msg.includes('password') || msg.includes('decrypt')) {
        if (activeView === 'view-unlock') {
            showCustomAlert("Unlock Failed ❌<br><br>Incorrect password, or API server issue.");
        } else {
            showCustomAlert("This PDF is password protected 🔒.<br><br>Please use the <b>'Unlock PDF'</b> tool first to remove the password before using this feature.");
        }
    } else {
        showCustomAlert(`Error: ${error.message}`);
    }
}

// ==========================================
// DYNAMIC 3-STEP UI HELPERS 
// ==========================================
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

async function simulateLoadingAndProcess(title, processCallback) {
    window.__pendingShare = null;
    const overlay = document.getElementById('dynamic-ui-overlay');
    const processingState = document.getElementById('processing-state');
    const successState = document.getElementById('success-state');
    const actionTitle = document.getElementById('action-title');
    const barContainer = document.getElementById('loading-bar-container');
    const barFill = document.getElementById('loading-bar-fill');
    const loadingText = document.getElementById('loading-text');
    const spinner = document.getElementById('processing-spinner');
    const procMsg = document.getElementById('processing-msg');

    if (overlay && processingState && successState) {
        overlay.style.display = 'flex';
        processingState.style.display = 'block';
        successState.style.display = 'none';
        
        actionTitle.innerText = "Reading Files...";
        barContainer.style.display = 'block';
        loadingText.style.display = 'block';
        spinner.style.display = 'none';
        procMsg.style.display = 'none';
        barFill.style.width = '0%';

        for(let i = 0; i <= 100; i += 15) {
            barFill.style.width = i + '%';
            loadingText.innerText = `${i}%`;
            await new Promise(r => setTimeout(r, 60)); 
        }

        actionTitle.innerText = title + '...';
        barContainer.style.display = 'none';
        loadingText.style.display = 'none';
        spinner.style.display = 'block';
        procMsg.style.display = 'block';

        await new Promise(r => setTimeout(r, 50)); 
    }

    try {
        await processCallback();
    } catch(e) {
        hideProcessingUI();
        handleError(e);
    }
}

function showProcessingUI(title = "Processing") {
    const overlay = document.getElementById('dynamic-ui-overlay');
    const processingState = document.getElementById('processing-state');
    const successState = document.getElementById('success-state');
    const actionTitle = document.getElementById('action-title');
    const barContainer = document.getElementById('loading-bar-container');
    const loadingText = document.getElementById('loading-text');
    const spinner = document.getElementById('processing-spinner');
    const procMsg = document.getElementById('processing-msg');
    
    if (overlay && processingState && successState && actionTitle) {
        overlay.style.display = 'flex';
        processingState.style.display = 'block';
        successState.style.display = 'none';
        actionTitle.innerText = title + '...';
        barContainer.style.display = 'none';
        loadingText.style.display = 'none';
        spinner.style.display = 'block';
        procMsg.style.display = 'block';
    }
}

function hideProcessingUI() {
    const overlay = document.getElementById('dynamic-ui-overlay');
    if (overlay) overlay.style.display = 'none';
}

function showSuccessResult(originalBytes, compressedBytes, successTitle, downloadCallback, forceShowStats = false) {
    const overlay = document.getElementById('dynamic-ui-overlay');
    const processingState = document.getElementById('processing-state');
    const successState = document.getElementById('success-state');
    const successTitleEl = document.getElementById('success-title');
    const percentCircleUi = document.getElementById('percent-circle-ui');
    const sizeStatsUi = document.getElementById('size-stats-ui');
    const successMsgUi = document.getElementById('success-message');
    const downloadBtn = document.getElementById('final-download-btn');
    
    if (!overlay || !successState || !downloadBtn) {
        downloadCallback();
        return;
    }

    overlay.style.display = 'flex';
    processingState.style.display = 'none';
    successState.style.display = 'block';
    const shareBtn = document.getElementById('final-share-btn'); if (shareBtn) shareBtn.style.display = window.__pendingShare ? 'block' : 'none';
    if(successTitleEl) successTitleEl.innerText = successTitle;

    let savedBytes = originalBytes - compressedBytes;
    let percentSaved = 0;
    
    if (originalBytes > 0 && (savedBytes > 0 || forceShowStats)) {
        percentSaved = savedBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;
        percentCircleUi.style.display = 'flex';
        sizeStatsUi.style.display = 'block';
        successMsgUi.style.display = 'none'; 
        document.getElementById('saved-percent').innerText = percentSaved + '%';
        document.getElementById('old-size').innerText = formatBytes(originalBytes);
        document.getElementById('new-size').innerText = formatBytes(compressedBytes);
    } else {
        percentCircleUi.style.display = 'none';
        sizeStatsUi.style.display = 'none';
        successMsgUi.style.display = 'block'; 
        successMsgUi.innerText = "Your file is ready to download!";
    }

    const newBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
    newBtn.onclick = () => {
        overlay.style.display = 'none'; 
        downloadCallback(); 
    };
}

let lastBackPress = 0;
if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    App.addListener('backButton', () => {
        if (window.__editorOpen && window.__editorOpen()) { window.__closeEditor(); return; }
        const activeView = document.querySelector('.view-section.active')?.id;
        if (activeView && activeView !== 'view-dashboard') {
            window.switchView('dashboard');
        } else {
            const now = new Date().getTime();
            if (now - lastBackPress < 2000) {
                App.exitApp();
            } else {
                lastBackPress = now;
            }
        }
    });
}

window.switchView = (viewId) => {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => (btn.getAttribute('onclick') || '').replace(/\s/g, '') === `switchView('${viewId}')`);
    if (activeBtn) activeBtn.classList.add('active');
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.add('active');
    if (viewId !== 'vault' && window.__lockVault) window.__lockVault();
    if (viewId === 'vault') { loadPro().then(() => window.__openVault && window.__openVault()); }
    if (viewId === 'history') window.renderHistory();
    const mc = document.querySelector('.main-content'); if (mc) mc.scrollTop = 0; window.scrollTo(0, 0);
    const sb = document.querySelector('.sidebar'); if (sb && sb.classList.contains('active')) { sb.classList.remove('active'); const ov = document.getElementById('sidebar-overlay'); if (ov) ov.classList.remove('active'); }
};
const escapeHtml = (str) => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const getBaseName = (filename) => filename.substring(0, filename.lastIndexOf('.')) || filename;

// ==========================================
// HISTORY & DOWNLOAD MANAGEMENT
// ==========================================
const DB_NAME = 'AmazingPDFHistory';
const STORE_NAME = 'files';

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveToHistory(bytes, filename, type) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ filename, type, data: bytes, date: new Date().getTime() });
    return new Promise(resolve => tx.oncomplete = resolve);
}

window.getHistory = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const out = []; const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { const v = c.value; out.push({ id: v.id, filename: v.filename, type: v.type, date: v.date, size: v.data ? v.data.byteLength : 0 }); c.continue(); } else resolve(out.sort((a, b) => b.date - a.date)); };
        req.onerror = () => reject(req.error);
    });
};

window.deleteHistory = async (id) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    return new Promise(resolve => tx.oncomplete = resolve);
};

window.renderHistory = async () => {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '<p>Loading...</p>';
    let items = []; try { items = await window.getHistory(); } catch (e) { }
    if (!items.length) { list.innerHTML = '<p style="color:var(--text-secondary);">No downloads history found.</p>'; return; }
    list.innerHTML = items.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border); gap: 10px; margin-bottom: 10px;">
            <div class="text-container" style="flex: 1; min-width: 0;">
                <b class="text-ellipsis" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${escapeHtml(item.filename)}</b>
                <small style="color:var(--text-secondary);">${new Date(item.date).toLocaleString()} · ${formatBytes(item.size)}</small>
            </div>
            <div style="display:flex; gap:10px; flex-shrink: 0;">
                <button onclick="triggerHistoryDownload(${Number(item.id)})" style="background:var(--accent); color:white; border:none; padding:8px 12px; border-radius:6px;"><i class="fas fa-share-alt"></i></button>
                <button onclick="removeHistoryItem(${Number(item.id)})" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px;"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
};

window.removeHistoryItem = async (id) => { 
    await window.deleteHistory(id); 
    window.renderHistory(); 
};

window.triggerHistoryDownload = async (id) => {
    const db = await initDB();
    const item = await new Promise(res => { const r = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    if (item) await processAndDownload(item.data, item.filename, item.type, false);
};

function bytesToBase64(bytes) {
    let binary = ''; 
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// BULK UPLOAD CHUNKED WRITER
async function processAndDownload(bytes, filename, type, saveToDb = true) {
    filename = String(filename).replace(/[\\/:*?"<>|]+/g, '_');
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if(saveToDb) { 
        try { await saveToHistory(bytes, filename, type); } catch(e) { console.error("History save error:", e); } 
    }
    
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const chunkSize = 256 * 1024; 
            const len = bytes.byteLength; 
            let isFirstChunk = true;
            
            for (let i = 0; i < len; i += chunkSize) {
                const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
                const base64Chunk = bytesToBase64(chunk);
                if (isFirstChunk) { 
                    await Filesystem.writeFile({ path: filename, data: base64Chunk, directory: Directory.Documents }); 
                    isFirstChunk = false; 
                } else { 
                    await Filesystem.appendFile({ path: filename, data: base64Chunk, directory: Directory.Documents }); 
                }
            }
            const savedFile = await Filesystem.getUri({ path: filename, directory: Directory.Documents });
            await Share.share({ title: filename, text: 'Processed via Amazing PDF', url: savedFile.uri });
        } catch (e) { 
            try { browserDownload(bytes, filename, type); } catch(err) { showCustomAlert("Saved to Documents & History!"); }
        }
    } else {
        browserDownload(bytes, filename, type);
    }
}
function browserDownload(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000); // revoking too early cancels the download in some browsers
}

// =======================================================
// SMART SCANNER
// =======================================================
let scannerPages = [];
let currentScannerIndex = -1;
let isCroppingMode = false;
let cropPoints = [];
let activeCropPoint = -1;
let scannerOriginalName = "Scanned_Document";

const scannerModal = document.getElementById('scanner-source-modal');
const scannerWorkspace = document.getElementById('scanner-workspace');
const scanCanvas = document.getElementById('scanner-main-canvas');
const scanCtx = scanCanvas ? scanCanvas.getContext('2d') : null;
const cropCanvas = document.getElementById('scanner-crop-canvas');
const cropCtx = cropCanvas ? cropCanvas.getContext('2d') : null;

window.handleScanInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    scannerOriginalName = file.name.substring(0, file.name.lastIndexOf('.')) || "Scanned_Document";
    if (scannerModal) scannerModal.style.display = 'none';
    if (scannerWorkspace) scannerWorkspace.style.display = 'flex';
    document.body.classList.add('is-editing');
    
    const reader = new FileReader();
    reader.onload = function(event) {
        scannerPages.push({ original: event.target.result, filter: 'magic', rotation: 0 });
        currentScannerIndex = scannerPages.length - 1;
        renderScannerWorkspace();
        renderScannerThumbnails();
    };
    reader.readAsDataURL(file);
    e.target.value = ""; 
};

document.getElementById('hidden-camera-input')?.addEventListener('change', window.handleScanInput);
document.getElementById('hidden-gallery-input')?.addEventListener('change', window.handleScanInput);

function renderScannerWorkspace() {
    if (currentScannerIndex === -1 || !scanCtx || isCroppingMode) return;
    const pageData = scannerPages[currentScannerIndex];
    const counter = document.getElementById('scanner-page-counter');
    if (counter) counter.innerText = `Page ${currentScannerIndex + 1}`;
    
    document.querySelectorAll('.scanner-filter-btn').forEach(btn => { 
        btn.style.borderColor = btn.dataset.filter === pageData.filter ? '#10b981' : 'transparent'; 
    });

    const renderImg = new Image();
    renderImg.onload = () => {
        const angle = pageData.rotation || 0;
        const isRotated = angle === 90 || angle === 270;
        scanCanvas.width = isRotated ? renderImg.height : renderImg.width;
        scanCanvas.height = isRotated ? renderImg.width : renderImg.height;
        
        scanCtx.save();
        scanCtx.translate(scanCanvas.width / 2, scanCanvas.height / 2);
        scanCtx.rotate((angle * Math.PI) / 180);
        scanCtx.translate(-renderImg.width / 2, -renderImg.height / 2);

        if (pageData.filter === 'lighten') scanCtx.filter = 'brightness(1.15) contrast(1.05)';
        else if (pageData.filter === 'magic') scanCtx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)';
        else if (pageData.filter === 'grayscale') scanCtx.filter = 'grayscale(100%)';
        else if (pageData.filter === 'bw') scanCtx.filter = 'grayscale(100%) contrast(1.8) brightness(1.1)';
        else if (pageData.filter === 'eco') scanCtx.filter = 'sepia(0.3) brightness(0.9) contrast(0.9)';
        else scanCtx.filter = 'none';
        
        scanCtx.drawImage(renderImg, 0, 0);
        scanCtx.restore();
    };
    renderImg.src = pageData.original;
}

document.getElementById('btn-scanner-rotate-left')?.addEventListener('click', () => { 
    if(currentScannerIndex === -1 || isCroppingMode) return; 
    scannerPages[currentScannerIndex].rotation = (scannerPages[currentScannerIndex].rotation + 270) % 360; 
    renderScannerWorkspace(); 
});
document.getElementById('btn-scanner-rotate-right')?.addEventListener('click', () => { 
    if(currentScannerIndex === -1 || isCroppingMode) return; 
    scannerPages[currentScannerIndex].rotation = (scannerPages[currentScannerIndex].rotation + 90) % 360; 
    renderScannerWorkspace(); 
});
document.getElementById('btn-scanner-crop-trigger')?.addEventListener('click', () => {
    if(currentScannerIndex === -1) return;
    document.getElementById('scanner-default-top-bar').style.display = 'none';
    document.getElementById('scanner-crop-top-bar').style.display = 'flex';
    startCropMode();
});

function startCropMode() {
    isCroppingMode = true;
    const pageData = scannerPages[currentScannerIndex];
    const tempImg = new Image();
    
    tempImg.onload = () => {
        const angle = pageData.rotation || 0;
        const isRotated = angle === 90 || angle === 270;
        
        scanCanvas.width = isRotated ? tempImg.height : tempImg.width;
        scanCanvas.height = isRotated ? tempImg.width : tempImg.height;
        
        scanCtx.save(); 
        scanCtx.translate(scanCanvas.width / 2, scanCanvas.height / 2); 
        scanCtx.rotate((angle * Math.PI) / 180); 
        scanCtx.translate(-tempImg.width / 2, -tempImg.height / 2); 
        scanCtx.filter = 'none'; 
        scanCtx.drawImage(tempImg, 0, 0); 
        scanCtx.restore();
        
        cropCanvas.width = scanCanvas.width; 
        cropCanvas.height = scanCanvas.height; 
        cropCanvas.style.display = 'block';

        const w = cropCanvas.width; const h = cropCanvas.height; 
        const offset = Math.min(w, h) * 0.15;
        cropPoints = [ { x: offset, y: offset }, { x: w - offset, y: offset }, { x: w - offset, y: h - offset }, { x: offset, y: h - offset } ];
        drawCropPolygon();
    };
    tempImg.src = pageData.original;
}

function drawCropPolygon() {
    if (!cropCtx) return;
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'; 
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    cropCtx.globalCompositeOperation = 'destination-out';
    cropCtx.beginPath(); cropCtx.moveTo(cropPoints[0].x, cropPoints[0].y); 
    for (let i = 1; i < 4; i++) cropCtx.lineTo(cropPoints[i].x, cropPoints[i].y);
    cropCtx.closePath(); cropCtx.fill();
    
    cropCtx.globalCompositeOperation = 'source-over';
    cropCtx.strokeStyle = '#10b981'; cropCtx.lineWidth = Math.max(4, cropCanvas.width * 0.005); cropCtx.stroke();
    cropCtx.fillStyle = '#10b981';
    
    const isMobile = window.innerWidth <= 768;
    const radius = isMobile ? Math.max(25, cropCanvas.width * 0.035) : Math.max(10, cropCanvas.width * 0.015);
    
    for (let i = 0; i < 4; i++) {
        cropCtx.beginPath(); cropCtx.arc(cropPoints[i].x, cropPoints[i].y, radius, 0, Math.PI * 2); cropCtx.fill(); cropCtx.stroke();
    }
}

function getScannerCropCursorPos(e) {
    if (!cropCanvas) return { x: 0, y: 0 };
    const rect = cropCanvas.getBoundingClientRect();
    const canvasRatio = cropCanvas.width / cropCanvas.height; const rectRatio = rect.width / rect.height;
    let actualWidth = rect.width; let actualHeight = rect.height; let offsetX = 0; let offsetY = 0;

    if (canvasRatio > rectRatio) { actualHeight = rect.width / canvasRatio; offsetY = (rect.height - actualHeight) / 2; } 
    else { actualWidth = rect.height * canvasRatio; offsetX = (rect.width - actualWidth) / 2; }

    const scaleX = cropCanvas.width / actualWidth; const scaleY = cropCanvas.height / actualHeight;
    let clientX = e.clientX || (e.touches && e.touches[0].clientX); let clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return { x: (clientX - rect.left - offsetX) * scaleX, y: (clientY - rect.top - offsetY) * scaleY };
}

cropCanvas?.addEventListener('pointerdown', (e) => {
    if (!isCroppingMode) return;
    const pos = getScannerCropCursorPos(e);
    const hitRadius = Math.max(60, cropCanvas.width * 0.08); 
    for (let i = 0; i < 4; i++) {
        const dx = pos.x - cropPoints[i].x; const dy = pos.y - cropPoints[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) { activeCropPoint = i; break; }
    }
});

window.addEventListener('pointermove', (e) => {
    if (!isCroppingMode || activeCropPoint === -1) return;
    const pos = getScannerCropCursorPos(e);
    cropPoints[activeCropPoint].x = Math.max(0, Math.min(pos.x, cropCanvas.width)); 
    cropPoints[activeCropPoint].y = Math.max(0, Math.min(pos.y, cropCanvas.height));
    drawCropPolygon();
});

window.addEventListener('pointerup', () => { if (isCroppingMode) activeCropPoint = -1; });

document.getElementById('btn-cancel-crop')?.addEventListener('click', () => { 
    isCroppingMode = false; cropCanvas.style.display = 'none'; 
    document.getElementById('scanner-crop-top-bar').style.display = 'none'; 
    document.getElementById('scanner-default-top-bar').style.display = 'flex'; 
    renderScannerWorkspace(); 
});

document.getElementById('btn-apply-crop')?.addEventListener('click', () => {
    const tl = cropPoints[0], tr = cropPoints[1], br = cropPoints[2], bl = cropPoints[3];
    const w1 = Math.hypot(tr.x - tl.x, tr.y - tl.y); const w2 = Math.hypot(br.x - bl.x, br.y - bl.y); const destW = Math.max(w1, w2);
    const h1 = Math.hypot(bl.x - tl.x, bl.y - tl.y); const h2 = Math.hypot(br.x - tr.x, br.y - tr.y); const destH = Math.max(h1, h2);
    
    const tempCanvas = document.createElement('canvas'); tempCanvas.width = destW; tempCanvas.height = destH; const ctx = tempCanvas.getContext('2d');

    function drawTriangle(ctx, img, p0, p1, p2, uv0, uv1, uv2) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.closePath(); ctx.clip();
        const det = uv0.x * (uv1.y - uv2.y) - uv1.x * (uv0.y - uv2.y) + uv2.x * (uv0.y - uv1.y);
        if (det === 0) { ctx.restore(); return; }
        const a = (p0.x * (uv1.y - uv2.y) - p1.x * (uv0.y - uv2.y) + p2.x * (uv0.y - uv1.y)) / det;
        const c = (uv0.x * (p1.x - p2.x) - uv1.x * (p0.x - p2.x) + uv2.x * (p0.x - p1.x)) / det;
        const e = p0.x - a * uv0.x - c * uv0.y;
        const b = (p0.y * (uv1.y - uv2.y) - p1.y * (uv0.y - uv2.y) + p2.y * (uv0.y - uv1.y)) / det;
        const d = (uv0.x * (p1.y - p2.y) - uv1.x * (p0.y - p2.y) + uv2.x * (p0.y - p1.y)) / det;
        const f = p0.y - b * uv0.x - d * uv0.y;
        ctx.transform(a, b, c, d, e, f); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0); ctx.restore();
    }
    
    const dTl = {x:0, y:0}, dTr = {x:destW, y:0}, dBr = {x:destW, y:destH}, dBl = {x:0, y:destH}; const pad = 1;
    drawTriangle(ctx, scanCanvas, dTl, {x:dTr.x+pad, y:dTr.y}, {x:dBl.x, y:dBl.y+pad}, tl, tr, bl);
    drawTriangle(ctx, scanCanvas, {x:dTr.x+pad, y:dTr.y-pad}, {x:dBr.x+pad, y:dBr.y+pad}, {x:dBl.x-pad, y:dBl.y+pad}, tr, br, bl);
    
    scannerPages[currentScannerIndex].original = tempCanvas.toDataURL('image/jpeg', 0.95); scannerPages[currentScannerIndex].rotation = 0; 
    isCroppingMode = false; cropCanvas.style.display = 'none'; document.getElementById('scanner-crop-top-bar').style.display = 'none'; document.getElementById('scanner-default-top-bar').style.display = 'flex';
    renderScannerWorkspace(); renderScannerThumbnails();
});

function renderScannerThumbnails() {
    const list = document.getElementById('scanner-page-list'); if (!list) return; list.innerHTML = '';
    scannerPages.forEach((page, index) => {
        const img = document.createElement('img'); img.src = page.original; img.className = `scanned-thumb ${index === currentScannerIndex ? 'active' : ''}`;
        img.onclick = () => { if(isCroppingMode) return; currentScannerIndex = index; renderScannerWorkspace(); renderScannerThumbnails(); };
        list.appendChild(img);
    });
}

document.querySelectorAll('.scanner-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { if (currentScannerIndex === -1 || isCroppingMode) return; scannerPages[currentScannerIndex].filter = e.target.dataset.filter; renderScannerWorkspace(); });
});

document.getElementById('btn-scanner-close')?.addEventListener('click', () => { 
    if (scannerWorkspace) { scannerWorkspace.style.display = 'none'; }
    document.body.classList.remove('is-editing'); scannerPages = []; isCroppingMode = false; 
});

document.getElementById('btn-scanner-preview')?.addEventListener('click', async () => {
    if (scannerPages.length === 0 || isCroppingMode) return;
    const previewModal = document.getElementById('scanner-preview-modal'); const previewList = document.getElementById('scanner-preview-list');
    if (!previewModal || !previewList) return;
    previewList.innerHTML = '<p style="color:white; margin-top: 20px;">Generating preview...</p>'; previewModal.style.display = 'flex'; previewList.innerHTML = '';
    
    for (let i = 0; i < scannerPages.length; i++) {
        const page = scannerPages[i]; const tempImg = new Image(); tempImg.src = page.original; await new Promise(res => tempImg.onload = res);
        const angle = page.rotation || 0; const isRotated = angle === 90 || angle === 270;
        const cw = isRotated ? tempImg.height : tempImg.width; const ch = isRotated ? tempImg.width : tempImg.height;
        const tempCanvas = document.createElement('canvas'); tempCanvas.width = cw; tempCanvas.height = ch; const tCtx = tempCanvas.getContext('2d');
        tCtx.translate(cw / 2, ch / 2); tCtx.rotate((angle * Math.PI) / 180); tCtx.translate(-tempImg.width / 2, -tempImg.height / 2);
        
        if (page.filter === 'lighten') tCtx.filter = 'brightness(1.15) contrast(1.05)'; 
        else if (page.filter === 'magic') tCtx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)'; 
        else if (page.filter === 'grayscale') tCtx.filter = 'grayscale(100%)'; 
        else if (page.filter === 'bw') tCtx.filter = 'grayscale(100%) contrast(1.8) brightness(1.1)'; 
        else if (page.filter === 'eco') tCtx.filter = 'sepia(0.3) brightness(0.9) contrast(0.9)'; 
        else tCtx.filter = 'none';
        
        tCtx.drawImage(tempImg, 0, 0);
        const finalImg = document.createElement('img'); finalImg.src = tempCanvas.toDataURL('image/jpeg', 0.8); finalImg.className = 'preview-img'; previewList.appendChild(finalImg);
    }
});

document.getElementById('btn-scanner-export')?.addEventListener('click', async () => {
    if (scannerPages.length === 0) return;
    const btn = document.getElementById('btn-scanner-export'); const oldText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading PDF...';
    
    simulateLoadingAndProcess("Generating PDF", async () => {
        const pdfDoc = await PDFDocument.create();
        for (let page of scannerPages) {
            const tempImg = new Image(); tempImg.src = page.original; await new Promise(res => tempImg.onload = res);
            const angle = page.rotation || 0; const isRotated = angle === 90 || angle === 270; 
            const cw = isRotated ? tempImg.height : tempImg.width; const ch = isRotated ? tempImg.width : tempImg.height;
            const tempCanvas = document.createElement('canvas'); tempCanvas.width = cw; tempCanvas.height = ch; const tCtx = tempCanvas.getContext('2d');
            tCtx.translate(cw / 2, ch / 2); tCtx.rotate((angle * Math.PI) / 180); tCtx.translate(-tempImg.width / 2, -tempImg.height / 2);
            
            if (page.filter === 'lighten') tCtx.filter = 'brightness(1.15) contrast(1.05)'; 
            else if (page.filter === 'magic') tCtx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)'; 
            else if (page.filter === 'grayscale') tCtx.filter = 'grayscale(100%)'; 
            else if (page.filter === 'bw') tCtx.filter = 'grayscale(100%) contrast(1.8) brightness(1.1)'; 
            else if (page.filter === 'eco') tCtx.filter = 'sepia(0.3) brightness(0.9) contrast(0.9)'; 
            else tCtx.filter = 'none';
            
            tCtx.drawImage(tempImg, 0, 0);
            const optimizedBase64 = tempCanvas.toDataURL('image/jpeg', 0.85).split(',')[1]; const pdfImage = await pdfDoc.embedJpg(optimizedBase64);
            const dims = pdfImage.scale(1); const pdfPage = pdfDoc.addPage([dims.width, dims.height]); pdfPage.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
        }
        
        const bytes = await pdfDoc.save();
        showSuccessResult(0, bytes.length, "Scan Completed!", async () => {
            if(typeof AdManager !== 'undefined' && AdManager) { await AdManager.showInterstitial(); }
            await processAndDownload(bytes, `${scannerOriginalName}_Scanned.pdf`, 'application/pdf');
        });
        
        document.getElementById('scanner-preview-modal').style.display = 'none'; if (scannerWorkspace) { scannerWorkspace.style.display = 'none'; }
        document.body.classList.remove('is-editing'); scannerPages = []; btn.innerHTML = oldText;
    });
});

// ==========================================
// UI GENERATION FOR TOOLS
// ==========================================
const views = [
    'pdftoword', 'wordtopdf', 'exceltopdf', 'pdftoexcel', 'edit', 'merge', 'split', 'delete', 'compress', 'rotate', 'pdftojpg', 'pagenumbers', 
    'jpgtopdf', 'extract', 'watermark', 'sign', 'protect', 'unlock', 'flatten', 
    'crop', 'metadata', 'repair', 'reorder', 'imagewatermark', 'htmltopdf',
    'addtext', 'addblank', 'resizepdf', 'splitevenodd', 'addmargins', 'removeannots',
    'contact', 'privacy', 'terms', 'imagecompressor'
];

const ui = {};
views.forEach(v => { ui[v] = document.getElementById(`${v}-ui-container`); });

const dropZoneStyle = "border: 2px dashed var(--accent); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.05); transition: 0.3s; margin-bottom: 20px;";
const btnStyle = "background: var(--accent); color: white; border: none; padding: 14px 24px; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 15px;";
const inputStyle = "width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 15px;";
const fileListStyle = "display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;";
const fileItemStyle = "display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border); gap: 10px;";

const generateSingleFileUI = (id, icon, color, title, btnText, extraHtml = "", acceptType = "application/pdf") => `
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Select File to ${title}</h3>
        <button onclick="document.getElementById('${id}-file-input').click()" style="padding: 10px 20px; background: ${color}; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse File</button>
        <input type="file" id="${id}-file-input" accept="${acceptType}" style="display: none;">
    </div>
    <div id="${id}-file-info" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas ${icon}"></i> ${btnText}</button>
    </div>
`;

const generateMultipleFileUI = (id, icon, color, title, btnText, extraHtml = "", acceptType = "application/pdf") => `
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Drag & Drop Files to ${title}</h3>
        <button onclick="document.getElementById('${id}-file-input').click()" style="padding: 10px 20px; background: ${color}; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Files</button>
        <input type="file" id="${id}-file-input" multiple accept="${acceptType}" style="display: none;">
    </div>
    <div id="${id}-file-list" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas ${icon}"></i> ${btnText}</button>
    </div>
`;

// Document converters
const ocrOption = (id) => `
    <label style="display:flex; gap:8px; align-items:center; color:var(--text-secondary); font-size:0.9rem; margin-bottom:15px; cursor:pointer;"><input type="checkbox" id="${id}-ocr"> Scanned PDF? Read text with OCR (needs internet the first time)</label>
    <select id="${id}-lang" style="${inputStyle}"><option value="eng">OCR language: English</option><option value="hin">OCR language: Hindi</option><option value="eng+hin">OCR language: English + Hindi</option><option value="guj">OCR language: Gujarati</option><option value="mar">OCR language: Marathi</option></select>`;
if (ui.pdftoword) ui.pdftoword.innerHTML = generateSingleFileUI('pdftoword', 'fa-file-word', '#3b82f6', 'PDF to Word', 'Convert to Word', `
    <label style="color:var(--text-secondary); font-size:0.9rem;">Conversion style:</label>
    <select id="pdftoword-mode" style="${inputStyle}">
        <option value="layout">Editable - keeps layout, tables & images (recommended)</option>
        <option value="flow">Editable - flowing paragraphs (easier to rewrite)</option>
        <option value="exact">Exact look - every page as a picture (not editable)</option>
    </select>${ocrOption('pdftoword')}`);
if (ui.wordtopdf) ui.wordtopdf.innerHTML = generateSingleFileUI('wordtopdf', 'fa-file-pdf', '#ef4444', 'Word to PDF', 'Convert to PDF', `<p style="font-size:0.8rem; color:#94a3b8; margin-bottom:15px;">Looks exactly like your document and the text stays searchable. Works with .docx files.</p>`, '.docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document');
if (ui.exceltopdf) ui.exceltopdf.innerHTML = generateSingleFileUI('exceltopdf', 'fa-file-excel', '#10b981', 'Excel to PDF', 'Convert to PDF', `
    <label style="color:var(--text-secondary); font-size:0.9rem;">Page size & orientation:</label>
    <div style="display:flex; gap:10px;"><select id="exceltopdf-size" style="${inputStyle}"><option value="A4">A4</option><option value="Letter">Letter</option><option value="Legal">Legal</option></select>
    <select id="exceltopdf-orient" style="${inputStyle}"><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div>
    <label style="display:flex; gap:8px; align-items:center; color:var(--text-secondary); font-size:0.9rem; margin-bottom:10px; cursor:pointer;"><input type="checkbox" id="exceltopdf-fit" checked> Fit all columns on one page width</label>
    <label style="display:flex; gap:8px; align-items:center; color:var(--text-secondary); font-size:0.9rem; margin-bottom:15px; cursor:pointer;"><input type="checkbox" id="exceltopdf-grid" checked> Show gridlines</label>`, '.xlsx,.xlsm,.xls,.ods,.csv,.tsv');
if (ui.pdftoexcel) ui.pdftoexcel.innerHTML = generateSingleFileUI('pdftoexcel', 'fa-file-excel', '#10b981', 'PDF to Excel', 'Convert to Excel', `
    <label style="color:var(--text-secondary); font-size:0.9rem;">Sheets:</label>
    <select id="pdftoexcel-sheets" style="${inputStyle}"><option value="page">One sheet per PDF page</option><option value="one">Everything on a single sheet</option></select>${ocrOption('pdftoexcel')}`);

// Visual Editors Initialize
if (ui.edit) ui.edit.innerHTML = generateSingleFileUI('edit', 'fa-edit', '#10b981', 'Edit PDF', '');
if (ui.rotate) ui.rotate.innerHTML = generateSingleFileUI('rotate', 'fa-sync-alt', '#3b82f6', 'Rotate', '');
if (ui.flatten) ui.flatten.innerHTML = generateSingleFileUI('flatten', 'fa-layer-group', '#64748b', 'Flatten PDF', '');
if (ui.imagewatermark) ui.imagewatermark.innerHTML = generateSingleFileUI('imagewatermark', 'fa-images', '#ec4899', 'Image Watermark', '');
if (ui.crop) ui.crop.innerHTML = generateSingleFileUI('crop', 'fa-crop', '#3b82f6', 'Crop PDF', '');
if (ui.addmargins) ui.addmargins.innerHTML = generateSingleFileUI('addmargins', 'fa-border-all', '#3b82f6', 'Add Margins', '');

if (ui.pagenumbers) ui.pagenumbers.innerHTML = generateSingleFileUI('pagenumbers', 'fa-sort-numeric-down', '#6366f1', 'Add Numbers', '', `
    <label style="color:var(--text-secondary); font-size:0.9rem;">Format:</label>
    <select id="pagenumbers-format" style="${inputStyle}">
        <option value="1">1, 2, 3...</option>
        <option value="Page 1">Page 1, Page 2...</option>
        <option value="Page 1 of 10">Page 1 of 10...</option>
    </select>
`);

if (ui.sign) ui.sign.innerHTML = generateSingleFileUI('sign', 'fa-signature', '#8b5cf6', 'Sign', '');
if (ui.watermark) ui.watermark.innerHTML = generateSingleFileUI('watermark', 'fa-stamp', '#ec4899', 'Watermark', '');
if (ui.addtext) ui.addtext.innerHTML = generateSingleFileUI('addtext', 'fa-font', '#6366f1', 'Add Text', '');

if (ui.extract) ui.extract.innerHTML = generateSingleFileUI('extract', 'fa-file-alt', '#14b8a6', 'Extract Text', 'Continue', `
    <select id="extract-mode" style="${inputStyle}">
        <option value="full">Extract Full PDF Text</option>
        <option value="visual">Select Text Area Visually</option>
    </select>
`);

// Image Compressor UI
if (ui.imagecompressor) {
    ui.imagecompressor.innerHTML = generateSingleFileUI('imagecompressor', 'fa-file-image', '#eab308', 'Compress Image', 'Compress Now', `
        <label style="color:var(--text-secondary); font-size:0.9rem;">Target Maximum Size:</label>
        <select id="image-target-size" style="${inputStyle}">
            <option value="50">Under 50 KB (Best for Signatures)</option>
            <option value="100">Under 100 KB (Best for Photos)</option>
        </select>
        <p style="font-size:0.75rem; color:#94a3b8; margin-top:-10px; margin-bottom:15px;">Smart algorithm ensures max quality without pixelation.</p>
    `, 'image/*');
}

// Standard Tools
if (ui.merge) {
    ui.merge.innerHTML = `
        <div id="merge-drop-zone" style="${dropZoneStyle}">
            <i class="fas fa-cloud-upload-alt" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i>
            <h3>Drag & Drop PDFs or ZIP</h3>
            <button onclick="document.getElementById('merge-file-input').click()" style="padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Files</button>
            <input type="file" id="merge-file-input" multiple accept="application/pdf, application/zip, .zip" style="display: none;">
        </div>
        <div id="merge-file-list" style="${fileListStyle}"></div>
        <button id="btn-merge-action" style="${btnStyle}; display: none;"><i class="fas fa-object-group"></i> Merge Files Now</button>
    `;
}

if (ui.jpgtopdf) {
    ui.jpgtopdf.innerHTML = `
        <div id="jpgtopdf-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#eab308')}">
            <i class="fas fa-images" style="font-size: 3rem; color: #eab308; margin-bottom: 15px;"></i>
            <h3>Drag & Drop Images</h3>
            <button onclick="document.getElementById('jpgtopdf-file-input').click()" style="padding: 10px 20px; background: #eab308; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Images</button>
            <input type="file" id="jpgtopdf-file-input" multiple accept="image/*" style="display: none;">
        </div>
        <div id="jpgtopdf-file-list" style="${fileListStyle}"></div>
        <button id="btn-jpgtopdf-action" style="${btnStyle.replace('var(--accent)', '#eab308')}; display: none;"><i class="fas fa-file-pdf"></i> Convert to PDF</button>
    `;
}

if (ui.htmltopdf) {
    ui.htmltopdf.innerHTML = `
        <div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <label style="color: var(--text-secondary);">Paste your HTML Code here:</label>
            <textarea id="html-input" rows="10" style="${inputStyle}" placeholder="<h1>Hello</h1>"></textarea>
            <button id="btn-htmltopdf-action" style="${btnStyle.replace('var(--accent)', '#f97316')}"><i class="fas fa-code"></i> Convert to PDF</button>
        </div>
    `;
}

if (ui.protect) {
    ui.protect.innerHTML = generateMultipleFileUI('protect', 'fa-lock', '#8b5cf6', 'Protect', 'Encrypt', `
        <div style="position: relative; width: 100%;">
            <input type="password" id="protect-password" placeholder="Set Password for all files" style="${inputStyle} padding-right: 45px;" autocomplete="new-password">
            <i class="fas fa-eye" onclick="let inp = document.getElementById('protect-password'); if(inp.type==='password'){inp.type='text';this.className='fas fa-eye-slash'}else{inp.type='password';this.className='fas fa-eye'}" style="position: absolute; right: 15px; top: 14px; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; z-index: 10;"></i>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <input type="checkbox" id="protect-remember" style="width: 18px; height: 18px; cursor: pointer;">
            <label for="protect-remember" style="color: var(--text-secondary); font-size: 0.9rem; cursor: pointer;">Remember password on this PC</label>
        </div>
    `);
}

if (ui.unlock) {
    ui.unlock.innerHTML = generateMultipleFileUI('unlock', 'fa-unlock', '#06b6d4', 'Unlock', 'Unlock', `
        <div style="position: relative; width: 100%;">
            <input type="password" id="unlock-password" placeholder="Current Password (applied to all)" style="${inputStyle} padding-right: 45px;" autocomplete="new-password">
            <i class="fas fa-eye" onclick="let inp = document.getElementById('unlock-password'); if(inp.type==='password'){inp.type='text';this.className='fas fa-eye-slash'}else{inp.type='password';this.className='fas fa-eye'}" style="position: absolute; right: 15px; top: 14px; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; z-index: 10;"></i>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <input type="checkbox" id="unlock-remember" style="width: 18px; height: 18px; cursor: pointer;">
            <label for="unlock-remember" style="color: var(--text-secondary); font-size: 0.9rem; cursor: pointer;">Remember password on this PC</label>
        </div>
    `);
}

setTimeout(() => {
    const savedProtectPass = localStorage.getItem('amazingpdf_protect_pass');
    if (savedProtectPass) {
        const pInput = document.getElementById('protect-password');
        const pCheck = document.getElementById('protect-remember');
        if (pInput) pInput.value = savedProtectPass;
        if (pCheck) pCheck.checked = true;
    }
    
    const savedUnlockPass = localStorage.getItem('amazingpdf_unlock_pass');
    if (savedUnlockPass) {
        const uInput = document.getElementById('unlock-password');
        const uCheck = document.getElementById('unlock-remember');
        if (uInput) uInput.value = savedUnlockPass;
        if (uCheck) uCheck.checked = true;
    }
}, 500);

if (ui.compress) ui.compress.innerHTML = generateMultipleFileUI('compress', 'fa-compress-arrows-alt', '#10b981', 'Compress', 'Compress Files', `
    <label style="color:var(--text-secondary); font-size:0.9rem;">Compression level:</label>
    <select id="compress-level" style="${inputStyle}">
        <option value="balanced">Balanced - keeps text sharp & selectable (recommended)</option>
        <option value="extreme">Extreme - smallest size (pages become images)</option>
    </select>`, 'application/pdf, application/zip, .zip');

if (ui.split) ui.split.innerHTML = generateSingleFileUI('split', 'fa-cut', '#f59e0b', 'Split', 'Split & Download', `<input type="text" id="split-ranges" placeholder="e.g. 1-3" style="${inputStyle}">`);
if (ui.delete) ui.delete.innerHTML = generateSingleFileUI('delete', 'fa-trash-alt', '#ef4444', 'Delete Pages', 'Remove Pages', `<input type="text" id="delete-ranges" placeholder="e.g. 2, 4-6" style="${inputStyle}">`);
if (ui.reorder) ui.reorder.innerHTML = generateSingleFileUI('reorder', 'fa-sort-amount-up', '#8b5cf6', 'Reorder Pages', 'Apply New Order', `<input type="text" id="reorder-input" placeholder="e.g. 33-32-31, 3, 1, 2" style="${inputStyle}">`);
if (ui.pdftojpg) ui.pdftojpg.innerHTML = generateSingleFileUI('pdftojpg', 'fa-file-archive', '#eab308', 'Convert to JPG', 'Download ZIP of Images');

if (ui.metadata) {
    ui.metadata.innerHTML = generateSingleFileUI('metadata', 'fa-info-circle', '#eab308', 'Edit Metadata', 'Update Metadata', `
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Update hidden document properties.</p>
        <input type="text" id="meta-title" placeholder="New Document Title" style="${inputStyle}">
        <input type="text" id="meta-author" placeholder="New Author Name" style="${inputStyle}">
    `);
}

if (ui.repair) {
    ui.repair.innerHTML = generateSingleFileUI('repair', 'fa-tools', '#10b981', 'Repair PDF', 'Attempt Repair', `
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Rebuilds broken internal links & corrupted XRef tables.</p>
    `);
}

if (ui.addblank) {
    ui.addblank.innerHTML = generateSingleFileUI('addblank', 'fa-file-medical', '#10b981', 'Insert Blank Pages', 'Insert & Download', `
        <select id="addblank-position" style="${inputStyle}">
            <option value="end">At the very end</option>
            <option value="start">At the very beginning</option>
            <option value="after">After specific page...</option>
        </select>
        <input type="number" id="addblank-after-num" placeholder="Page Number" style="${inputStyle} display:none;">
        <label style="font-size:0.8rem; color:#94a3b8;">Number of Pages:</label>
        <input type="number" id="addblank-count" value="1" min="1" style="${inputStyle}">
    `);
}

if (ui.resizepdf) {
    ui.resizepdf.innerHTML = generateSingleFileUI('resizepdf', 'fa-expand-arrows-alt', '#14b8a6', 'Resize Pages', 'Scale Document', `
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Proportionally scales content to fit new page size.</p>
        <select id="resize-profile" style="${inputStyle}">
            <option value="A4">A4 Profile</option>
            <option value="Letter">Letter Profile</option>
            <option value="Legal">Legal Profile</option>
        </select>
    `);
}

if (ui.splitevenodd) ui.splitevenodd.innerHTML = generateSingleFileUI('splitevenodd', 'fa-columns', '#6366f1', 'Split Even/Odd', 'Split & Download ZIP');
if (ui.removeannots) ui.removeannots.innerHTML = generateSingleFileUI('removeannots', 'fa-eraser', '#8b5cf6', 'Clean Annotations', 'Remove All');

document.getElementById('addblank-position')?.addEventListener('change', (e) => { 
    document.getElementById('addblank-after-num').style.display = (e.target.value === 'after') ? 'block' : 'none'; 
});

// ==========================================
// FILE LOGIC UTILITIES (Single/Multiple/ZIP)
// ==========================================
function parseRange(rangeStr, maxPages) {
    const pages = [];
    String(rangeStr || '').split(',').forEach(raw => {
        const part = raw.trim(); if (!part) return;
        const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) { let a = parseInt(m[1]), b = parseInt(m[2]); if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) pages.push(i - 1); }
        else if (/^\d+$/.test(part)) pages.push(parseInt(part) - 1);
        else throw new Error(`"${part}" is not a valid page number or range. Use something like 1, 3-5.`);
    });
    const clean = [...new Set(pages)].sort((a, b) => a - b);
    if (maxPages != null) { const bad = clean.filter(p => p < 0 || p >= maxPages); if (bad.length) throw new Error(`This PDF has only ${maxPages} page(s). Page ${bad[0] + 1} does not exist.`); }
    else if (clean.some(p => p < 0)) throw new Error('Page numbers start from 1.');
    return clean;
}

// drag & drop support for any drop zone
function enableDrop(zone, onFiles) {
    if (!zone || zone.dataset.dropReady) return; zone.dataset.dropReady = '1';
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.style.opacity = '0.75'; }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.style.opacity = ''; }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); });
}
const isPdfFile = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

// ZIP Parser Helper
async function handleFilesOrZip(filesArray) {
    let finalFiles = [];
    for (let file of filesArray) {
        if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            for (let filename of Object.keys(contents.files)) {
                const base = filename.split('/').pop();
                if (!contents.files[filename].dir && /\.pdf$/i.test(base) && !base.startsWith('.') && !filename.startsWith('__MACOSX')) {
                    const blob = await contents.files[filename].async('blob');
                    finalFiles.push(new File([blob], base, { type: 'application/pdf' }));
                }
            }
        } else if (isPdfFile(file)) {
            finalFiles.push(file);
        }
    }
    if (!finalFiles.length && filesArray.length) showCustomAlert('Please choose PDF files (or a ZIP containing PDFs).');
    return finalFiles;
}

const VISUAL_TOOLS = ['edit', 'crop', 'addmargins', 'pagenumbers', 'sign', 'watermark', 'addtext', 'rotate', 'flatten', 'imagewatermark'];
const FILE_RULES = {
    imagecompressor: { re: /^image\//, name: /\.(jpe?g|png|webp|bmp|gif)$/i, msg: 'Please choose an image (JPG / PNG / WEBP).' },
    wordtopdf: { name: /\.docx$/i, msg: 'Please choose a .docx file. (Old .doc files: open in Word and Save As .docx first.)' },
    exceltopdf: { name: /\.(xlsx|xlsm|xls|ods|csv|tsv)$/i, msg: 'Please choose an Excel file (.xlsx, .xls) or CSV.' }
};
function validateFile(id, file) {
    const r = FILE_RULES[id];
    if (r) { if ((r.re && r.re.test(file.type)) || (r.name && r.name.test(file.name))) return true; showCustomAlert(r.msg); return false; }
    if (!isPdfFile(file)) { showCustomAlert('Please choose a PDF file.'); return false; }
    return true;
}
const TOOL_ICON = { wordtopdf: 'fa-file-word', exceltopdf: 'fa-file-excel', imagecompressor: 'fa-file-image' };

function setupSingleFileLogic(id, actionCallback) {
    const dropZone = document.getElementById(`${id}-drop-zone`); 
    const input = document.getElementById(`${id}-file-input`);
    const info = document.getElementById(`${id}-file-info`); 
    const controls = document.getElementById(`${id}-controls`); 
    const btn = document.getElementById(`btn-${id}-action`);
    let currentFile = null;

    if (!dropZone || !input) return;
    
    dropZone.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') input.click(); });

    const acceptFile = (file) => {
        if (!file || !validateFile(id, file)) return;
        currentFile = file;
        const extractEl = document.getElementById('extract-mode');
        if (VISUAL_TOOLS.includes(id) || (id === 'extract' && extractEl && extractEl.value === 'visual')) {
            openVisualWorkspace(currentFile, id); input.value = ''; currentFile = null; return;
        }
        dropZone.style.display = 'none';
        info.innerHTML = `
            <div style="${fileItemStyle}">
                <div class="text-container" style="display:flex; align-items:center; gap:15px; min-width:0;">
                    <i class="fas ${TOOL_ICON[id] || 'fa-file-pdf'}" style="color:#ef4444; font-size:1.5rem; flex-shrink:0;"></i>
                    <b class="text-ellipsis">${escapeHtml(file.name)}</b>
                </div>
                <button id="reset-${id}" style="background:var(--glass-border); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; flex-shrink:0;"><i class="fas fa-times"></i></button>
            </div>`;
        controls.style.display = 'block';
        document.getElementById(`reset-${id}`)?.addEventListener('click', () => { currentFile = null; input.value = ''; dropZone.style.display = 'block'; info.innerHTML = ''; controls.style.display = 'none'; });
    };
    input.addEventListener('change', (e) => acceptFile(e.target.files[0]));
    enableDrop(dropZone, (files) => acceptFile(files[0]));

    if (btn) {
        btn.addEventListener('click', async () => {
            if (!currentFile) return; 
            const totalOriginalSize = currentFile.size; const fileRef = currentFile;
            simulateLoadingAndProcess(`Processing File`, async () => {
                const result = await actionCallback(fileRef);
                if (!result) return;
                window.__pendingShare = result;
                document.getElementById(`reset-${id}`)?.click();
                const forceStats = ['split', 'wordtopdf', 'pdftoword', 'exceltopdf', 'pdftoexcel'].includes(id);
                showSuccessResult(totalOriginalSize, result.bytes.length, result.title || "Task Completed!", async () => {
                    if (typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
                    await processAndDownload(result.bytes, result.filename, result.type); 
                }, forceStats);
            });
        });
    }
}

function setupMultipleFileLogic(id, actionCallback) {
    const dropZone = document.getElementById(`${id}-drop-zone`); 
    const input = document.getElementById(`${id}-file-input`);
    const listContainer = document.getElementById(`${id}-file-list`); 
    const controls = document.getElementById(`${id}-controls`); 
    const btn = document.getElementById(`btn-${id}-action`);
    let currentFiles = [];

    if (!dropZone || !input || !btn) return;
    dropZone.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') input.click(); });
    
    function renderList() {
        listContainer.innerHTML = '';
        currentFiles.forEach((f, i) => {
            const itemDiv = document.createElement('div'); 
            itemDiv.style = fileItemStyle;
            itemDiv.innerHTML = `
                <div class="text-container"><b class="text-ellipsis">${escapeHtml(f.name)}</b></div>
                <button class="remove-btn" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; flex-shrink:0;"><i class="fas fa-times"></i></button>`;
            listContainer.appendChild(itemDiv);
        });
        listContainer.querySelectorAll('.remove-btn').forEach(button => { 
            button.addEventListener('click', (e) => { currentFiles.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); renderList(); }); 
        });
        if (currentFiles.length > 0) {
            controls.style.display = 'block'; dropZone.style.display = 'none';
            const addMoreBtn = document.createElement('button'); 
            addMoreBtn.id = `add-more-${id}`; addMoreBtn.innerHTML = '<i class="fas fa-plus"></i> Add More PDFs';
            addMoreBtn.style = `background:var(--surface-color); color:var(--text-main); border:1px dashed var(--glass-border); padding:10px; width:100%; border-radius:8px; margin-bottom:15px; cursor:pointer; font-weight:600;`;
            addMoreBtn.addEventListener('click', () => input.click()); 
            listContainer.appendChild(addMoreBtn);
        } else { controls.style.display = 'none'; dropZone.style.display = 'block'; }
    }
    const addFiles = async (list) => { const files = await handleFilesOrZip(list); currentFiles = [...currentFiles, ...files]; renderList(); };
    input.addEventListener('change', async (e) => { await addFiles(Array.from(e.target.files)); input.value = ''; });
    enableDrop(dropZone, addFiles);

    btn.addEventListener('click', async () => {
        if (!currentFiles.length) return; 
        const filesRef = currentFiles; const totalOriginalSize = filesRef.reduce((acc, f) => acc + f.size, 0);
        simulateLoadingAndProcess(`Processing ${filesRef.length} File(s)`, async () => {
            const result = await actionCallback(filesRef); 
            window.__pendingShare = result;
            currentFiles = []; renderList(); 
            showSuccessResult(totalOriginalSize, result.bytes.length, "Task Completed!", async () => {
                if (typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
                await processAndDownload(result.bytes, result.filename, result.type); 
            }, id === 'compress');
        });
    });
}

function hexToRgbPdf(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) { 
        r = parseInt(hex.substring(1, 3), 16) / 255; 
        g = parseInt(hex.substring(3, 5), 16) / 255; 
        b = parseInt(hex.substring(5, 7), 16) / 255; 
    }
    return rgb(r, g, b);
}

// Visual tool mappings handled inside openVisualWorkspace
setupSingleFileLogic('edit', null);
setupSingleFileLogic('rotate', null);
setupSingleFileLogic('flatten', null);
setupSingleFileLogic('imagewatermark', null);
setupSingleFileLogic('crop', null);
setupSingleFileLogic('addmargins', null);
setupSingleFileLogic('pagenumbers', null);
setupSingleFileLogic('sign', null);
setupSingleFileLogic('watermark', null);
setupSingleFileLogic('addtext', null);

// --- Document converters (modules are loaded on first use) ---
const withProgress = (label) => (i, n) => { const t = document.getElementById('action-title'); if (t) t.textContent = `${label}: page ${i} of ${n}`; };
async function prepOcr(on) { if (on) { const pro = await loadPro(true); ctx.ocrCanvas = pro.ocrCanvas; } }
setupSingleFileLogic('pdftoword', async (file) => {
    const cv = await getConvert(); const ocr = document.getElementById('pdftoword-ocr')?.checked; await prepOcr(ocr);
    const r = await cv.pdfToWord(file, { mode: document.getElementById('pdftoword-mode').value, ocr, lang: document.getElementById('pdftoword-lang').value }, ctx, withProgress('Converting'));
    if (r.scanned && !ocr) showCustomAlert(`${r.scanned} page(s) have no selectable text (scanned), so they were inserted as pictures. Tick the OCR option to get editable text.`);
    return { bytes: r.bytes, filename: `${getBaseName(file.name)}.docx`, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', title: 'Word File Ready!' };
});
setupSingleFileLogic('wordtopdf', async (file) => {
    const cv = await getConvert(); const bytes = await cv.wordToPdf(file, ctx, withProgress('Rendering'));
    return { bytes, filename: `${getBaseName(file.name)}.pdf`, type: 'application/pdf', title: 'PDF Ready!' };
});
setupSingleFileLogic('exceltopdf', async (file) => {
    const cv = await getConvert(); const g = (i) => document.getElementById('exceltopdf-' + i);
    const bytes = await cv.excelToPdf(file, { size: g('size').value, orient: g('orient').value, margin: 28, fit: g('fit').checked, grid: g('grid').checked, quality: 2.5 }, ctx);
    return { bytes, filename: `${getBaseName(file.name)}.pdf`, type: 'application/pdf', title: 'PDF Ready!' };
});
setupSingleFileLogic('pdftoexcel', async (file) => {
    const cv = await getConvert(); const ocr = document.getElementById('pdftoexcel-ocr')?.checked; await prepOcr(ocr);
    const bytes = await cv.pdfToExcel(file, { perPage: document.getElementById('pdftoexcel-sheets').value === 'page', ocr, lang: document.getElementById('pdftoexcel-lang').value }, ctx, withProgress('Reading'));
    return { bytes, filename: `${getBaseName(file.name)}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', title: 'Excel File Ready!' };
});


setupSingleFileLogic('split', async (file) => {
    const sourcePdf = await PDFDocument.load(await file.arrayBuffer()); 
    const pagesToExtract = parseRange(document.getElementById('split-ranges').value, sourcePdf.getPageCount());
    if (!pagesToExtract.length) throw new Error("Please enter the pages to extract, e.g. 1-3, 5");
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pagesToExtract); 
    copiedPages.forEach(p => newPdf.addPage(p));
    return { bytes: await newPdf.save(), filename: `${getBaseName(file.name)}_Split.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('delete', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    const pagesToDelete = parseRange(document.getElementById('delete-ranges').value, pdfDoc.getPageCount());
    if (!pagesToDelete.length) throw new Error("Please enter the pages to delete, e.g. 2, 4-6");
    if (pagesToDelete.length >= pdfDoc.getPageCount()) throw new Error("You cannot delete every page of the PDF.");
    pagesToDelete.sort((a, b) => b - a).forEach(i => pdfDoc.removePage(i));
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Deleted.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('reorder', async (file) => {
    const rawInput = document.getElementById('reorder-input').value;
    const srcDoc = await PDFDocument.load(await file.arrayBuffer()); 
    const maxPages = srcDoc.getPageCount();
    let indices = [];
    rawInput.split(',').forEach(raw => {
        const part = raw.trim(); if (!part) return;
        const nums = part.split('-').map(n => parseInt(n.trim()) - 1);
        if (nums.some(n => isNaN(n) || n < 0 || n >= maxPages)) throw new Error(`"${part}" is invalid. This PDF has ${maxPages} page(s).`);
        if (nums.length === 2) { const [a, b] = nums; if (a <= b) for (let i = a; i <= b; i++) indices.push(i); else for (let i = a; i >= b; i--) indices.push(i); } // 5-3 => 5,4,3
        else indices.push(...nums); // 33-32-31 style chains keep the typed order
    });
    if (!indices.length) throw new Error("Please enter the new page order, e.g. 3, 1, 2 or 5-1");
    const newPdf = await PDFDocument.create(); 
    const copied = await newPdf.copyPages(srcDoc, indices); copied.forEach(p => newPdf.addPage(p));
    return { bytes: await newPdf.save(), filename: `${getBaseName(file.name)}_Reordered.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('metadata', async (file) => {
    const title = document.getElementById('meta-title').value; 
    const author = document.getElementById('meta-author').value;
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    if(title) pdfDoc.setTitle(title); if(author) pdfDoc.setAuthor(author);
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Metadata.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('repair', async (file) => {
    const buf = await file.arrayBuffer();
    try {
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
        return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Repaired.pdf`, type: 'application/pdf' };
    } catch (e) { // structure too damaged: rebuild from rendered pages
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; const out = await PDFDocument.create();
        for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const base = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: 2 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); await page.render({ canvasContext: c, viewport: vp }).promise; const img = await out.embedJpg(cv.toDataURL('image/jpeg', 0.9)); out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height }); cv.width = 0; }
        return { bytes: await out.save(), filename: `${getBaseName(file.name)}_Repaired.pdf`, type: 'application/pdf' };
    }
});

setupSingleFileLogic('addblank', async (file) => {
    const pos = document.getElementById('addblank-position').value;
    const afterNum = parseInt(document.getElementById('addblank-after-num').value);
    const count = Math.min(500, Math.max(1, parseInt(document.getElementById('addblank-count').value) || 1));
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    if (pos === 'after' && !(afterNum > 0 && afterNum <= pdfDoc.getPageCount())) throw new Error(`Enter a valid page number (1-${pdfDoc.getPageCount()}).`);
    const ref = pdfDoc.getPage(pos === 'start' ? 0 : pos === 'after' ? afterNum - 1 : pdfDoc.getPageCount() - 1).getSize();
    for (let i = 0; i < count; i++) { // new pages take the size of the neighbouring page
        if (pos === 'start') pdfDoc.insertPage(0, [ref.width, ref.height]); 
        else if (pos === 'after') pdfDoc.insertPage(afterNum, [ref.width, ref.height]);
        else pdfDoc.addPage([ref.width, ref.height]);
    }
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_AddedPages.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('resizepdf', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    const profile = document.getElementById('resize-profile').value;
    let targetW = 595.28, targetH = 841.89;
    if(profile === 'Letter') { targetW = 612; targetH = 792; }
    if(profile === 'Legal') { targetW = 612; targetH = 1008; }

    pdfDoc.getPages().forEach(page => {
        const { width, height } = page.getSize();
        const scale = Math.min(targetW / width, targetH / height);
        page.scaleContent(scale, scale); page.setSize(targetW, targetH); page.setCropBox(0, 0, targetW, targetH);
        const newX = (targetW - (width * scale)) / 2; const newY = (targetH - (height * scale)) / 2;
        page.translateContent(newX, newY);
    });
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Resized.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('removeannots', async (file) => {
    const doc = await PDFDocument.load(await file.arrayBuffer());
    doc.getPages().forEach(page => page.node.delete(PDFName.of('Annots')));
    return { bytes: await doc.save(), filename: `${getBaseName(file.name)}_Cleaned.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('splitevenodd', async (file) => {
    const srcDoc = await PDFDocument.load(await file.arrayBuffer());
    const oddDoc = await PDFDocument.create(); const evenDoc = await PDFDocument.create();
    let oddIdx = [], evenIdx = [];
    for(let i=0; i<srcDoc.getPageCount(); i++) { if(i%2===0) oddIdx.push(i); else evenIdx.push(i); }
    const zip = new JSZip();
    if(oddIdx.length) { const oP = await oddDoc.copyPages(srcDoc, oddIdx); oP.forEach(p => oddDoc.addPage(p)); zip.file("Odd_Pages.pdf", await oddDoc.save()); }
    if(evenIdx.length) { const eP = await evenDoc.copyPages(srcDoc, evenIdx); eP.forEach(p => evenDoc.addPage(p)); zip.file("Even_Pages.pdf", await evenDoc.save()); }
    return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(file.name)}_EvenOdd.zip`, type: 'application/zip' };
});

setupSingleFileLogic('pdftojpg', async (file) => {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const zip = new JSZip();
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); const canvas = document.createElement('canvas'); const viewport = page.getViewport({ scale: 2.0 });
        canvas.height = viewport.height; canvas.width = viewport.width; const c2 = canvas.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: c2, viewport }).promise;
        zip.file(`Page_${i}.jpg`, canvas.toDataURL('image/jpeg', 0.9).split(',')[1], {base64: true});
        canvas.width = canvas.height = 0;
    }
    return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(file.name)}_Images.zip`, type: 'application/zip' };
});

setupSingleFileLogic('extract', async (file) => {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; 
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); const textContent = await page.getTextContent();
        let pageText = '', lastY = null;
        textContent.items.forEach(item => { if (!item.str && !item.hasEOL) return; const y = item.transform[5]; if (lastY !== null && Math.abs(y - lastY) > 3) pageText += '\n'; else if (pageText && !/\s$/.test(pageText) && item.str && !/^\s/.test(item.str)) pageText += ' '; pageText += item.str; if (item.hasEOL) { pageText += '\n'; lastY = null; } else lastY = y; });
        fullText += `--- Page ${i} ---\n${pageText.trim()}\n\n`;
    }
    if (!fullText.replace(/--- Page \d+ ---/g, '').trim()) throw new Error("No selectable text found. This looks like a scanned PDF - use the OCR Scanner tool.");
    return { bytes: new TextEncoder().encode(fullText), filename: `${getBaseName(file.name)}_Extracted.txt`, type: 'text/plain' };
});

// Image Compressor Tool Logic
setupSingleFileLogic('imagecompressor', async (file) => {
    const targetKB = parseInt(document.getElementById('image-target-size').value);
    const targetBytes = targetKB * 1024; 
    
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = async function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                let width = img.width;
                let height = img.height;
                
                const maxDim = targetKB === 50 ? 1000 : 1500; 
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.fillStyle = 'white'; 
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                let minQ = 0.1;
                let maxQ = 1.0;
                let bestBlob = null;

                const getCanvasBlob = (quality) => {
                    return new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
                };

                let attempts = 0;
                while (minQ <= maxQ && attempts < 10) {
                    let midQ = (minQ + maxQ) / 2;
                    let blob = await getCanvasBlob(midQ);
                    
                    if (blob.size <= targetBytes) {
                        bestBlob = blob; 
                        minQ = midQ + 0.05; 
                    } else {
                        maxQ = midQ - 0.05; 
                    }
                    attempts++;
                }
                
                if (!bestBlob) {
                    bestBlob = await getCanvasBlob(0.1); let guard = 0; let cw = canvas.width, ch = canvas.height;
                    while (bestBlob.size > targetBytes && guard++ < 8 && cw > 120) { cw = Math.floor(cw * 0.8); ch = Math.floor(ch * 0.8); const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch; const x2 = c2.getContext('2d'); x2.fillStyle = 'white'; x2.fillRect(0, 0, cw, ch); x2.drawImage(canvas, 0, 0, cw, ch); bestBlob = await new Promise(r => c2.toBlob(r, 'image/jpeg', 0.5)); }
                }
                
                const outName = getBaseName(file.name) + `_${targetKB}KB.jpg`;
                resolve({ 
                    bytes: new Uint8Array(await bestBlob.arrayBuffer()), 
                    filename: outName, 
                    type: 'image/jpeg' 
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
});

const compressSingleFile = async (file, level) => {
    const originalBytes = new Uint8Array(await file.arrayBuffer()); const originalSize = originalBytes.length;
    let standardBytes = null;
    try { const tempDoc = await PDFDocument.load(originalBytes, { updateMetadata: false }); standardBytes = await tempDoc.save({ useObjectStreams: true }); } catch (e) { }
    let best = originalBytes; if (standardBytes && standardBytes.length < best.length) best = standardBytes;
    if (level === 'balanced' && best.length <= originalSize * 0.8) return best; // structural optimisation was enough
    const pdf = await pdfjsLib.getDocument({ data: originalBytes.slice(0) }).promise; const newPdf = await PDFDocument.create();
    let dynamicScale, quality;
    if (level === 'extreme') {
        if (originalSize > 50 * 1024 * 1024) { dynamicScale = 0.4; quality = 0.5; } else if (originalSize > 15 * 1024 * 1024) { dynamicScale = 0.6; quality = 0.6; } else if (originalSize > 5 * 1024 * 1024) { dynamicScale = 0.8; quality = 0.65; } else if (originalSize > 1024 * 1024) { dynamicScale = 1.0; quality = 0.7; } else { dynamicScale = 1.2; quality = 0.6; }
    } else { dynamicScale = originalSize > 15 * 1024 * 1024 ? 1.0 : 1.5; quality = 0.78; } // balanced fallback keeps pages readable
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); const baseViewport = page.getViewport({ scale: 1.0 });
        let finalScale = dynamicScale; if (baseViewport.width * dynamicScale > 1600) finalScale = 1600 / baseViewport.width;
        const viewport = page.getViewport({ scale: finalScale }); const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
        const c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: c, viewport }).promise;
        const pdfImage = await newPdf.embedJpg(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
        newPdf.addPage([baseViewport.width, baseViewport.height]).drawImage(pdfImage, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height });
        canvas.width = canvas.height = 0;
    }
    const rasterBytes = await newPdf.save();
    if (level === 'extreme' ? rasterBytes.length < best.length : rasterBytes.length < best.length * 0.7) best = rasterBytes; // balanced: only trade text for size when it really pays off
    return best;
};
setupMultipleFileLogic('compress', async (files) => {
    const level = (document.getElementById('compress-level') || {}).value || 'balanced';
    if (files.length === 1) {
        const bytes = await compressSingleFile(files[0], level);
        return { bytes, filename: `${getBaseName(files[0].name)}_Compressed.pdf`, type: 'application/pdf' };
    }
    const zip = new JSZip();
    for (const file of files) zip.file(`${getBaseName(file.name)}_Compressed.pdf`, await compressSingleFile(file, level));
    return { bytes: await zip.generateAsync({ type: 'uint8array' }), filename: `Batch_Compressed.zip`, type: 'application/zip' };
});

setupMultipleFileLogic('unlock', async (files) => {
    const passwordInput = document.getElementById('unlock-password');
    const rememberCheck = document.getElementById('unlock-remember');
    const password = passwordInput.value; 
    if (!password) throw new Error("Please enter a password to unlock the file.");
    
    if (rememberCheck && rememberCheck.checked) localStorage.setItem('amazingpdf_unlock_pass', password);
    else localStorage.removeItem('amazingpdf_unlock_pass');
    
    const unlockSingleFile = async (file, pwd) => {
        try { 
            const buf = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(buf); // works only if the file is not actually encrypted
            return await pdfDoc.save(); 
        } catch (err) {
            if (!navigator.onLine) throw new Error("Please turn on internet to unlock via Cloud.");
            const formData = new FormData(); formData.append('file', file); formData.append('password', pwd);
            const response = await fetch("https://amazing-pdf-tool.vercel.app/api/unlock", { method: 'POST', body: formData });
            if (response.status === 401 || response.status === 400) throw new Error("Wrong password, or this PDF is not password protected.");
            if (!response.ok) throw new Error("Unlock failed (server error). Please try again."); 
            return new Uint8Array(await (await response.blob()).arrayBuffer());
        }
    };
    
    if (files.length === 1) { 
        const bytes = await unlockSingleFile(files[0], password); 
        return { bytes, filename: `${getBaseName(files[0].name)}_Unlocked.pdf`, type: 'application/pdf' }; 
    } else {
        const zip = new JSZip(); let successCount = 0;
        for (const file of files) { 
            try { const bytes = await unlockSingleFile(file, password); zip.file(`${getBaseName(file.name)}_Unlocked.pdf`, bytes); successCount++; } catch (e) { } 
        }
        if (successCount === 0) throw new Error("Failed to unlock."); 
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Unlocked.zip`, type: 'application/zip' };
    }
});

setupMultipleFileLogic('protect', async (files) => {
    const passwordInput = document.getElementById('protect-password');
    const rememberCheck = document.getElementById('protect-remember');
    const password = passwordInput.value; 
    if (!password) throw new Error("Password required"); 
    if (!navigator.onLine) throw new Error("Online required for Secure Cloud Protect.");
    
    if (rememberCheck && rememberCheck.checked) localStorage.setItem('amazingpdf_protect_pass', password);
    else localStorage.removeItem('amazingpdf_protect_pass');
    
    const VERCEL_API_URL = "https://amazing-pdf-tool.vercel.app/api/protect"; 
    
    if (files.length === 1) {
        const formData = new FormData(); formData.append('file', new Blob([await files[0].arrayBuffer()], {type: 'application/pdf'}), files[0].name); formData.append('password', password);
        const response = await fetch(VERCEL_API_URL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Server error."); 
        const bytes = new Uint8Array(await (await response.blob()).arrayBuffer());
        return { bytes, filename: `${getBaseName(files[0].name)}_Protected.pdf`, type: 'application/pdf' };
    } else {
        const zip = new JSZip();
        for (const file of files) {
            const formData = new FormData(); formData.append('file', new Blob([await file.arrayBuffer()], {type: 'application/pdf'}), file.name); formData.append('password', password);
            const response = await fetch(VERCEL_API_URL, { method: 'POST', body: formData });
            if (response.ok) { const bytes = new Uint8Array(await (await response.blob()).arrayBuffer()); zip.file(`${getBaseName(file.name)}_Protected.pdf`, bytes); }
        }
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Protected.zip`, type: 'application/zip' };
    }
});

if (ui.htmltopdf) {
    document.getElementById('btn-htmltopdf-action')?.addEventListener('click', async () => {
        const htmlContent = document.getElementById('html-input').value; 
        if (!htmlContent) return showCustomAlert("Enter HTML first.");
        const btn = document.getElementById('btn-htmltopdf-action'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';
        
        simulateLoadingAndProcess("Converting HTML", async () => {
            const iframe = document.createElement('iframe'); iframe.setAttribute('sandbox', 'allow-same-origin'); iframe.style.position = 'absolute'; iframe.style.top = '-9999px'; iframe.style.width = '800px'; document.body.appendChild(iframe);
            iframe.contentDocument.open(); iframe.contentDocument.write(htmlContent); iframe.contentDocument.close();
            const opt = { margin: 1, jsPDF: { format: 'letter' } };
            const blob = await window.html2pdf().set(opt).from(iframe.contentDocument.body).output('blob');
            const bytes = new Uint8Array(await blob.arrayBuffer()); 
            document.getElementById('html-input').value = ''; document.body.removeChild(iframe);
            
            showSuccessResult(0, bytes.length, "PDF Generated!", async () => {
                if(typeof AdManager !== 'undefined' && AdManager) { await AdManager.showInterstitial(); }
                await processAndDownload(bytes, 'HTML_Converted.pdf', 'application/pdf'); 
            }, true);
        });
        btn.innerHTML = '<i class="fas fa-code"></i> Convert to PDF';
    });
}

let mergeFiles = [];
if (ui.merge) {
    const mergeInput = document.getElementById('merge-file-input');
    document.getElementById('merge-drop-zone')?.addEventListener('click', (e) => { if(e.target.tagName !== 'BUTTON') mergeInput.click(); });
    
    function renderMergeList() {
        const list = document.getElementById('merge-file-list'); list.innerHTML = '';
        mergeFiles.forEach((f, i) => { 
            list.innerHTML += `
                <div style="${fileItemStyle}">
                    <div class="text-container"><b class="text-ellipsis">${escapeHtml(f.name)}</b></div>
                    <button class="remove-merge" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            `; 
        });
        list.querySelectorAll('.remove-merge').forEach(btn => {
            btn.addEventListener('click', (e) => { mergeFiles.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); renderMergeList(); });
        });
        const actionBtn = document.getElementById('btn-merge-action'); if (actionBtn) actionBtn.style.display = mergeFiles.length > 1 ? 'block' : 'none';
    }
    
    const addMerge = async (list) => { const files = await handleFilesOrZip(list); mergeFiles = [...mergeFiles, ...files]; renderMergeList(); };
    mergeInput?.addEventListener('change', async (e) => { await addMerge(Array.from(e.target.files)); mergeInput.value = ''; });
    enableDrop(document.getElementById('merge-drop-zone'), addMerge);
    
    document.getElementById('btn-merge-action')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-merge-action'); btn.innerHTML = 'Processing...';
        const totalOriginalSize = mergeFiles.reduce((acc, f) => acc + f.size, 0);
        
        simulateLoadingAndProcess("Merging Files", async () => {
            const mergedPdf = await PDFDocument.create();
            for (const file of mergeFiles) { 
                const pdf = await PDFDocument.load(await file.arrayBuffer()); 
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices()); 
                copiedPages.forEach(p => mergedPdf.addPage(p)); 
            }
            const bytes = await mergedPdf.save(); 
            const outputName = mergeFiles.length > 0 ? `${getBaseName(mergeFiles[0].name)}_Merged.pdf` : 'Amazing_Merged.pdf';
            mergeFiles = []; renderMergeList(); 
            
            showSuccessResult(totalOriginalSize, bytes.length, "PDF Merged!", async () => {
                if(typeof AdManager !== 'undefined' && AdManager) { await AdManager.showInterstitial(); }
                await processAndDownload(bytes, outputName, 'application/pdf');
            }, true);
        });
        btn.innerHTML = 'Merge Files Now';
    });
}

let imageFiles = [];
if (ui.jpgtopdf) {
    const imgInput = document.getElementById('jpgtopdf-file-input'); 
    document.getElementById('jpgtopdf-drop-zone')?.addEventListener('click', (e) => { if(e.target.tagName !== 'BUTTON') imgInput.click(); });
    
    function renderImgList() {
        const list = document.getElementById('jpgtopdf-file-list'); list.innerHTML = '';
        imageFiles.forEach((f, i) => { 
            list.innerHTML += `
                <div style="${fileItemStyle}">
                    <div class="text-container"><b class="text-ellipsis">${escapeHtml(f.name)}</b></div>
                    <button class="remove-img" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            `; 
        });
        list.querySelectorAll('.remove-img').forEach(btn => {
            btn.addEventListener('click', (e) => { imageFiles.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); renderImgList(); });
        });
        const actionBtn = document.getElementById('btn-jpgtopdf-action'); if (actionBtn) actionBtn.style.display = imageFiles.length > 0 ? 'block' : 'none';
    }
    
    const addImgs = (list) => { imageFiles = [...imageFiles, ...list.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name))]; renderImgList(); };
    imgInput?.addEventListener('change', (e) => { addImgs(Array.from(e.target.files)); imgInput.value = ''; });
    enableDrop(document.getElementById('jpgtopdf-drop-zone'), addImgs);
    
    document.getElementById('btn-jpgtopdf-action')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-jpgtopdf-action'); btn.innerHTML = 'Converting...';
        const totalOriginalSize = imageFiles.reduce((acc, f) => acc + f.size, 0);
        
        simulateLoadingAndProcess("Converting Images", async () => {
            const pdfDoc = await PDFDocument.create();
            for (const file of imageFiles) {
                const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.readAsDataURL(file); });
                const imgObj = new Image(); imgObj.src = dataUrl; await new Promise((resolve, reject) => { imgObj.onload = resolve; imgObj.onerror = () => reject(new Error('Could not read image ' + file.name)); });
                const k = Math.min(1, 3000 / Math.max(imgObj.width, imgObj.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(imgObj.width * k); canvas.height = Math.round(imgObj.height * k); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);
                const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]; const pdfImage = await pdfDoc.embedJpg(optimizedBase64);
                const dims = pdfImage.scale(1); const page = pdfDoc.addPage([dims.width, dims.height]); page.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
            }
            const bytes = await pdfDoc.save(); const outputName = imageFiles.length > 0 ? `${getBaseName(imageFiles[0].name)}_Images.pdf` : 'Amazing_Images.pdf';
            imageFiles = []; renderImgList(); 
            
            showSuccessResult(totalOriginalSize, bytes.length, "PDF Generated!", async () => {
                if(typeof AdManager !== 'undefined' && AdManager) { await AdManager.showInterstitial(); }
                await processAndDownload(bytes, outputName, 'application/pdf');
            }, true);
        });
        btn.innerHTML = 'Convert to PDF';
    });
}

const handleSearch = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.tool-card').forEach(card => {
        const title = card.querySelector('h3').innerText.toLowerCase();
        card.style.display = title.includes(searchTerm) ? 'block' : 'none';
    });
};
document.getElementById('mobile-search')?.addEventListener('input', handleSearch); 
document.getElementById('desktop-search')?.addEventListener('input', handleSearch);

// ==========================================
// MODULES: editor, converters, pro tools (loaded on demand)
// ==========================================
const APP_VER = (document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '').match(/v=([\w.]+)/)?.[1] || '';
const modUrl = (n) => `./js/${n}.js${APP_VER ? '?v=' + APP_VER : ''}`;
const ops = {
    compressPdf: (file) => compressSingleFile(file, 'balanced'),
    async resizePdf(file, profile) {
        const pdfDoc = await PDFDocument.load(await file.arrayBuffer()); const sizes = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] }; const [tw, th] = sizes[profile] || sizes.A4;
        pdfDoc.getPages().forEach(page => { const { width, height } = page.getSize(); const sc = Math.min(tw / width, th / height); page.scaleContent(sc, sc); page.setSize(tw, th); page.setCropBox(0, 0, tw, th); page.translateContent((tw - width * sc) / 2, (th - height * sc) / 2); });
        return pdfDoc.save();
    },
    async imageToPdf(file) {
        const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Unreadable image')); i.src = url; });
        const k = Math.min(1, 3000 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height);
        const doc = await PDFDocument.create(); const im = await doc.embedJpg(cv.toDataURL('image/jpeg', 0.88)); doc.addPage([im.width, im.height]).drawImage(im, { x: 0, y: 0, width: im.width, height: im.height }); return doc.save();
    }
};
const ctx = { PDFLIB, pdfjsLib, JSZip, showCustomAlert, handleError, simulateLoadingAndProcess, showProcessingUI, hideProcessingUI, showSuccessResult, processAndDownload, AdManager, getBaseName, enableDrop, ops };
ctx.openVisualWorkspace = (f, m) => openVisualWorkspace(f, m);
ctx.getOcr = async () => { const pro = await loadPro(); return pro.ocrCanvas; };
let _tools2 = null;
async function getTools2() { if (!_tools2) { await getConvert(); _tools2 = await import(modUrl('tools2')); } return _tools2; }
let _editor = null, _convert = null, _pro = null;
async function getEditor() { if (!_editor) { _editor = await import(modUrl('editor')); ctx.closeEditor = _editor.closeEditor; window.__editorOpen = _editor.isEditorOpen; } return _editor; }
async function getConvert() { if (!_convert) { _convert = await import(modUrl('convert')); ctx.convert = _convert; } return _convert; }
async function loadPro(noInit) { if (!_pro) { _pro = await import(modUrl('pro')); await getConvert(); _pro.initPro(ctx); } return _pro; }
async function openVisualWorkspace(file, mode) {
    try { const m = await getEditor(); await m.openEditor(file, mode, ctx); } catch (e) { console.error(e); handleError(e); }
}
// OCR Scanner / Batch tools initialise when their page is first opened
const _sv = window.switchView;
window.switchView = (viewId) => {
    _sv(viewId);
    if (viewId === 'ocr' || viewId === 'batch') loadPro().catch(e => handleError(e));
    if (TOOLS2.some(t => t.id === viewId)) getTools2().then(m => m.mountTool(viewId, ctx)).catch(e => handleError(e));
};
// extra tools (sidebar, cards, views) + app lock + share button
injectTools2(); initAppLock();
document.getElementById('final-share-btn')?.addEventListener('click', async () => {
    const dl = document.getElementById('final-download-btn'); const r = window.__pendingShare; const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!r || native) { dl.click(); return; }
    try { const file = new File([r.bytes], r.filename, { type: r.type }); if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: r.filename }); else dl.click(); } catch (e) { if (e && e.name !== 'AbortError') dl.click(); }
});




// Network Connectivity Checker & Ad Reloader
function checkNetworkStatus() {
    const offlineScreen = document.getElementById('offline-screen');
    if (!offlineScreen) return;
    if (navigator.onLine) {
        offlineScreen.style.display = 'none';
        
        if (typeof AdManager !== 'undefined' && typeof AdManager.showBanner === 'function') {
            console.log("Internet restored. Reloading AdMob Banner...");
            AdManager.showBanner();
        }
    } else {
        offlineScreen.style.display = 'flex';
    }
}

window.addEventListener('online', checkNetworkStatus);
window.addEventListener('offline', checkNetworkStatus);

setTimeout(checkNetworkStatus, 1000);

// Close Button Logic for Dynamic UI
document.getElementById('dynamic-ui-close')?.addEventListener('click', () => {
    document.getElementById('dynamic-ui-overlay').style.display = 'none';
});
