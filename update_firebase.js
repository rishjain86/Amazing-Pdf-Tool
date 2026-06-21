const fs = require('fs');
const admin = require('firebase-admin');

// 1. Aapke index.html se naya version dhoondhega
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/const\s+CURRENT_APP_VERSION\s*=\s*([0-9.]+);/);

if (!match) {
    console.error("❌ Error: index.html mein CURRENT_APP_VERSION nahi mila!");
    process.exit(1);
}

const latestVersion = parseFloat(match[1]);
console.log(`🚀 Naya version detect hua: ${latestVersion}`);

// 2. Firebase Database se connect karega
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 3. Database ko automatically update kar dega
db.collection('amazingpdf_settings').doc('app_config').set({
    latest_version: latestVersion
}, { merge: true })
.then(() => {
    console.log(`✅ Firebase successfully updated to version ${latestVersion}!`);
    process.exit(0);
})
.catch((error) => {
    console.error("❌ Firebase update fail ho gaya:", error);
    process.exit(1);
});
