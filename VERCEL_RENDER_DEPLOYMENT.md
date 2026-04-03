# Vercel + Render Deployment Guide

Complete guide to deploy frontend (Vercel) + backend (Render) for eSign Platform.

## Architecture
```
Frontend (Vercel)           Backend (Render)          Database (Render)
https://your-app.vercel.app → https://your-api.onrender.com → PostgreSQL 16
```

---

## Part 1: Deploy Backend to Render

### Step 1.1: Go to Render
1. Visit https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 1.2: Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Select repository: **x402DocuSign/DocuSign**
3. Fill in:
   - **Name**: `esign-api`
   - **Environment**: `Node`
   - **Region**: `Oregon` (US) or closest to you
   - **Branch**: `main`

### Step 1.3: Build & Start Commands
Leave these as default (Render will auto-detect from `render.yaml`):
- **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @esign/db prisma generate && NODE_OPTIONS="--max-old-space-size=256" pnpm --filter @esign/web build && NODE_OPTIONS="--max-old-space-size=256" pnpm --filter @esign/api build`
- **Start Command**: `pnpm run start`

### Step 1.4: Add Environment Variables

Scroll to "Environment" section and add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22.22.2` |
| `JWT_PRIVATE_KEY` | [Copy from your `.env.local`] |
| `JWT_PUBLIC_KEY` | [Copy from your `.env.local`] |
| `NEXTAUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Will set after Vercel deployment |
| `API_URL` | Will set after Render is live |

*For now, leave NEXTAUTH_URL and API_URL blank - we'll update them after both are deployed*

### Step 1.5: Create PostgreSQL Database
1. Click **"New +"** → **"PostgreSQL"**
2. Fill in:
   - **Name**: `esign-db`
   - **Database**: `esign_db`
   - **User**: `esign_user`
   - **Region**: Same as web service
   - **Plan**: `Free`

3. Wait for database to be created
4. Copy the **Internal Database URL**
5. Go back to web service → Update environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: [Paste the Internal Database URL]

### Step 1.6: Deploy Web Service
1. Scroll to top and click **"Create Web Service"**
2. Wait for build to complete (5-10 minutes)
3. Once deployed, you'll get a URL like: `https://esign-api.onrender.com`
4. **Save this URL** - you'll need it for frontend

---

## Part 2: Deploy Frontend to Vercel

### Step 2.1: Go to Vercel
1. Visit https://vercel.com
2. Sign up with GitHub
3. Authorize Vercel to access repositories

### Step 2.2: Create New Project
1. Click **"Add New..."** → **"Project"**
2. Select repository: **x402DocuSign/DocuSign**
3. Fill in:
   - **Project Name**: `esign-platform` (or your choice)
   - **Framework Preset**: `Next.js` (auto-detected)
   - **Root Directory**: `apps/web`

### Step 2.3: Build Settings
Vercel auto-detects from `vercel.json`:
- **Build Command**: `pnpm --filter @esign/web build`
- **Output Directory**: `apps/web/.next`

✅ Leave as default (detected automatically)

### Step 2.4: Add Environment Variables
Click **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `NEXTAUTH_URL` | `https://your-vercel-url.vercel.app` |
| `NEXTAUTH_SECRET` | [Same one from Render setup] |
| `API_URL` | `https://esign-api.onrender.com` |

**To get your Vercel URL:**
1. After clicking "Deploy", Vercel will give you a URL like `https://esign-platform-xyz.vercel.app`
2. Copy this and paste as `NEXTAUTH_URL`

### Step 2.5: Deploy
1. Click **"Deploy"**
2. Wait for build to complete (3-5 minutes)
3. You'll get a live URL: `https://esign-platform-xyz.vercel.app`

---

## Part 3: Update Environment Variables

Now that both are deployed, update them with each other's URLs:

### On Render (Backend):
1. Go to **esign-api** service → **Settings** → **Environment**
2. Update/Add:
   - **NEXTAUTH_URL**: `https://your-vercel-url.vercel.app` (from Vercel)
   - **API_URL**: `https://esign-api.onrender.com` (your Render URL)

3. Click **"Save"** - Render auto-redeploys

