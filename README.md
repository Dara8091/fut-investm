# fut.invest — Plataforma de Inversión Profesional

> Sistema institucional de inversión con ROI dinámico, arbitraje automatizado y gestión profesional de portafolio.

## 🚀 Características

- **Dashboard en Tiempo Real**: Balance y ROI dinámico con actualizaciones vía WebSocket
- **Motor de Arbitraje FutInvest**: Escaneo multi-exchange (Binance, OKX, Bybit, KuCoin, Gate.io)
- **Gestión de Billetera**: Depósitos/retiros con validación de direcciones cripto
- **Seguridad Avanzada**: AES-256, TOTP 2FA, rate limiting, WAF
- **Panel de Administración**: Gestión de usuarios, retiros, comisiones
- **Sistema de Referidos**: Códigos únicos con bonificaciones
- **KYC Integrado**: Verificación de identidad con subida de documentos
- **Dual Database**: Compatible con SQLite y PostgreSQL

## 📁 Estructura

```
fut_invest/
├── index.html              # Frontend SPA
├── style.css               # Estilos profesionales
├── app.js                  # Lógica frontend
├── backend/
│   ├── src/
│   │   ├── index.js        # Entry point
│   │   ├── routes/         # Rutas API
│   │   ├── controllers/    # Controladores
│   │   ├── services/       # Servicios (arbitraje, notificaciones, etc.)
│   │   ├── middleware/     # Auth, rate limiting, WAF, etc.
│   │   ├── config/         # DB, logger, swagger
│   │   └── db/             # Migraciones
│   ├── .env                # Variables de entorno
│   └── package.json
├── services/               # Servicios Python opcionales
└── README.md
```

## 🛠️ Instalación

### Backend

```bash
cd backend
npm install
cp .env.example .env  # Configura tus variables
npm run dev
```

### Frontend

Abre `index.html` en un navegador o sirve con:

```bash
python -m http.server 8000
# o
npx http-server -p 8000
```

## 🔧 Variables de Entorno

Ver `backend/.env` para configuración completa. Las principales:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | `3001` |
| `DB_TYPE` | `sqlite` o `postgres` | `sqlite` |
| `JWT_SECRET` | Clave para tokens JWT | (requerido) |
| `FUTINVEST_ENABLED` | Motor de arbitraje activo | `true` |
| `FUTINVEST_AUTO_EXECUTE` | Ejecución automática | `false` |
| `FUTINVEST_MIN_PROFIT_USD` | Ganancia mínima | `1.0` |
| `FUTINVEST_PLATFORM_FEE_PERCENT` | Fee de plataforma | `10` |

## 🧪 Tests

```bash
cd backend
npm test
```

## 📡 API

Documentación Swagger disponible en `/api/docs` cuando el servidor está corriendo.

## 🚀 Deployment

1. Configura `NODE_ENV=production`
2. Genera secretos seguros: `openssl rand -base64 48`
3. Configura base de datos PostgreSQL (opcional)
4. Habilita HTTPS con certificados SSL
5. Configura SMTP para emails

## 📄 Licencia

Privado — fut.invest © 2024
