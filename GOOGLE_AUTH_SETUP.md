# Google Authentication Setup Guide

> **Status:** ✅ Complete  
> **Last Updated:** April 25, 2026

## Overview

Your eSign Platform now supports Google OAuth authentication. Users can sign in with their Google account, which creates or updates their user profile in the database.

---

## Architecture

### Flow Diagram
```
User clicks "Continue with Google"
        ↓
NextAuth Google Provider (Frontend)
        ↓
Redirects to Google Login
        ↓
Google authorizes & returns code
        ↓
NextAuth exchanges code for user info
        ↓
SignIn Callback: POST /api/auth/google (Backend)
        ↓
Backend creates/updates user in DB
        ↓
Backend returns tokens (accessToken, refreshToken)
        ↓
NextAuth stores tokens in session
        ↓
User redirected to /dashboard
```

### Components

**Frontend (Next.js):**
- `apps/web/app/api/auth/[...nextauth]/options.ts` - NextAuth configuration
- `apps/web/app/auth/login/page.tsx` - Login page with Google button
- Google OAuth credentials in environment variables

**Backend (Express):**
- `apps/api/src/routes/auth.ts` - `/api/auth/google` endpoint
- Handles user creation/updates with Google profile data
- Returns JWT tokens for session management

---

## Configuration

### 1. Environment Variables (Already Configured ✅)

The following variables are set in `.env.local`:

```env
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=use-a-secure-random-key-min-32-chars
```

### 2. Credentials Source

Credentials are extracted from `google_auth.json`:
- **Project ID:** signhere-493220
- **OAuth App Name:** Sign Here (Google Cloud Console)
- **Authorized Redirect URIs:** 
  - `http://localhost:3000/api/auth/callback/google` (local dev)
  - `http://yourdomain.com/api/auth/callback/google` (production)

### 3. How to Update Google OAuth in Production

When deploying to production, you'll need to:

1. **Update Redirect URI in Google Cloud Console:**
   ```
   https://yourdomain.com/api/auth/callback/google
   ```

2. **Update Environment Variables:**
   ```bash
   GOOGLE_CLIENT_ID=your-production-client-id
   GOOGLE_CLIENT_SECRET=your-production-client-secret
   NEXTAUTH_URL=https://yourdomain.com
   NEXTAUTH_SECRET=use-a-secure-random-key-min-32-chars
   ```

