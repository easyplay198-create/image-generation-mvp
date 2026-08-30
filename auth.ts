import NextAuth, { type NextAuthConfig } from "next-auth";

import { createP2AuthAdapter } from "@/src/auth/authjs-adapter";
import { createP2AuthEmailProvider } from "@/src/auth/authjs-email";
import { getDatabaseClient } from "@/src/storage/database";

export const P2_AUTH_SESSION_COOKIE = Object.freeze({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
});

export const { handlers, auth } = NextAuth((): NextAuthConfig => {
  const database = getDatabaseClient();
  const adapter = createP2AuthAdapter(database);
  const secure = process.env.NODE_ENV === "production";

  return {
    adapter,
    providers: [createP2AuthEmailProvider()],
    session: {
      strategy: "database",
      maxAge: 604800,
      updateAge: 0,
    },
    cookies: {
      sessionToken: {
        name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
        options: { ...P2_AUTH_SESSION_COOKIE, secure },
      },
    },
    callbacks: {
      async signIn({ user }) {
        if (!user.email || !adapter.getUserByEmail) return false;
        const actor = await adapter.getUserByEmail(user.email);
        return actor !== null && actor.id === user.id;
      },
      async session({ session, user }) {
        return {
          ...session,
          user: { ...session.user, id: user.id },
        };
      },
    },
  };
});
