import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET, // 明示的にシークレットを指定
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid profile', // email は取得しない
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt', // Cookie版JWT
    maxAge: 24 * 60 * 60, // 24時間
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: false, // 開発環境ではfalseに設定
        sameSite: 'lax',
        path: '/',
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile && profile.sub) {
        token.userId = profile.sub;
        token.displayName = profile.name || 'Anonymous';
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        session.user.displayName = token.displayName as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};