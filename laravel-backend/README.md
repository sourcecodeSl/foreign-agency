# Agency &amp; Candidate Management — Laravel Backend

REST API for a foreign-employment agency system.

- **Main Admin** creates agencies and issues their login credentials.
- **Agency** signs in with phone **and** email OTP, then registers candidates.
- **Candidates (students)** are registered by an agency and **never log in**, so
  they have no password and no OTP.

Laravel 12 · PHP 8.2 · MySQL/MariaDB · Sanctum tokens.

---

## Setup

```bash
cd laravel-backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve            # http://127.0.0.1:8000
```

Start **MySQL** in XAMPP first. The app uses its own database, `foreign_agency`:

```sql
CREATE DATABASE foreign_agency CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Seeded Main Admin (change the password after signing in):

| Email | Password |
| --- | --- |
| `visaltheekshana555@gmail.com` | `Admin@1234` |

---

## Roles and access control

RBAC is enforced by the `role` middleware alias
([`app/Http/Middleware/EnsureUserRole.php`](app/Http/Middleware/EnsureUserRole.php)),
which also rejects deactivated accounts and agency logins whose agency has been
switched off.

| Route group | Middleware | Who |
| --- | --- | --- |
| `/api/admin/*` | `role:main_admin` | Main Admin only |
| `/api/agency/*` | `role:agency,main_admin` | Agency; admin may read across agencies |

Agency users are pinned to their own `agency_id` inside the controllers, so one
agency can never read, edit or download another agency's candidates.

---

## Sign-in flow

A token is issued **only after both factors are confirmed**:

```
POST /api/auth/login          credentials  ->  SMS code    (phone challenge)
POST /api/auth/verify-phone   phone code   ->  email code  (email challenge)
POST /api/auth/verify-email   email code   ->  API token
```

The challenge id is rotated between steps, so a phone code cannot be replayed
against the email step, and the email challenge carries a `phone_verified` flag
that is checked before a token is issued.

Codes are stored **hashed**, expire after `OTP_TTL_SECONDS` (default 5 min),
allow 5 attempts, and cannot be re-sent inside `OTP_RESEND_COOLDOWN`
(default 59 s — the countdown the UI shows). Requests past the cooldown get
**429**.

`OTP_REQUIRED_ROLES` controls who must go through this. It defaults to
`main_admin,agency`; the spec only requires it for agencies, so drop
`main_admin` if admins should sign in with a password alone.

### Seeing the codes

While no SMS gateway or SMTP server is configured, the code comes back in the
response as `dev_code` and is written to `storage/logs/laravel.log`. It is
returned **only** for a channel that could not actually deliver, and never when
`APP_ENV=production`. Set real mail credentials and the email `dev_code`
disappears on its own.

---

## Candidate documents

The eight document types are defined once in
[`app/Enums/DocumentType.php`](app/Enums/DocumentType.php) and drive the
validation, the database enum and the UI checklist:

| Value | Label |
| --- | --- |
| `passport_copy` | Passport Copy |
| `online_police_report` | Online Police Report |
| `medical` | Medical |
| `affidavit_english` | Affidavit English |
| `affidavit_sinhala` | Affidavit Sinhala |
| `family_affidavit_english` | Family Affidavit English |
| `family_affidavit_sinhala` | Family Affidavit Sinhala |
| `agreement` | Agreement |

`GET /api/agency/document-types` returns this list, so the frontend never
hard-codes it.

Files are stored on the `FILESYSTEM_DISK` disk under
`candidates/{agency_id}/{candidate_id}/`. On the default `local` disk that is
`storage/app/private`, which is **not** web-reachable — downloads go through
`GET /api/agency/candidates/{id}/documents/{doc}/download`, which re-checks
ownership. Set `FILESYSTEM_DISK=s3` (plus the AWS keys) to switch to a bucket;
no code changes are needed.

Uploading the same type twice replaces the previous file. Limits are
`DOCUMENTS_MAX_KB` (default 10 MB) and pdf/jpg/jpeg/png/webp.

A candidate cannot move to `submitted` until all eight are attached; the API
answers **422** and lists what is missing.

---

## API reference

All responses use `{ success, data, message, errors }`.

### Auth

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Step 1 — password check, sends the SMS code |
| POST | `/api/auth/verify-phone` | Step 2 — confirms phone, sends the email code (**no token**) |
| POST | `/api/auth/verify-email` | Step 3 — confirms email and issues the token |
| POST | `/api/auth/resend-otp` | Re-sends the current step's code (429 inside the cooldown) |
| GET | `/api/auth/me` | Current user + agency |
| POST | `/api/auth/logout` | Revokes the current token |

### Main Admin — agencies

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/admin/agencies?status=&search=` | List |
| GET | `/api/admin/agencies/counts` | Pending / active / deactivated counts |
| GET | `/api/admin/agencies/{agency}` | One agency |
| POST | `/api/admin/agencies` | Create agency **+ its login**; returns the password once |
| PUT | `/api/admin/agencies/{agency}` | Update details |
| POST | `/api/admin/agencies/{agency}/status` | Approve / deactivate |
| POST | `/api/admin/agencies/{agency}/credentials/reset` | Issue a new password |
| DELETE | `/api/admin/agencies/{agency}` | Remove |

### Agency — candidates

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/agency/document-types` | The eight required documents |
| GET | `/api/agency/candidates?search=&status=&per_page=` | Paginated list |
| POST | `/api/agency/candidates` | Register a candidate |
| GET | `/api/agency/candidates/{candidate}` | One candidate + documents + missing list |
| PUT | `/api/agency/candidates/{candidate}` | Update |
| POST | `/api/agency/candidates/{candidate}/status` | draft / submitted / approved / rejected |
| DELETE | `/api/agency/candidates/{candidate}` | Soft delete |

### Agency — documents

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/agency/candidates/{candidate}/documents` | Attached, required and missing |
| POST | `/api/agency/candidates/{candidate}/documents` | Upload one (`type`, `file`) |
| POST | `/api/agency/candidates/{candidate}/documents/bulk` | Upload several (`documents[type]`) |
| GET | `.../documents/{document}/download` | Stream the file |
| DELETE | `.../documents/{document}` | Remove |

---

## Database

| Table | Holds |
| --- | --- |
| `users` | Logins for both roles: `role`, optional `agency_id`, status, verification timestamps |
| `agencies` | Agency records with `code`, address, contact and status |
| `candidates` | Name, passport no, NIC no, address, mobile, email, status — scoped to an agency |
| `candidate_documents` | One row per attached document, unique per candidate + type |
| `otp_challenges` | Login codes in flight (hashed), with cooldown and attempt counters |
| `personal_access_tokens` | Sanctum API tokens |

Passport number and NIC are unique **within an agency**
(`unique(agency_id, passport_no)` / `unique(agency_id, nic_no)`), so the same
person may legitimately appear under two different agencies.

---

## Tests

```bash
php artisan test
```

[`tests/Feature/AgencyCandidateFlowTest.php`](tests/Feature/AgencyCandidateFlowTest.php)
covers the whole path: admin sign-in, agency creation with credentials, agency
sign-in, candidate registration, all eight uploads, the submit gate, and the
RBAC boundaries (no cross-agency reads, no agency access to admin routes).

---

## Before production

- Configure SMTP so the email code is really delivered, and wire an SMS gateway
  in [`app/Services/SmsService.php`](app/Services/SmsService.php) (the `log`
  driver only writes to the log).
- Set `APP_ENV=production` and `APP_DEBUG=false` — this alone stops `dev_code`
  being returned.
- Use S3 (`FILESYSTEM_DISK=s3`) or make sure `storage/` is outside the web root.
- Consider a virus scan on uploads, and a retention policy for candidate files.
