"""
Arma y ejecuta los notebooks de evidencia de los modelos (quedan guardados con sus resultados y gráficos).

    .venv/Scripts/python -m notebooks.build_notebooks      (desde ms-ml-python/)
"""
from pathlib import Path

import nbformat
from nbconvert.preprocessors import ExecutePreprocessor

HERE = Path(__file__).resolve().parent
md = nbformat.v4.new_markdown_cell
code = nbformat.v4.new_code_cell

SETUP = """%matplotlib inline
import os, sys, warnings
warnings.filterwarnings('ignore')
os.environ.setdefault('LOKY_MAX_CPU_COUNT', str(os.cpu_count() or 1))
sys.path.insert(0, os.path.abspath('..'))
import numpy as np, pandas as pd
import matplotlib.pyplot as plt
pd.set_option('display.float_format', lambda v: f'{v:,.2f}')
plt.rcParams['figure.dpi'] = 100"""

CU03 = [
    md("""# CU03 — Estimar el precio de un inmueble (aprendizaje supervisado)

**Objetivo:** que el agente obtenga un precio sugerido al publicar un inmueble, a partir de ciudad, zona, tipo, superficie y ambientes.

**Modelo:** `RandomForestRegressor` (bosque de 200 árboles de decisión). Se eligió porque:
- maneja bien relaciones no lineales (el precio por m² cambia mucho según la zona),
- no necesita escalar las variables,
- da la **importancia de cada variable** y un **rango** (la dispersión entre árboles).

**Datos:** el sistema todavía no tiene suficientes ventas reales, así que se generan **3.000 inmuebles sintéticos** con una regla de mercado explícita (ver `ml/data.py`):

> precio = m² × USD/m²(zona) × factor(tipo) × factor(entrega) × (1 + 1,5 % por comodidad) + 3.000·dormitorios + 2.500·baños + 4.000·parqueos, con un ruido aleatorio de ±10 %.

Los USD/m² por zona son referencias aproximadas del mercado boliviano; antes de producción conviene calibrarlos con 30–50 avisos reales."""),
    code(SETUP),
    md("## 1. Datos"),
    code("""from ml.data import generate_properties, ZONE_PRICE_M2
df = generate_properties(n=3000, seed=42)
print(df.shape)
df.head(8)"""),
    code("""df.describe()[['superficie_m2', 'dormitorios', 'banos', 'parqueos', 'precio_usd']]"""),
    code("""fig, axes = plt.subplots(1, 2, figsize=(13, 4))
df['precio_usd'].div(1000).plot.hist(bins=40, ax=axes[0], color='#1d4ed8', title='Distribución del precio (miles USD)')
(df.assign(usd_m2=df.precio_usd / df.superficie_m2)
   .groupby('ciudad')['usd_m2'].median().sort_values()
   .plot.barh(ax=axes[1], color='#1d4ed8', title='USD por m² (mediana) por ciudad'))
plt.tight_layout(); plt.show()"""),
    md("""## 2. Preparación y entrenamiento

- Variables categóricas (`ciudad`, `ciudad_zona`, `tipo`, `entrega`) → **one-hot**. Se usa `ciudad_zona` porque "Centro" de La Paz no vale lo mismo que "Centro" de Sucre.
- Variables numéricas (superficie, dormitorios, baños, parqueos, comodidades) → sin transformar.
- División **80 % entrenamiento / 20 % prueba**; el modelo nunca ve los datos de prueba al entrenar."""),
    code("""from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from ml.train import add_price_features, PRICE_CAT, PRICE_NUM

data = add_price_features(df)
X, y = data[PRICE_CAT + PRICE_NUM], data['precio_usd']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = Pipeline([
    ('prep', ColumnTransformer([('cat', OneHotEncoder(handle_unknown='ignore'), PRICE_CAT), ('num', 'passthrough', PRICE_NUM)])),
    ('rf', RandomForestRegressor(n_estimators=200, min_samples_leaf=3, random_state=42, n_jobs=-1)),
])
model.fit(X_train, y_train)
print('Entrenado con', len(X_train), 'inmuebles; prueba con', len(X_test))"""),
    md("## 3. Evaluación"),
    code("""from sklearn.metrics import r2_score, mean_absolute_error, mean_absolute_percentage_error
pred = model.predict(X_test)
cv = cross_val_score(model, X, y, cv=5, scoring='r2', n_jobs=-1)
print(f'R² (prueba):              {r2_score(y_test, pred):.3f}')
print(f'Error absoluto medio:     {mean_absolute_error(y_test, pred):,.0f} USD')
print(f'Error porcentual medio:   {mean_absolute_percentage_error(y_test, pred):.1%}')
print(f'R² validación cruzada (5): {cv.round(3)}  → promedio {cv.mean():.3f}')"""),
    md("""**Lectura:** un R² cercano a 0,9 significa que el modelo explica alrededor del 90 % de la variación de precios. El error porcentual (~15 %) está cerca del ruido de ±10 % que se le puso a los datos: el modelo aprendió la regla sin memorizar el ruido. La validación cruzada da valores parecidos en los 5 cortes, así que el resultado no depende de una división con suerte."""),
    code("""fig, ax = plt.subplots(figsize=(6, 5))
ax.scatter(y_test / 1000, pred / 1000, s=8, alpha=0.5, color='#1d4ed8')
lim = [0, max(y_test.max(), pred.max()) / 1000 * 1.05]
ax.plot(lim, lim, '--', color='#71717a'); ax.set(xlabel='Precio real (miles USD)', ylabel='Precio estimado (miles USD)', title='Real vs. estimado')
plt.show()"""),
    md("## 4. ¿Qué variables pesan más?"),
    code("""names = model.named_steps['prep'].get_feature_names_out()
imp = {}
for name, value in zip(names, model.named_steps['rf'].feature_importances_):
    feature = name.split('__', 1)[1]
    base = next((c for c in sorted(PRICE_CAT, key=len, reverse=True) if feature.startswith(c + '_')), feature)
    imp[base] = imp.get(base, 0) + value
pd.Series(imp).sort_values().plot.barh(color='#1d4ed8', figsize=(7, 4), title='Importancia de cada variable')
plt.show()"""),
    md("""La **superficie** y la **zona** explican la mayor parte del precio, como en el mercado real; dormitorios y tipo ajustan, y el resto (parqueos, comodidades, entrega) aporta poco."""),
    md("## 5. Ejemplos (lo mismo que hace el botón «Estimar precio»)"),
    code("""ejemplos = pd.DataFrame([
    {'ciudad': 'Santa Cruz', 'zona': 'Equipetrol', 'tipo': 'DEPARTAMENTO', 'entrega': 'ENTREGA_INMEDIATA', 'superficie_m2': 96, 'dormitorios': 2, 'banos': 2, 'parqueos': 1, 'comodidades': 4},
    {'ciudad': 'La Paz', 'zona': 'Calacoto', 'tipo': 'DEPARTAMENTO', 'entrega': 'ENTREGA_INMEDIATA', 'superficie_m2': 96, 'dormitorios': 2, 'banos': 2, 'parqueos': 1, 'comodidades': 4},
    {'ciudad': 'Santa Cruz', 'zona': 'Plan 3000', 'tipo': 'CASA', 'entrega': 'ENTREGA_INMEDIATA', 'superficie_m2': 150, 'dormitorios': 3, 'banos': 2, 'parqueos': 1, 'comodidades': 1},
    {'ciudad': 'Cochabamba', 'zona': 'Queru Queru', 'tipo': 'TERRENO', 'entrega': 'ENTREGA_INMEDIATA', 'superficie_m2': 400, 'dormitorios': 0, 'banos': 0, 'parqueos': 0, 'comodidades': 0},
])
ejemplos['precio_estimado_usd'] = model.predict(add_price_features(ejemplos)[PRICE_CAT + PRICE_NUM]).round(-2)
ejemplos"""),
    md("""## Conclusión

- El random forest estima precios con **R² ≈ 0,9** y un error medio de ~15 %, suficiente para sugerir un precio inicial que el agente ajusta.
- El servicio `ms-ml-python` usa este mismo modelo en `POST /api/v1/ml/predict-price` y devuelve también un **rango** (percentiles 10–90 de los 200 árboles).
- **Límite honesto:** la calidad depende de que los USD/m² por zona reflejen el mercado; con avisos reales se recalibra la tabla y se reentrena con `python -m ml.train`."""),
]

