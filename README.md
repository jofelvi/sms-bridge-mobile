# sms-bridge-mobile

**English** · [Español](README.es.md)

Self-hosted SMS gateway: send SMS **from your own phone line** using an Android device as the bridge — no per-message fees and **no third party ever sees your messages**.

> Unlike [httpSMS](https://github.com/NdoleStudio/httpsms), there is no cloud relay here: the phone talks **only to your server**.

MIT licensed.

## How it works

```
[Your backend] ──POST /api/messages──► [sms-bridge] ══WebSocket push══► [Android app] ──► SMS
                                            │ SQLite                          │
                     webhooks ◄─────────────┴──── status + inbound SMS ───────┘
```

The server **pushes** to the phone over WebSocket the moment a message is queued — delivery is instant (**~300 ms measured**, not the seconds a polling loop would cost). The phone sends it via SMS and reports the result. It also uploads any SMS it receives.

**Why WebSocket and not Firebase (FCM)?** The phone already runs a foreground service 24/7 — mandatory for it to be able to send at all — so holding the socket costs nothing extra. FCM's superpower is waking sleeping apps, which isn't needed here. Most importantly: **nobody has to create a Firebase project or rebuild the APK** to use this.

The phone also polls every 5 minutes as a **safety net**: if the socket drops silently (common on mobile networks), no message gets stuck.

## Quickstart

**1. Generate two keys** (they must be different):

```bash
node -e "console.log('API_KEY=' + require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log('DEVICE_TOKEN=' + require('crypto').randomBytes(24).toString('hex'))"
```

**2. Save them in a `.env`** next to `docker-compose.yml`:

```bash
API_KEY=<the first one>
DEVICE_TOKEN=<the second one>
```

**3. Start the server:**

```bash
docker compose up -d
curl localhost:8080/health     # {"ok":true}
```

**4. Queue your first SMS:**

```bash
curl -X POST localhost:8080/api/messages \
  -H "Authorization: Bearer $API_KEY" \
  -H 'content-type: application/json' \
  -d '{"to":"+1234567890","body":"Hello from sms-bridge"}'
```

**5. Install the Android app** ([latest release](../../releases/latest)), enter your server URL and the `DEVICE_TOKEN`, tap **Encender pasarela** — and the message goes out through your line.

> The app requires SMS permissions, so it is distributed as an APK (sideload), not through the Play Store. See [Notes](#notes).
>
> 🔍 **Rather not trust a binary?** The entire app is 930 lines of Kotlin — [read it](android/app/src/main/java/com/odincodex/smsbridge/) or [build it yourself](#audit-it-yourself--dont-trust-the-binary).

## Audit it yourself — don't trust the binary

You are about to give an app permission to **read and send your SMS**. You should be suspicious. So the whole app is here, and it is deliberately small enough to read in one sitting: **9 files, 930 lines of Kotlin**.

| File | Lines | What it does |
|---|---|---|
| [`BridgeService.kt`](android/app/src/main/java/com/odincodex/smsbridge/BridgeService.kt) | 224 | Foreground service: keeps the bridge alive, drains the queue |
| [`MainActivity.kt`](android/app/src/main/java/com/odincodex/smsbridge/MainActivity.kt) | 160 | The only screen: server URL, token, on/off |
| [`PushClient.kt`](android/app/src/main/java/com/odincodex/smsbridge/PushClient.kt) | 122 | WebSocket to **your** server + reconnect |
| [`ApiClient.kt`](android/app/src/main/java/com/odincodex/smsbridge/ApiClient.kt) | 120 | Every HTTP call the app makes — all of them |
| [`SmsSender.kt`](android/app/src/main/java/com/odincodex/smsbridge/SmsSender.kt) | 106 | Sends the SMS, asks for the delivery report |
| [`SmsSentReceiver.kt`](android/app/src/main/java/com/odincodex/smsbridge/SmsSentReceiver.kt) | 87 | Reports sent/delivered/failed back |
| [`Settings.kt`](android/app/src/main/java/com/odincodex/smsbridge/Settings.kt) | 45 | Local storage (URL, token, interval) |
| [`SmsReceiver.kt`](android/app/src/main/java/com/odincodex/smsbridge/SmsReceiver.kt) | 44 | Captures inbound SMS |
| [`BootReceiver.kt`](android/app/src/main/java/com/odincodex/smsbridge/BootReceiver.kt) | 22 | Restarts the bridge after a reboot |

### What it does NOT do

- **No hardcoded servers.** There is not a single URL baked into the app — grep for it. It talks *only* to the address you type in.
- **No analytics, no telemetry, no crash reporting, no ads.** The full dependency list is `androidx.core`, `appcompat`, `material`, `coroutines` and `okhttp`. No Firebase, no Google Analytics, no third-party SDK.
- **Your SMS never leave your infrastructure.** Message bodies go from the phone to your server and nowhere else.

### Why each permission

| Permission | Why it is needed |
|---|---|
| `SEND_SMS` | The whole point: sending the messages. |
| `RECEIVE_SMS` | Capturing inbound SMS to forward to your webhook. |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Talking to your server. |
| `FOREGROUND_SERVICE`, `..._DATA_SYNC` | Android kills background services; a gateway that dies silently is worse than none. |
| `POST_NOTIFICATIONS` | Android **requires** a visible notification for a foreground service. |
| `RECEIVE_BOOT_COMPLETED` | Resume the bridge after a power cut — only if you left it on. |
| `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Keep the socket alive while the phone sleeps. |

`BROADCAST_SMS` appears in the manifest as a **protection**, not a request: it ensures only the Android system can trigger the SMS receiver, so another app cannot inject fake inbound messages.

### Build it yourself

The safest binary is the one you compile:

```bash
git clone https://github.com/jofelvi/sms-bridge-mobile
cd sms-bridge-mobile/android
./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

You need JDK 17 and the Android SDK. Note the published APK is signed with Android's debug key, so it will **not** be byte-identical to yours — if you need a verifiable chain of trust, build and sign it with your own key.

## API

### For your backend — auth `Authorization: Bearer <API_KEY>`

| Endpoint | Method | Description |
|---|---|---|
| `/api/messages` | POST | Queue an SMS. Body: `to`, `body`, optional `clientMessageId`, `webhookUrl`. |
| `/api/messages/:id` | GET | Status of one message. |
| `/api/messages` | GET | List. Filters: `status`, `direction` (`inbound`/`outbound`), `limit`. |
| `/api/device/status` | GET | Whether the phone is alive (`pushConnected` = socket open right now), battery, last seen. |

**Idempotency:** send the same `clientMessageId` twice and the second call returns `200` with `duplicate: true` — **it does not send a second SMS**. Always use it: mobile networks fail, clients retry, and retries cost real money.

### For the phone — auth `Authorization: Bearer <DEVICE_TOKEN>`

| Endpoint | Method | Description |
|---|---|---|
| `/api/device/pending` | GET | Claim messages to send. |
| `/api/device/result` | POST | Report result: `{ id, status: "delivered"\|"failed", error? }`. |
| `/api/device/inbox` | POST | Upload a received SMS: `{ from, body }`. |
| `/api/device/heartbeat` | POST | Liveness: `{ batteryLevel?, appVersion? }`. |
| `/ws/device` | WS | Push channel. Authenticates during the handshake via the `Authorization` header (or `?token=` for clients that cannot send headers). |

The two credentials are **deliberately separate**: lose the phone and you revoke its token without touching your backend key. The device token **cannot queue messages**.

## Message states

| State | Meaning |
|---|---|
| `queued` | Waiting for the phone to pick it up. |
| `sent` | The carrier accepted it — waiting for the delivery report. |
| `delivered` | **The recipient's handset confirmed receipt** (real network delivery report). |
| `failed` | Could not be sent; reason in `error`. |
| `received` | An inbound SMS. |

`sent` and `delivered` mean different things on purpose: a carrier can accept a message that never arrives (no credit, blocked number). Only the delivery report proves it landed.

⚠️ Not every carrier returns delivery reports. If yours doesn't, messages stay at `sent` even though they arrived — a network limitation, not a bug.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_KEY` | yes | — | Your backend's key. |
| `DEVICE_TOKEN` | yes | — | The phone's token. Must differ from `API_KEY`. |
| `PORT` | no | `8080` | Server port. |
| `DATABASE_PATH` | no | `./data/sms-bridge.db` | SQLite file. |
| `DEVICE_BATCH_SIZE` | no | `10` | Max messages per device poll. |
| `MAX_ATTEMPTS` | no | `3` | Retries before marking failed. |

The server **refuses to start** if a key is missing or both are equal.

## Notes

- **Use HTTPS in production.** The token travels on every request. Put nginx, Caddy or a Cloudflare Tunnel in front. See [SECURITY.md](SECURITY.md).
- **An SMS is 160 characters.** Longer messages are split into segments and carriers charge per segment; the API response tells you how many it cost.
- **App distribution:** APK via GitHub Releases. Google Play restricts SMS permissions to apps whose core purpose is messaging, so this installs by sideload.
- **The release APK is signed with Android's debug key.** Fine for sideloading; if you care about the trust chain, build it yourself — it's two commands.
- **iOS is not possible:** Apple does not allow sending SMS programmatically.

## Development

```bash
cd server
npm install
npm test          # 39 tests
npm run dev       # hot reload
```

```bash
cd android
./gradlew assembleRelease   # APK in app/build/outputs/apk/release/
```

## Status

- [x] Server: queue, API, webhooks, device status, **WebSocket push**
- [x] Android app: sending, receiving, instant push, backoff reconnect, real delivery reports
- [ ] QR pairing (today you paste the URL and token by hand)
- [ ] Multiple phones / load balancing

Contributions welcome — open an issue first if it's a big change.

## License

MIT — see [LICENSE](LICENSE).
