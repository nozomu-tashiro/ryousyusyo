// 初期化
document.addEventListener('DOMContentLoaded', function() {
    // 今日の日付を設定
    setToday();
    
    // チェックボックスのイベントリスナー
    setupCheckboxListeners();
    
    // 金額入力のイベントリスナー
    setupAmountListeners();
    
    // 但し書きの初期状態を設定（ページ読み込み時にも反映）
    handleNoteChange();
    
    // 履歴を読み込み
    loadHistory();
});

// 再発行説明の折りたたみ
function toggleReissueNote() {
    const note = document.getElementById('reissueNote');
    const arrow = document.getElementById('reissueArrow');
    if (note.style.display === 'none') {
        note.style.display = 'block';
        arrow.textContent = '▲ 閉じる';
    } else {
        note.style.display = 'none';
        arrow.textContent = '▼ 詳細を見る';
    }
}

// 但し書きの切り替え（ラジオボタン方式のため不要・互換用に空関数を残す）
function handleNoteChange() {
    // ラジオボタン方式に変更済みのため処理なし
}

// 但し書きラベルに物件名・号室を自動反映する
function updateNoteLabels() {
    const building = document.getElementById('buildingRoom').value.trim();
    // 物件名が入力されていれば「物件名の〇〇」、未入力なら「〇〇」のみ
    const prefix = building ? building + 'の' : '';

    const templates = [
        { id: 'noteLabel0', suffix: '初回保証料として' },
        { id: 'noteLabel1', suffix: '更新保証料として' },
        { id: 'noteLabel2', suffix: '月額保証料として' },
        { id: 'noteLabel3', suffix: '家賃保証料として' }
        // noteLabel4（自由記載）は変更しない
    ];

    templates.forEach(function(t) {
        const el = document.getElementById(t.id);
        if (el) {
            el.textContent = prefix + t.suffix;
        }
    });
}

// チェックボックスのセットアップ
function setupCheckboxListeners() {
    const checkboxes = ['Initial', 'Monthly', 'Renewal', 'Collection', 'Billing'];
    
    checkboxes.forEach(name => {
        const checkbox = document.getElementById('check' + name);
        const body = document.getElementById('body' + name);
        
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                body.style.display = 'block';
            } else {
                body.style.display = 'none';
            }
            calculateTotal();
        });
    });
}

// 金額入力のセットアップ
function setupAmountListeners() {
    const amounts = ['Initial', 'Monthly', 'Renewal', 'Collection', 'Billing'];
    
    amounts.forEach(name => {
        const input = document.getElementById('amount' + name);
        input.addEventListener('input', calculateTotal);
    });
}

// 合計金額の計算（月数×単価を正しく反映）
function calculateTotal() {
    let totalNontax = 0;
    let totalTaxable = 0;

    // 初回保証料（単月・非課税）
    if (document.getElementById('checkInitial').checked) {
        totalNontax += parseInt(document.getElementById('amountInitial').value) || 0;
    }

    // 月額保証料（月数×単価・非課税）
    if (document.getElementById('checkMonthly').checked) {
        const unitAmt = parseInt(document.getElementById('amountMonthly').value) || 0;
        const months  = countMonths(
            parseInt(document.getElementById('monthlyStartYear').value),
            parseInt(document.getElementById('monthlyStartMonth').value),
            parseInt(document.getElementById('monthlyEndYear').value),
            parseInt(document.getElementById('monthlyEndMonth').value)
        );
        // 期間指定がある場合は月数×単価、なければ単価をそのまま使う
        totalNontax += (months !== null && months > 0) ? unitAmt * months : unitAmt;
    }

    // 更新保証料（単月・非課税）
    if (document.getElementById('checkRenewal').checked) {
        totalNontax += parseInt(document.getElementById('amountRenewal').value) || 0;
    }

    // 集送金手数料（月数×単価・課税）
    if (document.getElementById('checkCollection').checked) {
        const unitAmt = parseInt(document.getElementById('amountCollection').value) || 0;
        const months  = countMonths(
            parseInt(document.getElementById('collectionStartYear').value),
            parseInt(document.getElementById('collectionStartMonth').value),
            parseInt(document.getElementById('collectionEndYear').value),
            parseInt(document.getElementById('collectionEndMonth').value)
        );
        totalTaxable += (months !== null && months > 0) ? unitAmt * months : unitAmt;
    }

    // 請求事務手数料（月数×単価・課税）
    if (document.getElementById('checkBilling').checked) {
        const unitAmt = parseInt(document.getElementById('amountBilling').value) || 0;
        const months  = countMonths(
            parseInt(document.getElementById('billingStartYear').value),
            parseInt(document.getElementById('billingStartMonth').value),
            parseInt(document.getElementById('billingEndYear').value),
            parseInt(document.getElementById('billingEndMonth').value)
        );
        totalTaxable += (months !== null && months > 0) ? unitAmt * months : unitAmt;
    }

    // 課税：税抜き金額と消費税（税込金額から逆算）
    const taxBase = Math.round(totalTaxable * 10 / 11);
    const tax     = totalTaxable - taxBase;
    const total   = totalNontax + totalTaxable;

    // 表示を更新
    document.getElementById('totalNontax').textContent   = formatCurrency(totalNontax);
    document.getElementById('totalTaxBase').textContent  = formatCurrency(taxBase);
    document.getElementById('totalTax').textContent      = formatCurrency(tax);
    document.getElementById('totalAmount').textContent   = formatCurrency(total);
}

