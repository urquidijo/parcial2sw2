"""
ms-ml-python — Machine Learning de Habitat Pro (FastAPI, puerto 8003).

  POST /api/v1/ml/predict-price     CU03: precio estimado de un inmueble (random forest)      AGENTE, ADMIN
  POST /api/v1/ml/segment-clients   CU13: segmento de cada cliente (K-means)                    ADMIN
  GET  /api/v1/ml/models            métricas de los dos modelos                                 personal interno
  GET  /api/v1/ml/plots/{archivo}   gráficos de entrenamiento (datos sintéticos, público)
  GET  /health

Valida el token de Keycloak igual que los demás microservicios.
"""
import json
import os
from pathlib import Path
from typing import List, Literal, Optional

os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 1))

import joblib  # noqa: E402
import jwt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from fastapi import Depends, FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from ml import train  # noqa: E402
from ml.data import SEGMENT_FEATURES, ZONE_PRICE_M2, canonical_location  # noqa: E402

ARTIFACTS = train.ARTIFACTS
ISSUER = os.environ.get("KEYCLOAK_ISSUER_URI", "http://localhost:8080/realms/habitat")
STAFF = {"ADMIN", "AGENTE", "LEGAL", "FINANZAS", "ATENCION"}

# Si faltan los modelos (primera vez o despliegue nuevo), se entrenan al arrancar (~30 s).
if not (ARTIFACTS / "price_model.joblib").exists() or not (ARTIFACTS / "segment_model.joblib").exists():
    train.main()

PRICE_MODEL = joblib.load(ARTIFACTS / "price_model.joblib")
SEGMENTS = joblib.load(ARTIFACTS / "segment_model.joblib")
METRICS = json.loads((ARTIFACTS / "metrics.json").read_text(encoding="utf-8"))
JWKS = jwt.PyJWKClient(f"{ISSUER}/protocol/openid-connect/certs", cache_keys=True, lifespan=600)

app = FastAPI(title="ms-ml-python · Habitat Pro", version="1.0.0")


# ------------------------------------------------------------------ seguridad
def effective_role(claims: dict) -> str:
    roles = (claims.get("realm_access") or {}).get("roles") or []
    if "ADMIN" in roles:
        return "ADMIN"
    if "EMPLEADO" in roles:
        return str(claims.get("sector") or "EMPLEADO").upper()
    return "CLIENTE"


def current_role(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Falta el token de Keycloak (Authorization: Bearer ...)")
    token = header[7:]
    try:
        key = JWKS.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER, options={"verify_aud": False})
    except jwt.PyJWKClientError:
        raise HTTPException(503, "No se pudieron obtener las claves de Keycloak")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido o expirado")
    return effective_role(claims)


def require(*roles):
    def checker(role: str = Depends(current_role)) -> str:
        if role not in roles:
            raise HTTPException(403, "Tu rol no tiene permiso para esta operación")
        return role
    return checker


# ------------------------------------------------------------------ CU03 precio
class PriceRequest(BaseModel):
    ciudad: str = Field(min_length=2, max_length=60)
    zona: str = Field(default="", max_length=80)
    tipo: Literal["DEPARTAMENTO", "CASA", "TERRENO", "OFICINA", "LOCAL_COMERCIAL"]
    entrega: Literal["ENTREGA_INMEDIATA", "EN_CONSTRUCCION", "PREVENTA"] = "ENTREGA_INMEDIATA"
    superficie_m2: float = Field(gt=0, le=20000)
    dormitorios: int = Field(default=0, ge=0, le=20)
    banos: int = Field(default=0, ge=0, le=20)
    parqueos: int = Field(default=0, ge=0, le=20)
    comodidades: int = Field(default=0, ge=0, le=30)


