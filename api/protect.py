from flask import Flask, request, Response
from pypdf import PdfReader, PdfWriter
import io

app = Flask(__name__)

@app.route('/api/protect', methods=['POST', 'OPTIONS'])
def protect():
    # Frontend (app.js) ko connect karne ke liye CORS
    if request.method == 'OPTIONS':
        resp = Response(status=200)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        return resp
        
    try:
        # App se aayi hui PDF aur password receive karna
        file = request.files['file']
        password = request.form['password']
        
        # PDF ko read karna
        reader = PdfReader(file)
        writer = PdfWriter()
        
        # PDF ke saare pages copy karna
        for page in reader.pages:
            writer.add_page(page)
            
        # PDF par secure password lagana
        if reader.is_encrypted:
            resp = Response('This PDF is already password protected. Unlock it first.', status=400)
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp
        writer.encrypt(password, algorithm='AES-256')  # strong encryption (needs 'cryptography')
        
        # Output ko memory mein save karna
        out = io.BytesIO()
        writer.write(out)
        
        # App ko wapas encrypted PDF bhej dena
        resp = Response(out.getvalue(), mimetype='application/pdf')
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
        
    except Exception as e:
        # Error handling
        return Response(str(e), status=500)
