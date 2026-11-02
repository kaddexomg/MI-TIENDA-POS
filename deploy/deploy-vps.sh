#!/usr/bin/env bash
# ============================================================================
# Script de Despliegue Aislado en VPS para MI-TIENDA-POS (v6)
# ============================================================================
# Uso en el VPS:
#   bash deploy/deploy-vps.sh pos.tudominio.com
#
# Garantías de Seguridad:
# - NO modifica ningún archivo, puerto ni servicio de JJ Paper.
# - Instala MI-TIENDA-POS en su propio directorio (/var/www/mi-tienda-pos).
# - Corre en el puerto interno exclusivo 7070.
# - Configura su propio archivo Nginx (/etc/nginx/sites-available/mi-tienda-pos)
#   y solicita su certificado SSL con Certbot si el DNS ya apunta al VPS.
# ============================================================================

set -e

DOMAIN="${1:-}"
APP_DIR="/var/www/mi-tienda-pos"
REPO_URL="https://github.com/kaddexomg/MI-TIENDA-POS.git"
PORT="7070"

if [ -z "$DOMAIN" ]; then
  echo "Uso: bash deploy-vps.sh <subdominio.tudominio.com>"
  exit 1
fi

echo "=== [1/4] Clonando o actualizando MI-TIENDA-POS en $APP_DIR ==="
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  git pull origin main
fi

cd "$APP_DIR"

echo "=== [2/4] Configurando servicio en segundo plano en puerto $PORT ==="
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete mi-tienda-pos >/dev/null 2>&1 || true
  PORT=$PORT pm2 start server/server.js --name "mi-tienda-pos"
  pm2 save
else
  sudo tee /etc/systemd/system/mi-tienda-pos.service >/dev/null <<EOF
[Unit]
Description=MI-TIENDA-POS Server (Isolated Port $PORT)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
ExecStart=$(command -v node) $APP_DIR/server/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable mi-tienda-pos
  sudo systemctl restart mi-tienda-pos
fi

echo "=== [3/4] Configurando Nginx VirtualHost aislado para $DOMAIN ==="
sudo sed "s/POS_DOMAIN/$DOMAIN/g" "$APP_DIR/deploy/nginx-mi-tienda-pos.conf" | sudo tee /etc/nginx/sites-available/mi-tienda-pos >/dev/null
sudo ln -sf /etc/nginx/sites-available/mi-tienda-pos /etc/nginx/sites-enabled/mi-tienda-pos
sudo nginx -t
sudo systemctl reload nginx

echo "=== [4/4] Verificando SSL con Certbot (opcional si el DNS ya propaga) ==="
if command -v certbot >/dev/null 2>&1; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "Aviso: Ejecuta 'sudo certbot --nginx -d $DOMAIN' cuando el registro DNS Tipo A ya apunte al VPS."
fi

echo "============================================================================"
echo " ¡LISTO! MI-TIENDA-POS desplegado en http://$DOMAIN (Puerto interno $PORT)"
echo "============================================================================"
