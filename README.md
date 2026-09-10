# Main Admin System

Admin console for managing agencies, users, roles and verification flows.

- **frontend/** — React 18 + Vite + Tailwind CSS
- **backend-laravel/** — Laravel REST API (`/api/v1`)

---

## Secrets

No credential belongs in this repository. Real values live in `.env` on the
machine that runs the app; `.env` is gitignored and `.env.example` carries
placeholders only.

A pre-commit hook enforces that. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

It refuses a commit that stages a `.env`, an SMTP or database password, an API
key, a private key or a provider token, and lets obvious placeholders through.
For a genuine false positive: `git commit --no-verify`.

Anything that does reach GitHub is public from that moment, and deleting it in
a later commit does not remove it from the history - the only real fix is to
rotate the credential at its source.

---

## Running it

**Backend**

```bash
cd backend-laravel
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed   # creates the tables and seeds the admin
php artisan serve            # http://localhost:8000
```

Start **MySQL** in the XAMPP control panel first, and make sure a database named
`agency` exists (phpMyAdmin > New > `agency`).

**Frontend**

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

`frontend/.env` ships with `VITE_USE_MOCK=false`, so the app talks to the live Laravel API
(Vite proxies `/api` to `http://localhost:8000`). Set it to `true` to browse the UI offline on
the built-in mock adapter — registration and login need the real API, since they use the database.

### Database

`php artisan migrate --seed` applies the migrations in
[`backend-laravel/database/migrations`](backend-laravel/database/migrations) and seeds a
Main Admin. It is safe to re-run.

| Table | Holds |
| --- | --- |
| `users` | accounts: name, email, phone, bcrypt hash, role, status, verification timestamps |

**There is no self-registration.** The Main Admin is seeded; every agency login
is issued by the admin from the Create Agency screen.

Seeded admin — **change the password after signing in**:

| Username | Password |
| --- | --- |
| `mainadmin` | `Admin@1234` |

You can also sign in with the admin's email or phone number.

All data is persisted in MySQL through Eloquent models and migrations.

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
| `/login` | Sign in with username, email **or** phone number |
| `/verify-phone` | Step 1 of 2 — phone OTP, 59-second resend countdown |
| `/verify-email` | Step 2 of 2 — email OTP; only this step signs you in |
| `/dashboard` | Stat cards, pending-approval queue, quick actions |
| `/agencies` | Tabbed tables: Pending / Active / Deactivated / All |
| `/agencies/create` | Create Agency form + **Copy Details** credential panel |
| `/users` | Users data table with role/status filters |
| `/users/types` | Define and manage user types (roles) |
| `/users/permissions` | Permission matrix (modules × view/create/edit/delete) |
| `/verification/emails` | Email confirmation table with resend / mark-verified |

### Candidates & documents (API)

Candidates are registered by an agency and **never sign in** - no password, no OTP.
Full detail in [backend-laravel/README.md](backend-laravel/README.md#candidates-and-documents).

| Method | Endpoint |
| --- | --- |
| GET | `/candidates/document-types` (the eight required documents) |
| GET / POST | `/candidates` |
| GET / PUT / DELETE | `/candidates/{id}` |
| PATCH | `/candidates/{id}/status` |
| GET / POST | `/candidates/{id}/documents` |
| POST | `/candidates/{id}/documents/bulk` |
| GET | `/candidates/{id}/documents/{doc}/download` |
| DELETE | `/candidates/{id}/documents/{doc}` |

Queries are scoped by the agency in the caller's token, passport/NIC are unique
per agency, files are stored privately, and a candidate cannot be submitted
until all eight documents are attached.

---

## API reference

All routes are prefixed with `/api/v1`. Every response uses the envelope
`{ success, data, message, errors }`.

### Auth

| Method | Endpoint | Purpose |
| --- | --- | --- |
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

## OTP delivery — demo mode

No mail gateway and no SMS gateway are wired up. Verification codes are shown
on the sign-in screen and written to the Laravel log; nothing leaves the
server.

That is deliberate. A gateway means credentials - an SMTP password, an API
key - and those belong in the `.env` file on the machine that runs the app,
never in this repository. When a channel is connected, put its credentials in
`.env` only: `.env` is gitignored and `.env.example` holds placeholders alone.

The on-screen code panel is shown only for channels that could not deliver,
and never in production.

---

## Before production

All data is persisted in MySQL through Eloquent. Still required:

- Configure a real SMS provider (OTP delivery still logs to the console).
- Move OTP challenges into Redis/cache so the 59s cooldown survives restarts and works
  across instances.
- Set a strong `APP_KEY` and `JWT_SECRET`.
- Run behind HTTPS and set `APP_URL` / `CLIENT_URL` accordingly (see
  [`backend-laravel/DEPLOY-SINHALA.md`](backend-laravel/DEPLOY-SINHALA.md)).
