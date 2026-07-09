# Relay — real-time chat application

Node.js · Express · `ws` · MySQL — no Redis, no ORM, no Socket.IO. Raw parameterized SQL via `mysql2`, a **hand-built O(1) ring buffer** in front of MySQL on the message hot path, **role-based JWT auth** in HttpOnly cookies (verified at the WebSocket handshake too) with account lockout and an admin **audit log**, Chart.js analytics, QR-code room invites, and fully reversible moderation.

## Architecture

Layered MVC + Service pattern, with a WebSocket gateway that reuses the same services:

```
HTTP:  Router → Controller → Validator → Service → Model/Buffer
WS:    Gateway → Handler   → Validator → Service → Model/Buffer

src/config/       env loading (local DB_* vars or Railway MYSQL_URL), MySQL pool
src/constants/    HTTP status codes, WS event names, user-facing messages
src/models/       parameterized SQL query modules (no ORM)
src/validators/   message / room / auth rules (+ xss sanitization)
src/structures/   the O(1) ring buffer (pure class, zero imports → unit-testable)
src/services/     business logic: message, room, auth, user, analytics
src/controllers/  thin req/res translation only
src/ws/           the WebSocket gateway (handshake, routing, presence, heartbeat)
src/routes/       Express routers (+ page routes)
src/middleware/   auth (JWT), security stack, rate limits, central errors
src/utils/        logger, jwt, password, AppError, asyncHandler
src/scripts/      db:init (migration runner), db:seed (admin account)
migrations/       numbered .sql files, tracked in schema_migrations
test/             node:test unit tests (no Jest/Mocha)
views/            HTML + Bootstrap 5 glass dark theme + Chart.js + WS client
logs/             app.log · error.log · request.log
```

Controllers hold no business logic; services never touch `req`/`res` or a socket — which is exactly why the WS gateway can call `messageService.postMessage()` and the HTTP layer can call `messageService.removeMessage()` with the same rules applied.

## The hot path: broadcast first, persist async

```
WS frame {type:"message"} arrives
  ├─ validate + sanitize body
  ├─ shared membership guard (roomService.assertMember)
  ├─ daily limit check (seeded once from MySQL, counted in memory)
  ├─ push onto the room's ring buffer          ← O(1), in memory
  ├─ BROADCAST to everyone in the room         ← users see it NOW
  └─ INSERT into MySQL in the background       ← write-behind; the id is
                                                 backfilled onto the same
                                                 object the buffer holds
```

Opening a room serves its recent history straight from the buffer. A cold buffer (fresh boot) hydrates once from MySQL, then never reads again. Older history is paginated from MySQL over HTTP with an id cursor.

**Why a ring buffer here, when the URL shortener used an LRU cache?** Chat wants the *newest* N items per room: bounded memory, oldest silently overwritten — a circular array does that in O(1) with no pointer bookkeeping. Redirects wanted the most *reused* keys out of an unbounded key space, i.e. recency-of-access, which is what the LRU's map + linked list buys you.

## Security model

- **JWT carries only `{ id, role }`** in an **HttpOnly cookie** (JS never sees it). Every protected HTTP request *and* the WebSocket upgrade verify the signature, then re-load the account from the table matching the **signed role claim** and re-check `is_active` / `locked_until`.
- **Socket identity is server-side.** Every event handler reads the sender from `client.user` (set at the handshake), never from a `userId`/`role` field in the frame. A client cannot speak as another user or claim to be an owner.
- **Account lockout**: `MAX_LOGIN_ATTEMPTS` consecutive failures lock the account for `LOCKOUT_MINUTES`. Admins can unlock. Unknown email and wrong password return the same generic error.
- **Deactivation is immediate**: an admin disabling a user closes their live sockets (`gateway.kickUser`).
- **Audit trail**: every mutating admin action lands in `admin_logs`, browsable in the dashboard.
- **Hardening**: `helmet` (CSP allows `ws:`/`wss:`), tiered `express-rate-limit` (auth < rooms < general), `hpp`, recursive `xss` sanitization on HTTP inputs — and message bodies are sanitized in the **shared validator**, because WS frames never pass through Express middleware. Plus WS basics: Origin check at upgrade, `maxPayload`, heartbeat ping/pong reaping dead sockets, and a minimum interval between messages per socket.

## The WebSocket protocol

Small, documented JSON frames (see `src/constants/wsEvents.js`). Connect to `/ws`; the cookie authenticates the upgrade.

| Direction | Frame | Payload |
|---|---|---|
| C→S | `join` | `{ roomId }` |
| C→S | `leave` | `{ roomId }` |
| C→S | `message` | `{ roomId, body, clientId }` |
| S→C | `ready` | `{ user }` (sent on connect) |
| S→C | `joined` | `{ roomId, messages, online }` |
| S→C | `message` | `{ message, clientId }` (broadcast) |
| S→C | `removed` / `restored` | `{ roomId, messageId }` / `{ roomId, message }` |
| S→C | `presence` | `{ roomId, online }` |
| S→C | `error` | `{ message, ref? }` |

The browser client (`views/assets/js/chat.js`) is a hand-written wrapper with reconnect + exponential backoff (1s → 15s), re-joining the current room on reconnect.

## Getting started (local)

