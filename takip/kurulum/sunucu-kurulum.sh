#!/usr/bin/env bash
# Karaca Güvenlik araç takip sunucusu kurulumu (Traccar + HTTPS).
# Ubuntu 22.04/24.04 veya Debian 12 üzerinde root olarak çalıştırın:
#   bash sunucu-kurulum.sh takip.alanadiniz.com
# Önkoşul: alan adının A kaydı bu sunucunun IP adresini göstermeli.
set -euo pipefail

DOMAIN="${1:-}"
PANEL_ORIGIN="${PANEL_ORIGIN:-https://karacaguvenlik.github.io}"
TRACCAR_VERSION="${TRACCAR_VERSION:-6.17.0}"
GT06_PORT=5023

if [[ -z "$DOMAIN" ]]; then
  echo "Kullanım: bash $0 takip.alanadiniz.com" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Bu betik root olarak çalıştırılmalı (sudo bash $0 $DOMAIN)." >&2
  exit 1
fi

echo "==> Paketler kuruluyor"
apt-get update -y
apt-get install -y curl unzip ufw debian-keyring debian-archive-keyring apt-transport-https gnupg

echo "==> Traccar $TRACCAR_VERSION kuruluyor"
tmp="$(mktemp -d)"
curl -fsSL -o "$tmp/traccar.zip" \
  "https://github.com/traccar/traccar/releases/download/v${TRACCAR_VERSION}/traccar-linux-64-${TRACCAR_VERSION}.zip"
unzip -o -q "$tmp/traccar.zip" -d "$tmp"
"$tmp/traccar.run"
rm -rf "$tmp"

conf=/opt/traccar/conf/traccar.xml
# Re-running the script must not duplicate entries.
sed -i "/key='web.origin'/d; /key='protocols.enable'/d; /key='web.address'/d" "$conf"
sed -i "s#</properties>#    <entry key='web.origin'>${PANEL_ORIGIN} https://${DOMAIN}</entry>\n    <entry key='web.address'>127.0.0.1</entry>\n    <entry key='protocols.enable'>gt06</entry>\n\n</properties>#" "$conf"
systemctl enable traccar
systemctl restart traccar

echo "==> Caddy (otomatik HTTPS) kuruluyor"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    encode gzip
    reverse_proxy 127.0.0.1:8082
}
EOF
systemctl restart caddy

echo "==> Güvenlik duvarı"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow ${GT06_PORT}/tcp
ufw --force enable

ip="$(curl -fsS https://api.ipify.org || echo '<sunucu-ip>')"
cat <<EOF

Kurulum tamamlandı.
  Yönetim arayüzü : https://${DOMAIN}  (ilk girişte yönetici hesabı oluşturun)
  Cihaz sunucusu  : ${DOMAIN} (veya ${ip}), port ${GT06_PORT}
  Panel           : ${PANEL_ORIGIN}/takip/  -> "Sunucu adresi" alanına https://${DOMAIN}

Kayıtlar: tail -f /opt/traccar/logs/tracker-server.log
EOF
