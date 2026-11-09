# How to release an update (one click)

1. **Edit `whatsnew.json`** - change the `items` list to the new features / fixes (short lines). Commit + push.
   These lines are shown (a) in the "Update available" box *before* users update and (b) in the "What's new" popup the first time they open the new version.
2. GitHub -> **Actions -> One-Click Auto Release -> Run workflow** -> enter version name (e.g. `2.4`) and a higher version code (e.g. `12`).
3. The workflow builds, signs and publishes the APK, and **only then** publishes `version.json` (so nobody is told about an APK that does not exist yet).
4. Users open the app -> "Update available" -> **Update now** -> the APK downloads inside the app (progress bar) -> tap **Update** on the Android screen -> done. Data and settings stay.

## One-time setup (important)
* Add GitHub secrets `KEYSTORE_BASE64` and `KEYSTORE_PASSWORD`. Android only installs an update over the old app when it is signed with the SAME key. Without these secrets every build gets a new key and updates fail.
* The very first time, users on an OLD app (before this feature) still download the APK in the browser and install it once. After that, all updates are in-app.
* On first in-app update Android asks once: "Allow Amazing PDF to install unknown apps" (a normal Android rule for apps not from Play Store). The app guides the user.
* Android never allows a *fully silent* install outside the Play Store - the user always taps "Update" once on the system screen. That is the closest possible to Play Store behaviour.

## What users who ALREADY have the old app see
The old app (2.2 and earlier) has the old update code inside it, so it can never show the new in-app box. What it does do, after you release (e.g. 2.4):
1. A normal Android dialog appears with the **list of new features** (taken from `whatsnew.json` via `message`).
2. Tapping OK opens **https://amazingpdf.in/update.html** - a nice page with the features and a big *Download the update* button.
3. They install the APK once (the page explains the steps). From that version on, every update is the in-app one-tap flow.

Rules that keep old users able to see updates:
* Version names must be `X.Y` with ONE digit after the dot: 2.3, 2.4 ... 2.9, then 3.0 (never 2.10 - old apps read it as 2.1). The workflow refuses other formats.
* Keep `update.html` and `version.json` on the website (they are in the repo root, so they deploy with the site).
