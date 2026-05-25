# 🚀 Guía de Despliegue Permanente — fut.invest

## Opciones para Uso Permanente

---

## Opción 1: Cloudflare Tunnel + Dominio Propio (RECOMENDADO - Gratis)

### Requisitos
- Cuenta gratuita en Cloudflare (https://dash.cloudflare.com)
- Un dominio propio (puedes comprar uno en Namecheap ~$10/año)
- Tu PC encendida 24/7 O un VPS barato

### Paso 1: Crear Tunnel en Cloudflare

1. Ve a https://one.dash.cloudflare.com
2. Click en **"Create a tunnel"**
3. Selecciona **"Cloudflared"** como conector
4. Ponle nombre: `futinvest`
5. Descarga el archivo de configuración (credentials.json)

### Paso 2: Instalar cloudflared como servicio

```bash
# Windows (PowerShell como Administrador)
$env:CLOUDFLARE_ACCESS = "tu-credentials.json-path"
C:\Users\rf883\AppData\Local\Temp\opencode\cloudflared.exe service install

# O manualmente:
C:\Users\rf883\AppData\Local\Temp\opencode\cloudflared.exe --config C:\path\to\credentials.json tunnel run
```

### Paso 3: Configurar DNS

1. En Cloudflare Dashboard → DNS
2. Agrega un registro CNAME:
   - **Name:** `app.tudominio.com`
   - **Target:** `tu-tunnel-id.cfargotunnel.com`
   - **Proxy:** ON (naranja)

### Paso 4: Configurar ruta pública

1. En Cloudflare Zero Trust → Networks → Tunnels
2. Click en tu tunnel → **Public Hostname**
3. Agrega:
   - **Subdomain:** `app`
   - **Domain:** `tudominio.com`
   - **Service:** `http://localhost:8080`

---

## Opción 2: Render.com (Gratis - Más Fácil)

### Paso 1: Crear cuenta
1. Ve a https://render.com
2. Sign up con GitHub

### Paso 2: Preparar para deploy

Crea un archivo `render.yaml` en la raíz del proyecto:

```yaml
services:
  - type: web
    name: futinvest-backend
    env: node
    buildCommand: cd backend && npm ci --production
    startCommand: cd backend && node src/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: JWT_SECRET
        sync: false
      - key: TOTP_SECRET
        sync: false
      - key: APP_SECRET
        sync: false
      - key: DB_TYPE
        value: sqlite
      - key: DB_PATH
        value: ./data/fut_invest.db

  - type: web
    name: futinvest-frontend
    env: static
    buildCommand: echo "No build needed"
    staticPublishPath: .
    headers:
      - path: /*
        name: Cache-Control
        value: public, max-age=3600
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

### Paso 3: Deploy
1. Push tu código a GitHub
2. En Render → New Web Service → Connect repo
3. Selecciona `render.yaml`
4. Click Deploy

---

## Opción 3: Railway.app (Gratis - $5 crédito/mes)

### Paso 1: Crear cuenta
1. Ve a https://railway.app
2. Sign up con GitHub

### Paso 2: Deploy
1. New Project → Deploy from GitHub repo
2. Railway detectará automáticamente Node.js
3. Agrega variables de entorno en el dashboard
4. Deploy automático

---

## Opción 4: VPS (DigitalOcean - $6/mes)

### Paso 1: Crear Droplet
1. Ve a https://digitalocean.com
2. Create Droplet:
   - **OS:** Ubuntu 22.04
   - **Size:** Basic $6/mes (1GB RAM)
   - **Region:** New York (más cerca de LATAM)

### Paso 2: Conectar por SSH
```bash
ssh root@TU_IP
```

### Paso 3: Instalar dependencias
```bash
apt update && apt upgrade -y
apt install -y nodejs npm nginx certbot python3-certbot-nginx git

# Instalar Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### Paso 4: Clonar y configurar
```bash
git clone https://github.com/tu-usuario/fut-invest.git /opt/futinvest
cd /opt/futinvest/backend
npm ci --production

# Generar secretos
node scripts/generate-secrets.js
# Copia los valores al .env
```

### Paso 5: Configurar PM2
```bash
npm install -g pm2

# Backend
cd /opt/futinvest/backend
pm2 start src/index.js --name futinvest-backend

# Frontend server
cd /opt/futinvest
pm2 start server.js --name futinvest-frontend

pm2 save
pm2 startup
```

### Paso 6: Configurar Nginx
```bash
nano /etc/nginx/sites-available/futinvest
```

```nginx
server {
    listen 80;
    server_name app.tudominio.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
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
ln -s /etc/nginx/sites-available/futinvest /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Paso 7: SSL con Let's Encrypt
```bash
certbot --nginx -d app.tudominio.com
```

---

## Opción 5: Fly.io (Gratis - 3 VMs compartidas)

### Paso 1: Instalar Fly CLI
```bash
# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### Paso 2: Crear cuenta y login
```bash
fly auth signup
# o
fly auth login
```

### Paso 3: Deploy
```bash
cd C:\Users\rf883\.gemini\antigravity\scratch\fut_invest
fly launch
fly deploy
```

---

## Comparación de Opciones

| Opción | Costo | Dificultad | Uptime | Custom Domain |
|--------|-------|------------|--------|---------------|
| Cloudflare Tunnel | Gratis | Media | Depende de tu PC | ✅ |
| Render.com | Gratis | Fácil | 750h/mes | ✅ |
| Railway.app | $5/mes | Fácil | 24/7 | ✅ |
| DigitalOcean VPS | $6/mes | Media | 24/7 | ✅ |
| Fly.io | Gratis | Fácil | 24/7 (limitado) | ✅ |
| Heroku | $5/mes | Fácil | 24/7 | ✅ |

---

## 🎯 Recomendación

**Para empezar GRATIS:**
1. **Render.com** - Más fácil, solo conecta GitHub
2. **Fly.io** - Bueno para pruebas, 3 VMs gratis

**Para producción profesional:**
1. **DigitalOcean VPS ($6/mes)** - Control total, mejor rendimiento
2. **Cloudflare Tunnel + VPS** - Mejor seguridad y rendimiento

---

## 📋 Checklist Pre-Deploy

- [ ] Generar secretos de producción (`npm run secrets`)
- [ ] Configurar variables de entorno
- [ ] Cambiar NODE_ENV a production
- [ ] Configurar CORS con tu dominio real
- [ ] Habilitar HTTPS
- [ ] Configurar base de datos PostgreSQL
- [ ] Ejecutar migraciones
- [ ] Verificar health check
- [ ] Configurar backups automáticos
- [ ] Configurar monitoreo (Sentry)

---

## 🆘 Soporte

Si necesitas ayuda con algún paso específico, dime qué opción prefieres y te guío paso a paso.
