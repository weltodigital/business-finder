import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieItem = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ['/login', '/auth'];

/** Refreshes the Supabase session cookie and gates the application behind auth. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without Supabase configured there is nothing to authenticate against;
  // let the request through so the setup page can explain what is missing.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: CookieItem[]) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  // API routes answer with JSON, never an HTML redirect: the route handlers
  // return a 401 the client can actually parse.
  if (!user && request.nextUrl.pathname.startsWith('/api/')) return response;

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && request.nextUrl.pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
