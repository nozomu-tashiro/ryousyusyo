from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
import os
from datetime import datetime

# Railway永続ボリューム or ローカルディレクトリ
_DATA_DIR = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH', os.path.dirname(os.path.abspath(__file__)))
_PDF_DIR  = os.path.join(_DATA_DIR, 'pdfs')

# 日本語フォントの登録（複数パスを試行 → CIDフォントにフォールバック）
def register_fonts():
    font_paths = [
        # Ubuntu/Debian系（Railway環境）
        '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
        '/usr/share/fonts/truetype/ipafont-gothic/ipag.ttf',
        '/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf',
        '/usr/share/fonts/ipa-gothic/ipag.ttf',
        # その他
        '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
        '/usr/share/fonts/truetype/takao-gothic/TakaoGothic.ttf',
        '/usr/share/fonts/truetype/vlgothic/VL-Gothic-Regular.ttf',
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont('IPAGothic', path))
                return 'ttf'
            except:
                continue
    # TTFが見つからない場合はReportLab内蔵CIDフォント（HeiseiKakuGo-W5）を使用
    try:
        pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
        return 'cid'
    except:
        pass
    return False

def format_currency(amount):
    """金額をカンマ区切りでフォーマット"""
    return f"{amount:,}"

def generate_receipt_pdf(data):
    """領収書PDFを生成"""
    
    # フォント登録
    font_result = register_fonts()
    if font_result == 'ttf':
        font_name = 'IPAGothic'
    elif font_result == 'cid':
        font_name = 'HeiseiKakuGo-W5'
    else:
        font_name = 'Helvetica'
    
    # PDFファイル名
    receipt_number = data['receipt_number']
    filename = f"receipt_{receipt_number}.pdf"
    os.makedirs(_PDF_DIR, exist_ok=True)
    filepath = os.path.join(_PDF_DIR, filename)
    
    # PDF作成
    c = canvas.Canvas(filepath, pagesize=A4)
    width, height = A4

    # ── 色定義 ──────────────────────────────────────────────
    blue_color = HexColor('#1565C0')
    gray_color = HexColor('#666666')
    light_gray = HexColor('#F5F5F5')

    # ── レイアウト定数 ───────────────────────────────────────
    # 外枠: rect(15mm, 20mm, width-30mm, height-30mm)
    #   → 上端 = 20mm + (height-30mm) = height - 10mm  ≒ 287mm
    FRAME_TOP   = 20*mm + (height - 30*mm)   # 外枠の上端 y座標
    MARGIN_R    = 15*mm                       # 右マージン（枠の右端）
    INNER_L     = 20*mm                       # テキスト左端
    logo_right  = width - MARGIN_R            # ロゴ・タイトルの右端（枠右端に揃える）

    # 三つ折りパネル高さ（参考）
    PANEL_H       = height / 3               # ≒ 99mm
    PANEL_A_TOP   = height                   # 上段の上端 = 297mm
    PANEL_A_BOTTOM = PANEL_H * 2            # 上段の下端（折り目）= 198mm

    # =========================================================
    # === 上段（封筒の窓から見える面）===
    #     外枠上端(FRAME_TOP)から枠内5mm余白を取って配置
    # =========================================================

    # ── ロゴ（右端・枠内5mm余白） ──
    logo_path = 'static/images/ierabu_logo_new.png'
    logo_w    = 58 * mm
    logo_h    = 11 * mm
    logo_x    = logo_right - logo_w
    logo_y    = FRAME_TOP - 5*mm - logo_h    # 枠内5mm余白

    if os.path.exists(logo_path):
        c.drawImage(logo_path, logo_x, logo_y,
                    width=logo_w, height=logo_h,
                    preserveAspectRatio=True, mask='auto')

    # ── タイトル（ロゴの直下・右端揃え） ──
    c.setFillColor(blue_color)
    c.setFont(font_name, 16)
    title = "領収書（再発行）" if data['receipt_type'] == 'normal' else "適格請求書（再発行）"
    title_y = logo_y - 8*mm
    c.drawRightString(logo_right, title_y, title)

    # タイトル下線（右揃え）
    title_w = c.stringWidth(title, font_name, 16)
    c.setStrokeColor(blue_color)
    c.setLineWidth(2)
    c.line(logo_right - title_w, title_y - 1.5*mm,
           logo_right,            title_y - 1.5*mm)

    # ── 発行番号・再発行日（タイトルの直下・右端揃え） ──
    c.setFont(font_name, 9)
    c.setFillColor(gray_color)
    c.drawRightString(logo_right, title_y - 8*mm,  f"No. {receipt_number}")
    c.drawRightString(logo_right, title_y - 13*mm, f"再発行日: {data['issue_date']}")

    # ── 宛名ブロック（枠内5mm余白から開始・左側） ──
    # 順番: 郵便番号 → 住所 → 物件名・号室 → 契約者名様 → 保証番号
    addr_top = FRAME_TOP - 5*mm - 3*mm      # 宛名ブロック先頭の y座標

    # 郵便番号
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 9)
    c.drawString(INNER_L, addr_top, f"〒{data['postal_code']}")

    # 住所
    c.drawString(INNER_L, addr_top - 6*mm, data['address'])

    # 物件名・号室
    addr_y_after_address = addr_top - 12*mm
    if data.get('building_room'):
        c.drawString(INNER_L, addr_y_after_address, data['building_room'])
        name_y = addr_top - 19*mm
    else:
        name_y = addr_top - 12*mm

    # お客様名（大きめフォント）
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 13)
    c.drawString(INNER_L, name_y, f"{data['customer_name']} 様")

    # 保証番号
    if data.get('guarantee_number'):
        c.setFont(font_name, 8)
        c.setFillColor(gray_color)
        c.drawString(INNER_L, name_y - 7*mm, f"保証番号: {data['guarantee_number']}")

    # =========================================================
    # === 中段（折り目より下・明細エリア）===
    #     「下記の通り〜」は上段下端(折り目)のすぐ下から開始
    # =========================================================

    # ── 契約者名（大きめ・「下記の通り」の直上） ──
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 14)
    name_line_y = PANEL_A_BOTTOM - 5*mm
    # 下線（名前の幅に合わせる）
    name_str = f"{data['customer_name']} 様"
    name_w = c.stringWidth(name_str, font_name, 14)
    # 下線を先に描画（名前テキストより少し幅広に）
    c.setStrokeColor(HexColor('#000000'))
    c.setLineWidth(0.8)
    c.line(INNER_L, name_line_y - 2*mm, INNER_L + name_w + 4*mm, name_line_y - 2*mm)
    c.drawString(INNER_L, name_line_y, name_str)

    # 「下記の通り領収いたしました。」
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 10)
    c.drawString(INNER_L, PANEL_A_BOTTOM - 13*mm, "下記の通り領収いたしました。")

    # === 金額ボックス（目立つデザイン） ===
    y_pos = PANEL_A_BOTTOM - 20*mm

    # 背景ボックス
    c.setFillColor(light_gray)
    c.setStrokeColor(blue_color)
    c.setLineWidth(1.5)
    c.rect(INNER_L, y_pos - 10*mm, width - 40*mm, 12*mm, fill=1, stroke=1)

    # 金額テキスト
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 18)
    total_text = f"金   {format_currency(data['total_amount'])}円"
    c.drawCentredString(width / 2, y_pos - 5*mm, total_text)

    # 消費税表示
    if data['tax_amount'] > 0:
        c.setFont(font_name, 10)
        c.setFillColor(gray_color)
        tax_text = f"(うち消費税等 {format_currency(data['tax_amount'])}円)"
        c.drawCentredString(width / 2, y_pos - 8.5*mm, tax_text)

    # === 但し書き ===
    y_pos -= 18*mm
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 10)
    c.drawString(INNER_L, y_pos, f"但し、{data.get('note', '家賃保証料として')}")

    # === 内訳明細 ===
    y_pos -= 10*mm

    # 明細ヘッダー（背景付き）
    c.setFillColor(HexColor('#E3F2FD'))
    c.rect(INNER_L, y_pos - 5*mm, width - 40*mm, 6*mm, fill=1, stroke=0)

    c.setFillColor(blue_color)
    c.setFont(font_name, 10)
    c.drawString(22*mm, y_pos - 2*mm, "【内訳明細】")

    y_pos -= 10*mm
    c.setFillColor(HexColor('#000000'))
    c.setFont(font_name, 9)

    for item in data['items']:
        if item['amount'] == 0:
            continue

        # 項目名（領収日を追加）
        item_name = f" {item['name']}"
        if item.get('receipt_date_start') and item.get('receipt_date_end'):
            # 期間表示
            item_name += f"（領収日: {item['receipt_date_start']}～{item['receipt_date_end']}）"
        elif item.get('receipt_date'):
            # 単一日付
            item_name += f"（領収日: {item['receipt_date']}）"

        # 期間がある場合（まとめて表示：パターンA+B）
        if item.get('details') and len(item['details']) > 0:
            y_pos -= 4*mm
            c.setFont(font_name, 9)
            c.drawString(22*mm, y_pos, item_name)

            # 期間範囲を取得
            first_period = item['details'][0]['period']
            last_period = item['details'][-1]['period']
            month_count = len(item['details'])

            # 単価を計算
            unit_price = item['details'][0]['amount']

            # まとめて1行で表示
            y_pos -= 3.5*mm
            c.setFont(font_name, 8)
            period_text = f"  {first_period}分～{last_period}分  @{format_currency(unit_price)}円 × {month_count}ヶ月"
            c.drawString(25*mm, y_pos, period_text)

            amount_text = f"{format_currency(item['amount'])}円"
            if not item.get('is_taxable'):
                amount_text += " ※非課税"
            c.drawRightString(width - 17*mm, y_pos, amount_text)

            # 課税項目の場合は税額表示
            if item.get('is_taxable'):
                base_amount = round(item["amount"] * 10 // 11)
                tax = item['amount'] - base_amount
                y_pos -= 3*mm
                c.setFillColor(gray_color)
                c.drawString(27*mm, y_pos, f"   (本体 {format_currency(base_amount)}円 / 消費税 {format_currency(tax)}円)")
                c.setFillColor(HexColor('#000000'))
        else:
            # 単一項目
            y_pos -= 4*mm
            c.setFont(font_name, 9)
            c.drawString(22*mm, y_pos, item_name)

            amount_text = f"{format_currency(item['amount'])}円"
            if not item.get('is_taxable'):
                amount_text += " ※非課税"
            c.drawRightString(width - 17*mm, y_pos, amount_text)

            if item.get('is_taxable'):
                base_amount = round(item["amount"] * 10 // 11)
                tax = item['amount'] - base_amount
                y_pos -= 3*mm
                c.setFont(font_name, 8)
                c.setFillColor(gray_color)
                c.drawString(25*mm, y_pos, f"(本体 {format_currency(base_amount)}円 / 消費税 {format_currency(tax)}円)")
                c.setFillColor(HexColor('#000000'))

        y_pos -= 2*mm

    # === 消費税額サマリー ===
    if data['tax_amount'] > 0:
        y_pos -= 6*mm

        # 背景ボックス
        c.setFillColor(HexColor('#FFF3E0'))
        c.rect(INNER_L, y_pos - 9*mm, width - 40*mm, 10*mm, fill=1, stroke=0)

        c.setFillColor(HexColor('#000000'))
        c.setFont(font_name, 9)
        c.drawString(22*mm, y_pos - 2*mm, "【消費税額】")

        y_pos -= 5*mm
        base_amount = data['total_amount'] - data['tax_excluded_amount'] - data['tax_amount']
        c.setFont(font_name, 8)
        c.drawString(24*mm, y_pos, f"10%対象")
        c.drawString(50*mm, y_pos, f"本体価格 {format_currency(base_amount):>10}円")
        c.drawString(100*mm, y_pos, f"消費税 {format_currency(data['tax_amount']):>10}円")

        if data['tax_excluded_amount'] > 0:
            y_pos -= 3.5*mm
            c.drawString(24*mm, y_pos, f"非課税対象")
            c.drawString(100*mm, y_pos, f"{format_currency(data['tax_excluded_amount']):>10}円")

    # === フッター（注記） ===
    y_pos -= 15*mm

    # 区切り線
    c.setStrokeColor(gray_color)
    c.setLineWidth(0.5)
    c.line(INNER_L, y_pos, width - 15*mm, y_pos)

    y_pos -= 5*mm
    c.setFont(font_name, 8)
    c.setFillColor(gray_color)
    c.drawString(INNER_L, y_pos, "※この領収書は再発行です。原本は保証契約書お客様控えに含まれております。")

    # T番号（適格請求書番号）- 課税項目がある場合は常に表示
    has_taxable = any(item.get('is_taxable') for item in data['items'])
    if data['receipt_type'] == 'invoice' or has_taxable:
        y_pos -= 4*mm
        c.drawString(INNER_L, y_pos, "※適格請求書発行事業者  登録番号: T7040001098239")

    # === 最下部会社情報 ===
    y_pos = 25*mm
    c.setFont(font_name, 8)
    c.setFillColor(gray_color)
    c.drawCentredString(width / 2, y_pos, "株式会社いえらぶパートナーズ  〒163-0248 東京都新宿区西新宿2-6-1 新宿住友ビル48階  TEL: 03-6240-3362")

    # T番号を常に表示（課税項目がある場合）
    if data['receipt_type'] == 'invoice' or has_taxable:
        y_pos -= 3.5*mm
        c.drawCentredString(width / 2, y_pos, "適格請求書発行事業者登録番号: T7040001098239")

    # === 外枠 ===
    c.setStrokeColor(gray_color)
    c.setLineWidth(0.5)
    c.rect(15*mm, 20*mm, width - 30*mm, height - 30*mm, fill=0, stroke=1)

    c.save()

    return filename
