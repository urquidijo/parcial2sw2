"""
Entrena los dos modelos de Habitat Pro y guarda modelos, métricas y gráficos en artifacts/.

    python -m ml.train

CU03 (supervisado):     RandomForestRegressor que estima el precio de un inmueble.
CU13 (no supervisado):  K-means que agrupa clientes por comportamiento.
"""
import json
import os
from pathlib import Path

os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 1))

import joblib
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.cluster import KMeans  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.decomposition import PCA  # noqa: E402
from sklearn.ensemble import RandomForestRegressor  # noqa: E402
from sklearn.metrics import (adjusted_rand_score, mean_absolute_error,  # noqa: E402
                             mean_absolute_percentage_error, r2_score, silhouette_score)
from sklearn.model_selection import cross_val_score, train_test_split  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler  # noqa: E402

from ml.data import SEGMENT_FEATURES, generate_clients, generate_properties  # noqa: E402
from ml.features import log_money  # noqa: E402

ARTIFACTS = Path(__file__).resolve().parent.parent / "artifacts"
SEED = 42

# El precio depende de la zona dentro de su ciudad ("Centro" de La Paz no es "Centro" de Sucre).
PRICE_CAT = ["ciudad", "ciudad_zona", "tipo", "entrega"]
PRICE_NUM = ["superficie_m2", "dormitorios", "banos", "parqueos", "comodidades"]
FEATURE_LABELS = {
    "ciudad": "Ciudad", "ciudad_zona": "Zona", "tipo": "Tipo", "entrega": "Entrega",
    "superficie_m2": "Superficie", "dormitorios": "Dormitorios", "banos": "Baños", "parqueos": "Parqueos", "comodidades": "Comodidades",
}
def add_price_features(df):
    df = df.copy()
    df["ciudad_zona"] = df["ciudad"] + "|" + df["zona"]
    return df


# ---------------------------------------------------------------------------------------------
# CU03 — Random forest de precios
# ---------------------------------------------------------------------------------------------
def train_price_model():
    df = add_price_features(generate_properties(n=3000, seed=SEED))
    X, y = df[PRICE_CAT + PRICE_NUM], df["precio_usd"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED)

    model = Pipeline([
        ("prep", ColumnTransformer([
            ("cat", OneHotEncoder(handle_unknown="ignore"), PRICE_CAT),
            ("num", "passthrough", PRICE_NUM),
        ])),
        ("rf", RandomForestRegressor(n_estimators=200, min_samples_leaf=3, random_state=SEED, n_jobs=-1)),
    ])
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    cv_r2 = cross_val_score(model, X, y, cv=5, scoring="r2", n_jobs=-1)

    # Importancia por variable original (suma de sus columnas one-hot)
    names = model.named_steps["prep"].get_feature_names_out()
    raw = model.named_steps["rf"].feature_importances_
    importance = {}
    by_length = sorted(PRICE_CAT, key=len, reverse=True)  # "ciudad_zona_..." antes que "ciudad_..."
    for name, value in zip(names, raw):
        feature = name.split("__", 1)[1]
        base = next((c for c in by_length if feature.startswith(c + "_")), feature)
        label = FEATURE_LABELS.get(base, base)
        importance[label] = importance.get(label, 0) + float(value)
    importance = dict(sorted(importance.items(), key=lambda kv: -kv[1]))

    metrics = {
        "modelo": "RandomForestRegressor (200 árboles)",
        "filas_entrenamiento": int(len(X_train)),
        "filas_prueba": int(len(X_test)),
        "r2": round(float(r2_score(y_test, pred)), 4),
        "mae_usd": round(float(mean_absolute_error(y_test, pred)), 0),
        "mape": round(float(mean_absolute_percentage_error(y_test, pred)), 4),
        "r2_validacion_cruzada": [round(float(v), 4) for v in cv_r2],
        "importancia_variables": {k: round(v, 4) for k, v in importance.items()},
    }

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))
    axes[0].scatter(y_test / 1000, pred / 1000, s=8, alpha=0.5, color="#1d4ed8")
    lim = [0, max(y_test.max(), pred.max()) / 1000 * 1.05]
    axes[0].plot(lim, lim, color="#71717a", linewidth=1, linestyle="--")
    axes[0].set(title=f"Precio real vs. estimado (R² = {metrics['r2']:.3f})", xlabel="Real (miles USD)", ylabel="Estimado (miles USD)")
    labels, values = list(importance)[::-1], list(importance.values())[::-1]
    axes[1].barh(labels, values, color="#1d4ed8")
    axes[1].set(title="Importancia de cada variable", xlabel="Importancia")
    fig.tight_layout()
    fig.savefig(ARTIFACTS / "cu03_precio.png", dpi=110)
    plt.close(fig)

    joblib.dump(model, ARTIFACTS / "price_model.joblib", compress=3)
    return metrics


# ---------------------------------------------------------------------------------------------
# CU13 — K-means de clientes
# ---------------------------------------------------------------------------------------------
def name_clusters(centroids):
    """Nombra cada grupo según su centroide (en unidades originales)."""
    names = {}
    remaining = list(range(len(centroids)))

    def take(name, key, reverse=True):
        if not remaining:
            return
        idx = sorted(remaining, key=lambda i: centroids[i][key], reverse=reverse)[0]
        names[idx] = name
        remaining.remove(idx)

    take("Inquilino", "interes_alquiler")
    take("Curioso", "dias_inactivo")
    take("Inversionista", "presupuesto_usd")
    take("Primera vivienda", "visitas")
    for i in remaining:
        names[i] = f"Segmento {i + 1}"
    return names


