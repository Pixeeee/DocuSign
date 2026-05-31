import type { DefaultSession, DefaultUser } from "next-auth";
import type { Role, PlanType } from "@esign/db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      plan: PlanType;
      totpEnabled: boolean;
      accessToken?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: Role;
    plan: PlanType;
    totpEnabled: boolean;
    accessToken?: string;
    refreshToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    plan: PlanType;
    totpEnabled: boolean;
    accessToken?: string;
    refreshToken?: string;
  }
}
