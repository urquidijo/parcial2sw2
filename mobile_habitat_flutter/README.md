# Habitat Pro Mobile (Flutter)

Aplicación móvil para clientes de **Habitat Pro** conectada directamente a los microservicios desplegados en la nube (**Railway API Gateway**, **Keycloak SSO**, **MongoDB Atlas**, **Amazon S3 `sw2p2`**, **Amazon DynamoDB** y **Azure PostgreSQL**).

---

## Características implementadas

1. **Experiencia 100 % Cliente (sin importar el rol)**:
   - Tanto si ingresas con una cuenta de `CLIENTE` (`juan.comprador@habitat.pro`), una cuenta recién registrada o una cuenta `ADMIN`, la app móvil presenta exclusivamente la interfaz limpia de comprador/cliente.
2. **Catálogo en Tiempo Real + Amazon S3 (`GET /api/properties`)**:
   - Galería de fotografías desde el bucket **Amazon S3 (`sw2p2`)**, filtros por tipo/disponibilidad/favoritos y calculadora hipotecaria interactiva.
3. **Reserva con Arras de 48h — Saga Distribuida (`POST /api/reservations`)**:
   - Bloquea el inmueble en MongoDB Atlas, procesa el cobro en Amazon DynamoDB y genera el pre-contrato en Azure PostgreSQL.
   - Permite **cancelar y reembolsar** las arras (`POST /api/reservations/:id/cancel`), agendar visitas (`POST /api/appointments`) y **firmar contratos digitalmente con SHA-256** (`POST /api/contracts/:id/sign`).
4. **Notificaciones Push (`flutter_local_notifications` + `/api/push/test`)**:
   - Alertas push nativas en el celular con vibración háptica al confirmar una reserva, agendar visita, firmar contrato, buscar por GPS o subir fotos con IA, además de historial y botón de prueba en la pestaña **Alertas Push**.
5. **Funcionalidades basadas en IA**:
   - **Asistente Inmobiliario IA (Claude API `POST /api/ai/assistant`)** con soporte de voz y recomendaciones sobre el catálogo en vivo.
   - **Escáner Visual IA con Cámara + Tasación en Vivo**: toma una foto con la cámara del celular, la sube al bucket **Amazon S3 (`sw2p2`)** (`POST /api/properties/upload-photo`), estima su valor de mercado en USD y recomienda los inmuebles más similares del catálogo.
6. **Recursos nativos del dispositivo móvil**:
   - **Cámara y Galería (`image_picker`)**: captura de fotos para tasación IA y subida a S3.
   - **Micrófono y Reconocimiento de Voz (`speech_to_text`)**: dictado por voz en español tanto en el buscador del catálogo como en el chat con el Asistente IA.
   - **GPS y Geolocalización (`geolocator`)**: botón **"Cerca de mí"** que obtiene las coordenadas GPS reales del teléfono y consulta `GET /api/properties/search/geo`.
   - **Vibración Háptica (`HapticFeedback`) y Enlaces Nativos (`url_launcher`)**: abrir ubicación en Google Maps y contactar al asesor por WhatsApp.

---

## Cómo ejecutar la app

```powershell
cd mobile_habitat_flutter
flutter pub get
flutter run
```

- Para probarla rápidamente en un dispositivo Android conectado por USB o emulador:
  ```powershell
  flutter run -d android
  ```
- O en navegador móvil/escritorio:
  ```powershell
  flutter run -d chrome
  ```
