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

RUN mkdir -p pdfs && chmod +x start.sh

CMD ["./start.sh"]
