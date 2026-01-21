import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the token from the request
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // Protect /admin routes - require ADMIN role
  if (pathname.startsWith("/admin")) {
    // If not authenticated, redirect to login
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // If not admin, redirect to dashboard with error
    if (token.role !== "ADMIN") {
      const dashboardUrl = new URL("/dashboard", request.url);
      dashboardUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Protect /api/admin routes - require ADMIN role
  if (pathname.startsWith("/api/admin")) {
    if (!token) {
      return NextResponse.json(
        { message: "לא מורשה - נדרשת התחברות" },
        { status: 401 }
      );
    }

    if (token.role !== "ADMIN") {
      return NextResponse.json(
        { message: "לא מורשה - נדרשות הרשאות מנהל" },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

// Configure which paths should be processed by the middleware
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};

