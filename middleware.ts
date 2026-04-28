// middleware.ts — désactivé : la protection /admin est gérée côté client
// dans DDAFLIX-Admin.html (guard Supabase avec vérification du rôle admin)

export const config = {
  matcher: '/admin',
};

export default async function middleware(_request: Request): Promise<Response> {
  return new Response(null, { status: 200, headers: { 'x-middleware-next': '1' } });
}
