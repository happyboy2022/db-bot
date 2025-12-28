import Link from 'next/link';
import { logout } from '../login/actions';

export default function ForbiddenPage() {
  return (
    <div className="text-center">
      <div className="mb-4 text-6xl">🚫</div>
      <h1 className="mb-4 text-2xl font-bold">访问被拒绝</h1>
      <p className="mb-6 text-gray-600">
        您没有权限访问此页面。
      </p>
      <div className="flex justify-center gap-4">
        <Link
          href="/requests"
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          前往请求页面
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            退出登录
          </button>
        </form>
      </div>
    </div>
  );
}