@app.post("/api/v1/ml/predict-price")
def predict_price(body: PriceRequest, _role: str = Depends(require("AGENTE", "ADMIN"))):
    city, zone = canonical_location(body.ciudad, body.zona)
    row = pd.DataFrame([{
        "ciudad": city, "ciudad_zona": f"{city}|{zone}", "tipo": body.tipo, "entrega": body.entrega,
        "superficie_m2": body.superficie_m2, "dormitorios": body.dormitorios, "banos": body.banos,
        "parqueos": body.parqueos, "comodidades": body.comodidades,
    }])
    # Rango: percentiles 10 y 90 de las predicciones de los 200 árboles del bosque.
    features = PRICE_MODEL.named_steps["prep"].transform(row)
    per_tree = np.array([tree.predict(features)[0] for tree in PRICE_MODEL.named_steps["rf"].estimators_])
    estimate = float(PRICE_MODEL.predict(row)[0])
    low, high = np.percentile(per_tree, [10, 90])
    round500 = lambda v: int(round(float(v) / 500.0) * 500)  # noqa: E731

    notes = []
    if city == "Otra":
        notes.append("La ciudad no está en los datos del modelo: la estimación es poco confiable.")
    elif zone == "Otra":
        notes.append(f"La zona no está en los datos del modelo: se estimó con el promedio de {city}.")
    return {
        "precio_estimado_usd": round500(estimate),
        "rango_usd": [round500(low), round500(high)],
        "precio_m2_usd": round(estimate / body.superficie_m2),
        "ciudad_modelo": city,
        "zona_modelo": zone,
        "avisos": notes,
        "modelo": METRICS["cu03_precio"]["modelo"],
        "r2_modelo": METRICS["cu03_precio"]["r2"],
    }


# ------------------------------------------------------------------ CU13 segmentos
class ClientActivity(BaseModel):
    id: str = Field(max_length=80)
    nombre: str = Field(default="", max_length=150)
    visitas: float = Field(ge=0)
    consultas: float = Field(ge=0)
    reservas: float = Field(ge=0)
    monto_reservado_usd: float = Field(ge=0)
    presupuesto_usd: float = Field(ge=0)
    dias_inactivo: float = Field(ge=0)
    interes_alquiler: float = Field(ge=0, le=1)


class SegmentRequest(BaseModel):
    clientes: List[ClientActivity] = Field(max_length=5000)


@app.post("/api/v1/ml/segment-clients")
def segment_clients(body: SegmentRequest, _role: str = Depends(require("ADMIN"))):
    names = SEGMENTS["names"]
    profiles = METRICS["cu13_segmentos"]["segmentos"]
    if not body.clientes:
        return {"clientes": [], "resumen": {p["nombre"]: 0 for p in profiles}, "perfiles": profiles}
    matrix = np.array([[getattr(c, f) for f in SEGMENT_FEATURES] for c in body.clientes], dtype=float)
    labels = SEGMENTS["model"].predict(matrix)
    result = [{**c.model_dump(), "segmento": names[int(label)]} for c, label in zip(body.clientes, labels)]
    summary = {p["nombre"]: 0 for p in profiles}
    for r in result:
        summary[r["segmento"]] = summary.get(r["segmento"], 0) + 1
    return {"clientes": result, "resumen": summary, "perfiles": profiles}


# ------------------------------------------------------------------ métricas y gráficos
@app.get("/api/v1/ml/models")
def models(role: str = Depends(current_role)):
    if role not in STAFF:
        raise HTTPException(403, "Solo personal interno")
    return METRICS


@app.get("/api/v1/ml/locations")
def locations(role: str = Depends(current_role)):
    """Ciudades y zonas que conoce el modelo de precios: el formulario de inmuebles las ofrece en listas desplegables."""
    if role not in STAFF:
        raise HTTPException(403, "Solo personal interno")
    return {"ciudades": {city: sorted(zones) for city, zones in ZONE_PRICE_M2.items()}}


PLOTS = {"cu03_precio.png", "cu13_segmentos.png"}


@app.get("/api/v1/ml/plots/{name}")
def plot(name: str):
    if name not in PLOTS:
        raise HTTPException(404, "Gráfico no encontrado")
    return FileResponse(ARTIFACTS / name, media_type="image/png")


@app.get("/health")
def health():
    return {"service": "ms-ml-python", "status": "UP", "modelos": ["cu03_precio (random forest)", "cu13_segmentos (k-means)"]}
