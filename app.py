from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
from datetime import datetime, timedelta
import sqlite3
import os
from pdf_generator import generate_receipt_pdf
import json
import secrets

app = Flask(__name__)
# 環境変数からSECRET_KEYを取得（Railway本番用）
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# 静的ファイルのキャッシュを完全無効化
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_no_cache_headers(response):
    # 静的ファイル（JS・CSS）にキャッシュ禁止ヘッダーを付与
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# 認証情報（環境変数から取得・なければデフォルト値）
LOGIN_ID   = os.environ.get('LOGIN_ID',   'keiyaku.partners@ielove-partners.jp')
LOGIN_PASS = os.environ.get('LOGIN_PASS', 'Ielove3390')

# ログイン確認デコレータ
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            if request.path.startswith('/api/'):
                return jsonify({'error': 'unauthorized'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

# データパス（Railway の永続ボリューム or ローカル）
DATA_DIR = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH', os.path.dirname(os.path.abspath(__file__)))
DB_PATH  = os.path.join(DATA_DIR, 'receipts.db')
PDF_DIR  = os.path.join(DATA_DIR, 'pdfs')

# データベースの初期化
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_number TEXT NOT NULL,
            guarantee_number TEXT,
            customer_name TEXT NOT NULL,
            postal_code TEXT NOT NULL,
            address TEXT NOT NULL,
            building_room TEXT,
            issue_date TEXT NOT NULL,
            receipt_type TEXT NOT NULL,
            items TEXT NOT NULL,
            total_amount INTEGER NOT NULL,
            tax_excluded_amount INTEGER NOT NULL,
            tax_amount INTEGER NOT NULL,
            note TEXT,
            issuer_name TEXT DEFAULT '',
            is_void INTEGER DEFAULT 0,
            void_reason TEXT DEFAULT '',
            void_at TEXT DEFAULT '',
            created_at TEXT NOT NULL
        )
    ''')
    # 既存DBにカラムが無い場合は追加
    existing = [row[1] for row in c.execute('PRAGMA table_info(receipts)').fetchall()]
    for col, definition in [
        ('issuer_name', 'TEXT DEFAULT ""'),
        ('is_void',     'INTEGER DEFAULT 0'),
        ('void_reason', 'TEXT DEFAULT ""'),
        ('void_at',     'TEXT DEFAULT ""'),
    ]:
        if col not in existing:
            c.execute(f'ALTER TABLE receipts ADD COLUMN {col} {definition}')
    conn.commit()
    conn.close()

# 領収書番号の生成
def generate_receipt_number():
    today = datetime.now().strftime('%Y%m%d')
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM receipts WHERE receipt_number LIKE ?', (f'{today}%',))
    count = c.fetchone()[0]
    conn.close()
    return f'{today}{count + 1:02d}'

# ==================== ルーティング ====================

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = ''
    if request.method == 'POST':
        login_id   = request.form.get('login_id', '').strip()
        login_pass = request.form.get('login_pass', '').strip()
        if login_id == LOGIN_ID and login_pass == LOGIN_PASS:
            session['logged_in'] = True
            session.permanent = True
            app.permanent_session_lifetime = timedelta(hours=8)
            return redirect(url_for('index'))
        else:
            error = 'IDまたはパスワードが正しくありません'
    import time
    return render_template('login.html', error=error, cache_bust=int(time.time()))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    import time
    # ミリ秒単位にして毎回確実に新しいURLを生成
    cache_bust = int(time.time() * 1000)
    return render_template('index.html', cache_bust=cache_bust)

@app.route('/api/preview', methods=['POST'])
@login_required
def preview():
    data = request.json
    receipt_number = generate_receipt_number()
    data['receipt_number'] = receipt_number
    pdf_path = generate_receipt_pdf(data)
    return jsonify({'success': True, 'pdf_path': pdf_path, 'receipt_number': receipt_number})

@app.route('/api/issue', methods=['POST'])
@login_required
def issue():
    data = request.json
    issuer_name = data.get('issuer_name', '').strip()
    if not issuer_name:
        return jsonify({'success': False, 'error': '発行者氏名を入力してください'}), 400

    receipt_number = generate_receipt_number()
    data['receipt_number'] = receipt_number
    pdf_path = generate_receipt_pdf(data)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO receipts (
            receipt_number, guarantee_number, customer_name, postal_code,
            address, building_room, issue_date, receipt_type, items,
            total_amount, tax_excluded_amount, tax_amount, note,
            issuer_name, is_void, void_reason, void_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', ?)
    ''', (
        receipt_number,
        data.get('guarantee_number', ''),
        data['customer_name'],
        data['postal_code'],
        data['address'],
        data.get('building_room', ''),
        data['issue_date'],
        data['receipt_type'],
        json.dumps(data['items'], ensure_ascii=False),
        data['total_amount'],
        data['tax_excluded_amount'],
        data['tax_amount'],
        data.get('note', ''),
        issuer_name,
        datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    ))
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'pdf_path': pdf_path, 'receipt_number': receipt_number})

