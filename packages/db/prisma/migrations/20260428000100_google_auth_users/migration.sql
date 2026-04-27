-- Support OAuth users that authenticate through Google.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");
