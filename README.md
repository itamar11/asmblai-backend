# Assembly.AI — Backend

Node.js + Supabase + Stripe. Follow every step below exactly and you'll have a live backend in under an hour.

---

## What You Need First

Create free accounts on these four services before starting:

| Service | Link | What it's for |
|---|---|---|
| Supabase | https://supabase.com | Database + auth |
| Railway | https://railway.app | Hosting the backend |
| Stripe | https://stripe.com | Payments |
| Gmail | (you have one) | Sending emails |

---

## Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version
3. Install it (just click through the installer)
4. Open **Terminal** (Mac: press Cmd+Space, type "Terminal", hit Enter)
5. Type this and press Enter to confirm it worked:
```
node --version
```
You should see something like `v20.10.0`. If you do, you're good.

---

## Step 2 — Set Up Supabase

1. Go to https://supabase.com and sign up
2. Click **New Project**
3. Name it `assemblyai`, pick a region close to you, set a database password (save it somewhere)
4. Wait ~2 minutes for it to spin up
5. Go to **SQL Editor** → **New Query**
6. Copy the entire contents of `supabase/schema.sql` from this folder
7. Paste it into the SQL editor and click **Run**
8. You should see "Success" — your database is now set up

**Get your API keys:**
1. In Supabase, go to **Settings** → **API**
2. Copy **Project URL** — this is your `SUPABASE_URL`
3. Copy **service_role** key (scroll down, reveal it) — this is your `SUPABASE_SERVICE_KEY`

---

## Step 3 — Set Up Stripe

1. Go to https://stripe.com and sign up
2. Go to **Developers** → **API Keys**
3. Copy **Secret key** (starts with `sk_test_`) — this is your `STRIPE_SECRET_KEY`

**Create your 3 products:**
1. Go to **Products** → **Add Product**
2. Create three products:
   - **Starter** — $150/month recurring → copy the Price ID (starts with `price_`)
   - **Growth** — $250/month recurring → copy the Price ID
   - **Scale** — $500/month recurring → copy the Price ID

---

## Step 4 — Set Up Gmail App Password

1. Go to https://myaccount.google.com
2. Click **Security** → **2-Step Verification** (turn it on if not already)
3. Go back to Security → scroll down to **App passwords**
4. Create one called "assemblyai"
5. Copy the 16-character password — this is your `EMAIL_PASS`

---

## Step 5 — Configure Your Environment

1. In Terminal, navigate to this folder:
```bash
cd path/to/assemblyai-backend
```
2. Copy the example env file:
```bash
cp .env.example .env
```
3. Open `.env` in any text editor (TextEdit on Mac works fine)
4. Fill in every value using what you collected above:

```
SUPABASE_URL=           ← paste from Supabase Settings → API
SUPABASE_SERVICE_KEY=   ← paste service_role key from Supabase
JWT_SECRET=             ← go to https://generate-secret.vercel.app/64 and paste result
STRIPE_SECRET_KEY=      ← paste from Stripe Developers → API Keys
STRIPE_PRICE_STARTER=   ← paste Starter price ID from Stripe
STRIPE_PRICE_GROWTH=    ← paste Growth price ID from Stripe
STRIPE_PRICE_SCALE=     ← paste Scale price ID from Stripe
EMAIL_USER=             ← your gmail address
EMAIL_PASS=             ← your Gmail app password (16 chars)
FRONTEND_URL=           ← http://localhost:5500 for now
QR_BASE_URL=            ← https://assemblyai.app/s
```

---

## Step 6 — Install and Run Locally

In Terminal, run these one at a time:

```bash
npm install
```
(waits ~30 seconds, installs everything)

```bash
npm run dev
```

You should see:
```
┌─────────────────────────────────────┐
│  Assembly.AI Backend                │
│  Running on http://localhost:3000   │
└─────────────────────────────────────┘
```

**Test it's working:**
Open your browser and go to: http://localhost:3000/api/health

You should see: `{"status":"ok","version":"1.0.0"}`

If you see that — your backend is running. 🎉

