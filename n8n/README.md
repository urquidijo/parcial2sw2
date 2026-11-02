# Flujos n8n de Habitat Pro

## CU14 — Confirmación de reserva por Telegram (`habitat_reserva_telegram.json`)

Cuando la saga de reserva termina bien, el gateway (`server.js`) hace un `POST` al webhook de este flujo con los datos de la reserva, y n8n envía el mensaje por Telegram. Si el webhook falla o no está configurado, **la reserva no se revierte**: la respuesta solo indica `telegramNotification: NO_CONFIGURADA | ERROR | ENVIADA`.

```
Saga OK ──► POST http://localhost:5678/webhook/habitat-reserva-confirmada
            (header X-Habitat-Secret) ──► nodo Telegram ──► chat TELEGRAM_CHAT_ID
```

### Ponerlo a andar (una vez)

1. **Crear el bot:** en Telegram, hablar con `@BotFather` → `/newbot` → copiar el **token**.
2. **Obtener el chat id:** escribirle cualquier mensaje al bot y abrir `https://api.telegram.org/bot<TOKEN>/getUpdates`; el número está en `message.chat.id`.
3. **Variables:** en el `.env` de la raíz (lo lee `docker-compose.yml` y el gateway):
   ```env
   TELEGRAM_CHAT_ID=123456789
   N8N_RESERVATION_WEBHOOK_URL=http://localhost:5678/webhook/habitat-reserva-confirmada
   N8N_WEBHOOK_SECRET=una-clave-larga-al-azar
   ```
4. **Levantar n8n:** `docker compose up -d n8n-automation` → http://localhost:5678
5. **Importar el flujo:** *Workflows → Import from file* → `n8n/habitat_reserva_telegram.json`.
6. **Credenciales** (n8n las pide al abrir cada nodo):
   - *Habitat Telegram Bot* (tipo **Telegram API**): pegar el token del bot.
   - *Habitat Gateway Secret* (tipo **Header Auth**): nombre `X-Habitat-Secret`, valor = `N8N_WEBHOOK_SECRET`.
7. **Activar** el flujo (interruptor *Active*) y reiniciar el gateway para que lea las variables.

Prueba: reservar un inmueble como `juan.comprador`. El mensaje llega al chat y el aviso del shell dice "Confirmación enviada por Telegram".

> Por ahora todas las confirmaciones van a un solo chat (`TELEGRAM_CHAT_ID`, por ejemplo el celular de la demo o un grupo del equipo). Para que cada cliente reciba la suya, habría que guardar su `chat_id` cuando escriba `/start` al bot.

## Flujo anterior (`../n8n_proptech_workflow.json`)

Es el flujo original de WhatsApp → saga → correo. Llama al gateway **sin token**, así que desde la Fase 0 (SSO) recibe 401. Se arreglará cuando n8n tenga su cuenta de servicio en Keycloak (CU20 / CU21).
