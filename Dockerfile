FROM python:3.12-slim

# 日本語フォントをインストール
RUN apt-get update && apt-get install -y \
    fonts-ipafont \
    fonts-ipaexfont \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p pdfs

# PORT環境変数はRailwayが自動設定するためデフォルト値を設定
ENV PORT=8080

CMD gunicorn app:app --bind 0.0.0.0:${PORT} --workers 2 --timeout 120 --log-level info
