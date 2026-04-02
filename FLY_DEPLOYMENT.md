# Fly.io Deployment Guide

## Prerequisites
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account (free tier available)
- GitHub repository pushed (already done ✓)

## Step 1: Install Flyctl
```bash
# macOS/Linux
brew install flyctl

# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

## Step 2: Login to Fly.io
```bash
fly auth login
```
Follow the browser prompt to authenticate.

## Step 3: Create Fly App
```bash
cd c:\projects\esign-platform
fly launch
```

When prompted:
- **App Name**: `esign-platform` (or custom)
- **Region**: `sjc` (San Jose, US) or choose closest to you
- **PostgreSQL**: Yes - Create a PostgreSQL database
- **PgBouncer**: No (not needed for this scale)
- **Upstash Redis**: No

This creates a PostgreSQL database and generates the `fly.toml` file.

## Step 4: Set Environment Variables
```bash
fly secrets set \
  JWT_PRIVATE_KEY="$(cat /path/to/your/jwt-private.key)" \
  JWT_PUBLIC_KEY="$(cat /path/to/your/jwt-public.key)" \
  NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
  NEXTAUTH_URL="https://esign-platform.fly.dev" \
  API_URL="https://esign-platform.fly.dev"
```

Get DATABASE_URL from Fly (auto-generated):
```bash
fly secrets get DATABASE_URL
```

## Step 5: Deploy
```bash
fly deploy
```

Fly will:
- ✅ Build using nixpacks (auto-detects pnpm)
- ✅ Deploy both frontend (`apps/web`) and API (`apps/api`)
- ✅ Set up HTTPS with auto-renewing certificate
- ✅ Configure PostgreSQL database

## Step 6: Run Database Migrations
```bash
fly ssh console
cd /app
pnpm --filter @esign/db migrate deploy
exit
```

Or use Fly's web dashboard to run the command.

## Step 7: Access Your App
- **Frontend**: `https://esign-platform.fly.dev`
- **API**: `https://esign-platform.fly.dev/api/*`

## Common Commands

```bash
# View logs
fly logs

# SSH into machine
fly ssh console

# Scale machines
fly scale count 2

# View dashboard
fly open

# List secrets
fly secrets list

# Update secrets
fly secrets set KEY="value"

# Deploy again after git push
fly deploy
```

## Troubleshooting

**App not building?**
```bash
fly logs -n 50
```

**Database not connecting?**
```bash
fly secrets get DATABASE_URL
```

**Want to see what Fly builds?**
```bash
fly status
fly machine list
```

## Free Tier Limits
- ✅ 3 shared PostgreSQL databases
- ✅ 3 machines with 3 shared-cpu-1x 256MB RAM each
- ✅ 160GB bandwidth/month included
- ✅ No credit card required (initially)

---

**Your app is ready to deploy!** 🚀
