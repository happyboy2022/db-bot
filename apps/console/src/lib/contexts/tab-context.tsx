'use client';

import {
  createContext,
  useContext,
  useCallback,
  useReducer,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';

export interface Tab {
  id: string;      // 唯一标识（通常是 pathname）
  href: string;    // 路由路径
  label: string;   // 显示标题
  closable: boolean; // 是否可关闭
}

interface TabContextValue {
  tabs: Tab[];                           // 所有打开的页签
  activeTabId: string | null;            // 当前活跃的页签 ID
  addTab: (tab: Omit<Tab, 'id'>) => void; // 添加页签
  removeTab: (tabId: string) => void;    // 关闭页签
  switchTab: (tabId: string) => void;    // 切换页签
  updateTabLabel: (tabId: string, label: string) => void; // 更新页签标题
}

const TabContext = createContext<TabContextValue | null>(null);

// 路由配置 - 用于生成页签标题
const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/requests': 'SQL 请求',
  '/requests/new': '新建请求',
  '/requests/import': '导入请求',
  '/admin/approvals': '审批管理',
  '/admin/users': '用户管理',
  '/admin/clusters': '集群管理',
  '/admin/databases': '数据库管理',
  '/admin/templates': '模板管理',
  '/admin/sessions': '会话管理',
  '/admin/audit': '审计日志',
};

// 不可关闭的固定页签路由
const PINNED_ROUTES = ['/dashboard', '/requests'];

// 获取路由对应的标签名称
function getRouteLabel(pathname: string): string {
  // 精确匹配
  if (ROUTE_LABELS[pathname]) {
    return ROUTE_LABELS[pathname];
  }

  // 动态路由匹配
  if (pathname.match(/^\/requests\/[^/]+\/edit$/)) {
    return '编辑请求';
  }
  if (pathname.match(/^\/requests\/[^/]+\/execute$/)) {
    return '执行请求';
  }
  if (pathname.match(/^\/requests\/[^/]+$/) && pathname !== '/requests/new' && pathname !== '/requests/import') {
    // 提取请求 ID 的前 8 位作为标题的一部分
    const parts = pathname.split('/');
    const requestId = parts[parts.length - 1];
    const shortId = requestId.length > 8 ? requestId.slice(0, 8) : requestId;
    return `请求 ${shortId}...`;
  }

  return '页面';
}

// 判断路由是否可以添加为页签
function isTabRoute(pathname: string): boolean {
  // 排除根路径（会重定向到 /requests）
  if (pathname === '/') {
    return false;
  }

  // 排除登录、注册等认证页面
  if (pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/pending') ||
      pathname.startsWith('/forbidden')) {
    return false;
  }

  return true;
}

const STORAGE_KEY = 'sql-ops-tabs';
const MAX_TABS = 10; // 最大页签数量

// 从 localStorage 加载页签
function loadTabsFromStorage(): Tab[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // 忽略解析错误
  }

  return [];
}

// 保存页签到 localStorage
function saveTabsToStorage(tabs: Tab[]) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // 忽略存储错误
  }
}

// 状态类型
interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  isInitialized: boolean;
}

// Action 类型
type TabAction =
  | { type: 'INIT'; payload: { tabs: Tab[]; activeTabId: string | null } }
  | { type: 'ADD_TAB'; payload: Tab }
  | { type: 'REMOVE_TAB'; payload: string }
  | { type: 'SET_ACTIVE'; payload: string }
  | { type: 'UPDATE_LABEL'; payload: { id: string; label: string } }
  | { type: 'SYNC_ROUTE'; payload: { pathname: string } };

