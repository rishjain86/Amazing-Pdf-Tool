// Automatic document edge detection + perspective correction (no external libraries)
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read image')); i.src = src; }); }
function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * r + 1); acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    return out;
}
function otsu(gray) { const hist = new Uint32Array(256); gray.forEach(v => hist[v | 0]++); const total = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0, thr = 128; for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = i; } } return thr; }
function largestComponent(mask, w, h) {
    const lab = new Int32Array(w * h); let best = 0, bestId = 0, id = 0; const stack = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) { if (!mask[i] || lab[i]) continue; id++; let sp = 0, size = 0; stack[sp++] = i; lab[i] = id;
        while (sp) { const p = stack[--sp]; size++; const x = p % w, y = (p / w) | 0; if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; } if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; } if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; } if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; } }
        if (size > best) { best = size; bestId = id; } }
    return { lab, id: bestId, size: best };
}
function hull(points) { points.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = []; for (const p of points) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } const up = []; for (let i = points.length - 1; i >= 0; i--) { const p = points[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); }
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };

// returns {found, quad:[TL,TR,BR,BL] in image pixels}
export function findDocumentQuad(img, maxSide = 560) {
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)); const w = Math.max(8, Math.round((img.naturalWidth || img.width) * k)), h = Math.max(8, Math.round((img.naturalHeight || img.height) * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h); for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const blur = boxBlur(boxBlur(gray, w, h, Math.max(3, Math.round(Math.min(w, h) / 38))), w, h, 3); const thr = otsu(blur);
    let best = null;
    for (const bright of [true, false]) {
        const mask = new Uint8Array(w * h); for (let i = 0; i < mask.length; i++) mask[i] = (bright ? blur[i] > thr : blur[i] <= thr) ? 1 : 0;
        // close small holes (text) by dilating then eroding via blur threshold
        const mb = boxBlur(Float32Array.from(mask), w, h, Math.max(3, Math.round(Math.min(w, h) / 45))); for (let i = 0; i < mask.length; i++) mask[i] = mb[i] > 0.5 ? 1 : 0;
        const { lab, id, size } = largestComponent(mask, w, h); const ratio = size / (w * h); if (ratio < 0.12 || ratio > 0.985) continue;
        const pts = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (lab[p] !== id) continue; if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || lab[p - 1] !== id || lab[p + 1] !== id || lab[p - w] !== id || lab[p + w] !== id) pts.push([x, y]); }
        if (pts.length < 20) continue; let x0 = w, x1 = 0, y0 = h, y1 = 0; pts.forEach(q => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; });
        if (x0 <= 1 && y0 <= 1 && x1 >= w - 2 && y1 >= h - 2) continue; // spans the whole frame: that is the background (or nothing to crop)
        const hl = hull(pts); const hullArea = polyArea(hl); if (hullArea / (w * h) < 0.12) continue;
        const sum = (p) => p[0] + p[1], dif = (p) => p[0] - p[1]; const tl = hl.reduce((a, b) => sum(b) < sum(a) ? b : a), br = hl.reduce((a, b) => sum(b) > sum(a) ? b : a), tr = hl.reduce((a, b) => dif(b) > dif(a) ? b : a), bl = hl.reduce((a, b) => dif(b) < dif(a) ? b : a);
        const quad = [tl, tr, br, bl]; const qa = polyArea(quad); if (qa < hullArea * 0.8 || qa < w * h * 0.12) continue;
        const score = qa / hullArea * (bright ? 1.02 : 1); if (!best || score > best.score) best = { quad, score, bright };
    }
    if (!best) return { found: false };
    return { found: true, quad: best.quad.map(p => [p[0] / k, p[1] / k]) };
}
function solveHomography(src, dst) { // maps dst->src ; 8 unknowns
    const A = [], B = []; for (let i = 0; i < 4; i++) { const [x, y] = dst[i], [u, v] = src[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v); }
    const n = 8; for (let i = 0; i < n; i++) { let m = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; [B[i], B[m]] = [B[m], B[i]]; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; B[r] -= f * B[i]; } }
    const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = B[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; } return x;
}
export function warpToRect(img, quad, maxOut = 2400) {
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); let W = Math.round(Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]))), H = Math.round(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]))); const sc = Math.min(1, maxOut / Math.max(W, H)); W = Math.max(16, Math.round(W * sc)); H = Math.max(16, Math.round(H * sc));
    const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height; const sk = Math.min(1, 3000 / Math.max(sw, sh)); const src = document.createElement('canvas'); src.width = Math.round(sw * sk); src.height = Math.round(sh * sk); const sg = src.getContext('2d', { willReadFrequently: true }); sg.drawImage(img, 0, 0, src.width, src.height); const sd = sg.getImageData(0, 0, src.width, src.height);
    const q = quad.map(p => [p[0] * sk, p[1] * sk]); const c = solveHomography(q, [[0, 0], [W, 0], [W, H], [0, H]]);
    const out = document.createElement('canvas'); out.width = W; out.height = H; const og = out.getContext('2d'); const od = og.createImageData(W, H); const S = sd.data, O = od.data, sW = sd.width, sH = sd.height;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const den = c[6] * x + c[7] * y + 1, u = (c[0] * x + c[1] * y + c[2]) / den, v = (c[3] * x + c[4] * y + c[5]) / den; const o = (y * W + x) * 4;
        if (u < 0 || v < 0 || u >= sW - 1 || v >= sH - 1) { O[o] = O[o + 1] = O[o + 2] = 255; O[o + 3] = 255; continue; } const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i00 = (y0 * sW + x0) * 4, i10 = i00 + 4, i01 = i00 + sW * 4, i11 = i01 + 4;
        for (let ch = 0; ch < 3; ch++) O[o + ch] = S[i00 + ch] * (1 - fx) * (1 - fy) + S[i10 + ch] * fx * (1 - fy) + S[i01 + ch] * (1 - fx) * fy + S[i11 + ch] * fx * fy; O[o + 3] = 255; }
    og.putImageData(od, 0, 0); return out;
}
// whole pipeline: dataURL in -> {url, found}
export async function autoCropDataUrl(dataUrl) {
    const img = await loadImage(dataUrl); const r = findDocumentQuad(img); if (!r.found) return { found: false, url: dataUrl };
    // pull corners slightly inwards to drop the shadowed border
    const cx = r.quad.reduce((a, p) => a + p[0], 0) / 4, cy = r.quad.reduce((a, p) => a + p[1], 0) / 4; const quad = r.quad.map(p => [p[0] + (cx - p[0]) * 0.006, p[1] + (cy - p[1]) * 0.006]);
    const out = warpToRect(img, quad); return { found: true, url: out.toDataURL('image/jpeg', 0.95), quad };
}
