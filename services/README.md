# fut.invest - Python Services

Servicios Python para análisis de mercado y motor de arbitraje.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (HTML/CSS/JS)                    │
│                      Puerto 8000                             │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────┐
│                  Backend API (TypeScript)                    │
│                      Puerto 3001                             │
│  • Autenticación  • Usuarios  • Wallet  • Admin             │
└───────────┬─────────────────────────────┬───────────────────┘
            │ HTTP                        │
            ▼                             ▼
┌───────────────────────┐   ┌─────────────────────────────────┐
│   Python Services     │   │      SQLite / PostgreSQL        │
│   Puerto 3002         │   │                                 │
│                       │   │  • Usuarios  • Transacciones    │
│  • Análisis de mercado│   │  • Contratos  • Configuración   │
│  • Predicción ROI     │   └─────────────────────────────────┘
│  • Motor GoArbit      │
│  • Arbitraje triangular│
└───────────────────────┘
```

## Instalación

```bash
cd services
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac
pip install -e .
```

## Ejecución

```bash
# Windows
start-services.bat

# Linux/Mac
uvicorn main:app --host 0.0.0.0 --port 3002 --reload
```

## Endpoints

### Análisis
- `POST /analyze/roi` - Predicción de ROI
- `GET /analyze/market` - Insights del mercado
- `POST /analyze/portfolio` - Métricas de portafolio

### GoArbit
- `POST /goarbit/scan` - Escanear par
- `POST /goarbit/scan-all` - Escanear todos
- `POST /goarbit/triangular` - Arbitraje triangular
- `POST /goarbit/execute` - Ejecutar arbitraje

## Tecnologías

| Componente | Lenguaje | Librerías |
|---|---|---|
| Análisis | Python | numpy, pandas, scikit-learn |
| GoArbit | Python | ccxt (60+ exchanges) |
| API | Python | FastAPI, uvicorn |
| Backend | TypeScript | Express, better-sqlite3 |
| Frontend | JS vanilla | - |
