import Busboy from 'busboy';
import muhammara from 'muhammara';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const config = {
    api: { bodyParser: false } // Vercel ko stream handle karne ke liye allow karta hai
};

export default function handler(req, res) {
    // CORS setup taaki frontend properly connect ho sake
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const busboy = Busboy({ headers: req.headers });
    let password = '';
    const tmpInput = path.join(os.tmpdir(), `input_${Date.now()}.pdf`);
    const tmpOutput = path.join(os.tmpdir(), `output_${Date.now()}.pdf`);

    // Password receive karna
    busboy.on('field', (fieldname, val) => {
        if (fieldname === 'password') password = val;
    });

    // File receive karke temporary save karna
    busboy.on('file', (fieldname, file) => {
        file.pipe(fs.createWriteStream(tmpInput));
    });

    // Jab file puri upload ho jaye
    busboy.on('finish', () => {
        try {
            if (!password) {
                return res.status(400).json({ error: "Password missing" });
            }

            // Muhammara se PDF par strict encryption lagana
            const pdfWriter = muhammara.createWriterToModify(tmpInput, {
                modifiedFilePath: tmpOutput,
                userPassword: password,
                ownerPassword: password
            });
            pdfWriter.end();

            // Lock hui file ko wapas buffer mein read karna
            const fileBuffer = fs.readFileSync(tmpOutput);

            // Temporary files delete karna taaki server memory full na ho
            fs.unlinkSync(tmpInput);
            fs.unlinkSync(tmpOutput);

            // Frontend ko encrypted PDF bhej dena
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/pdf');
            res.send(fileBuffer);
        } catch (error) {
            console.error('Encryption Error:', error);
            res.status(500).json({ error: 'Encryption failed on server' });
        }
    });

    req.pipe(busboy);
}
