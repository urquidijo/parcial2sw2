"""
Transformaciones que forman parte de los modelos guardados.

Viven en su propio módulo (no en ml/train.py) para que el modelo serializado con joblib las encuentre al
cargarlo desde la API: si se definieran en el script que se ejecuta con `python -m`, quedarían guardadas
como `__main__.log_money` y la API no podría cargarlas.
"""
import numpy as np

from ml.data import SEGMENT_FEATURES

MONEY_COLS = [SEGMENT_FEATURES.index("monto_reservado_usd"), SEGMENT_FEATURES.index("presupuesto_usd")]


def log_money(x):
    """log(1 + x) en las columnas de montos: compra (cientos de miles) y alquiler (cientos) quedan en escala comparable."""
    x = np.array(x, dtype=float)
    x[:, MONEY_COLS] = np.log1p(np.clip(x[:, MONEY_COLS], 0, None))
    return x
