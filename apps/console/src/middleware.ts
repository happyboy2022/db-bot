import { NextResponse, type NextRequest } from 'next/server';

const authPaths = ['/login', '/register'];
const publicPaths = ['/login', '/register', '/pending', '/forbidden'];

// Better Auth 默认的 session cookie 名称
const SESSION_COOKIE_NAME = 'better-auth.session_token';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 检查 session cookie 是否存在
  // 注意：这只是初步检查，完整的会话验证在服务器组件中进行
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const hasSessionCookie = !!sessionCookie?.value;

  // 处理认证页面 (登录/注册) - 已登录用户重定向到仪表板
  if (authPaths.some((p) => pathname.startsWith(p))) {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL('/requests', request.url));
    }
    return NextResponse.next();
  }

  // 其他公共路径 - 允许访问
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 受保护路径 - 需要认证
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 对于 admin 路径，需要在页面组件中检查权限
  // 因为 middleware 运行在 Edge Runtime，无法直接访问数据库进行 profile 查询
  // 完整的会话验证和权限检查由 requireAuth()/requireAdmin() 在服务端组件中完成

  return NextResponse.next();
}

export const config = {
  // 排除静态资源和 Better Auth API 路由
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
