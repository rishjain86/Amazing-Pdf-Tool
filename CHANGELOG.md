# Amazing PDF - Update notes

## New / completed ("Labs" is now live)
- **Edit PDF (Sejda-style)** - new editor (`js/editor*.js`): continuous scroll, click any text to edit it (font/size/bold/colour auto-matched), add text, images, signature, whiteout, draw, highlight, underline, strike, rectangle, ellipse, line, arrow, clickable links; move/resize objects, undo/redo, zoom, per-page rotate / delete / insert blank page. Correct on rotated pages and pages with non-zero crop box.
- **Sign PDF / E-Signature** - draw, type (cursive fonts) or upload a signature; saved on-device for reuse.
- **PDF to Word** - layout-preserving DOCX (paragraphs, tabs, tables, images, fonts, colours), "flowing text" and "exact picture" modes, optional OCR for scans.
- **Word to PDF** - renders the DOCX and keeps selectable/searchable text.
- **Excel to PDF** (new) - own XLSX reader: fills, borders, merged cells, number/date formats, wrap, fit-to-width, auto page size/orientation. CSV supported, .xls/.ods via SheetJS on demand.
- **PDF to Excel** (new) - detects columns/rows, real numbers, one sheet per page or single sheet.
- **OCR Scanner** (new) - images/PDF -> searchable PDF, TXT or DOCX (Tesseract.js; Hindi/Gujarati/Marathi etc.).
- **Batch Processing** (new) - 14 operations on many files / a ZIP, result as one ZIP.
- **Smart Vault** (new) - AES-256-GCM encrypted (PBKDF2 310k) Aadhaar/PAN/document store in IndexedDB, auto-lock.
- Watermark now supports angle (diagonal) and opacity; Page numbers has a "Page 1 of N" format and real placement; Crop/Add-margins/Extract handle rotated pages.

## Bugs fixed
- `window.docx` collision (docx vs docx-preview) broke PDF->Word / Word->PDF; invalid `docx-preview@0.3.32` URL; libraries now loaded only when needed.
- Removed duplicate pdf.js 2.16 global script (heavy, unused) and fontkit/docx scripts from `index.html`.
- Drag & drop did not work anywhere - now works on every tool.
- Files with empty MIME type (common on Android/Windows) were silently ignored; ZIP imports kept folder paths.
- File names were injected as HTML (XSS) in file lists and History - escaped.
- Downloads: object URL was revoked immediately (cancelled downloads on Firefox/Safari).
- History loaded every stored file into memory just to list/download one.
- Page ranges: invalid / out-of-range / reversed ranges crashed or were ignored; "1-5" in Reorder only gave pages 1 and 5; Delete could remove all pages.
- Split/Delete/Reorder/Add-blank/Resize error messages are now clear; Add-blank pages use the neighbour page size.
- Unlock used an unsupported `password` option; server lacked `cryptography` so AES PDFs could not be unlocked/protected (now AES-256).
- PNG -> PDF produced black backgrounds for transparent images; PDF -> JPG could have a transparent/black page; Image compressor could return files above the target size.
- Compress always rasterised pages (lost text) - new "Balanced" mode keeps text, "Extreme" is the old behaviour.
- Repair PDF now falls back to rebuilding from rendered pages.
- Extract text had no line breaks; now keeps lines and warns on scanned PDFs.
- App update popup appeared for website visitors; now only in the Android app.
- Navigation highlighted the wrong sidebar item (substring match) and did not scroll to top.
- **Release workflow generated a brand-new signing key on every build, so Android refused to update installed apps.** Add GitHub secrets `KEYSTORE_BASE64` (base64 of your .jks) and `KEYSTORE_PASSWORD` to keep one key. Workflow also now copies/obfuscates the new `js/` folder.

## Notes
- Word->PDF and Excel->PDF are rendered in the browser, so fonts that are not installed on the device are substituted.
- PDF->Word cannot recreate vector drawings; text, tables and images are rebuilt.
- Protect PDF still uses the Vercel API (needs internet).

## Round 2 - new tools (all in the sidebar / dashboard)
- **Compress to Exact Size** (PDF or photo, target KB/MB) and **Photo & Signature Resizer** (exam presets or custom px + max KB).
- **Redact PDF** (true redaction: pages are burned in, text underneath is removed; auto-find words, Aadhaar, PAN, phone, e-mail) and **Mask Aadhaar** (auto-hides first 8 digits; OCR fallback for scanned images).
- **Fill Forms** (detects fillable fields, checkbox/dropdown/radio; Text + Sign for flat forms; optional flatten).
- **Header, Footer & Bates numbering** ({page} {total} {date} {file}), **Bookmarks** (manual or auto-detected headings), **Extract Images**, **Compare PDFs** (red highlight report), **ID Card to PDF**, **Scan Enhance** (magic colour / grayscale / B&W).
- **PDF to PowerPoint** (editable text boxes + pictures, or exact pictures) and **PowerPoint to PDF**.
- **Invoice Maker** (GST: CGST+SGST / IGST, amount in words, Hindi names ok) and **Resume Maker** (2 templates).
- **App Lock** (PIN, salted PBKDF2) and a **Share** button on every result (WhatsApp / Drive via the phone share sheet).
- Fixed: sidebar did not close on mobile after choosing a tool.

Not done on purpose: biometric unlock (needs a native Capacitor plugin + APK rebuild) and automatic Google Drive backup (needs your own Google Cloud OAuth client). The share sheet already lets users save to Drive.
Hindi text in the editor is already supported (it is drawn as a picture so shaping stays correct); searchable Hindi text would need an embedded font.

## Round 3
- **Smart Scanner: auto edge detection** - new magic-wand button in the scanner top bar finds the page on a darker background and straightens it (perspective correction). Tap again to undo. Works best when the page contrasts with the table.
- **Hindi / Gujarati / Punjabi / Bengali / Tamil / Telugu text is now selectable & searchable** in PDFs made by the editor, Excel/Word/PowerPoint -> PDF, OCR and the invoice/resume makers: the visible text stays a perfectly shaped picture and an invisible real-text layer (Noto font, downloaded on first use) sits behind it. Needs internet the first time; offline it silently keeps the picture only.
- **Fingerprint / face unlock** for App Lock (Android app only, uses @aparajita/capacitor-biometric-auth, added to package.json - the GitHub workflow installs it on the next APK build). The PIN always works as backup.
- Re-tested every older tool through the UI (compress, reorder, add blank, resize, repair, extract text, PDF->JPG, odd/even split, image compress, merge, JPG->PDF) and opened all 34 sidebar views: no errors.