@app.route('/api/download/<path:filename>')
@login_required
def download(filename):
    # 無効化されていたらダウンロード不可
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    base = filename.replace('receipt_', '').replace('.pdf', '')
    c.execute('SELECT is_void FROM receipts WHERE receipt_number = ?', (base,))
    row = c.fetchone()
    conn.close()
    if row and row[0] == 1:
        return jsonify({'error': 'この領収書は無効化されています'}), 403

    file_path = os.path.join(PDF_DIR, filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

@app.route('/api/history')
@login_required
def history():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT id, receipt_number, customer_name, items, total_amount,
               created_at, issuer_name, is_void, void_reason, void_at
        FROM receipts
        ORDER BY created_at DESC
        LIMIT 50
    ''')
    rows = c.fetchall()
    conn.close()

    result = []
    for row in rows:
        items = json.loads(row[3])
        main_items = [item['name'] for item in items if item['amount'] > 0]
        result.append({
            'id':             row[0],
            'receipt_number': row[1],
            'customer_name':  row[2],
            'items':          '、'.join(main_items[:3]),
            'total_amount':   f"{row[4]:,}",
            'created_at':     row[5],
            'issuer_name':    row[6] or '―',
            'is_void':        row[7] == 1,
            'void_reason':    row[8] or '',
            'void_at':        row[9] or '',
        })
    return jsonify(result)

@app.route('/api/void/<int:receipt_id>', methods=['POST'])
@login_required
def void_receipt(receipt_id):
    data = request.json
    admin_pass  = data.get('admin_pass', '').strip()
    void_reason = data.get('void_reason', '').strip()

    if admin_pass != LOGIN_PASS:
        return jsonify({'success': False, 'error': 'パスワードが正しくありません'}), 403
    if not void_reason:
        return jsonify({'success': False, 'error': '無効化理由を入力してください'}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT is_void FROM receipts WHERE id = ?', (receipt_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': '対象が見つかりません'}), 404
    if row[0] == 1:
        conn.close()
        return jsonify({'success': False, 'error': 'すでに無効化済みです'}), 400

    c.execute('''
        UPDATE receipts
        SET is_void = 1, void_reason = ?, void_at = ?
        WHERE id = ?
    ''', (void_reason, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), receipt_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/history/export')
@login_required
def export_history():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT receipt_number, guarantee_number, customer_name, postal_code,
               address, building_room, issue_date, items, total_amount,
               tax_excluded_amount, tax_amount, issuer_name,
               is_void, void_reason, void_at, created_at
        FROM receipts
        ORDER BY created_at DESC
    ''')
    rows = c.fetchall()
    conn.close()

    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        '領収書番号', '保証番号', '契約者名', '郵便番号', '住所', '物件名・号室',
        '発行日', '項目', '合計金額', '非課税額', '消費税額',
        '発行者氏名', '有効/無効', '無効化理由', '無効化日時', '発行日時'
    ])
    for row in rows:
        items = json.loads(row[7])
        item_names = '、'.join([item['name'] for item in items if item['amount'] > 0])
        writer.writerow([
            row[0], row[1], row[2], row[3], row[4], row[5],
            row[6], item_names, row[8], row[9], row[10],
            row[11],
            '無効' if row[12] == 1 else '有効',
            row[13], row[14], row[15]
        ])

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'receipt_history_{datetime.now().strftime("%Y%m%d")}.csv'
    )

if __name__ == '__main__':
    os.makedirs('pdfs', exist_ok=True)
    init_db()
    app.run(debug=False, host='0.0.0.0', port=5001)
