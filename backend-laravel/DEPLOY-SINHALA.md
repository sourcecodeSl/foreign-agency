# Foreign Agency Admin — cPanel Deploy Guide (සිංහල)

Domain: **http://foreign-agency.solidrow.lk/**
Stack: **Laravel 11 (PHP) + MySQL + React (build එක ඇතුළත්)**

> මේ folder එකම subdomain එකේ document root එකට upload කරන්න ලෑස්තියි.
> `vendor/` සහ React build එක (`public/assets`) ඇතුළත්, ඒ නිසා server එකේ
> composer / npm run කරන්න ඕන නෑ.

---

## කලින් සූදානම (PHP version)

cPanel එකේ PHP version එක **8.2 හෝ ඊට වැඩි** එකකට set කරන්න
(cPanel > *Select PHP Version* / *MultiPHP Manager*).
අවශ්‍ය extensions: `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `ctype`,
`json`, `bcmath` — මේවා සාමාන්‍යයෙන් default ON.

---

## Step 1 — Database එක හදන්න

1. cPanel > **MySQL Databases**.
2. **Create New Database** — නමක් දෙන්න. (cPanel එක prefix එකක් දානවා,
   උදා: `festelsd_foreign_agency`). මේ **සම්පූර්ණ නම** මතක තියාගන්න.
3. **Add New User** — ඔයා දැනටමත් හදලා තියෙනවා:
   - User: `festelsd_foreign-agency`
   - Password: `bSlY&%oN77[8o[3E`
4. **Add User To Database** — ඒ user එක උඩ database එකට add කරලා
   **ALL PRIVILEGES** දෙන්න.

## Step 2 — Tables import කරන්න

1. cPanel > **phpMyAdmin** > වම් පැත්තෙන් ඔයාගේ database එක click කරන්න.
2. උඩ **Import** tab එක > **Choose File** > මේ zip එකේ තියෙන
   `install/database.sql` එක තෝරන්න > **Go**.
3. Tables 6ක් + demo data + admin account එක හැදෙනවා.

## Step 3 — Files upload කරන්න

1. cPanel > **Subdomains** — `foreign-agency` subdomain එකේ *Document Root*
   එක බලාගන්න (උදා: `/home/festelsd/foreign-agency.solidrow.lk`).
2. cPanel > **File Manager** > ඒ document root එකට යන්න.
3. මේ folder එකේ **හැම දෙයක්ම** (`.htaccess`, `.env`, `app`, `public`,
   `vendor`, `artisan` ... ඔක්කොම) ඒ document root එකට upload කරන්න.
   - ලේසිම විදිය: මේ folder එක **.zip** කරලා upload කරලා,
     File Manager එකේ **Extract** කරන්න.
   - `.env` සහ `.htaccess` වගේ **dot files** ටිකත් යනවද කියලා තහවුරු
     කරගන්න (File Manager > Settings > *Show Hidden Files* ✔).

> **වඩාත් හොඳ විකල්පය (optional):** Subdomain එකේ Document Root එක කෙලින්ම
> `.../public` folder එකට point කරන්න පුළුවන් නම්, root එකේ `.htaccess` එක
> අයින් කරන්න පුළුවන් — වඩාත් secure.

## Step 4 — .env එක හරිද බලන්න

`.env` file එක File Manager එකෙන් **Edit** කරලා මේ 3 පේළිය තහවුරු කරගන්න
(Step 1 එකේ database නම හරියටම):

```
DB_DATABASE=festelsd_foreign_agency
DB_USERNAME=festelsd_foreign-agency
DB_PASSWORD="bSlY&%oN77[8o[3E"
```

> Database නම cPanel එකේ දාපු එකට **හරියටම** සමාන විය යුතුයි.
> HTTPS (SSL) දැම්මම `APP_URL` සහ `CLIENT_URL` දෙකම `https://...` කරන්න.

## Step 5 — Permissions

`storage/` සහ `bootstrap/cache/` folders දෙක **writable** විය යුතුයි.
File Manager එකෙන් ඒ folders 2 select කරලා **Permissions → 755**
(අවශ්‍ය නම් 775) දෙන්න.

## Step 6 — Test කරන්න

Browser එකේ **http://foreign-agency.solidrow.lk/** open කරන්න.
Login page එක එනවා. Sign in:

| Field | Value |
| --- | --- |
| Email හෝ Phone | `visaltheekshana555@gmail.com` / `0781311850` |
| Password | `Admin@1234` |

2-step verification screen එකේ **code එක screen එකේම පෙන්නනවා** (Autofill
button එක ඇති), මොකද තාම SMS/Email gateway එකක් සම්බන්ධ කරලා නෑ.
Login උනාට පස්සේ Admin password එක වෙනස් කරගන්න.

---

## Email (OTP) නියම විදියට යවන්න (optional)

Codes screen එකේ පෙන්නීම නවත්තලා, ඇත්තටම email යවන්න ඕන නම් — `.env` එකේ:

```
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your@gmail.com
MAIL_PASSWORD=<Gmail App Password>   # 16 අකුරු, spaces නැතුව
MAIL_ENCRYPTION=tls
SHOW_DEV_OTP=false
```

Gmail App Password එකක් හදන්නේ: https://myaccount.google.com/apppasswords
(2-Step Verification ON වෙලා තියෙන්න ඕන).

---

## ගැටලු (Troubleshooting)

- **500 error / සුදු page:** `.env` එකේ DB විස්තර වැරදියි, නැත්තං
  `storage/` writable නෑ. `storage/logs/laravel.log` බලන්න.
- **CSS/JS load වෙන්නෙ නෑ:** `public/assets/` folder එක upload උනාද බලන්න.
- **"Route ... does not exist" / API 404:** root `.htaccess` එක upload
  උනාද, `mod_rewrite` ON ද බලන්න.
- **DB connect error:** user එක database එකට ALL PRIVILEGES එක්ක add
  කරලද, database නම `.env` එකට හරියටම දැම්මද බලන්න.
- **"file missing on the server" / ZIP එක download වෙන්නෙ නෑ:** document
  එකේ database row එක තියෙනවා, ඒත් file එක `storage/` ඇතුළේ නෑ. හේතු 2යි:
  1. `storage/app/private/` writable නෑ — upload එක fail වෙලා. Step 5 බලලා
     `storage/` folder එකට **755 (recursive)** දෙන්න.
  2. අලුතෙන් upload කරද්දි `storage/app/private/candidates/` folder එක
     replace කරලා — ඒ folder එක **කවදාවත් overwrite කරන්න එපා**, candidate
     documents ඔක්කොම ඒක ඇතුළේ.

  හදාගත්තට පස්සේ ඒ documents නැවත **Attach** කරන්න ඕන (පරණ file එක නැති
  නිසා). Permissions හදන්නෙ නැතුව attach කරොත් දැන් "The file could not be
  saved on the server" කියලා error එකක් එනවා — කලින් වගේ නිශ්ශබ්දව
  attached වගේ පෙන්නන්නෙ නෑ.

---

## තාක්ෂණික සටහන

- පරණ Node/Express backend එකේ හැම `/api/v1` endpoint එකක්ම Laravel එකට
  1:1 port කරලා (auth 2FA, agencies, users, roles/permissions, verification,
  dashboard) — response envelope එකම `{ success, data, message, errors }`.
- Express එකේ in-memory stores (agencies, roles, OTP challenges) PHP එකේ
  request අතර memory රැඳෙන්නෙ නැති නිසා **MySQL tables** බවට පත් කරලා.
- Passwords bcrypt, sessions JWT (localStorage), OTP challenges `otp_challenges`
  table එකේ.
