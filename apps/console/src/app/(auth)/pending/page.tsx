import { logout } from '../login/actions';

export default function PendingPage() {
  return (
    <div className="text-center">
      <div className="mb-4 text-6xl">⏳</div>
      <h1 className="mb-4 text-2xl font-bold">等待激活</h1>
      <p className="mb-6 text-gray-600">
        您的账户正在等待管理员审批，请耐心等待激活。
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          退出登录
        </button>
      </form>
    </div>
  );
}
