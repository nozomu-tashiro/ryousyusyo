#!/bin/bash
# Railway ビルド時の日本語フォントインストール
echo "=== Installing Japanese fonts ==="
mkdir -p /usr/share/fonts/truetype/ipafont

# IPAフォントをダウンロード
FONT_URL="https://moji.or.jp/wp-content/ipafont/IPAexfont/IPAexfont00401.zip"
TAKAO_URL="https://launchpad.net/ubuntu/+archive/primary/+files/fonts-takao-gothic_003.03.orig.tar.gz"

# まずaptで試す
if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq fonts-ipafont fonts-ipaexfont fonts-takao-gothic 2>/dev/null || true
fi

echo "=== Font installation complete ==="
