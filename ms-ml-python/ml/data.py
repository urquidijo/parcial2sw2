"""
Datos sintéticos para entrenar los modelos de Habitat Pro.

No hay suficientes operaciones reales en el sistema para entrenar un modelo, así que se generan datos con
reglas de mercado explícitas (documentadas aquí y en los notebooks). Los valores de USD por m² son
referencias aproximadas de mercado de Bolivia; conviene calibrarlos con 30–50 avisos reales de portales
inmobiliarios antes de usar el modelo en producción.
"""
import unicodedata

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------------------------
# CU03 — Precio de inmuebles
# ---------------------------------------------------------------------------------------------

# USD por m² construido de un departamento estándar, por ciudad y zona (referencia aproximada).
ZONE_PRICE_M2 = {
    "Santa Cruz": {"Equipetrol": 1500, "Urubó": 1350, "Las Palmas": 1150, "Centro": 1000, "Norte": 950, "Sur": 700, "Plan 3000": 480},
    "La Paz": {"Calacoto": 1650, "San Miguel": 1550, "Sopocachi": 1300, "Miraflores": 1050, "Centro": 950, "Villa Fátima": 750},
    "Cochabamba": {"Queru Queru": 1150, "Cala Cala": 1050, "Centro": 880, "Tiquipaya": 780, "Sacaba": 600},
    "El Alto": {"Ciudad Satélite": 520, "Centro": 450},
    "Tarija": {"Centro": 850, "San Roque": 780},
    "Sucre": {"Centro": 800, "Recoleta": 900},
}

# Multiplicador del precio por m² según tipo, y rango de superficie típica (m²).
PROPERTY_TYPES = {
    "DEPARTAMENTO": {"mult": 1.00, "area": (40, 220)},
    "CASA": {"mult": 0.90, "area": (90, 450)},
    "TERRENO": {"mult": 0.32, "area": (200, 1500)},
    "OFICINA": {"mult": 1.05, "area": (30, 300)},
    "LOCAL_COMERCIAL": {"mult": 1.20, "area": (25, 400)},
}
DELIVERY_FACTOR = {"ENTREGA_INMEDIATA": 1.00, "EN_CONSTRUCCION": 0.93, "PREVENTA": 0.88}

PRICE_FEATURES_CAT = ["ciudad", "zona", "tipo", "entrega"]
PRICE_FEATURES_NUM = ["superficie_m2", "dormitorios", "banos", "parqueos", "comodidades"]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return " ".join(text.lower().split())


def canonical_location(city: str, zone: str) -> tuple:
    """Lleva ciudad y zona escritas a mano ("santa cruz", "Equipetrol Norte") a los nombres del modelo.
    Si la zona no se conoce devuelve "Otra" (el modelo usa entonces solo la ciudad)."""
    city_key = next((c for c in ZONE_PRICE_M2 if _norm(c) == _norm(city) or _norm(c) in _norm(city)), None)
    if city_key is None:
        return "Otra", "Otra"
    z = _norm(zone)
    for known in ZONE_PRICE_M2[city_key]:
        k = _norm(known)
        if z and (k == z or k in z or z in k):
            return city_key, known
    return city_key, "Otra"


