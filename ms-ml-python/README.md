# ms-ml-python — Machine Learning de Habitat Pro

Microservicio en **FastAPI** (puerto 8003) con los dos modelos del proyecto:

| CU | Tipo | Modelo | Endpoint | Quién |
|---|---|---|---|---|
| CU03 Predecir precio | Supervisado | `RandomForestRegressor` (200 árboles) | `POST /api/v1/ml/predict-price` | Agente, Admin |
| CU13 Segmentar clientes | No supervisado | `KMeans` (k = 4) con `StandardScaler` | `POST /api/v1/ml/segment-clients` | Admin |

Otros: `GET /api/v1/ml/models` (métricas), `GET /api/v1/ml/plots/{archivo}` (gráficos), `GET /health`, documentación interactiva en `/docs`. Valida el token de Keycloak como los demás microservicios. El gateway lo expone como `/api/ml/*`.

## Resultados

- **CU03:** R² = 0,89 en prueba (0,91 en validación cruzada de 5), error medio ≈ 30.000 USD (14,5 %). Las variables que más pesan son superficie (58 %) y zona (21 %).
- **CU13:** k = 4 elegido por el método del codo (silhouette 0,445, prácticamente igual a la de k = 3). Coincide con los perfiles reales en ARI = 0,93: *Inversionista, Primera vivienda, Inquilino, Curioso*.

La evidencia paso a paso, con gráficos, está en los notebooks:
- `notebooks/CU03_precio_random_forest.ipynb`
- `notebooks/CU13_segmentacion_kmeans.ipynb`

## Datos

Son **sintéticos**, con reglas de mercado explícitas en `ml/data.py`, porque el sistema todavía no tiene suficientes operaciones reales. Los USD/m² por zona son referencias aproximadas; para producción conviene calibrarlos con avisos reales y reentrenar.

## Correrlo en local

```powershell
cd ms-ml-python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m ml.train          # entrena y guarda artifacts/ (también se hace solo al arrancar si faltan)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8003
```

`start-all.ps1` lo levanta si existe `.venv`.

Para regenerar los notebooks (con sus resultados): `pip install -r requirements-notebooks.txt` y `python -m notebooks.build_notebooks`.

| Variable | Valor por defecto |
|---|---|
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8080/realms/habitat` |
| `PORT` (solo Docker) | `8003` |
