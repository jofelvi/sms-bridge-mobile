# sms-bridge-mobile

Pasarela de SMS **autoalojada**: envía mensajes desde **tu propia línea telefónica** usando un teléfono Android como puente, sin pagar por mensaje y **sin que tus SMS pasen por servidores de terceros**.

> A diferencia de [httpSMS](https://github.com/NdoleStudio/httpsms), aquí no hay relay en la nube: el teléfono habla **solo con tu servidor**. Nadie más ve tus mensajes.

Licencia MIT.

## Cómo funciona

```
[Tu backend] ──POST /api/messages──► [sms-bridge] ══push WebSocket══► [App Android] ──► SMS
                                          │ SQLite                          │
                    webhooks ◄────────────┴──── estado + SMS entrante ──────┘
```

El servidor **empuja** el aviso al teléfono por WebSocket en cuanto entra un mensaje: la entrega es instantánea (**~300 ms** medidos, no los segundos que tardaría un sondeo). El teléfono lo envía por SMS y reporta el resultado. También sube los SMS que recibe.

**¿Por qué WebSocket y no Firebase (FCM)?** El teléfono ya corre un servicio en primer plano 24/7 —obligatorio para poder enviar—, así que mantener el socket no cuesta nada extra. El superpoder de FCM es despertar apps dormidas, algo que aquí no hace falta. Y sobre todo: **no obliga a nadie a crear un proyecto Firebase ni a recompilar el APK** para usar este proyecto.

El teléfono además sondea cada 5 minutos como **red de seguridad**: si el socket se cae sin avisar (típico en redes móviles), ningún mensaje se queda clavado.

## Quickstart

**1. Genera tus dos claves** (deben ser distintas):

```bash
node -e "console.log('API_KEY=' + require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log('DEVICE_TOKEN=' + require('crypto').randomBytes(24).toString('hex'))"
```

**2. Guárdalas en un `.env`** junto al `docker-compose.yml`:

```bash
API_KEY=<la primera>
DEVICE_TOKEN=<la segunda>
```

**3. Levanta el servidor:**

```bash
docker compose up -d
curl localhost:8080/health     # {"ok":true}
```

**4. Encola tu primer SMS:**

```bash
curl -X POST localhost:8080/api/messages \
  -H "Authorization: Bearer $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"to":"+584141234567","body":"Hola desde sms-bridge"}'
```

**5. Instala la app Android** (ver `/android`), pega la URL del servidor y el `DEVICE_TOKEN`, y el mensaje sale por tu línea.

## API

### Para tu backend — autenticación `Authorization: Bearer <API_KEY>`

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/messages` | POST | Encola un SMS. Body: `to`, `body`, y opcionales `clientMessageId`, `webhookUrl`. |
| `/api/messages/:id` | GET | Estado de un mensaje. |
| `/api/messages` | GET | Listado. Filtros: `status`, `direction` (`inbound`/`outbound`), `limit`. |
| `/api/device/status` | GET | Si el teléfono está vivo (`pushConnected` = socket abierto ahora), su batería y cuándo se le vio por última vez. |

**Idempotencia:** si mandas el mismo `clientMessageId` dos veces, el segundo intento responde `200` con `duplicate: true` y **no envía un segundo SMS**. Úsalo siempre: la red móvil falla y los reintentos cuestan dinero real.

### Para el teléfono — autenticación `Authorization: Bearer <DEVICE_TOKEN>`

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/device/pending` | GET | Toma los mensajes por enviar (los marca como entregados al teléfono). |
| `/api/device/result` | POST | Reporta el resultado: `{ id, status: "delivered"\|"failed", error? }`. |
| `/api/device/inbox` | POST | Sube un SMS recibido: `{ from, body }`. |
| `/api/device/heartbeat` | POST | Señal de vida: `{ batteryLevel?, appVersion? }`. |
| `/ws/device` | WS | Canal push. Autentica en el handshake: `?token=<DEVICE_TOKEN>` o cabecera `Authorization`. |

Las dos credenciales son **distintas a propósito**: si pierdes el teléfono, revocas su token sin tocar la clave de tu backend. El token del dispositivo **no puede** encolar mensajes.

## Estados de un mensaje

| Estado | Significado |
|---|---|
| `queued` | En cola, esperando que el teléfono lo tome. |
| `sent` | Entregado al teléfono. |
| `delivered` | El teléfono confirmó que salió. |
| `failed` | No se pudo enviar (el motivo va en `error`). |
| `received` | SMS entrante. |

## Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
|---|---|---|---|
| `API_KEY` | sí | — | Clave de tu backend. |
| `DEVICE_TOKEN` | sí | — | Token del teléfono. Debe ser distinto de `API_KEY`. |
| `PORT` | no | `8080` | Puerto del servidor. |
| `DATABASE_PATH` | no | `./data/sms-bridge.db` | Archivo SQLite. |
| `DEVICE_BATCH_SIZE` | no | `10` | Máximo de mensajes por consulta del teléfono. |
| `MAX_ATTEMPTS` | no | `3` | Reintentos antes de marcar como fallido. |

El servidor **no arranca** si falta una clave o si ambas son iguales.

## Notas

- **Usa HTTPS en producción.** El token viaja en cada petición; detrás de un proxy con TLS (nginx, Caddy, Cloudflare Tunnel).
- **Un SMS son 160 caracteres.** Los mensajes más largos se parten en varios segmentos y la operadora cobra cada uno. La respuesta te dice cuántos costó.
- **Distribución de la app:** por APK en GitHub Releases. Los permisos de SMS están restringidos en Google Play para apps cuya función principal no es mensajería, así que la app se instala por sideload.
- **iOS no es posible:** Apple no permite enviar SMS mediante programación.

## Desarrollo

```bash
cd server
npm install
npm test          # 39 tests
npm run dev       # con recarga en caliente
```

## Estado

- [x] Servidor: cola, API, webhooks, estado del dispositivo, **push por WebSocket**
- [x] App Android (Kotlin): envío, recepción, push instantáneo, reconexión con backoff
- [ ] Emparejado por QR (hoy se pega la URL y el token a mano)

## Licencia

MIT — ver [LICENSE](LICENSE).