Prerequisites: Node.js ≥ 18 and MySQL 8.

```bash
npm install
cp .env.example .env      # set DB_PASSWORD, a long random JWT_SECRET,
                          # and your ADMIN_EMAIL / ADMIN_PASSWORD
npm run db:init           # creates DB + applies migrations/ in order
npm run db:seed           # creates the admin account from .env
npm run dev               # http://localhost:3000
```

Sign in at `/login` — **Create account** self-serves users; the **Admin** tab uses the seeded account. Open `/chat` in two browsers (or a normal + private window) with different accounts to watch live broadcast, presence, and moderation.

## Deploying

Live demo: **https://relay-vwyb.onrender.com** — free tier, so it sleeps after ~15 min idle and takes 30-60s to wake on the first request.

Either target needs a host with persistent WebSockets (rules out Vercel/Netlify's serverless model) plus a managed MySQL instance.

### Render + Aiven (free, no credit card — what the live demo runs on)

1. Push to GitHub, create a Render **Web Service from the repo** (this repo includes a `render.yaml` blueprint).
2. Create an Aiven MySQL service on the free plan — only available on **DigitalOcean/UpCloud** clouds, not AWS/GCP/Azure: `avn service create <name> --service-type mysql --plan free-1-1gb --cloud do-<region>`.
3. On the Render service → Environment:
   - `MYSQL_URL` = Aiven's service URI with `?ssl-mode=REQUIRED` appended
   - `DB_SSL` = `true` (managed MySQL requires TLS; `env.js` also honors `ssl-mode` inside `MYSQL_URL` itself)
   - `JWT_SECRET` = a long random string
   - `NODE_ENV` = `production`
   - `BASE_URL` and `CORS_ORIGIN` = your Render public URL
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`
4. Once: run `npm run db:init && npm run db:seed` locally with `MYSQL_URL`/`DB_SSL` pointed at Aiven (`db:init` skips `CREATE DATABASE` gracefully if the plan doesn't grant that privilege — Aiven's free tier pre-creates `defaultdb`).
5. `trust proxy` is set, so secure cookies and real IPs work behind Render's proxy. The client picks `wss://` automatically on HTTPS.

### Railway (paid, single-dashboard setup)

Railway bundles WebSockets and managed MySQL in one place, trading the permanent free tier for simplicity.

1. Push to GitHub, create a Railway project **from the repo**.
2. Add the **MySQL** plugin.
3. Same env vars as above, but `MYSQL_URL` = `${{ MySQL.MYSQL_URL }}` — no `DB_SSL`/`ssl-mode` needed, Railway's internal MySQL doesn't require TLS.
4. Once: `railway run npm run db:init && railway run npm run db:seed`
5. Railway starts `npm start` automatically.

**Known limitation (and a great interview answer):** the ring buffers and presence map live in the process, so they reset on redeploy and aren't shared across instances. Scaling past one instance means moving them to Redis with pub/sub for cross-instance broadcast. Everything else is stateless.

## Testing

```bash
npm test        # node --test test/  (built-in runner, no Jest/Mocha)
```

- `ringBuffer.test.js` — eviction/wrap-around order, `last(n)` windows, in-place mutation, stats (pure, no mocks)
- `message.service.test.js` — validation, XSS sanitization, membership guard, daily limit seeded once, **write-behind** (message returns before the INSERT, id backfills after), cold-buffer hydration hits MySQL exactly once, buffer wrap, moderation permissions
- `auth.service.test.js` — registration rules, bcrypt hashing, minimal JWT claims, the full lockout flow, deactivated accounts
- `room.service.test.js` — name rules, owner membership on create, invite validation, owner-cannot-leave, owner/admin-only rename & archive

Services are tested without Express, MySQL, or a socket by monkey-patching the model modules (`test/helpers.js`).

## API reference

**Auth** `/api/auth` — `POST /register` · `POST /login` · `POST /admin/login` · `POST /logout` · `GET /me`

**Users** `/api/users` (auth) — `GET /me` (profile + daily usage) · `PATCH /me` · `PATCH /me/password`

**Rooms** `/api/rooms` (auth) — `POST /` (create) · `GET /` (mine) · `POST /join` (invite code) · `GET /:id/qr` · `GET /:id/members` · `GET /:id/messages?beforeId=` (older history) · `POST /:id/leave` · `PATCH /:id` (rename) · `PATCH /:id/archive` · `PATCH /:id/restore`

**Messages** `/api/messages` (auth) — `DELETE /:id` (author/owner/admin) · `PATCH /:id/restore` (owner/admin)

**Analytics** `/api/analytics` (auth) — `GET /summary` · `GET /rooms/:id`

**Admin** `/api/admin` (admin role) — `GET /overview` (totals + **live** sockets/buffers) · `GET /rooms` · `PATCH /rooms/:id/archive|restore` · `GET /users` · `PATCH /users/:id` · `PATCH /users/:id/unlock` · `GET /messages` · `DELETE /messages/:id` · `PATCH /messages/:id/restore` · `GET /logs`

## Pages

`/` landing · `/login` (sign in / register / admin) · `/chat` (rooms, live messages, presence, invite QR) · `/join/:code` (invite landing) · `/account` · `/analytics` · `/admin` · styled 404/500.

## License

MIT
