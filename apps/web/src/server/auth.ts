import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { findUserByEmailWithHash } from "@training/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Auth.js v5 — Credentials-only, JWT session strategy, NO database adapter.
 *
 * Rationale (see ARCH-006 and ARCH-020):
 *  - JWT sessions keep the door open for a future mobile client's bearer
 *    token without introducing a second auth system.
 *  - Credentials-only is what Phase 0 requires ("email/password signup +
 *    login").
 *  - No adapter means Auth.js does not need Account/Session/Verification
 *    tables; the Prisma schema stays minimal (see prisma/schema.prisma).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
           async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await findUserByEmailWithHash(parsed.data.email);
        if (!user) return null;

        // ARCH-024 made passwordHash nullable to anticipate future OAuth.
        // Credentials provider requires a hash; if absent, this user can't
        // sign in via password (they'd need OAuth once implemented).
        if (!user.passwordHash) return null;

        const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordMatches) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
});