# sms-bridge-mobile

[English](README.md) · **Español**

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

## Puesta en marcha

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

**5. Instala la app Android** ([última versión](../../releases/latest)), pega la URL de tu servidor y el `DEVICE_TOKEN`, toca **Encender pasarela** — y el mensaje sale por tu línea.

> La app necesita permisos de SMS, por eso se distribuye como APK (sideload) y no por Play Store. Ver [Notas](#notas).
>
> 🔍 **¿Prefieres no confiar en un binario?** La app entera son 930 líneas de Kotlin — [léela](android/app/src/main/java/com/odincodex/smsbridge/) o [compílala tú mismo](#audítala-tú-mismo--no-confíes-en-el-binario).

## Audítala tú mismo — no confíes en el binario

Estás a punto de darle a una app permiso para **leer y enviar tus SMS**. Deberías desconfiar. Por eso la app completa está aquí, y es deliberadamente pequeña para que la leas de una sentada: **9 archivos, 930 líneas de Kotlin**.

| Archivo | Líneas | Qué hace |
|---|---|---|
| [`BridgeService.kt`](android/app/src/main/java/com/odincodex/smsbridge/BridgeService.kt) | 224 | Servicio en primer plano: mantiene viva la pasarela y vacía la cola |
| [`MainActivity.kt`](android/app/src/main/java/com/odincodex/smsbridge/MainActivity.kt) | 160 | La única pantalla: URL, token, encender/apagar |
| [`PushClient.kt`](android/app/src/main/java/com/odincodex/smsbridge/PushClient.kt) | 122 | WebSocket contra **tu** servidor + reconexión |
| [`ApiClient.kt`](android/app/src/main/java/com/odincodex/smsbridge/ApiClient.kt) | 120 | Todas las llamadas HTTP que hace la app — todas |
| [`SmsSender.kt`](android/app/src/main/java/com/odincodex/smsbridge/SmsSender.kt) | 106 | Envía el SMS y pide el acuse de entrega |
| [`SmsSentReceiver.kt`](android/app/src/main/java/com/odincodex/smsbridge/SmsSentReceiver.kt) | 87 | Reporta enviado/entregado/fallido |
| [`Settings.kt`](android/app/src/main/java/com/odincodex/smsbridge/Settings.kt) | 45 | Almacenamiento local (URL, token, intervalo) |
| [`SmsReceiver.kt`](android/app/src/main/java/com/odincodex/smsbridge/SmsReceiver.kt) | 44 | Captura los SMS entrantes |
| [`BootReceiver.kt`](android/app/src/main/java/com/odincodex/smsbridge/BootReceiver.kt) | 22 | Reanuda la pasarela al reiniciar el teléfono |

### Lo que NO hace

- **Ningún servidor incrustado.** No hay una sola URL escrita en el código — búscala. Habla *únicamente* con la dirección que tú escribes.
- **Sin analytics, sin telemetría, sin reporte de errores, sin publicidad.** La lista completa de dependencias es `androidx.core`, `appcompat`, `material`, `coroutines` y `okhttp`. Ni Firebase, ni Google Analytics, ni SDK de terceros.
- **Tus SMS nunca salen de tu infraestructura.** El contenido va del teléfono a tu servidor y a ningún otro sitio.

### Por qué cada permiso

| Permiso | Para qué se necesita |
|---|---|
| `SEND_SMS` | El objetivo del proyecto: enviar los mensajes. |
| `RECEIVE_SMS` | Capturar los SMS entrantes para reenviarlos a tu webhook. |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Hablar con tu servidor. |
| `FOREGROUND_SERVICE`, `..._DATA_SYNC` | Android mata los servicios en segundo plano; una pasarela que muere en silencio es peor que no tenerla. |
| `POST_NOTIFICATIONS` | Android **exige** una notificación visible para un servicio en primer plano. |
| `RECEIVE_BOOT_COMPLETED` | Reanudar tras un corte de luz — solo si la dejaste encendida. |
| `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Mantener el socket vivo mientras el teléfono duerme. |

`BROADCAST_SMS` aparece en el manifiesto como **protección**, no como petición: garantiza que solo el sistema Android pueda disparar el receptor de SMS, para que otra app no pueda inyectar mensajes entrantes falsos.

### Compílala tú mismo

El binario más seguro es el que compilas tú:

```bash
git clone https://github.com/jofelvi/sms-bridge-mobile
cd sms-bridge-mobile/android
./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

Necesitas JDK 17 y el SDK de Android. Ojo: el APK publicado está firmado con la clave de depuración de Android, así que **no** será idéntico byte a byte al tuyo — si necesitas una cadena de confianza verificable, compílalo y fírmalo con tu propia clave.

## API

### Para tu backend — autenticación `Authorization: Bearer <API_KEY>`

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/messages` | POST | Encola un SMS. Body: `to`, `body`, y opcionales `clientMessageId`, `webhookUrl`. |
| `/api/messages/:id` | GET | Estado de un mensaje. |
| `/api/messages` | GET | Listado. Filtros: `status`, `direction` (`inbound`/`outbound`), `limit`. |
| `/api/device/status` | GET | Si el teléfono está vivo (`pushConnected` = socket abierto ahora), batería y última señal. |

**Idempotencia:** si mandas el mismo `clientMessageId` dos veces, el segundo intento responde `200` con `duplicate: true` y **no envía un segundo SMS**. Úsalo siempre: la red móvil falla, los clientes reintentan, y los reintentos cuestan dinero real.

### Para el teléfono — autenticación `Authorization: Bearer <DEVICE_TOKEN>`

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/device/pending` | GET | Toma los mensajes por enviar. |
| `/api/device/result` | POST | Reporta el resultado: `{ id, status: "delivered"\|"failed", error? }`. |
| `/api/device/inbox` | POST | Sube un SMS recibido: `{ from, body }`. |
| `/api/device/heartbeat` | POST | Señal de vida: `{ batteryLevel?, appVersion? }`. |
| `/ws/device` | WS | Canal push. Autentica en el handshake por la cabecera `Authorization` (o `?token=` para clientes que no puedan mandar cabeceras). |

Las dos credenciales son **distintas a propósito**: si pierdes el teléfono, revocas su token sin tocar la clave de tu backend. El token del dispositivo **no puede encolar mensajes**.

## Estados de un mensaje

| Estado | Significado |
|---|---|
| `queued` | En cola, esperando que el teléfono lo tome. |
| `sent` | La operadora lo aceptó — esperando el acuse de entrega. |
| `delivered` | **El teléfono del destinatario confirmó que lo recibió** (acuse real de la red). |
| `failed` | No se pudo enviar; el motivo va en `error`. |
| `received` | SMS entrante. |

`sent` y `delivered` significan cosas distintas a propósito: la operadora puede aceptar un mensaje que nunca llega (sin saldo, número bloqueado). Solo el acuse prueba que llegó.

⚠️ No todas las operadoras devuelven acuse de entrega. Si la tuya no lo hace, los mensajes se quedan en `sent` aunque hayan llegado — es una limitación de la red, no un fallo del código.

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

- **Usa HTTPS en producción.** El token viaja en cada petición. Pon nginx, Caddy o un túnel de Cloudflare delante. Ver [SECURITY.md](SECURITY.md).
- **Un SMS son 160 caracteres.** Los mensajes más largos se parten en segmentos y la operadora cobra cada uno; la respuesta te dice cuántos costó.
- **Distribución de la app:** APK por GitHub Releases. Google Play restringe los permisos de SMS a apps cuya función principal es la mensajería, así que se instala por sideload.
- **El APK de las releases está firmado con la clave de depuración de Android.** Sirve para sideload; si te importa la cadena de confianza, compílalo tú — son dos comandos.
- **iOS no es posible:** Apple no permite enviar SMS mediante programación.

## Desarrollo

```bash
cd server
npm install
npm test          # 39 tests
npm run dev       # con recarga en caliente
```

```bash
cd android
./gradlew assembleRelease   # APK en app/build/outputs/apk/release/
```

## Estado

- [x] Servidor: cola, API, webhooks, estado del dispositivo, **push por WebSocket**
- [x] App Android: envío, recepción, push instantáneo, reconexión con backoff, acuse de entrega real
- [ ] Emparejado por QR (hoy se pega la URL y el token a mano)
- [ ] Varios teléfonos / balanceo de carga

Las contribuciones son bienvenidas — abre un issue primero si es un cambio grande.

## Licencia

MIT — ver [LICENSE](LICENSE).
