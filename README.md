# Main Admin System

Admin console for managing agencies, users, roles and verification flows.

- **frontend/** — React 18 + Vite + Tailwind CSS
- **backend/** — Node.js + Express REST API (`/api/v1`)

---

## Running it

**Backend**

```bash
cd backend
npm install
cp .env.example .env
npm run dev            # http://localhost:5000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The frontend ships with a **mock adapter enabled** (`VITE_USE_MOCK=true` in `frontend/.env`), so
every screen works without the backend running. Set it to `false` to hit the live Express API —
Vite proxies `/api` to `http://localhost:5000`.

### Sign-in flow

Both factors are mandatory — a session token is issued only after the phone
**and** the email are confirmed:

```
/login  ->  /verify-phone  ->  /verify-email  ->  /dashboard
credentials   SMS code         email code         JWT issued here
```

The challenge id is rotated between steps, so a phone code can never be replayed
against the email step, and calling `/auth/verify-email` first is rejected.

### Demo sign-in

| Mode | Username | Password | Codes |
| --- | --- | --- | --- |
| Mock (`VITE_USE_MOCK=true`) | anything | any 6+ characters | shown on screen |
| Live backend | `visaltheekshana555@gmail.com` | any 6+ characters | shown on screen, and logged as `[sms] OTP for ...` / `[mail] OTP for ...` |

While delivery is not configured, each verification screen displays its own code
in an amber "Demo mode" panel with an **Autofill** button. The backend omits
`devCode` when `NODE_ENV=production`, so that panel disappears on its own.

---

## Screens

| Route | Screen |
| --- | --- |
| `/login` | Main Admin login |
| `/verify-phone` | Step 1 of 2 — phone OTP, 59-second resend countdown |
| `/verify-email` | Step 2 of 2 — email OTP; only this step signs you in |
| `/dashboard` | Stat cards, pending-approval queue, quick actions |
| `/agencies` | Tabbed tables: Pending / Active / Deactivated / All |
| `/agencies/create` | Create Agency form + **Copy Details** credential panel |
| `/users` | Users data table with role/status filters |
| `/users/types` | Define and manage user types (roles) |
| `/users/permissions` | Permission matrix (modules × view/create/edit/delete) |
| `/verification/emails` | Email confirmation table with resend / mark-verified |

---

## API reference

All routes are prefixed with `/api/v1`. Every response uses the envelope
`{ success, data, message, errors }`.

### Auth

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Step 1 — validates credentials, sends the SMS code |
| POST | `/auth/verify-otp` | Step 2 — confirms the phone, sends the email code (**no token**) |
| POST | `/auth/verify-email` | Step 3 — confirms the email and issues the JWT |
| POST | `/auth/resend-otp` | Re-sends the current step's code; **429** inside the 59s cooldown |
| GET | `/auth/me` | Current admin (restores a session on refresh) |
| POST | `/auth/logout` | Clears the session cookie |

### Agencies

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/agencies?status=&search=` | List, filtered by tab status |
| GET | `/agencies/counts` | Tab badge counts |
| GET | `/agencies/:id` | Single agency |
| POST | `/agencies` | Create + return one-time credentials |
| PUT | `/agencies/:id` | Update details |
| PATCH | `/agencies/:id/status` | Approve / deactivate / reactivate |
| POST | `/agencies/:id/credentials/reset` | Issue a fresh password |
| DELETE | `/agencies/:id` | Remove |

### Users

| Method | Endpoint |
| --- | --- |
| GET | `/users?role=&status=&search=` |
| GET | `/users/:id` |
| POST | `/users` |
| PUT | `/users/:id` |
| PATCH | `/users/:id/status` |
| DELETE | `/users/:id` |

### Roles & permissions

| Method | Endpoint |
| --- | --- |
| GET | `/roles` |
| POST | `/roles` |
| PUT | `/roles/:id` |
| DELETE | `/roles/:id` |
| GET | `/roles/:slug/permissions` |
| PUT | `/roles/:slug/permissions` |

### Verification & dashboard

| Method | Endpoint |
| --- | --- |
| GET | `/verification/emails?status=&search=` |
| POST | `/verification/emails` |
| POST | `/verification/emails/:id/resend` |
| PATCH | `/verification/emails/:id/verify` |
| GET | `/verification/emails/confirm/:token` *(public)* |
| GET | `/dashboard/stats` |
| GET | `/dashboard/activity` |

---

## Sending real emails

Email is sent through Nodemailer as soon as SMTP credentials exist in `backend/.env`;
without them the code is logged to the console instead.

Gmail needs an **App Password**, not your normal password:

1. Turn on 2-Step Verification: <https://myaccount.google.com/security>
2. Create an App Password: <https://myaccount.google.com/apppasswords>
3. Put the 16-character value in `backend/.env`:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=abcdefghijklmnop     # the App Password, spaces removed
SMTP_FROM="Agency Admin" <you@gmail.com>
```

4. Check it without going through a login:

```bash
cd backend
npm run test:email               # sends to SMTP_USER
npm run test:email you@other.com # or to a specific address
```

Restart the API after editing `.env`. The on-screen "Demo mode" code panel
disappears on its own once a channel actually delivers — it is shown only for
channels that could not send (currently SMS), and never in production.

---

## Before production

The backend uses **in-memory stores** (`backend/src/models/*.store.js`) as a database stand-in.
Each exposes `findAll / findById / insert / update / remove`, so swapping in Mongoose, Prisma or
Knex only touches those files — controllers stay unchanged.

Also required:

- Replace the dummy password check in `auth.controller.js` with `bcrypt.compare`.
- Configure a real SMS provider in `services/sms.service.js` (it still logs to the console).
- Move OTP challenges out of memory into Redis so the 59s cooldown survives restarts and works
  across instances (`utils/otp.js`).
- Set a strong `JWT_SECRET`.
