import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      displayName: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface JWT {
    userId: string;
    displayName: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    displayName: string;
  }
}