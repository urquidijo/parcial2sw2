# ms-ml-python (FastAPI + scikit-learn): CU03 precio con random forest y CU13 segmentos con K-means
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml ./ml
COPY app ./app

# Los modelos se entrenan al construir la imagen (datos sintéticos con semilla fija: siempre el mismo resultado)
RUN python -m ml.train

ENV PORT=8003
EXPOSE 8003

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8003}"]
