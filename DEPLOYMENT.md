# Deploying Prakash Tour & Travels to Koyeb

This app is a persistent Node/Express server (`server.js`) + PostgreSQL
(via Prisma) + Vercel Blob storage, packaged with a `Dockerfile`. Koyeb
builds and runs the Dockerfile directly as a Web Service.

## 1. Prerequisites

- A Koyeb account ([koyeb.com](https://www.koyeb.com))
- A Postgres database reachable from Koyeb (Neon, Supabase, Koyeb's own
  managed Postgres add-on, or any other host) — get its `DATABASE_URL`
- A Vercel Blob store for receipt uploads — create one at
  vercel.com → Storage → Create → Blob (works fine from Koyeb, it's just
  an authenticated HTTPS API, nothing else needs to run on Vercel) —
  get its `BLOB_READ_WRITE_TOKEN`
- An email provider — **either**:
  - A [Resend](https://resend.com) API key, **or**
  - A Gmail account with an App Password (or any other SMTP provider)
- This repo pushed to GitHub/GitLab (or use the Koyeb CLI to deploy from
  a local Docker build)

## 2. Create the database schema

The Docker image runs `npx prisma db push` automatically on every
container start (see `Dockerfile`), which syncs the schema to your
database without needing migration files to exist first — convenient
for a from-scratch deploy. You don't need to do this manually before
first deploy. Once the schema has stabilized, consider switching to
real migrations (`npx prisma migrate dev --name init` locally, then
`npx prisma migrate deploy` in the Dockerfile `CMD`) for a more
rigorous, reversible production workflow.

## 3. Create the Koyeb service

**Via the dashboard:**
1. Koyeb → **Create Service → GitHub** → select this repo/branch.
2. Koyeb will detect the `Dockerfile` automatically (Builder: Docker).
3. Set the port to `8000` (matches `EXPOSE 8000` in the Dockerfile).
4. Add environment variables (see step 4).
5. Deploy.

**Via the CLI**, from the project root:

```bash
koyeb login
koyeb app init prakash-tour-travels
koyeb service create web \
  --app prakash-tour-travels \
  --git github.com/<you>/<repo> \
  --git-branch main \
  --git-builder docker \
  --ports 8000:http \
  --routes /:8000
```

Or use the included `koyeb.yaml` manifest with `koyeb deploy`.

## 4. Environment variables

Set these in the Koyeb dashboard (Service → Settings → Environment
variables) or via `koyeb service update ... --env KEY=value`. Mark
secrets (`DATABASE_URL`, `ADMIN_SESSION_SECRET`, API keys) as **Secret**
type, not plain text. Full reference: `.env.example`.

Required:
```
NODE_ENV=production
DATABASE_URL=
ADMIN_SESSION_SECRET=
BLOB_READ_WRITE_TOKEN=
APP_URL=https://<your-app>.koyeb.app
```

Email — set `EMAIL_PROVIDER` plus that provider's variables (see
`.env.example` for the full list of either set):
```
EMAIL_PROVIDER=resend        # or: smtp
EMAIL_FROM="Prakash Tour & Travels <booking@yourdomain.com>"

# if EMAIL_PROVIDER=resend:
RESEND_API_KEY=

# if EMAIL_PROVIDER=smtp (e.g. Gmail):
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=            # Gmail App Password, not your normal password
```

Optional:
```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
CRON_SECRET=
REMINDER_CRON_SCHEDULE="0 9 * * *"
DISABLE_CRON=false
UPI_ID=prakashtours@upi
UPI_DISPLAY_NAME=Prakash Tour & Travels
```

## 5. Bootstrap the first admin account

There's no default admin. Once deployed, create the first one:

```bash
curl -X POST https://<your-app>.koyeb.app/api/admin/init \
  -H "Authorization: Bearer <your ADMIN_SESSION_SECRET value>" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"a-real-strong-password-here"}'
```

This endpoint 403s once any admin account already exists — it's a
one-time bootstrap, not an open signup route. Log in at
`https://<your-app>.koyeb.app/admin.html`.

## 6. Custom domain

Koyeb → your service → **Domains** → add your domain, then create the
CNAME record it shows you at your DNS provider. Update `APP_URL` to match
once it's live (this is what gets used to build links inside emails).

## 7. Scheduled payment reminders

The reminder job (Part 34) runs in-process via `node-cron` inside
`server.js` — no separate cron infrastructure needed, since Koyeb keeps
the container running continuously. It fires daily at 09:00 server time
by default (`REMINDER_CRON_SCHEDULE`). To trigger it externally instead,
hit `GET /api/cron/reminders` with header
`Authorization: Bearer <CRON_SECRET>` and set `DISABLE_CRON=true`.

## 8. Cash payments

Customers can choose to pay in cash for either the advance or final
payment, right alongside the UPI+receipt and (optional) online gateway
options on the secure payment page. No extra setup is required — it
uses the same database tables as every other payment method. In the
admin panel, go to **Cash Payments** to see everything awaiting
collection and confirm it once received (this also updates the
booking's payment status exactly like approving a receipt does).

## 9. Redeploys

Any push to the connected branch triggers a new Koyeb build automatically
(if auto-deploy is enabled), or trigger manually via
`koyeb service redeploy web --app prakash-tour-travels`. The container's
`db push` on startup keeps the schema in sync automatically on redeploy.
