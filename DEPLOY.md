# Guía de Despliegue — fut.invest

## 📋 Prerrequisitos

- **Servidor**: Ubuntu 22.04+ (mínimo 2GB RAM, 20GB SSD)
- **Node.js**: 20.x o superior
- **PostgreSQL**: 15.x o superior (o Supabase)
- **Docker** (opcional, recomendado)
- **Dominio**: con acceso DNS
- **SSL**: Certificados (Let's Encrypt recomendado)

---

## 🚀 Opción 1: Despliegue con Docker (Recomendado)

### 1. Preparar el servidor

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt install docker-compose-plugin -y

# Verificar instalación
docker --version
docker compose version
```

### 2. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/fut-invest.git
cd fut-invest
```

### 3. Generar secretos

```bash
cd backend
node scripts/generate-secrets.js
```

Copia los valores generados al archivo `.env`.

### 4. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Configura al menos:
```env
JWT_SECRET=tu-secreto-generado
TOTP_SECRET=tu-secreto-generado
APP_SECRET=tu-secreto-generado
FRONTEND_URL=https://tudominio.com
DB_PASSWORD=contraseña-segura-postgres
```

### 5. Generar certificados SSL

```bash
# Instalar Certbot
sudo apt install certbot -y

# Generar certificados
sudo certbot certonly --standalone -d tudominio.com

# Copiar certificados
mkdir -p certs
sudo cp /etc/letsencrypt/live/tudominio.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/tudominio.com/privkey.pem certs/key.pem
```

### 6. Desplegar

```bash
# Construir y levantar servicios
docker compose up -d

# Verificar estado
docker compose ps

# Ver logs
docker compose logs -f backend
```

### 7. Ejecutar migraciones

```bash
docker compose exec backend npm run migrate
```

### 8. Verificar despliegue

```bash
# Health check
curl https://tudominio.com/api/health

# API Docs
open https://tudominio.com/api/docs
```

---

## 🛠️ Opción 2: Despliegue Manual

### 1. Preparar el servidor

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Instalar Nginx
sudo apt install -y nginx
```

### 2. Configurar PostgreSQL

```bash
# Iniciar PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Crear usuario y base de datos
sudo -u postgres psql
CREATE DATABASE futinvest;
CREATE USER futinvest WITH PASSWORD 'tu-contraseña-segura';
GRANT ALL PRIVILEGES ON DATABASE futinvest TO futinvest;
\q
```

### 3. Clonar y configurar

```bash
git clone https://github.com/tu-usuario/fut-invest.git
cd fut-invest/backend

# Instalar dependencias
npm ci --production

# Configurar variables
cp .env.example .env
nano .env
```

### 4. Generar secretos

```bash
node scripts/generate-secrets.js
```

### 5. Ejecutar migraciones

```bash
npm run migrate
```

### 6. Configurar PM2 (Process Manager)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar aplicación
pm2 start src/index.js --name futinvest-backend

# Guardar configuración
pm2 save
pm2 startup
```

### 7. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/futinvest
```

Contenido:
```nginx
server {
    listen 80;
    server_name tudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tudominio.com;

    ssl_certificate /etc/letsencrypt/live/tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tudominio.com/privkey.pem;

    root /var/www/fut-invest;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

```bash
# Habilitar sitio
sudo ln -s /etc/nginx/sites-available/futinvest /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Configurar SSL con Let's Encrypt

```bash
sudo certbot --nginx -d tudominio.com
```

### 9. Configurar backups automáticos

```bash
# Agregar al crontab
crontab -e

# Backup diario a las 2am
0 2 * * * cd /path/to/fut-invest/backend && node scripts/backup.js >> /var/log/futinvest-backup.log 2>&1
```

---

## 🔒 Checklist de Seguridad Pre-Despliegue

- [ ] JWT_SECRET generado con `openssl rand -base64 48`
- [ ] TOTP_SECRET generado con `openssl rand -base64 32`
- [ ] APP_SECRET generado con `openssl rand -hex 32`
- [ ] HTTPS habilitado con certificados válidos
- [ ] CORS configurado con FRONTEND_URL correcto
- [ ] CSRF habilitado (`CSRF_ENABLED=true`)
- [ ] WAF habilitado (`WAF_ENABLED=true`)
- [ ] Rate limiting configurado para producción
- [ ] Base de datos PostgreSQL (no SQLite)
- [ ] Logs configurados con rotación
- [ ] Backups automáticos configurados
- [ ] `.env` NO commiteado en git
- [ ] `.gitignore` incluye `node_modules`, `logs`, `data`, `.env`
- [ ] Firewall configurado (solo puertos 80, 443, 22)
- [ ] Usuario no-root para ejecutar la aplicación
- [ ] Sentry configurado para error tracking

---

## 📊 Monitoreo Post-Despliegue

### Health Checks

```bash
# Verificar API
curl https://tudominio.com/api/health

# Verificar métricas Prometheus
curl https://tudominio.com/api/metrics/prometheus
```

### Logs

```bash
# Logs de la aplicación
tail -f backend/logs/combined.log

# Logs de errores
tail -f backend/logs/error.log

# Logs de acceso
tail -f backend/logs/access.log
```

### PM2 Monitoreo

```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs futinvest-backend

# Monitoreo en tiempo real
pm2 monit
```

---

## 🔄 Actualizaciones

### Con Docker

```bash
git pull
docker compose down
docker compose up -d --build
docker compose exec backend npm run migrate
```

### Manual

```bash
git pull
npm ci --production
pm2 restart futinvest-backend
npm run migrate
```

---

## 🆘 Troubleshooting

### La API no responde

```bash
# Verificar que el proceso está corriendo
pm2 status

# Ver logs
pm2 logs futinvest-backend

# Verificar puerto
netstat -tulpn | grep 3001
```

### Error de base de datos

```bash
# Verificar PostgreSQL
sudo systemctl status postgresql

# Verificar conexión
psql -U futinvest -d futinvest -c "SELECT 1"
```

### Certificados SSL expirados

```bash
# Renovar automáticamente
sudo certbot renew

# Verificar fecha de expiración
sudo certbot certificates
```

---

## 📞 Soporte

- **Email**: soporte@futinvest.io
- **Documentación API**: https://tudominio.com/api/docs
- **Status Page**: https://status.futinvest.io