// 金額をカンマ区切りでフォーマット
function formatCurrency(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 今日の日付を設定
function setToday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('issueDate').value = `${year}-${month}-${day}`;
}

// 入力データの収集
function collectFormData() {
    // 但し書きの取得（ラジオボタン方式）
    let noteText;
    const selectedPreset = document.querySelector('input[name="notePreset"]:checked');
    const customNoteVal = document.getElementById('customNote').value.trim();

    if (!selectedPreset || selectedPreset.dataset.template === 'custom') {
        // 自由入力が選択されている場合
        if (!customNoteVal) {
            alert('但し書きを入力してください（自由入力欄に文言を入力してください）');
            document.getElementById('customNote').focus();
            return null;
        }
        noteText = customNoteVal;
    } else if (customNoteVal) {
        // プリセット選択中でも自由入力欄に何か書いてあればそちらを優先
        noteText = customNoteVal;
    } else {
        // data-template の {物件名} を実際の入力値に置換
        const building = document.getElementById('buildingRoom').value.trim();
        const template = selectedPreset.dataset.template || '';
        if (building) {
            noteText = template.replace('{物件名}', building);
        } else {
            // 物件名未入力時は「{物件名}の」の部分を除去
            noteText = template.replace('{物件名}の', '');
        }
    }
    
    const data = {
        customer_name: document.getElementById('customerName').value.trim(),
        guarantee_number: document.getElementById('guaranteeNumber').value.trim(),
        postal_code: document.getElementById('postalCode').value.trim(),
        address: document.getElementById('address').value.trim(),
        building_room: document.getElementById('buildingRoom').value.trim(),
        issue_date: formatDate(document.getElementById('issueDate').value),
        receipt_type: document.querySelector('input[name="receiptType"]:checked').value,
        note: noteText,
        items: [],
        total_amount: 0,
        tax_excluded_amount: 0,
        tax_amount: 0
    };
    
    // バリデーション
    if (!data.customer_name) {
        alert('契約者名を入力してください');
        return null;
    }
    if (!data.postal_code) {
        alert('郵便番号を入力してください');
        return null;
    }
    if (!data.address) {
        alert('住所を入力してください');
        return null;
    }
    
    let hasItems = false;
    
    // 初回保証料
    if (document.getElementById('checkInitial').checked) {
        const amount = parseInt(document.getElementById('amountInitial').value) || 0;
        if (amount > 0) {
            const receiptDate = document.getElementById('receiptDateInitial').value;
            data.items.push({
                name: '初回保証料',
                amount: amount,
                is_taxable: false,
                receipt_date: receiptDate ? formatDate(receiptDate) : ''
            });
            data.tax_excluded_amount += amount;
            hasItems = true;
        }
    }
    
    // 月額保証料
    if (document.getElementById('checkMonthly').checked) {
        const unitAmt = parseInt(document.getElementById('amountMonthly').value) || 0;
        if (unitAmt > 0) {
            const startYear  = document.getElementById('monthlyStartYear').value;
            const startMonth = document.getElementById('monthlyStartMonth').value;
            const endYear    = document.getElementById('monthlyEndYear').value;
            const endMonth   = document.getElementById('monthlyEndMonth').value;
            const months     = countMonths(parseInt(startYear), parseInt(startMonth), parseInt(endYear), parseInt(endMonth));
            // 合計金額 = 月数×単価（期間未指定なら単価そのまま）
            const totalAmt = (months !== null && months > 0) ? unitAmt * months : unitAmt;

            const receiptStartDate = document.getElementById('receiptDateMonthlyStart').value;
            const receiptEndDate   = document.getElementById('receiptDateMonthlyEnd').value;
            const item = {
                name: '月額保証料',
                amount: totalAmt,
                is_taxable: false,
                receipt_date_start: receiptStartDate ? formatDate(receiptStartDate) : '',
                receipt_date_end:   receiptEndDate   ? formatDate(receiptEndDate)   : ''
            };

            // 期間が指定されている場合は月別明細を生成
            if (startYear && startMonth && endYear && endMonth) {
                item.details = generateMonthlyDetails(
                    parseInt(startYear), parseInt(startMonth),
                    parseInt(endYear),   parseInt(endMonth),
                    totalAmt
                );
            }

            data.items.push(item);
            data.tax_excluded_amount += totalAmt;
            hasItems = true;
        }
    }
    
    // 更新保証料
    if (document.getElementById('checkRenewal').checked) {
        const amount = parseInt(document.getElementById('amountRenewal').value) || 0;
        if (amount > 0) {
            const receiptDate = document.getElementById('receiptDateRenewal').value;
            data.items.push({
                name: '更新保証料',
                amount: amount,
                is_taxable: false,
                receipt_date: receiptDate ? formatDate(receiptDate) : ''
            });
            data.tax_excluded_amount += amount;
            hasItems = true;
        }
    }
    
    // 集送金手数料
    if (document.getElementById('checkCollection').checked) {
        const unitAmt = parseInt(document.getElementById('amountCollection').value) || 0;
        if (unitAmt > 0) {
            const startYear  = document.getElementById('collectionStartYear').value;
            const startMonth = document.getElementById('collectionStartMonth').value;
            const endYear    = document.getElementById('collectionEndYear').value;
            const endMonth   = document.getElementById('collectionEndMonth').value;
            const months     = countMonths(parseInt(startYear), parseInt(startMonth), parseInt(endYear), parseInt(endMonth));
            const totalAmt   = (months !== null && months > 0) ? unitAmt * months : unitAmt;

            const receiptStartDate = document.getElementById('receiptDateCollectionStart').value;
            const receiptEndDate   = document.getElementById('receiptDateCollectionEnd').value;
            const item = {
                name: '集送金手数料',
                amount: totalAmt,
                is_taxable: true,
                receipt_date_start: receiptStartDate ? formatDate(receiptStartDate) : '',
                receipt_date_end:   receiptEndDate   ? formatDate(receiptEndDate)   : ''
            };

            if (startYear && startMonth && endYear && endMonth) {
                item.details = generateMonthlyDetails(
                    parseInt(startYear), parseInt(startMonth),
                    parseInt(endYear),   parseInt(endMonth),
                    totalAmt
                );
            }

            data.items.push(item);
            const taxBase = Math.round(totalAmt * 10 / 11);
            data.tax_amount += totalAmt - taxBase;
            hasItems = true;
        }
    }
    
    // 請求事務手数料
    if (document.getElementById('checkBilling').checked) {
        const unitAmt = parseInt(document.getElementById('amountBilling').value) || 0;
        if (unitAmt > 0) {
            const startYear  = document.getElementById('billingStartYear').value;
            const startMonth = document.getElementById('billingStartMonth').value;
            const endYear    = document.getElementById('billingEndYear').value;
            const endMonth   = document.getElementById('billingEndMonth').value;
            const months     = countMonths(parseInt(startYear), parseInt(startMonth), parseInt(endYear), parseInt(endMonth));
            const totalAmt   = (months !== null && months > 0) ? unitAmt * months : unitAmt;

            const receiptStartDate = document.getElementById('receiptDateBillingStart').value;
            const receiptEndDate   = document.getElementById('receiptDateBillingEnd').value;
            const item = {
                name: '請求事務手数料',
                amount: totalAmt,
                is_taxable: true,
                receipt_date_start: receiptStartDate ? formatDate(receiptStartDate) : '',
                receipt_date_end:   receiptEndDate   ? formatDate(receiptEndDate)   : ''
            };
            
            // 期間が指定されている場合は月別明細を生成
            if (startYear && startMonth && endYear && endMonth) {
                item.details = generateMonthlyDetails(
                    parseInt(startYear), parseInt(startMonth),
                    parseInt(endYear),   parseInt(endMonth),
                    totalAmt
                );
            }

            data.items.push(item);
            const taxBase = Math.round(totalAmt * 10 / 11);
            data.tax_amount += totalAmt - taxBase;
            hasItems = true;
        }
    }

    if (!hasItems) {
        alert('少なくとも1つの項目を選択し、金額を入力してください');
        return null;
    }
    
    
    // 合計金額の再計算
    data.total_amount = data.items.reduce((sum, item) => sum + item.amount, 0);
    
    return data;
}

