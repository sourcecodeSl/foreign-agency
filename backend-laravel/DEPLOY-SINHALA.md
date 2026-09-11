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
   උදා: `yourcpanel_foreign_agency`). මේ **සම්පූර්ණ නම** මතක තියාගන්න.
3. **Add New User** — user එකක් හදලා **ශක්තිමත් password එකක්** දෙන්න.
   ඒ password එක cPanel එකේ සහ server එකේ `.env` එකේ විතරයි තියෙන්නෙ —
   කොහෙවත් ලියලා තියන්න එපා.
4. **Add User To Database** — ඒ user එක උඩ database එකට add කරලා
   **ALL PRIVILEGES** දෙන්න.

## Step 2 — Tables import කරන්න

1. cPanel > **phpMyAdmin** > වම් පැත්තෙන් ඔයාගේ database එක click කරන්න.
2. උඩ **Import** tab එක > **Choose File** > මේ zip එකේ තියෙන
   `install/database.sql` එක තෝරන්න > **Go**.
3. Tables 6ක් + demo data + admin account එක හැදෙනවා.

## Step 3 — Files upload කරන්න

1. cPanel > **Subdomains** — `foreign-agency` subdomain එකේ *Document Root*
   එක බලාගන්න (උදා: `/home/youraccount/foreign-agency.solidrow.lk`).
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
DB_DATABASE=<cPanel එකේ database නම>
DB_USERNAME=<cPanel එකේ database user නම>
DB_PASSWORD="<ඒ user ගේ password එක>"
```

> **වැදගත්:** ඇත්ත password එක server එකේ `.env` එකේ විතරයි තියෙන්න ඕන.
> `.env` එක git එකට යන්නෙ නෑ. Password එකක් කවදාවත් document එකකට හෝ
> code එකට copy කරන්න එපා — GitHub එකට ගියොත් ඒක public.

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
| Email හෝ Phone | `.env` එකේ `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PHONE` |
| Password | `.env` එකේ `SEED_ADMIN_PASSWORD` |

2-step verification screen එකේ **code එක screen එකේම පෙන්නනවා** (Autofill
button එක ඇති), මොකද තාම SMS/Email gateway එකක් සම්බන්ධ කරලා නෑ.
Login උනාට පස්සේ Admin password එක වෙනස් කරගන්න.

---

## අලුත් version එකක් දාද්දි — Update කරන විදිය

Shared hosting එකේ terminal එකක් නෑ, ඒ නිසා `php artisan migrate` run කරන්න
බෑ. ඒකට browser එකෙන් run කරන්න පුළුවන් **`upgrade.php`** එකක් තියෙනවා.

1. අලුත් files ටික File Manager එකෙන් upload කරන්න (හැම විටම `app/`,
   `database/`, `public/`).
2. `.env` එකේ **`UPGRADE_TOKEN`** එකට දිග random string එකක් දෙන්න
   (අඩුම තරමේ අකුරු 16ක්). උදා:

   ```
   UPGRADE_TOKEN=k9Fx2Qm7Zt4Rv8Ly1Nb6Ws3Pd5Hc0Ja
   ```

3. Browser එකේ මේක open කරන්න (token එක ඔයාගේ එකට මාරු කරන්න):

   `https://foreign-agency.solidrow.lk/upgrade.php?token=k9Fx2Qm7Zt4Rv8Ly1Nb6Ws3Pd5Hc0Ja`

   Run වුණු migrations මොනවද කියලා screen එකේම පේනවා.
4. ඉවර උනාම **`UPGRADE_TOKEN` එක හිස් කරන්න** (නැත්තං `public/upgrade.php`
   එක delete කරන්න). Token එක හිස්ව තියෙනකම් ඒ page එකෙන් කිසිවක් වෙන්නෙ නෑ.

> Token එකක් නැතුව හෝ වැරදි token එකකින් `upgrade.php` එකට ගියොත් 403 එකක්
> විතරයි එන්නෙ — ඒ නිසා upload කරලා අමතක උනත් අනතුරක් නෑ. හැබැයි ඉවර
> උනාම token එක අයින් කරන එක තමයි හොඳම.

---

## OTP codes සහ Email — live server එකේ set කරන්න

Sign-in එකේ **email code එකයි**, agency එකක් හදද්දි යවන **login details
email එකයි** යන්නෙ server එකේ `.env` එකේ mail settings තියෙනවා නම් විතරයි.
නැත්නම් code එක screen එකේම "Demo mode" box එකේ පෙන්නනවා.

`.env` එක git එකට හෝ GitHub deploy එකට **යන්නෙ නෑ** — ඒ නිසා local
computer එකේ දාපු settings live එකට ඉබේ එන්නෙ නෑ. Server එකේ `.env` එකට
වෙනම දාන්න ඕන:

1. cPanel → **File Manager** → site folder එකේ `.env` → **Edit**
2. `MAIL_` වලින් පටන් ගන්න පේළි ටික මේවායින් replace කරන්න. `< >` ඇතුළේ
   තියෙන දේ ඔයාගේ value එකෙන් දාන්න (`< >` ලකුණු ඉවත් කරලා):

   ```
   MAIL_MAILER=smtp
   MAIL_SCHEME=null
   MAIL_HOST=<smtp.gmail.com>
   MAIL_PORT=587
   MAIL_USERNAME=<ඔයාගේ Gmail address එක>
   MAIL_PASSWORD=<Gmail App Password එක, spaces නැතුව>
   MAIL_FROM_ADDRESS="<ඔයාගේ Gmail address එක>"
   MAIL_FROM_NAME="Agency Admin"
   CLIENT_URL=https://foreign-agency.solidrow.lk
   ```

   `CLIENT_URL` තමයි agency email එකේ login link එකට යන්නෙ.
3. **Save** කරන්න. `bootstrap/cache/config.php` කියලා file එකක් තියෙනවා
   නම් ඒක **delete** කරන්න (පරණ settings cache වෙලා තියෙනවා නම් අලුත් ඒවා
   ගන්නෙ නෑ).
4. Site එකට ආයෙ log වෙලා බලන්න — email step එකේ demo box එක නැතුව code එක
   inbox එකට එනවා නම් හරි.

**Code එක තාම screen එකේ පේනවා නම්:** සමහර shared hosting වල Gmail SMTP
(port 587) block කරලා තියෙනවා. එතකොට email එක fail වෙලා code එක screen එකේ
පෙන්නනවා (login එක නවතින්නෙ නෑ), `storage/logs/laravel.log` එකේ
`[mail] failed to ...` කියලා පේනවා. එහෙම නම් cPanel එකේ **Email Accounts**
වලින් email account එකක් හදලා ඒකේ settings දාන්න: host එකට
`mail.<ඔයාගේ domain එක>`, `MAIL_PORT=465`, `MAIL_SCHEME=smtps`, username එකට
සම්පූර්ණ email address එක.

**Phone (SMS) code එක:** SMS gateway එකක් තාම සම්බන්ධ කරලා නෑ, ඒ නිසා
phone step එකේ code එක දිගටම screen එකේ පෙන්නනවා. **`SHOW_DEV_OTP=false`
දාන්න එපා** — SMS gateway එකක් නැතුව ඒක දැම්මොත් phone code එක කොහේවත්
පේන්නෙ නැති වෙලා කාටවත් log වෙන්න බැරි වෙනවා.

Password, API key වගේ credentials **server එකේ `.env` එකේ විතරක්** තියෙන්න
ඕන — කවදාවත් code එකට හෝ මේ වගේ document එකකට දාන්න එපා.

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