def generate_properties(n: int = 3000, seed: int = 42) -> pd.DataFrame:
    """Genera n inmuebles con la regla de precio:
    precio = m² × USD/m²(zona) × tipo × entrega × (1 + 1,5 % por comodidad)
             + 3.000 por dormitorio + 2.500 por baño + 4.000 por parqueo,  con ruido ±10 % (lognormal).
    """
    rng = np.random.default_rng(seed)
    cities = list(ZONE_PRICE_M2)
    city_weights = np.array([0.32, 0.25, 0.2, 0.08, 0.08, 0.07])
    types = list(PROPERTY_TYPES)
    type_weights = np.array([0.42, 0.28, 0.12, 0.1, 0.08])
    rows = []
    for _ in range(n):
        city = rng.choice(cities, p=city_weights)
        zone = rng.choice(list(ZONE_PRICE_M2[city]))
        ptype = rng.choice(types, p=type_weights)
        lo, hi = PROPERTY_TYPES[ptype]["area"]
        area = float(np.round(rng.uniform(lo, hi), 0))
        if ptype in ("DEPARTAMENTO", "CASA"):
            rooms = int(np.clip(round(area / 45 + rng.normal(0, 0.7)), 1, 7))
            baths = int(np.clip(round(rooms * 0.8 + rng.normal(0, 0.5)), 1, 6))
            parking = int(np.clip(round(area / 120 + rng.normal(0, 0.6)), 0, 4))
        elif ptype == "TERRENO":
            rooms, baths, parking = 0, 0, 0
        else:
            rooms = 0
            baths = int(np.clip(round(area / 100 + rng.normal(0, 0.5)), 1, 4))
            parking = int(np.clip(round(area / 150 + rng.normal(0, 0.5)), 0, 3))
        amenities = 0 if ptype == "TERRENO" else int(rng.integers(0, 9))
        delivery = rng.choice(list(DELIVERY_FACTOR), p=[0.7, 0.15, 0.15]) if ptype != "TERRENO" else "ENTREGA_INMEDIATA"

        price_m2 = ZONE_PRICE_M2[city][zone] * PROPERTY_TYPES[ptype]["mult"] * DELIVERY_FACTOR[delivery]
        price = area * price_m2 * (1 + 0.015 * amenities) + rooms * 3000 + baths * 2500 + parking * 4000
        price *= rng.lognormal(mean=0, sigma=0.10)
        rows.append({
            "ciudad": city, "zona": zone, "tipo": ptype, "entrega": delivery,
            "superficie_m2": area, "dormitorios": rooms, "banos": baths, "parqueos": parking,
            "comodidades": amenities, "precio_usd": round(price, -2),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------------------------
# CU13 — Segmentación de clientes
# ---------------------------------------------------------------------------------------------

SEGMENT_FEATURES = [
    "visitas",             # visitas agendadas
    "consultas",           # consultas enviadas a asesores
    "reservas",            # reservas con arras realizadas
    "monto_reservado_usd", # suma de arras depositadas
    "presupuesto_usd",     # precio promedio de los inmuebles que le interesaron
    "dias_inactivo",       # días desde su última actividad
    "interes_alquiler",    # proporción de su interés puesto en alquileres (0 a 1)
]

# Perfil esperado de cada tipo de cliente: media y desvío de cada variable (mismo orden que SEGMENT_FEATURES).
SEGMENT_PROFILES = {
    "Inversionista": {"share": 0.18, "mean": [8, 3, 3.0, 22000, 330000, 10, 0.10], "std": [2, 1.5, 1.0, 7000, 80000, 6, 0.08]},
    "Primera vivienda": {"share": 0.32, "mean": [3, 4, 1.0, 4000, 90000, 25, 0.15], "std": [1.2, 1.5, 0.4, 1500, 25000, 12, 0.10]},
    "Inquilino": {"share": 0.25, "mean": [3, 2, 0.3, 600, 650, 25, 0.90], "std": [1.2, 1.2, 0.5, 600, 250, 15, 0.08]},
    "Curioso": {"share": 0.25, "mean": [0.6, 2.5, 0.0, 0, 90000, 120, 0.40], "std": [0.7, 1.5, 0.1, 50, 50000, 50, 0.25]},
}


def generate_clients(n: int = 900, seed: int = 7) -> pd.DataFrame:
    """Genera n clientes mezclando los 4 perfiles. La columna "perfil_real" solo sirve para evaluar:
    K-means no la ve (es aprendizaje no supervisado)."""
    rng = np.random.default_rng(seed)
    rows = []
    for name, profile in SEGMENT_PROFILES.items():
        count = int(round(n * profile["share"]))
        values = rng.normal(profile["mean"], profile["std"], size=(count, len(SEGMENT_FEATURES)))
        for v in values:
            row = dict(zip(SEGMENT_FEATURES, v))
            for k in ("visitas", "consultas", "reservas", "dias_inactivo"):
                row[k] = max(0, round(row[k]))
            row["monto_reservado_usd"] = max(0.0, round(row["monto_reservado_usd"], -1)) if row["reservas"] > 0 else 0.0
            row["presupuesto_usd"] = max(300.0, round(row["presupuesto_usd"], -1))
            row["interes_alquiler"] = float(np.clip(row["interes_alquiler"], 0, 1))
            row["perfil_real"] = name
            rows.append(row)
    return pd.DataFrame(rows).sample(frac=1, random_state=seed).reset_index(drop=True)
