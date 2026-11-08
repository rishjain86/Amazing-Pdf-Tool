// PIN app lock (PIN is never stored - only a salted PBKDF2 hash)
const K = 'amazingpdf_lock';
const enc = new TextEncoder();
const b2h = (u) => Array.from(new Uint8Array(u)).map(b => b.toString(16).padStart(2, '0')).join('');
const h2b = (h) => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
async function hash(pin, saltHex) { const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']); return b2h(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: h2b(saltHex), iterations: 150000, hash: 'SHA-256' }, k, 256)); }
const cfg = () => { try { return JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { return null; } };
let overlay = null, lastHidden = 0, fails = 0, until = 0, bioMod = null;
// fingerprint / face unlock - only inside the Android app (native plugin: @aparajita/capacitor-biometric-auth)
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function bio() { if (!isNative()) return null; if (!bioMod) { try { bioMod = (await import('https://cdn.jsdelivr.net/npm/@aparajita/capacitor-biometric-auth@8/+esm')).BiometricAuth; } catch (e) { bioMod = false; } } return bioMod || null; }
async function bioAvailable() { try { const b = await bio(); if (!b) return false; const r = await b.checkBiometry(); return !!r.isAvailable; } catch (e) { return false; } }
async function bioVerify() { try { const b = await bio(); if (!b) return false; await b.authenticate({ reason: 'Unlock Amazing PDF', cancelTitle: 'Use PIN', allowDeviceCredential: false, androidTitle: 'Amazing PDF', androidSubtitle: 'Confirm it is you' }); return true; } catch (e) { return false; } }

function show() {
    if (overlay || !cfg()) return;
    overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;z-index:2000000;background:#0b1220;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Poppins,sans-serif;padding:20px';
    overlay.innerHTML = `<div style="font-size:3rem;color:#10b981;margin-bottom:10px"><i class="fas fa-lock"></i></div><h2 style="margin-bottom:6px">Amazing PDF is locked</h2><p id="al-msg" style="color:#94a3b8;margin-bottom:18px;font-size:.9rem">Enter your PIN</p>
    <input id="al-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" style="font-size:2rem;letter-spacing:10px;text-align:center;width:220px;padding:12px;border-radius:12px;border:1px solid #334155;background:#111c33;color:#fff"><button id="al-bio" style="display:none;margin-top:16px;padding:12px 26px;border-radius:30px;border:1px solid #334155;background:#111c33;color:#34d399;font-weight:600;font-size:.95rem;cursor:pointer"><i class="fas fa-fingerprint"></i> Use fingerprint / face</button><button id="al-go" style="margin-top:18px;padding:13px 40px;border-radius:30px;border:none;background:linear-gradient(90deg,#10b981,#3b82f6);color:#fff;font-weight:700;font-size:1rem;cursor:pointer">Unlock</button>`;
    document.body.appendChild(overlay);
    const pin = overlay.querySelector('#al-pin'); pin.focus();
    const go = async () => {
        const c = cfg(); if (!c) { overlay.remove(); overlay = null; return; }
        if (Date.now() < until) { overlay.querySelector('#al-msg').textContent = `Too many attempts. Try again in ${Math.ceil((until - Date.now()) / 1000)}s`; return; }
        if (await hash(pin.value, c.salt) === c.hash) { overlay.remove(); overlay = null; fails = 0; }
        else { fails++; pin.value = ''; overlay.querySelector('#al-msg').textContent = 'Wrong PIN'; overlay.querySelector('#al-msg').style.color = '#f87171'; if (fails >= 5) { until = Date.now() + 30000; fails = 0; } }
    };
    const tryBio = async () => { if (await bioVerify() && overlay) { overlay.remove(); overlay = null; fails = 0; } };
    if (cfg().bio) { const bb = overlay.querySelector('#al-bio'); bb.style.display = 'inline-block'; bb.onclick = tryBio; setTimeout(tryBio, 350); }
    overlay.querySelector('#al-go').onclick = go; pin.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
export function initAppLock() {
    if (!(window.crypto && crypto.subtle)) return;
    show();
    document.addEventListener('visibilitychange', () => { if (document.hidden) lastHidden = Date.now(); else { const c = cfg(); if (c && c.auto && Date.now() - lastHidden > 15000) show(); } });
}
export function mountAppLockUI(root) {
    const inp = 'width:100%;padding:12px;border-radius:8px;border:1px solid var(--glass-border);background:rgba(0,0,0,.3);color:white;margin-bottom:12px';
    const draw = () => {
        const c = cfg();
        root.innerHTML = `<div style="background:rgba(0,0,0,.2);padding:20px;border-radius:12px;border:1px solid var(--glass-border)">
        <p style="margin-bottom:14px;color:${c ? '#34d399' : '#94a3b8'}"><i class="fas fa-${c ? 'check-circle' : 'info-circle'}"></i> ${c ? 'App Lock is ON' : 'App Lock is OFF'}</p>
        ${c ? `<label style="display:flex;gap:8px;align-items:center;margin-bottom:14px;font-size:.9rem"><input type="checkbox" id="al-auto" ${c.auto ? 'checked' : ''}> Lock again after the app was in the background</label>
        <label id="al-biowrap" style="display:none;gap:8px;align-items:center;margin-bottom:14px;font-size:.9rem"><input type="checkbox" id="al-biochk" ${c.bio ? 'checked' : ''}> <i class="fas fa-fingerprint"></i> Unlock with fingerprint / face</label><button id="al-off" style="background:#ef4444;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">Turn off App Lock</button>` : `
        <input id="al-n1" type="password" inputmode="numeric" maxlength="8" placeholder="New PIN (4-8 digits)" style="${inp}"><input id="al-n2" type="password" inputmode="numeric" maxlength="8" placeholder="Repeat PIN" style="${inp}">
        <button id="al-on" style="background:#10b981;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600;width:100%">Turn on App Lock</button>
        <p style="font-size:.78rem;color:#94a3b8;margin-top:12px">If you forget the PIN, clear the app's data or reinstall (files in History / Vault will be lost).</p>`}</div>`;
        const on = root.querySelector('#al-on'); if (on) on.onclick = async () => { const a = root.querySelector('#al-n1').value, b = root.querySelector('#al-n2').value; if (!/^\d{4,8}$/.test(a)) return alert('PIN must be 4 to 8 digits.'); if (a !== b) return alert('PINs do not match.'); const salt = b2h(crypto.getRandomValues(new Uint8Array(16))); localStorage.setItem(K, JSON.stringify({ salt, hash: await hash(a, salt), auto: true })); draw(); };
        const off = root.querySelector('#al-off'); if (off) off.onclick = () => { const pin = prompt('Enter your current PIN to turn off'); if (pin == null) return; const c2 = cfg(); hash(pin, c2.salt).then(h => { if (h === c2.hash) { localStorage.removeItem(K); draw(); } else alert('Wrong PIN.'); }); };
        const bw = root.querySelector('#al-biowrap'); if (bw) bioAvailable().then(ok => { if (ok) bw.style.display = 'flex'; });
        const bc = root.querySelector('#al-biochk'); if (bc) bc.onchange = async () => { if (bc.checked && !(await bioVerify())) { bc.checked = false; return alert('Fingerprint / face check failed. Not enabled.'); } const c2 = cfg(); c2.bio = bc.checked; localStorage.setItem(K, JSON.stringify(c2)); };
        const au = root.querySelector('#al-auto'); if (au) au.onchange = () => { const c2 = cfg(); c2.auto = au.checked; localStorage.setItem(K, JSON.stringify(c2)); };
    };
    draw();
}
