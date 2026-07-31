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