---

## Step 7 — Deploy to Railway (Make It Live on the Internet)

1. Go to https://railway.app and sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Push this folder to a GitHub repo first:
```bash
git init
git add .
git commit -m "Initial Assembly.AI backend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/assemblyai-backend.git
git push -u origin main
```
4. In Railway, select your repo
5. Railway will detect it's a Node.js app and deploy automatically
6. Go to **Variables** in Railway and add every variable from your `.env` file
7. Railway will give you a URL like `https://assemblyai-backend-production.up.railway.app`
8. Update `FRONTEND_URL` in Railway variables to your actual frontend URL
9. Update `QR_BASE_URL` to `https://yourdomain.com/s`

---

## Step 8 — Connect the Frontend

In your frontend HTML files (`assembleai.html` and `assemblyai-marketing.html`), find where API calls are made and update the base URL from `http://localhost:3000` to your Railway URL.

Add this near the top of each `<script>` tag:
```javascript
const API_BASE = 'https://your-railway-url.up.railway.app';
```

Then for sign up, replace the mock `closeAuth()` with a real API call:
```javascript
async function handleAuth() {
  const email = document.querySelector('#auth-modal .modal-input').value;
  const password = document.querySelectorAll('#auth-modal .modal-input')[1].value;

  const res = await fetch(API_BASE + '/api/auth/' + authMode, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, companyName: 'Your Company' })
  });

  const data = await res.json();
  if (data.token) {
    localStorage.setItem('assemblyai_token', data.token);
    closeAuth();
    showToast('✓ Welcome to Assembly.AI!');
  }
}
```

---

## API Reference

All protected routes require: `Authorization: Bearer YOUR_TOKEN`

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/signin` | Sign in |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/me` | Update profile |
| PUT | `/api/auth/password` | Change password |

### SKUs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/skus` | List all SKUs |
| POST | `/api/skus` | Upload new SKU (multipart/form-data) |
| GET | `/api/skus/:id` | SKU detail |
| GET | `/api/skus/:id/status` | Poll processing status |
| DELETE | `/api/skus/:id` | Delete SKU |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/overview?period=7d` | Dashboard stats |
| GET | `/api/analytics/scans?period=7d` | Scans over time |
| GET | `/api/analytics/satisfaction?period=7d` | Star rating breakdown |
| GET | `/api/analytics/tod?period=7d` | Time of day |
| GET | `/api/analytics/questions?period=7d` | Top questions |

### Billing
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/billing/current` | Current plan + usage |
| POST | `/api/billing/subscribe` | Subscribe to a plan |
| POST | `/api/billing/cancel` | Cancel subscription |
| GET | `/api/billing/invoices` | Invoice history |

---

## Swapping in HeyGen (When Ready)

1. Sign up at https://heygen.com
2. Get your API key
3. Add `HEYGEN_API_KEY=your-key` to your `.env`
4. Open `lib/video.js`
5. Follow the instructions in the comments at the bottom of that file — it's a simple swap

---

## Folder Structure

```
assemblyai-backend/
├── server.js              Main Express server + QR consumer page
├── routes/
│   ├── auth.js            Sign up, sign in, profile, password
│   ├── skus.js            Upload, generate, list, delete SKUs
│   ├── analytics.js       All dashboard data + scan recording
│   ├── billing.js         Stripe plans, invoices, webhooks
│   └── settings.js        Company info, notifications
├── middleware/
│   └── auth.js            JWT verification, SKU limit check
├── lib/
│   ├── supabase.js        Database client
│   ├── qr.js              QR code generation
│   ├── video.js           Placeholder video (swap for HeyGen)
│   └── email.js           Welcome + QR ready emails
├── supabase/
│   └── schema.sql         Full database schema — run this first
├── uploads/               Uploaded instruction files (auto-created)
├── public/qr/             Generated QR code images (auto-created)
├── .env.example           Copy this to .env and fill in your keys
└── README.md              You're reading it
```

---

## Questions?

Email: hello@assemblyai.app
