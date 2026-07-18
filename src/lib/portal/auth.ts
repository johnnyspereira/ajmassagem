import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// A dedicated storage key keeps Portal 360 sessions separate from CRM staff
// sessions, even when both applications are open in the same browser.
export async function createPortalAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storageKey: 'wacrm-portal-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            })
          );
        },
      },
    }
  );
}
