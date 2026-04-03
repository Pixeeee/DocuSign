# Vercel + Render Deployment Guide

Complete guide to deploy frontend (Vercel) + backend (Render) for eSign Platform.

## ⚠️ PRE-DEPLOYMENT CHECKLIST (READ FIRST!)

**Before deploying, verify locally:**

```bash
# 1. Test build succeeds locally
pnpm install --frozen-lockfile
pnpm --filter @esign/db prisma generate
pnpm --filter @esign/api build

# 2. Test start command works
pnpm run start

# 3. Verify render.yaml is in root
ls -la render.yaml

# 4. Verify all changes are committed
git status
git log --oneline -5
```

**Fix these common issues BEFORE deploying:**

- ✅ All code pushed to GitHub (git status should be clean)
- ✅ render.yaml exists in project root (not in any subdirectory)
- ✅ render.yaml has no YAML syntax errors (check via https://www.yamllint.com/)
- ✅ pnpm-lock.yaml is committed to git
- ✅ All environment variables will be added to Render (not in render.yaml)
- ✅ PostgreSQL service name is `esign-postgres` in render.yaml

---

## Architecture
```
Frontend (Vercel)           Backend (Render)          Database (Render)
https://your-app.vercel.app → https://your-api.onrender.com → PostgreSQL 16
```

## Optimization Strategy ✨

**Why split frontend and backend across platforms:**
- ✅ **Vercel** (Frontend): Optimized for Next.js, fast builds, CDN
- ✅ **Render** (Backend): Full backend control, PostgreSQL included, ~$7/month
- ✅ **Memory Efficient**: Backend-only builds (saves 50% memory in Render free tier)
- ✅ **Auto-deploy**: Both platforms auto-build when you push to `main`

**Memory Optimization Details:**
- Frontend builds on Vercel (doesn't impact Render memory)
- Backend builds only `@esign/api` + `@esign/db`
- Node process capped at 320MB (safe under 512MB limit)
- Result: Stable deployments without out-of-memory errors ✅

---

## Part 1: Deploy Backend to Render

### Step 1.1: Go to Render
1. Visit https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Step 1.2: Create Web Service - BLUEPRINT MODE
1. Click **"New +"** → **"Web Service"**
2. Select repository: **x402DocuSign/DocuSign**
3. You'll see: **"It looks like we don't have access to your repo..."**
   - Click **"Connect anyway"** to continue (required!)
4. **CRITICAL - Verify Blueprint Detection:**
   - Look for: **"Render will look for a render.yaml file to configure this service"**
   - This message = Blueprint is active ✅
   - If you DON'T see it → STOP, go back, try again
5. Verify: **"This repository has a render.yaml file"** (green checkmark ✅)
6. Fill in:
   - **Name**: `esign-api`
   - **Region**: `Oregon` (US) or closest to you
   - **Branch**: `main`

### Step 1.3: Verify Settings (Do NOT Edit These)
**✅ Build Command field should be EMPTY or greyed out**
- Render is using render.yaml blueprint
- DO NOT manually enter anything
- If you see an editable field with `pnpm` command → Wrong mode, go back

**✅ Start Command field should be EMPTY or greyed out**
- render.yaml has `startCommand: pnpm run start`

**✅ Root Directory field should be EMPTY**
- Monorepo structure handled by render.yaml automatically

**What render.yaml will do:**
- Install: `pnpm install --frozen-lockfile`
- Generate Prisma: `pnpm --filter @esign/db prisma generate`
- Build: `NODE_OPTIONS="--max-old-space-size=320" pnpm --filter @esign/api build`
- Start: `pnpm run start`
- Total: Backend-only deployment, 320MB memory, no frontend build

### Step 1.4: Add Environment Variables

**IMPORTANT**: These values should be in `render.yaml` already, but verify they exist on Render dashboard:

1. Go to **Settings** → **Environment Variables**
2. **Render auto-adds** (you see these, don't edit):
   - `NODE_ENV` = `production`
   - `NODE_VERSION` = `22.22.2`
   - `DATABASE_URL` = Auto-linked from PostgreSQL
   - `API_URL` = Auto-generated from service name

3. **You MUST add manually** (click **"Add Secret"** for each):
   - `JWT_PRIVATE_KEY` = [Copy from your `.env.local`] ✅ REQUIRED
   - `JWT_PUBLIC_KEY` = [Copy from your `.env.local`] ✅ REQUIRED
   - `NEXTAUTH_SECRET` = Generate with `openssl rand -base64 32` ✅ REQUIRED
   - `NEXTAUTH_URL` = [Set AFTER Vercel deploys]

**To get JWT keys from .env.local:**
```bash
# In your local project
cat .env.local | grep JWT
echo "---"
echo "Copy JWT_PRIVATE_KEY value (entire long key)"
echo "Copy JWT_PUBLIC_KEY value (entire long key)"
```

**Mark as secrets:**
- ✅ CHECK "Is this a secret?" for JWT_* and NEXTAUTH_SECRET
- ✅ This prevents values from showing in logs

**⚠️ DO NOT copy DATABASE_URL** - Render auto-links it from PostgreSQL service

### Step 1.5: Create PostgreSQL Database
1. Click **"New +"** → **"PostgreSQL"**
2. Fill in:
   - **Name**: `esign-postgres` ⚠️ **EXACT NAME REQUIRED** (render.yaml references this)
   - **Database**: `esign_db`
   - **User**: `esign_user`
   - **Region**: **Same as esign-api web service** (CRITICAL!)
   - **Plan**: `Free`

3. Click **"Create Database"** and wait (3-5 minutes)

4. **Render auto-links DATABASE_URL:**
   - ⚠️ DO NOT manually copy/paste DATABASE_URL
   - render.yaml has `fromDatabase: esign-postgres` - it auto-links
   - Just verify it appears in environment variables after creation

5. **Verify database is ready:**
   - Go to esign-postgres service
   - Click "Connect" tab
   - See database credentials

### Step 1.6: Deploy Web Service
1. Scroll to top and click **"Create Web Service"**
2. Render starts the build (watch logs in **"Logs"** tab)
3. **Wait for build to complete** (5-10 minutes for first build)

**If build fails, check:**
- ✅ render.yaml is in repo root (not in subdirectory)
- ✅ render.yaml has valid YAML syntax (https://www.yamllint.com/)
- ✅ `pnpm-lock.yaml` is committed to git
- ✅ All code is pushed to GitHub (git push origin main)
- ✅ PostgreSQL service exists and is in same region
- ✅ Check **"Logs"** tab for exact error message

**Build logs you should see:**
```
==> Cloning from https://github.com/x402DocuSign/DocuSign
==> Checking out commit...
==> Running build command 'pnpm install --frozen-lockfile && ...'
pnpm install: Done
pnpm --filter @esign/db prisma generate: Done
Building @esign/api...
==> Build succeeded! 🎉
```

4. Once deployed, you'll get a URL like: `https://esign-api.onrender.com`
5. **Save this URL** - you'll need it for frontend

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

### Vercel (Frontend Only) Needs:
- `NEXTAUTH_URL` = Your Vercel URL
- `NEXTAUTH_SECRET` = Generated secret
- `API_URL` = Your Render backend URL

### Render (Backend Only) Needs:
- `NODE_ENV` = `production`
- `NODE_VERSION` = `22.22.2`
- `DATABASE_URL` = Auto-linked from PostgreSQL
- `JWT_PRIVATE_KEY` = From `.env.local`
- `JWT_PUBLIC_KEY` = From `.env.local`
- `NEXTAUTH_SECRET` = Same as Vercel
- `NEXTAUTH_URL` = Your Vercel URL (for OAuth redirects)
- `API_URL` = Auto-generated: `https://${render.host}`

**Deployment Strategy:**
```
Vercel builds & deploys: apps/web/ (frontend only)
Render builds & deploys: apps/api/ + packages/db (backend only)
Each optimized for their platform
```

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

### ❌ "turbo: not found" Error (render.yaml NOT DETECTED)
**Root Cause**: Render is NOT using render.yaml - it ran root `package.json` build instead

**Evidence in logs:**
```
> esign-platform@1.0.0 build
> turbo build
sh: 1: turbo: not found
```
← turbo is only in devDependencies (NODE_ENV=production skips it)

**Solution - DELETE & RECREATE Service:**
1. Go to Render dashboard → esign-api service
2. Click **Settings** → Scroll to **"Danger Zone"** → **"Delete Service"**
3. Confirm deletion (wait for it to complete)
4. Click **"New +"** → **"Web Service"**
5. Select repository: **x402DocuSign/DocuSign**
6. **CRITICAL STEP** - You'll see:
   ```
   "It looks like we don't have access to your repo, but we'll try to clone it anyway."
   ```
   Click **"Connect anyway"** ← This enables Blueprint mode
7. **VERIFY** - You should see:
   ```
   "Render will look for a render.yaml file to configure this service"
   ```
   If you DON'T see this → STOP, Render support issue
8. **VERIFY** - You should see:
   ```
   "This repository has a render.yaml file" ✅
   ```
9. Configuration:
   - Name: `esign-api`
   - Region: `Oregon` (or closest)
   - Branch: `main`
10. **DO NOT EDIT** Build/Start/Root fields (should be empty for Blueprint mode)
11. Click **"Create Web Service"** and watch logs

**Correct build logs will show:**
```
==> Running build command 'pnpm install --frozen-lockfile && pnpm --filter @esign/db prisma generate && NODE_OPTIONS="--max-old-space-size=320" pnpm --filter @esign/api build'
```

**If STILL getting turbo error:**
1. Validate YAML: Paste render.yaml content into https://www.yamllint.com/ (check for errors)
2. Verify file location: `ls -la render.yaml` (must show file exists at root)
3. Force update: `git push origin main` (Render may have stale cache)
4. Wait 30 seconds then check again in Render dashboard

---

### ❌ "Database connection error" or "ECONNREFUSED"
**Root Cause**: PostgreSQL service name doesn't match or region mismatch

**Fix:**
1. ✅ Verify PostgreSQL service name is **EXACTLY** `esign-postgres`
   - Go to Render dashboard → PostgreSQL service
   - Settings → Name should be `esign-postgres` (case-sensitive)
2. ✅ Verify both services are in **SAME region**
   - esign-api service: Settings → Region
   - esign-postgres service: Settings → Region
   - If different, delete and recreate in same region
3. ✅ Verify DATABASE_URL in environment variables
   - Get from: esign-api → Settings → Environment Variables
   - Should contain: `postgresql://user:password@...`
4. Run migrations: `pnpm --filter @esign/db migrate deploy`

---

### ❌ Build succeeds but no logs after "build succeeded"
**Root Cause**: Start command is wrong or application is crashing

**Check:**
1. Go to esign-api → **"Logs"** tab → Switch to **"Latest"** view
2. Look for error messages after "Listening on port"
3. Common issues:
   - ❌ `Error: Cannot find module` → Missing dependency (run `pnpm install` locally)
   - ❌ `Error: getaddrinfo ENOTFOUND esign-postgres` → Region mismatch for PostgreSQL
   - ❌ `Error: connect ECONNREFUSED` → Database not ready (wait 5 more minutes)
4. If crashed, check: esign-api → Settings → Start Command (should be empty for render.yaml)

---

### Memory Optimization (Render Free Tier)
**render.yaml is optimized for safe deployment:**
- ✅ Backend-only build (frontend on Vercel)
- ✅ 320MB Node memory limit (under 512MB container)
- ✅ Only builds `@esign/api` + `@esign/db`
- ✅ ~50% faster builds and less memory usage

If you still hit memory limits:
1. Check build logs in Render dashboard
2. Memory per process is capped at 320MB (safe)
3. Upgrade to paid plan if needed ($7/month)

---

### ✅ Backend health check endpoint

**Test that backend is actually running:**
```bash
curl https://esign-api.onrender.com/api/health
# Should return: {"status":"ok"}
```

If 404 or connection refused:
1. Backend may still be starting (wait 2-3 min)
2. Check Render logs: esign-api → Logs → Latest
3. Verify start command works locally: `pnpm run start`

---

### Frontend loads but API calls fail
- ❌ Check `API_URL` in Vercel environment variables (should be `https://esign-api.onrender.com`)
- ❌ Verify backend health: `curl https://esign-api.onrender.com/api/health`
- ❌ Check browser console for actual error messages
- ❌ Verify CORS is enabled in backend (should be by default in express.ts)

---

### Backend fails to run after successful build
- ✅ Check Render logs: esign-api → Logs → Switch to **"Latest"**
- ✅ Look for errors like: `Cannot find module`, `ECONNREFUSED`, `TypeError`
- ✅ Verify start command is empty (auto-detected from render.yaml as `pnpm run start`)
- ✅ Verify Node.js version: Should see `Using Node.js version 22.22.2`

---

### "Migrations have not been run yet" error when accessing app
- ✅ SSH into Render backend:
  ```bash
  render ssh -e production
  cd /app
  pnpm --filter @esign/db migrate deploy
  exit
  ```
- ✅ Or use Render Shell (easier):
  1. esign-api → Shell tab
  2. Run: `pnpm --filter @esign/db migrate deploy`
  3. Should complete in <1 minute

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