### On Vercel (Frontend):
1. Go to project settings → **Environment Variables**
2. Update:
   - **API_URL**: `https://esign-api.onrender.com` (your Render URL)

3. Click **"Save and Redeploy"**

---

## Part 4: Run Database Migrations

Once backend is live:

### Option A: Using Render Shell (Easiest)
1. Go to Render dashboard → **esign-api** service
2. Click **"Shell"** tab
3. Run:
   ```bash
   pnpm --filter @esign/db migrate deploy
   ```

### Option B: SSH into Service
```bash
render ssh -e production
cd /app
pnpm --filter @esign/db migrate deploy
exit
```

---

## Part 5: Test Your Deployment

### 1. Test Frontend
```
https://your-vercel-url.vercel.app
```
- Should load the login page ✓
- No errors in browser console ✓

### 2. Test Backend
```
https://esign-api.onrender.com/api/health
```
- Should return: `{"status":"ok"}` ✓

### 3. Test Complete Flow
1. Go to frontend URL
2. **Register** a new account
3. **Login** with credentials
4. **Upload** a PDF document
5. **Create signature** (test only)
6. **Verify** document appears in dashboard

---

## Automatic Redeployment

Both Vercel and Render auto-deploy when you push to `main`:

```bash
git add .
git commit -m "your changes"
git push origin main

# Vercel deploys frontend automatically (2-3 minutes)
# Render deploys backend automatically (5-10 minutes)
```

---

## Environment Variables Summary

### Vercel (Frontend) Needs:
- `NEXTAUTH_URL` = Your Vercel URL
- `NEXTAUTH_SECRET` = Generated secret
- `API_URL` = Your Render backend URL

### Render (Backend) Needs:
- `NODE_ENV` = `production`
- `DATABASE_URL` = Auto-linked from PostgreSQL
- `JWT_PRIVATE_KEY` = From `.env.local`
- `JWT_PUBLIC_KEY` = From `.env.local`
- `NEXTAUTH_SECRET` = Same as Vercel
- `NEXTAUTH_URL` = Your Vercel URL
- `API_URL` = Your Render URL

---

## Free Tier Limitations

### Vercel
- ✅ Unlimited deployments
- ✅ Generous free tier
- ✅ Good for Next.js
- ⚠️ Cold starts can be slow

### Render
- ⚠️ Free tier spins down after 15 minutes of inactivity
- ⚠️ PostgreSQL spins down after 90 days of inactivity
- ✅ Wakes up on first request

**Upgrade when ready:**
- Vercel: $20/month for Pro/Team features
- Render: $7/month for web service + $15/month for PostgreSQL

---

## Troubleshooting

### Frontend loads but API calls fail
- Check `API_URL` in Vercel environment variables
- Verify backend is running: https://esign-api.onrender.com/api/health
- Check CORS settings in backend (should be enabled)

### Backend deployment fails
- Check build logs in Render dashboard
- Verify `pnpm install --frozen-lockfile` works locally
- Confirm PostgreSQL database is created

### Database connection error
- Verify `DATABASE_URL` in Render environment
- Check PostgreSQL service is running
- Run migrations: `pnpm --filter @esign/db migrate deploy`

### "Migrations have not been run yet"
- SSH into Render backend: `render ssh -e production`
- Run: `pnpm --filter @esign/db migrate deploy`

---

## Monitoring

### Vercel
1. Go to project → **Analytics** tab
- View request counts
- Monitor performance

### Render
1. Go to service → **Metrics** tab
- CPU usage
- Memory usage
- Request count

---

## Next Steps

1. ✅ Deploy backend to Render
2. ✅ Deploy frontend to Vercel
3. ✅ Connect them with environment variables
4. ✅ Run database migrations
5. ✅ Test the complete flow
6. 🎉 Your app is live!

---

## Support & Docs

- **Vercel Docs**: https://vercel.com/docs
- **Render Docs**: https://render.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Project Repo**: https://github.com/x402DocuSign/DocuSign

**Deployment Workflow:**
```
Local Development
      ↓
git push origin main
      ↓
GitHub webhook triggers
      ↓
Vercel builds & deploys frontend (2-3 min)
Render builds & deploys backend (5-10 min)
      ↓
Both services live at their URLs
```

🚀 **Your application is now deployed!**
