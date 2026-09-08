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
npm run db:migrate     # creates the `users` table and seeds the admin
npm run dev            # http://localhost:5000
```

Start **MySQL** in the XAMPP control panel first, and make sure a database named
`agency` exists (phpMyAdmin > New > `agency`).

**Frontend**

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

`frontend/.env` ships with `VITE_USE_MOCK=false`, so the app talks to the live Express API
(Vite proxies `/api` to `http://localhost:5000`). Set it to `true` to browse the UI offline on
the built-in mock adapter — registration and login need the real API, since they use the database.

### Database

`npm run db:migrate` applies [`backend/sql/schema.sql`](backend/sql/schema.sql) and seeds a
Main Admin. It is safe to re-run.

| Table | Holds |
| --- | --- |
| `users` | accounts: name, email, phone, bcrypt hash, role, status, verification timestamps |

Seeded admin — **change the password after signing in**:

| Email | Password |
| --- | --- |
| `visaltheekshana555@gmail.com` | `Admin@1234` |

Agencies, roles and permissions still use in-memory stores
(`backend/src/models/*.store.js`); only users are persisted so far.

### Sign-in flow

Both factors are mandatory — a session token is issued only after the phone
**and** the email are confirmed:

```
/login  ->  /verify-phone  ->  /verify-email  ->  /dashboard
credentials   SMS code         email code         JWT issued here
```

The challenge id is rotated between steps, so a phone code can never be replayed
against the email step, and calling `/auth/verify-email` first is rejected.

### Verification codes

While delivery is not configured, each verification screen displays its own code
in an amber "Demo mode" panel with an **Autofill** button. Codes are also logged
as `[sms] OTP for ...` / `[mail] OTP for ...`. The panel is shown only for
channels that could not actually send, and never in production.

---

## Screens

| Route | Screen |
| --- | --- |
| `/register` | Create an account (name, email, phone, password) |
| `/login` | Sign in with email **or** phone number |
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
| POST | `/auth/register` | Creates an account (bcrypt-hashed password) |
| POST | `/auth/login` | Step 1 — checks the password, sends the SMS code |
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

- Move agencies, roles and permissions into MySQL as well (users are already there).
- Configure a real SMS provider in `services/sms.service.js` (it still logs to the console).
- Move OTP challenges out of memory into Redis so the 59s cooldown survives restarts and works
  across instances (`utils/otp.js`).
- Set a strong `JWT_SECRET`.
