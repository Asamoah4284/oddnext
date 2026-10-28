# Oddnext

Sports betting predictions platform for Ghana and Nigeria: priced odds boards, VIP all-access, admin-only login, and Moolre Mobile Money checkout.

## Stack

- **Frontend:** Next.js (App Router) on Vercel
- **Backend:** Express + Mongoose on Render
- **Database:** MongoDB Atlas
- **Payments:** Moolre hosted payment link + webhook + server-side verify


## Local setup

### 1. Prerequisites

- Node.js 20+
- MongoDB locally, Docker, or an Atlas connection string

### 2. Install

```bash
npm install
```

### 3. Environment

Copy the examples:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
```

On macOS/Linux use `cp` instead of `copy`.

`backend/.env` minimum:

```
MONGODB_URI=mongodb://127.0.0.1:27017/oddnext
JWT_SECRET=change-this-to-a-long-random-string
FRONTEND_URL=http://localhost:3000
```

Leave Moolre keys empty in development. Checkout then uses a local simulate return page so you can test VIP upgrades without live Mobile Money.

### 4. Seed and run

```bash
npm run seed
npm run dev:backend
npm run dev:frontend
```

In development the API also seeds demo users and tips automatically when the database is empty.

- Site: http://localhost:3000
- API: http://localhost:4000/api/health
- Admin: http://localhost:3000/admin (hidden from the public nav)

Seeded accounts:

| Role  | Email                 | Password   |
| ----- | --------------------- | ---------- |
| Admin | admin@system.com      | admin1234  |
| User  | user@oddnext.com      | User123!   |
| VIP   | vip@oddnext.com       | Vip123!    |

## Moolre (production)

1. Create a Moolre account and enable the API.
2. Set on the API service:

```
MOOLRE_API_USER=
MOOLRE_PUBLIC_KEY=
MOOLRE_ACCOUNT_NUMBER=
MOOLRE_WEBHOOK_SECRET=
MOOLRE_BASE_URL=https://api.moolre.com
```

3. Point the Moolre callback to `https://<your-api-host>/api/payments/webhook`.
4. Customer redirect is `https://<your-frontend>/payment/return?reference=<externalRef>`.

The API never upgrades VIP from the webhook or redirect alone. It re-checks `POST /open/transact/status`, then matches `externalRef`, amount, and account number before extending `vipExpiresAt` by 30 days.

Sandbox: `MOOLRE_BASE_URL=https://sandbox.moolre.com`.

## Deploy (Vercel + Render + Atlas)

GitHub repo: `https://github.com/Asamoah4284/Oddnext.git`. Push `main`, then connect that repo to Render and Vercel. Never upload `.env` files.

### 1. MongoDB Atlas

You can keep using the existing `oddnext` database.

1. Atlas → Network Access → allow `0.0.0.0/0` (or Render’s outbound IPs).
2. Atlas → Database Access → a user that can read/write `oddnext`.
3. Copy the `mongodb+srv://…` URI (database name `/oddnext`).

### 2. Backend on Render

1. [Render Dashboard](https://dashboard.render.com) → New → Blueprint, or New Web Service from this repo.
2. If you create the service manually:
   - **Root Directory:** `backend`
   - **Build:** `npm install --include=dev && npm run build`
   - **Start:** `npm start`
   - **Health check:** `/api/health`
3. Environment variables (same values as local `backend/.env`, except URLs):

| Key | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas URI |
| `JWT_SECRET` | long random string (not the local one) |
| `FRONTEND_URL` | `https://<your-vercel-domain>` (no trailing slash) |
| `MOOLRE_USERNAME` / `MOOLRE_API_USER` | Moolre user |
| `MOOLRE_PUBLIC_KEY` | Moolre public key |
| `MOOLRE_ACCOUNT_NUMBER` | Moolre account |
| `MOOLRE_API_KEY` | Moolre API key |
| `MOOLRE_WEBHOOK_SECRET` | same secret Moolre will send |
| `MOOLRE_SENDER_ID` | approved SMS sender |
| `MOOLRE_BASE_URL` | `https://api.moolre.com` |
| `ADMIN_EMAIL` | `admin@system.com` |
| `ADMIN_PASSWORD` | strong admin password |

4. Deploy, then open `https://<render-service>.onrender.com/api/health`. You should see `{ "ok": true, "service": "oddnext-api" }`.

The free Render web service sleeps after idle time. The first request after sleep can take ~30–60s.

### 3. Frontend on Vercel

1. [Vercel](https://vercel.com) → Add New Project → import `Asamoah4284/Oddnext`.
2. **Root Directory:** `frontend`.
3. Environment variables (set these **before** the first production build):

| Key | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<render-service>.onrender.com` (no `/api`, no trailing slash) |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-vercel-domain>` |
| `NEXT_PUBLIC_BRAND_NAME` | `Oddnext` |

4. Deploy. If you change `NEXT_PUBLIC_*` later, trigger a new Vercel deploy so the values are baked in.

If you created the Vercel project first and do not know the final URL yet: deploy the API with a temporary `FRONTEND_URL`, deploy the site, then set the real `FRONTEND_URL` on Render and redeploy the API.

### 4. Moolre

In the Moolre dashboard, set the payment webhook to:

`https://<render-service>.onrender.com/api/payments/webhook`

Customer return URL is already built by the API:

`https://<your-vercel-domain>/payment/return?reference=<externalRef>`

### 5. Smoke test

- Home and Live tips load.
- Pay with a real MoMo number completes and shows the slip.
- `/admin` still works with the production admin password.
- Atlas has new `payments` / `users` after a test purchase.

## Product notes

- Tips tabs: Yesterday, Today, VIP. VIP rows stay redacted unless the JWT user is an active VIP or admin.
- Booking codes render under match clusters that share the same code.
- Match results are settled manually in `/admin`.
- Telegram member count is edited in admin stats (no bot sync in v1).
- 18+ / responsible gambling copy is in the footer.

## API surface

- `POST /api/auth/register` `POST /api/auth/login` `GET /api/auth/me`
- `GET /api/tips?tab=yesterday|today|vip`
- `GET /api/stats`
- `POST /api/payments/initiate`
- `POST /api/payments/webhook`
- `GET /api/payments/verify/:ref`
- `POST /api/payments/simulate` (development only)
- Admin: `/api/admin/tips` CRUD, `/api/admin/users`, `/api/admin/users/:id/vip`, `/api/admin/stats`