def choose_k(ks, inertias, silhouettes, min_gain=0.15, tolerance=0.05):
    """Codo: el primer k a partir del cual sumar un grupo reduce la inercia menos de un 15 %.
    Se acepta si su silhouette está a menos de un 5 % del máximo; si no, se usa el k de mejor silhouette."""
    best_silhouette = max(silhouettes)
    for i in range(len(ks) - 1):
        gain = (inertias[i] - inertias[i + 1]) / inertias[i]
        if gain < min_gain:
            if silhouettes[i] >= best_silhouette * (1 - tolerance):
                return ks[i]
            break
    return ks[int(np.argmax(silhouettes))]


def train_segment_model():
    df = generate_clients(n=900, seed=7)
    X = df[SEGMENT_FEATURES].to_numpy(dtype=float)
    prep = Pipeline([("log", FunctionTransformer(log_money)), ("scale", StandardScaler())])
    Xs = prep.fit_transform(X)

    # Método del codo + silhouette para elegir k
    ks = list(range(2, 9))
    inertias, silhouettes = [], []
    for k in ks:
        km = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Xs)
        inertias.append(float(km.inertia_))
        silhouettes.append(float(silhouette_score(Xs, km.labels_)))
    best_k = choose_k(ks, inertias, silhouettes)

    model = Pipeline([("prep", prep), ("kmeans", KMeans(n_clusters=best_k, n_init=10, random_state=SEED))])
    labels = model.fit_predict(X)
    centroids = [
        {f: float(df.loc[labels == c, f].mean()) for f in SEGMENT_FEATURES} | {"clientes": int((labels == c).sum())}
        for c in range(best_k)
    ]
    names = name_clusters(centroids)

    metrics = {
        "modelo": f"KMeans (k = {best_k}) con StandardScaler y log de montos",
        "clientes": int(len(df)),
        "variables": SEGMENT_FEATURES,
        "k_elegido": best_k,
        "silhouette": round(silhouettes[ks.index(best_k)], 4),
        "codo": {str(k): round(v, 1) for k, v in zip(ks, inertias)},
        "silhouette_por_k": {str(k): round(v, 4) for k, v in zip(ks, silhouettes)},
        # Solo evaluación: K-means no usó estas etiquetas para entrenar
        "acuerdo_con_perfiles_reales_ari": round(float(adjusted_rand_score(df["perfil_real"], labels)), 4),
        "segmentos": [
            {"id": c, "nombre": names[c], **{k: round(v, 2) for k, v in centroids[c].items()}} for c in range(best_k)
        ],
    }

    fig, axes = plt.subplots(1, 3, figsize=(16, 4.6))
    axes[0].plot(ks, inertias, marker="o", color="#1d4ed8")
    axes[0].set(title="Método del codo", xlabel="k (número de grupos)", ylabel="Inercia")
    axes[1].plot(ks, silhouettes, marker="o", color="#047857")
    axes[1].axvline(best_k, color="#71717a", linestyle="--", linewidth=1)
    axes[1].set(title=f"Silhouette (k elegido = {best_k})", xlabel="k", ylabel="Silhouette")
    points = PCA(n_components=2, random_state=SEED).fit_transform(model.named_steps["prep"].transform(X))
    palette = ["#1d4ed8", "#047857", "#b45309", "#be123c", "#7c3aed", "#0e7490", "#4d7c0f", "#a16207"]
    for c in range(best_k):
        mask = labels == c
        axes[2].scatter(points[mask, 0], points[mask, 1], s=10, alpha=0.6, color=palette[c % len(palette)], label=names[c])
    axes[2].set(title="Clientes proyectados en 2D (PCA)", xlabel="Componente 1", ylabel="Componente 2")
    axes[2].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(ARTIFACTS / "cu13_segmentos.png", dpi=110)
    plt.close(fig)

    joblib.dump({"model": model, "names": names}, ARTIFACTS / "segment_model.joblib", compress=3)
    return metrics


def main():
    # Sin ventana gráfica (servidor o consola). Se cambia aquí y no al importar, para no apagar los gráficos de los notebooks.
    plt.switch_backend("Agg")
    ARTIFACTS.mkdir(exist_ok=True)
    metrics = {"cu03_precio": train_price_model(), "cu13_segmentos": train_segment_model()}
    (ARTIFACTS / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    p, s = metrics["cu03_precio"], metrics["cu13_segmentos"]
    print(f"CU03 precio:    R² = {p['r2']}  MAE = {p['mae_usd']:,.0f} USD  MAPE = {p['mape']:.1%}  CV R² = {np.mean(p['r2_validacion_cruzada']):.3f}")
    print(f"CU13 segmentos: k = {s['k_elegido']}  silhouette = {s['silhouette']}  ARI vs perfiles = {s['acuerdo_con_perfiles_reales_ari']}")
    for seg in s["segmentos"]:
        print(f"   - {seg['nombre']}: {seg['clientes']} clientes · presupuesto {seg['presupuesto_usd']:,.0f} USD · alquiler {seg['interes_alquiler']:.2f} · inactivo {seg['dias_inactivo']:.0f} días")


if __name__ == "__main__":
    main()