// ===== カ月×金額 計算式ヘルパー =====

// 月数を計算（期間入力から）
function countMonths(sy, sm, ey, em) {
    if (!sy || !sm || !ey || !em) return null;
    const start = sy * 12 + sm;
    const end   = ey * 12 + em;
    if (end < start) return null;
    return end - start + 1;
}

// 月額保証料の計算式表示（非課税）
function calcMonthly() {
    const amount = parseInt(document.getElementById('amountMonthly').value) || 0;
    const sy = parseInt(document.getElementById('monthlyStartYear').value);
    const sm = parseInt(document.getElementById('monthlyStartMonth').value);
    const ey = parseInt(document.getElementById('monthlyEndYear').value);
    const em = parseInt(document.getElementById('monthlyEndMonth').value);
    const months = countMonths(sy, sm, ey, em);

    const mEl = document.getElementById('monthlyMonths');
    const tEl = document.getElementById('monthlyTotal');
    const box = document.getElementById('calcMonthlyResult');

    if (amount > 0 && months !== null) {
        mEl.textContent = months;
        tEl.textContent = (amount * months).toLocaleString();
        box.style.display = 'flex';
    } else {
        mEl.textContent = '―';
        tEl.textContent = '―';
        box.style.display = amount > 0 ? 'flex' : 'none';
    }
    calculateTotal();
}

