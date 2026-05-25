# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto sigue [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-01-15

### ✨ Agregado
- Motor de arbitraje FutInvest multi-exchange (Binance, OKX, Bybit, KuCoin, Gate.io)
- Arbitraje triangular (USDT → BTC → ETH → USDT)
- Perfil de usuario con sub-tabs: Resumen, FutInvest, Actividad, Seguridad, Ajustes
- Sistema de referidos con códigos únicos y bonificaciones
- KYC integrado con subida de documentos
- Panel de administración completo
- WebSocket para ROI en tiempo real
- Rate limiting por usuario/ruta/IP
- WAF (Web Application Firewall)
- Soporte dual SQLite/PostgreSQL
- Skeleton loaders y estados de carga
- Empty states profesionales
- Animaciones y transiciones mejoradas
- Responsive design para móvil/tablet/desktop

### 🔧 Cambiado
- Rebranding de GoArbit a FutInvest
- Rutas API actualizadas: `/api/futinvest`, `/api/futinvest-profile`
- Variables de entorno renombradas: `GOARBIT_*` → `FUTINVEST_*`
- Mejoras en manejo de errores UI
- Transiciones de página más suaves

### 🐛 Corregido
- Doble deducción de balance en aprobación de retiros
- Mismatch sync/async en verificación TOTP
- Compatibilidad SQL `NOW()` → `datetime('now')` para SQLite
- Validación de paginación

### 🗑️ Eliminado
- Referencias a GoArbit en frontend y backend

---

## [1.0.0] - 2023-12-01

### ✨ Agregado
- Dashboard con balance y ROI dinámico
- Billetera con depósitos/retiros cripto
- Centro de seguridad con AES-256 y TOTP 2FA
- Árbol binario interactivo para red de referidos
- Calculadora ROI interactiva
- Validador de direcciones cripto con Regex
- Simulador 2FA TOTP
- Tema oscuro/claro
