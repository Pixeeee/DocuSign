-- Add indexes for authentication performance optimization
-- These queries are hot paths during login/registration

-- User lookup by email with active status (used in login)
CREATE INDEX IF NOT EXISTS "users_email_isActive_idx" ON "users"("email", "isActive");

-- User session lookup by userId (used in refresh token rotation)
CREATE INDEX IF NOT EXISTS "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

-- User by ID with minimal fields (for token validation)
CREATE INDEX IF NOT EXISTS "users_id_plan_role_idx" ON "users"("id", "plan", "role");

-- Audit logs by userId (for security monitoring)
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt" DESC);