// 集送金手数料の計算式表示（課税）
function calcCollection() {
    const amount = parseInt(document.getElementById('amountCollection').value) || 0;
    const sy = parseInt(document.getElementById('collectionStartYear').value);
    const sm = parseInt(document.getElementById('collectionStartMonth').value);
    const ey = parseInt(document.getElementById('collectionEndYear').value);
    const em = parseInt(document.getElementById('collectionEndMonth').value);
    const months = countMonths(sy, sm, ey, em);

    const mEl = document.getElementById('collectionMonths');
    const tEl = document.getElementById('collectionTotal');
    const box = document.getElementById('calcCollectionResult');

    if (amount > 0 && months !== null) {
        mEl.textContent = months;
        tEl.textContent = (amount * months).toLocaleString();
        box.style.display = 'flex';
    } else {
        mEl.textContent = '―';
        tEl.textContent = '―';
        box.style.display = amount > 0 ? 'flex' : 'none';
    }
    calculateTotal();
}

// 請求事務手数料の計算式表示（課税）
function calcBilling() {
    const amount = parseInt(document.getElementById('amountBilling').value) || 0;
    const sy = parseInt(document.getElementById('billingStartYear').value);
    const sm = parseInt(document.getElementById('billingStartMonth').value);
    const ey = parseInt(document.getElementById('billingEndYear').value);
    const em = parseInt(document.getElementById('billingEndMonth').value);
    const months = countMonths(sy, sm, ey, em);

    const mEl = document.getElementById('billingMonths');
    const tEl = document.getElementById('billingTotal');
    const box = document.getElementById('calcBillingResult');

    if (amount > 0 && months !== null) {
        mEl.textContent = months;
        tEl.textContent = (amount * months).toLocaleString();
        box.style.display = 'flex';
    } else {
        mEl.textContent = '―';
        tEl.textContent = '―';
        box.style.display = amount > 0 ? 'flex' : 'none';
    }
    calculateTotal();
}