3. **Generate NEXTAUTH_SECRET:**
   ```bash
   openssl rand -base64 32
   # or use: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## How It Works

### User Flow: New User via Google

1. User clicks **"Continue with Google"** button on login page
2. Redirected to Google login (if not signed in)
3. User authorizes the app
4. Google returns:
   - `id` (Google ID)
   - `name` (user's name)
   - `email` (verified email)
   - `image` (profile picture URL)

5. NextAuth `signIn` callback sends data to backend:
   ```typescript
   POST /api/auth/google
   {
     email: "user@gmail.com",
     name: "John Doe",
     googleId: "118261472930384922893",
     image: "https://lh3.googleusercontent.com/..."
   }
   ```

6. Backend (`auth.ts` lines 100-150):
   - ✅ Checks if user exists by email
   - ✅ If new user: Creates account with Google data
   - ✅ If existing user: Links Google ID to existing account
   - ✅ Returns JWT tokens (`accessToken`, `refreshToken`)

7. NextAuth stores tokens in JWT session
8. User automatically logged in to `/dashboard`

### User Flow: Existing User (Email/Password) Adding Google

If user has an existing account with email/password:

1. Next time they sign in with Google (same email)
2. Backend finds existing user by email
3. Updates user record with `googleId`
4. Returns tokens - seamless login

This allows users to switch between sign-in methods.

---

## API Reference

### POST /api/auth/google

**Frontend → Backend:** Called automatically by NextAuth during signin callback.

**Request Body:**
```json
{
  "email": "user@gmail.com",
  "name": "John Doe",
  "googleId": "118261472930384922893",
  "image": "https://lh3.googleusercontent.com/..."
}
```

**Response (Success):**
```json
{
  "message": "Google authentication successful",
  "user": {
    "id": "uuid-here",
    "email": "user@gmail.com",
    "firstName": "John",
    "lastName": "Doe",
    "plan": "free",
    "role": "user",
    "totpEnabled": false
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**Response (Error):**
```json
{
  "error": "Google authentication failed"
}
```

**Status Codes:**
- `200` - Authentication successful
- `400` - Invalid request or auth failed
- `409` - Conflict (shouldn't happen with Google)

---

## Testing Google Auth

### Local Development

1. **Start both servers:**
   ```bash
   # Terminal 1: Backend
   pnpm --filter @esign/api dev
   
   # Terminal 2: Frontend
   pnpm --filter @esign/web dev
   ```

2. **Navigate to login page:**
   ```
   http://localhost:3000/auth/login
   ```

3. **Click "Continue with Google"**

4. **Expected behavior:**
   - Redirected to Google login
   - After authorizing, redirected to `/dashboard`
   - User profile visible in dashboard

5. **Troubleshooting:**
   - Check browser console for errors
   - Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
   - Check NextAuth logs: `[NextAuth]` prefix in terminal

### Verifying Token Storage

After login, check that tokens are stored:

```javascript
// In browser console
const session = await fetch('http://localhost:3000/api/auth/session').then(r => r.json())
console.log(session.user.accessToken) // Should show JWT token
```

---

## Security Considerations

### ✅ Implemented
- **Token Validation:** AccessToken is RS256 signed JWT
- **Session Storage:** Tokens stored in secure JWT session
- **HTTPS Required:** Production must use HTTPS for Google OAuth
- **CORS Protected:** Backend validates origin
- **User Verification:** Google ID verified before creating account

### ⚠️ Important for Production

1. **Rotate `NEXTAUTH_SECRET`:**
   - Change before deploying to production
   - Use a secure random value (min 32 characters)

2. **Enable HTTPS:**
   - Google OAuth requires HTTPS in production
   - Update `NEXTAUTH_URL` to `https://yourdomain.com`

3. **Update Redirect URI:**
   - Add production domain to Google Cloud Console
   - Format: `https://yourdomain.com/api/auth/callback/google`

4. **Monitor Logs:**
   - Keep error logs to detect unusual auth patterns
   - Watch for repeated failed Google authentications

5. **Token Expiration:**
   - AccessToken: 15 minutes
   - RefreshToken: 7 days (in session)
   - Session maxAge: 7 days

---

## Database Schema

When a user signs in with Google, this is created/updated in the database:

```sql
-- users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  firstName VARCHAR(50),
  lastName VARCHAR(50),
  googleId VARCHAR(255),  -- Google user ID
  avatarUrl VARCHAR(500),  -- User's profile picture
  passwordHash VARCHAR(255) NULL,  -- NULL for Google-only users
  isVerified BOOLEAN DEFAULT true,  -- Google emails are auto-verified
  isActive BOOLEAN DEFAULT true,
  plan VARCHAR(50) DEFAULT 'free',
  role VARCHAR(50) DEFAULT 'user',
  totpEnabled BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### Important Fields for Google Auth

- `email` - Required, auto-verified from Google
- `googleId` - Linked to Google account
- `avatarUrl` - Profile picture from Google
- `passwordHash` - NULL for Google-only users
- `isVerified` - Always true for Google signups
- `firstName` / `lastName` - Parsed from Google `name` field

---

## Linking Existing Accounts

Users can link multiple sign-in methods to the same account:

**Scenario:** User has email/password account, then signs in with Google (same email)

```
Email registered: john@gmail.com (with password)
                 ↓
User clicks "Continue with Google"
                 ↓
Backend finds user by john@gmail.com
                 ↓
Links Google ID to existing account
                 ↓
User can now sign in with either:
  - Email/password
  - Google OAuth
```

### Unlinking

Currently, there's no UI for unlinking. To unlink:

```sql
UPDATE users SET googleId = NULL WHERE id = 'user-uuid';
```

---

## Troubleshooting

### "GOOGLE_CLIENT_ID is missing"
**Solution:** Verify in `.env.local`:
```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Redirect URI mismatch error
**Solution:** Add to Google Cloud Console:
- Go to: Google Cloud Console → OAuth 2.0 Credentials
- Update redirect URI to match your domain:
  - Local: `http://localhost:3000/api/auth/callback/google`
  - Production: `https://yourdomain.com/api/auth/callback/google`

### User not created after Google login
**Check:**
1. Database connection working (`pnpm db:migrate`)
2. Backend `/api/auth/google` endpoint is responding
3. No error in backend logs (prefix: `[NextAuth]`)

### Tokens not appearing in session
**Check:**
1. `NEXTAUTH_SECRET` is set (and same across requests)
2. Session callback is executing (`[NextAuth session callback]` in logs)
3. Backend returned valid tokens in response

### "Authentication failed" after Google redirect
**Likely causes:**
1. Email not verified in Google account
2. Backend `/api/auth/google` endpoint down
3. Database constraint violation (shouldn't happen)

**Debug:**
```bash
# Check backend is running
curl http://localhost:4000/health

# Check Google endpoint
curl -X POST http://localhost:4000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"email":"test@gmail.com","name":"Test","googleId":"123","image":""}'
```

---

## Next Steps

✅ **Google Auth is now configured and ready to use!**

### Testing Checklist
- [ ] Run both servers (`pnpm dev` in root)
- [ ] Click "Continue with Google" on login page
- [ ] Verify redirect to Google login
- [ ] Authorize the app
- [ ] Verify redirect to `/dashboard`
- [ ] Check user profile loaded correctly
- [ ] Test with second Google account (new user creation)

### Production Deployment
- [ ] Generate secure `NEXTAUTH_SECRET`
- [ ] Update `NEXTAUTH_URL` to production domain
- [ ] Add production redirect URI to Google Cloud Console
- [ ] Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for production app
- [ ] Enable HTTPS
- [ ] Test end-to-end in production

### Optional Enhancements
- [ ] Add GitHub OAuth (same NextAuth pattern)
- [ ] Add sign-in method linking UI
- [ ] Add sign-in method unlinking
- [ ] Add account recovery via email
- [ ] Add passwordless magic link auth

---

## Files Modified

```
✅ .env.local                                           Added Google OAuth vars
✅ .env.example                                         Added Google OAuth vars
ℹ️ apps/web/app/api/auth/[...nextauth]/options.ts     (Already configured)
ℹ️ apps/web/app/api/auth/[...nextauth]/route.ts       (Already configured)
ℹ️ apps/web/app/auth/login/page.tsx                   (Google button already present)
ℹ️ apps/api/src/routes/auth.ts                        (Google endpoint already present)
📄 google_auth.json                                     (Credentials source)
```

---

## Questions?

- **How do I change the user's default plan?** → See backend: `apps/api/src/routes/auth.ts` line 58, add `plan: 'premium'` to `user.create()`
- **Can I use the same Google app for multiple domains?** → Yes, just add all domains to redirect URIs in Google Cloud Console
- **What if user deletes their Google account?** → They can no longer sign in via Google, but email/password login (if set) still works
- **How are profile pictures updated?** → Only on first signup. To sync updates, you'd need to call Google API periodically

---

**Maintained by:** ESign Platform Team  
**Last Tested:** April 25, 2026
