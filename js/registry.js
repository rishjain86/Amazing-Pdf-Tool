// Registry of the extra tools: injects sidebar items, dashboard cards and empty views at start-up.
// The heavy code (tools2.js) is loaded only when one of these tools is opened.
export const TOOLS2 = [
    { id: 'exactsize', title: 'Compress to Exact Size', icon: 'fa-compress-arrows-alt', color: '#f97316', desc: 'PDF or photo under 100 KB / 200 KB...', group: 'Smart Tools' },
    { id: 'passport', title: 'Passport Photo Maker', icon: 'fa-user-circle', color: '#0ea5e9', desc: 'Full A4 sheet of passport photos.', group: 'Smart Tools' },
    { id: 'photosign', title: 'Photo & Signature Resizer', icon: 'fa-id-badge', color: '#06b6d4', desc: 'Exam / form size presets.', group: 'Smart Tools' },
    { id: 'redact', title: 'Redact PDF', icon: 'fa-user-secret', color: '#ef4444', desc: 'Permanently black out sensitive text.', group: 'Smart Tools', visual: 'redact' },
    { id: 'maskaadhaar', title: 'Mask Aadhaar', icon: 'fa-mask', color: '#a855f7', desc: 'Hide first 8 digits of Aadhaar.', group: 'Smart Tools', visual: 'maskaadhaar' },
    { id: 'forms', title: 'Fill Forms', icon: 'fa-pen-square', color: '#22c55e', desc: 'Fill PDF forms & type on any form.', group: 'Smart Tools', visual: 'forms' },
    { id: 'headerfooter', title: 'Header, Footer & Bates', icon: 'fa-heading', color: '#3b82f6', desc: 'Page x of y, date, Bates numbers.', group: 'Smart Tools' },
    { id: 'bookmarks', title: 'Bookmarks / Contents', icon: 'fa-bookmark', color: '#eab308', desc: 'Add clickable bookmarks.', group: 'Smart Tools' },
    { id: 'extractimages', title: 'Extract Images', icon: 'fa-images', color: '#ec4899', desc: 'Save all pictures from a PDF.', group: 'Smart Tools' },
    { id: 'compare', title: 'Compare PDFs', icon: 'fa-columns', color: '#14b8a6', desc: 'See what changed between 2 PDFs.', group: 'Smart Tools' },
    { id: 'idcard', title: 'ID Card to PDF', icon: 'fa-address-card', color: '#8b5cf6', desc: 'Front + back on one A4 page.', group: 'Smart Tools' },
    { id: 'scanenhance', title: 'Scan Enhance', icon: 'fa-magic', color: '#f59e0b', desc: 'Photos to clean B&W / magic colour PDF.', group: 'Smart Tools' },
    { id: 'pdftoppt', title: 'PDF to PowerPoint', icon: 'fa-file-powerpoint', color: '#f97316', desc: 'Each page becomes a slide.', group: 'Convert' },
    { id: 'ppttopdf', title: 'PowerPoint to PDF', icon: 'fa-file-powerpoint', color: '#ef4444', desc: 'Slides to PDF pages.', group: 'Convert' },
    { id: 'invoice', title: 'Invoice Maker', icon: 'fa-file-invoice', color: '#10b981', desc: 'GST invoice PDF in a minute.', group: 'Create' },
    { id: 'resume', title: 'Resume Maker', icon: 'fa-user-tie', color: '#6366f1', desc: 'Clean resume PDF from a form.', group: 'Create' },
    { id: 'applock', title: 'App Lock', icon: 'fa-lock', color: '#64748b', desc: 'Protect the app with a PIN.', group: 'Security', custom: true }
];

export function injectTools2(openVisual) {
    const sb = document.querySelector('.sidebar'); const grid = document.querySelector('.dashboard-grid'); const dash = document.getElementById('view-dashboard');
    if (!sb || !grid || !dash || document.getElementById('view-exactsize')) return;
    const labelFor = (g) => Array.from(sb.querySelectorAll('.menu-label')).find(l => l.textContent.trim() === g);
    const aboutLabel = Array.from(sb.querySelectorAll('.menu-label')).find(l => /About/i.test(l.textContent));
    const groups = {};
    TOOLS2.forEach(t => {
        let anchor = null;
        if (!groups[t.group]) { const l = labelFor(t.group); if (l) groups[t.group] = { label: l, last: l }; else { const nl = document.createElement('div'); nl.className = 'menu-label'; nl.textContent = t.group; sb.insertBefore(nl, aboutLabel || null); groups[t.group] = { label: nl, last: nl }; } }
        const g = groups[t.group];
        // keep the group's items together
        let ref = g.last; while (ref.nextElementSibling && ref.nextElementSibling.classList.contains('nav-btn')) ref = ref.nextElementSibling; g.last = ref;
        const btn = document.createElement('div'); btn.className = 'nav-btn'; btn.setAttribute('onclick', `switchView('${t.id}')`); btn.innerHTML = `<i class="fas ${t.icon}"></i> ${t.title}`;
        ref.after(btn);
        const card = document.createElement('div'); card.className = 'tool-card'; card.setAttribute('onclick', `switchView('${t.id}')`);
        card.innerHTML = `<i class="fas ${t.icon} tool-icon" style="color:${t.color}"></i><h3>${t.title}</h3><p>${t.desc}</p>`; grid.appendChild(card);
        const v = document.createElement('div'); v.id = 'view-' + t.id; v.className = 'view-section';
        v.innerHTML = `<div class="back-btn" onclick="switchView('dashboard')"><i class="fas fa-arrow-left"></i> Back to Home</div><div class="page-header" style="text-align:left;margin-bottom:24px"><h1 style="display:flex;align-items:center;gap:10px"><i class="fas ${t.icon}" style="color:${t.color}"></i> ${t.title}</h1><p>${t.desc}</p></div><div id="${t.id}-ui-container"></div>`;
        dash.parentNode.appendChild(v);
    });
}