// Reducer
function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'INIT': {
      return {
        ...state,
        tabs: action.payload.tabs,
        activeTabId: action.payload.activeTabId,
        isInitialized: true,
      };
    }

    case 'ADD_TAB': {
      const exists = state.tabs.some(t => t.href === action.payload.href);
      if (exists) {
        return {
          ...state,
          activeTabId: action.payload.id,
        };
      }

      const newTabs = [...state.tabs, action.payload];
      // 限制页签数量
      if (newTabs.length > MAX_TABS) {
        const closableIndex = newTabs.findIndex(t => t.closable);
        if (closableIndex !== -1) {
          newTabs.splice(closableIndex, 1);
        }
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: action.payload.id,
      };
    }

    case 'REMOVE_TAB': {
      const tabToRemove = state.tabs.find(t => t.id === action.payload);
      if (!tabToRemove || !tabToRemove.closable) {
        return state;
      }

      const newTabs = state.tabs.filter(t => t.id !== action.payload);
      let newActiveId = state.activeTabId;

      // 如果关闭的是当前活跃页签，切换到相邻页签
      if (state.activeTabId === action.payload && newTabs.length > 0) {
        const removedIndex = state.tabs.findIndex(t => t.id === action.payload);
        const newActiveIndex = Math.min(removedIndex, newTabs.length - 1);
        newActiveId = newTabs[newActiveIndex].id;
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveId,
      };
    }

    case 'SET_ACTIVE': {
      return {
        ...state,
        activeTabId: action.payload,
      };
    }

    case 'UPDATE_LABEL': {
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === action.payload.id ? { ...t, label: action.payload.label } : t
        ),
      };
    }

    case 'SYNC_ROUTE': {
      const { pathname } = action.payload;
      if (!state.isInitialized || !isTabRoute(pathname)) {
        return state;
      }

      const existingTab = state.tabs.find(tab => tab.href === pathname);
      if (existingTab) {
        // 页签已存在，直接激活
        if (state.activeTabId === existingTab.id) {
          return state;
        }
        return {
          ...state,
          activeTabId: existingTab.id,
        };
      }

      // 页签不存在，添加新页签
      const newTab: Tab = {
        id: pathname,
        href: pathname,
        label: getRouteLabel(pathname),
        closable: !PINNED_ROUTES.includes(pathname),
      };

      const newTabs = [...state.tabs, newTab];
      // 限制页签数量
      if (newTabs.length > MAX_TABS) {
        const closableIndex = newTabs.findIndex(t => t.closable);
        if (closableIndex !== -1) {
          newTabs.splice(closableIndex, 1);
        }
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newTab.id,
      };
    }

    default:
      return state;
  }
}

// 初始状态
const initialState: TabState = {
  tabs: [],
  activeTabId: null,
  isInitialized: false,
};

export function TabProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isFirstRender = useRef(true);

  const [state, dispatch] = useReducer(tabReducer, initialState);

  // 使用 ref 存储最新的 state，避免 callback 依赖于 state 导致频繁重建
  const stateRef = useRef(state);
  stateRef.current = state;

  // 初始化 - 从 localStorage 加载页签（只在客户端首次渲染后执行）
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      const storedTabs = loadTabsFromStorage();
      const activeId = storedTabs.find(t => t.href === pathname)?.id || null;
      dispatch({ type: 'INIT', payload: { tabs: storedTabs, activeTabId: activeId } });
    }
  }, [pathname]);

  // 当路由变化时，同步页签状态
  useEffect(() => {
    if (state.isInitialized) {
      dispatch({ type: 'SYNC_ROUTE', payload: { pathname } });
    }
  }, [pathname, state.isInitialized]);

  // 持久化页签到 localStorage
  useEffect(() => {
    if (state.isInitialized) {
      saveTabsToStorage(state.tabs);
    }
  }, [state.tabs, state.isInitialized]);

  // 添加页签
  const addTab = useCallback((tab: Omit<Tab, 'id'>) => {
    const newTab: Tab = {
      ...tab,
      id: tab.href,
    };
    dispatch({ type: 'ADD_TAB', payload: newTab });
    router.push(tab.href);
  }, [router]);

  // 关闭页签
  const removeTab = useCallback((tabId: string) => {
    const currentState = stateRef.current;
    const tabToRemove = currentState.tabs.find(t => t.id === tabId);
    if (!tabToRemove || !tabToRemove.closable) return;

    // 如果关闭的是当前活跃页签，需要计算新的活跃页签并导航
    if (currentState.activeTabId === tabId && currentState.tabs.length > 1) {
      const removedIndex = currentState.tabs.findIndex(t => t.id === tabId);
      const newTabs = currentState.tabs.filter(t => t.id !== tabId);
      const newActiveIndex = Math.min(removedIndex, newTabs.length - 1);
      const newActiveTab = newTabs[newActiveIndex];
      router.push(newActiveTab.href);
    }

    dispatch({ type: 'REMOVE_TAB', payload: tabId });
  }, [router]);

  // 切换页签
  const switchTab = useCallback((tabId: string) => {
    const currentState = stateRef.current;
    const tab = currentState.tabs.find(t => t.id === tabId);
    if (tab) {
      dispatch({ type: 'SET_ACTIVE', payload: tabId });
      router.push(tab.href);
    }
  }, [router]);

  // 更新页签标题
  const updateTabLabel = useCallback((tabId: string, label: string) => {
    dispatch({ type: 'UPDATE_LABEL', payload: { id: tabId, label } });
  }, []);

  const value = useMemo<TabContextValue>(() => ({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    addTab,
    removeTab,
    switchTab,
    updateTabLabel,
  }), [state.tabs, state.activeTabId, addTab, removeTab, switchTab, updateTabLabel]);

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
}