CU13 = [
    md("""# CU13 — Segmentar clientes según su comportamiento (aprendizaje no supervisado)

**Objetivo:** que el Administrador vea qué tipos de clientes tiene, para orientar la atención y las campañas.

**Modelo:** `K-means`. Es **no supervisado**: no recibe la respuesta correcta, solo agrupa a los clientes que se parecen. (La regresión lineal o logística son supervisadas, por eso no sirven para este caso de uso).

**Variables por cliente** (las calcula el gateway con la actividad real de cada cliente):

| Variable | Significado |
|---|---|
| visitas | visitas agendadas |
| consultas | preguntas enviadas a los asesores |
| reservas | reservas con arras |
| monto_reservado_usd | suma de arras depositadas |
| presupuesto_usd | precio promedio de los inmuebles que le interesaron |
| dias_inactivo | días desde su última actividad |
| interes_alquiler | proporción de su interés puesta en alquileres (0 a 1) |

**Datos de entrenamiento:** 900 clientes sintéticos mezclando 4 perfiles típicos de una inmobiliaria (*inversionista, primera vivienda, inquilino, curioso*). La columna `perfil_real` **no** se usa para entrenar: solo sirve al final para comprobar si K-means encontró esos grupos por sí solo."""),
    code(SETUP),
    md("## 1. Datos"),
    code("""from ml.data import generate_clients, SEGMENT_FEATURES
df = generate_clients(n=900, seed=7)
df.head(8)"""),
    code("""df.groupby('perfil_real')[SEGMENT_FEATURES].mean()"""),
    md("""## 2. Escalado (el paso que más se olvida)

K-means mide **distancias**. Si no se escalan las variables, el presupuesto (cientos de miles de USD) domina todo y las visitas (0 a 10) no pesan nada.

1. **log(1 + x)** en los montos: un presupuesto de compra (~100.000) y uno de alquiler (~700) quedan en escalas comparables.
2. **StandardScaler**: cada variable queda con media 0 y desvío 1."""),
    code("""from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from ml.features import log_money
X = df[SEGMENT_FEATURES].to_numpy(dtype=float)
prep = Pipeline([('log', FunctionTransformer(log_money)), ('scale', StandardScaler())])
Xs = prep.fit_transform(X)
pd.DataFrame(Xs, columns=SEGMENT_FEATURES).describe().loc[['mean', 'std']].round(2)"""),
    md("""## 3. ¿Cuántos grupos? Método del codo + silhouette

- **Inercia (codo):** qué tan compactos son los grupos. Siempre baja al sumar grupos; se busca el punto donde deja de bajar mucho.
- **Silhouette:** de −1 a 1, qué tan separados están los grupos entre sí."""),
    code("""from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
ks = list(range(2, 9)); inertias, sils = [], []
for k in ks:
    km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(Xs)
    inertias.append(km.inertia_); sils.append(silhouette_score(Xs, km.labels_))
tabla = pd.DataFrame({'k': ks, 'inercia': inertias, 'silhouette': sils})
tabla['mejora_inercia'] = (-tabla['inercia'].pct_change().shift(-1)).round(3)
tabla"""),
    code("""fig, axes = plt.subplots(1, 2, figsize=(12, 4))
axes[0].plot(ks, inertias, 'o-', color='#1d4ed8'); axes[0].set(title='Método del codo', xlabel='k', ylabel='Inercia')
axes[1].plot(ks, sils, 'o-', color='#047857'); axes[1].set(title='Silhouette', xlabel='k', ylabel='Silhouette')
plt.tight_layout(); plt.show()"""),
    md("""**Decisión:** el codo está en **k = 4**: hasta 4 grupos la inercia baja ~30 % por cada grupo nuevo, y desde ahí apenas ~11 %. La silhouette de k = 3 y k = 4 está prácticamente empatada (≈0,447 vs ≈0,445), así que se elige k = 4, que además separa a los compradores de primera vivienda de los inversionistas (útil para el negocio). La regla está automatizada en `ml/train.py → choose_k`."""),
    code("""from ml.train import choose_k
best_k = choose_k(ks, inertias, sils)
print('k elegido:', best_k)"""),
    md("## 4. Entrenamiento y perfil de cada grupo"),
    code("""from ml.train import name_clusters
model = Pipeline([('prep', prep), ('kmeans', KMeans(n_clusters=best_k, n_init=10, random_state=42))])
labels = model.fit_predict(X)
centroides = [{f: df.loc[labels == c, f].mean() for f in SEGMENT_FEATURES} for c in range(best_k)]
nombres = name_clusters(centroides)
perfil = pd.DataFrame(centroides).assign(segmento=[nombres[c] for c in range(best_k)], clientes=[int((labels == c).sum()) for c in range(best_k)]).set_index('segmento')
perfil"""),
    md("""Los nombres se asignan leyendo cada centroide: el grupo con más interés en alquiler es **Inquilino**, el más inactivo es **Curioso**, el de mayor presupuesto es **Inversionista** y el restante es **Primera vivienda**."""),
    md("## 5. Visualización en 2D (PCA)"),
    code("""from sklearn.decomposition import PCA
pts = PCA(n_components=2, random_state=42).fit_transform(prep.transform(X))
fig, ax = plt.subplots(figsize=(7, 5))
colores = ['#1d4ed8', '#047857', '#b45309', '#be123c', '#7c3aed']
for c in range(best_k):
    m = labels == c
    ax.scatter(pts[m, 0], pts[m, 1], s=10, alpha=0.6, color=colores[c % 5], label=nombres[c])
ax.set(title='Clientes proyectados en 2D', xlabel='Componente 1', ylabel='Componente 2'); ax.legend(); plt.show()"""),
    md("## 6. ¿Encontró los perfiles reales? (solo evaluación)"),
    code("""from sklearn.metrics import adjusted_rand_score
print('ARI (1 = coincidencia perfecta, 0 = al azar):', round(adjusted_rand_score(df['perfil_real'], labels), 3))
pd.crosstab(df['perfil_real'], pd.Series([nombres[l] for l in labels], name='segmento K-means'))"""),
    md("""## Conclusión

- K-means encontró **4 segmentos** sin conocer las etiquetas, con una coincidencia **ARI ≈ 0,93** con los perfiles reales.
- El gateway calcula estas 7 variables para cada cliente real del sistema (visitas, consultas, reservas, contratos) y `ms-ml-python` los clasifica en `POST /api/v1/ml/segment-clients`; el Administrador lo ve en la pestaña **Segmentos**.
- **Límite honesto:** hoy hay pocos clientes reales; con más actividad conviene reentrenar el modelo con datos reales en lugar de sintéticos."""),
]


def build(name, cells):
    nb = nbformat.v4.new_notebook()
    nb.cells = cells
    nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
    ExecutePreprocessor(timeout=600, kernel_name="python3").preprocess(nb, {"metadata": {"path": str(HERE)}})
    path = HERE / name
    nbformat.write(nb, path)
    print("Notebook ejecutado:", path)


if __name__ == "__main__":
    build("CU03_precio_random_forest.ipynb", CU03)
    build("CU13_segmentacion_kmeans.ipynb", CU13)