// 月別明細の生成
function generateMonthlyDetails(startYear, startMonth, endYear, endMonth, totalAmount) {
    const details = [];
    let currentYear = startYear;
    let currentMonth = startMonth;
    let monthCount = 0;
    
    // 月数をカウント
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        monthCount++;
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    }
    
    // 月額を計算
    const monthlyAmount = Math.floor(totalAmount / monthCount);
    let remainder = totalAmount - (monthlyAmount * monthCount);
    
    // 明細を生成
    currentYear = startYear;
    currentMonth = startMonth;
    
    for (let i = 0; i < monthCount; i++) {
        let amount = monthlyAmount;
        if (i === 0 && remainder > 0) {
            amount += remainder; // 端数は最初の月に加算
        }
        
        const detail = {
            period: `${currentYear}年${currentMonth}月`,
            amount: amount
        };
        
        // 課税項目の場合は税抜き金額と税額を計算
        const base = Math.round(amount * 10 / 11);
        const tax = amount - base;
        detail.base = base;
        detail.tax = tax;
        
        details.push(detail);
        
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    }
    
    return details;
}

// 日付フォーマット
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
}

// プレビュー表示
let currentPdfPath = null;

async function showPreview() {
    const data = collectFormData();
    if (!data) return;
    
    try {
        const response = await fetch('/api/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentPdfPath = result.pdf_path;
            
            // PDFを新しいタブで開く
            window.open(`/api/download/${result.pdf_path}`, '_blank');
            
            // 出力ボタンを表示
            document.getElementById('outputButtons').style.display = 'block';
            
            alert('プレビューを表示しました。内容を確認してください。');
        } else {
            alert('エラーが発生しました: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('通信エラーが発生しました');
    }
}

// PDFダウンロード
async function downloadPDF() {
    if (!currentPdfPath) {
        alert('先にプレビューを表示してください');
        return;
    }
    
    // 発行者氏名チェック
    const issuerName = document.getElementById('issuerName').value.trim();
    if (!issuerName) {
        alert('発行者氏名を入力してください（画面上部の入力欄）');
        document.getElementById('issuerName').focus();
        return;
    }

    const data = collectFormData();
    if (!data) return;
    
    // 発行者氏名をデータに追加
    data.issuer_name = issuerName;
    
    try {
        const response = await fetch('/api/issue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // PDFダウンロード
            window.open(`/api/download/${result.pdf_path}`, '_blank');
            
            alert(`領収書を発行しました（領収書番号: ${result.receipt_number}）`);
            
            // 履歴を再読み込み
            loadHistory();
            
            // フォームをリセット
            if (confirm('フォームをリセットしますか？')) {
                location.reload();
            }
        } else {
            alert('エラーが発生しました: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('通信エラーが発生しました');
    }
}

// メールフォーム表示
function showEmailForm() {
    if (!currentPdfPath) {
        alert('先にプレビューを表示してください');
        return;
    }
    // 本文テンプレートを自動生成
    generateEmailBody();
    document.getElementById('emailForm').style.display = 'block';
    document.getElementById('emailForm').scrollIntoView({behavior: 'smooth', block: 'center'});
}

// メール本文テンプレートを自動生成
function generateEmailBody() {
    const customerName = document.getElementById('customerName').value.trim() || 'お客様';
    const guaranteeNumber = document.getElementById('guaranteeNumber').value.trim();
    const issueDate = document.getElementById('issueDate').value;

    // 選択された項目の一覧を作成
    const itemNames = [];
    if (document.getElementById('checkInitial').checked) itemNames.push('初回保証料');
    if (document.getElementById('checkMonthly').checked) itemNames.push('月額保証料');
    if (document.getElementById('checkRenewal').checked) itemNames.push('更新保証料');
    if (document.getElementById('checkCollection').checked) itemNames.push('集送金手数料');
    if (document.getElementById('checkBilling').checked) itemNames.push('請求事務手数料');

    // 合計金額
    const totalEl = document.getElementById('totalAmount');
    const totalAmount = totalEl ? totalEl.textContent : '';

    // 発行日のフォーマット
    let issueDateStr = '';
    if (issueDate) {
        const d = new Date(issueDate);
        issueDateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    }

    // 保証番号行
    const guaranteeStr = guaranteeNumber ? `保証番号　：${guaranteeNumber}\n` : '';

    // 項目列
    const itemsStr = itemNames.length > 0 ? itemNames.join('、') : '（選択項目）';

    const body = `${customerName} 様

平素より大変お世話になっております。
株式会社いえらぶパートナーズでございます。

このたびはお問い合わせいただきありがとうございます。
ご依頼の領収書を発行いたしましたので、添付ファイルをご確認ください。

━━━━━━━━━━━━━━━━━━━━
■ 発行内容
━━━━━━━━━━━━━━━━━━━━
${guaranteeStr}発行日　　：${issueDateStr}
項目　　　：${itemsStr}
合計金額　：${totalAmount}円

※ 添付のPDFをご確認ください。
━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、下記までお気軽にお問い合わせください。

─────────────────────────
株式会社いえらぶパートナーズ
〒163-0248 東京都新宿区西新宿2-6-1
新宿住友ビル48階
TEL：03-6240-3362
─────────────────────────`;

    document.getElementById('emailBody').value = body;
}

// メーラーを起動（mailto:プロトコル）＋PDF自動ダウンロード＋履歴記録
async function openMailer() {
    const email = document.getElementById('emailAddress').value.trim();
    if (!email) {
        alert('宛先メールアドレスを入力してください');
        document.getElementById('emailAddress').focus();
        return;
    }
    if (!currentPdfPath) {
        alert('先にプレビューを表示してください');
        return;
    }

    // 発行者氏名チェック
    const issuerName = document.getElementById('issuerName').value.trim();
    if (!issuerName) {
        alert('発行者氏名を入力してください（画面上部の入力欄）');
        document.getElementById('issuerName').focus();
        return;
    }

    const subject = document.getElementById('emailSubject').value.trim();
    const body = document.getElementById('emailBody').value;

    // ① /api/issue を呼んで発行履歴に記録
    const data = collectFormData();
    if (!data) return;
    data.issuer_name = issuerName;

    let issuedPdfPath = currentPdfPath;
    try {
        const response = await fetch('/api/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            issuedPdfPath = result.pdf_path;
            // 履歴を更新
            loadHistory();
        } else {
            // 発行エラーでもメーラーは起動する（二重発行防止のため警告）
            if (!confirm('発行記録の保存中にエラーが発生しました：\n' + result.error + '\n\nメーラーの起動を続けますか？')) {
                return;
            }
        }
    } catch (e) {
        if (!confirm('通信エラーが発生しました。メーラーの起動を続けますか？')) {
            return;
        }
    }

    // ② PDFを自動ダウンロード（ダウンロードフォルダに保存）
    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/download/${issuedPdfPath}`;
    downloadLink.download = issuedPdfPath;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // ③ 少し待ってからメーラーを起動（ダウンロード開始を待つ）
    setTimeout(() => {
        const encodedSubject = encodeURIComponent(subject);
        const encodedBody = encodeURIComponent(body);
        const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodedSubject}&body=${encodedBody}`;
        window.location.href = mailtoUrl;

        // ④ PDF添付の案内バナーを表示
        setTimeout(() => {
            showAttachmentGuide(issuedPdfPath);
        }, 800);
    }, 600);
}

// PDF添付案内バナーを表示
function showAttachmentGuide(pdfFilename) {
    // 既存バナーがあれば削除
    const existing = document.getElementById('attachmentGuide');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'attachmentGuide';
    banner.style.cssText = `
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        background: #1565C0;
        color: #fff;
        border-radius: 6px;
        padding: 14px 20px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        max-width: 520px;
        width: 90%;
        font-size: 13px;
        line-height: 1.7;
    `;
    banner.innerHTML = `
        <div style="font-weight:bold; font-size:14px; margin-bottom:6px;">✅ メーラーが起動しました</div>
        <div>📎 PDFが自動でダウンロードされました。</div>
        <div style="margin-top:6px; background:rgba(255,255,255,0.15); border-radius:4px; padding:8px 10px;">
            <strong>【添付手順】</strong><br>
            ① ダウンロードフォルダの <code style="background:rgba(0,0,0,0.2); padding:1px 5px; border-radius:3px;">${pdfFilename}</code> を確認<br>
            ② メーラーのメール作成画面にドラッグ＆ドロップ<br>
            ③ 本文を確認して送信
        </div>
        <div style="text-align:right; margin-top:8px;">
            <button onclick="document.getElementById('attachmentGuide').remove()"
                style="background:rgba(255,255,255,0.25); border:1px solid rgba(255,255,255,0.5); color:#fff; border-radius:3px; padding:3px 12px; cursor:pointer; font-size:12px;">
                閉じる
            </button>
        </div>
    `;
    document.body.appendChild(banner);

    // 20秒後に自動で消える
    setTimeout(() => {
        if (document.getElementById('attachmentGuide')) {
            document.getElementById('attachmentGuide').remove();
        }
    }, 20000);
}

// （旧）メール送信（互換性のため残す）
async function sendEmail() {
    openMailer();
}

// 履歴読み込み
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const history = await response.json();
        
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<div class="history-item history-empty">発行履歴がありません</div>';
            return;
        }
        
        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item' + (item.is_void ? ' history-void' : '');
            div.dataset.id = item.id;

            const statusBadge = item.is_void
                ? `<span class="void-badge">無効</span>`
                : `<span class="valid-badge">有効</span>`;

            const voidInfo = item.is_void
                ? `<div class="void-info">無効化理由：${item.void_reason}　（${item.void_at}）</div>`
                : '';

            const voidBtn = item.is_void
                ? ''
                : `<button type="button" class="btn-void" onclick="confirmVoid(${item.id}, '${item.customer_name.replace(/'/g, "\\'")}')">無効化</button>`;

            div.innerHTML = `
                <div class="history-main">
                    <div class="history-info">
                        ${statusBadge}
                        <span class="history-date">${item.created_at}</span>
                        <span class="history-issuer">発行者：${item.issuer_name}</span>
                        <span class="history-customer">${item.customer_name}</span>
                        <span class="history-items">${item.items}</span>
                        <span class="history-amount">${item.total_amount}円</span>
                    </div>
                    <div class="history-actions">
                        ${voidBtn}
                    </div>
                </div>
                ${voidInfo}
            `;
            historyList.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// 無効化確認ダイアログ
async function confirmVoid(receiptId, customerName) {
    const reason = prompt(`【${customerName}】の領収書を無効化します。\n\n無効化理由を入力してください（必須）：`);
    if (reason === null) return;  // キャンセル
    if (!reason.trim()) {
        alert('無効化理由を入力してください');
        return;
    }

    const adminPass = prompt('管理者パスワードを入力してください：');
    if (adminPass === null) return;  // キャンセル

    try {
        const response = await fetch(`/api/void/${receiptId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ void_reason: reason.trim(), admin_pass: adminPass })
        });
        const result = await response.json();

        if (result.success) {
            alert('無効化しました。履歴を更新します。');
            loadHistory();
        } else {
            alert('エラー：' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('通信エラーが発生しました');
    }
}

// 履歴エクスポート
function exportHistory() {
    window.open('/api/history/export', '_blank');
}

// ヘルプ表示
function showHelp() {
    alert('ヘルプページは別途作成予定です。\n\n基本的な使い方:\n1. 契約者情報を入力\n2. 領収項目を選択して金額入力\n3. 発行設定を確認\n4. プレビューで確認後、出力\n\n不明点があれば上長にご確認ください。');
}
