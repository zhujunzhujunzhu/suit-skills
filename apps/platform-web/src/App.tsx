import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  getCurrentUser,
  listSkills,
  listSources,
  logoutOAuth,
  type AuthUser,
  type SourceItem,
} from './api/client';
import {
  adminOnlyViews,
  LoginPage,
  MarketPage,
  MySkillsPage,
  NotificationCenter,
  NotificationBell,
  navItems,
  ROLE_STORAGE_KEY,
  readStoredRole,
  SourcesPage,
  skillFromApi,
  skills,
  type Role,
  type Skill,
  type View,
} from './components';

const SkillDetailPage = lazy(() => import('./components/SkillDetailPage').then(m => ({ default: m.SkillDetailPage })));
const SkillDirectoryPage = lazy(() => import('./components/SkillDetailPage').then(m => ({ default: m.SkillDirectoryPage })));
const UploadPage = lazy(() => import('./components/UploadPage').then(m => ({ default: m.UploadPage })));
const ReviewCenter = lazy(() => import('./components/ReviewCenter').then(m => ({ default: m.ReviewCenter })));

type SkillSourceView = 'market' | 'mine';

const viewPaths: Record<Exclude<View, 'detail'>, string> = {
  market: '/market',
  upload: '/upload',
  mine: '/mine',
  notifications: '/notifications',
  reviews: '/reviews',
  sources: '/sources',
};

function viewFromPath(pathname: string): Exclude<View, 'detail'> | null {
  return (
    Object.entries(viewPaths).find(([, path]) => pathname === path)?.[0] as
      | Exclude<View, 'detail'>
      | undefined
  ) ?? null;
}

function sourceFromState(state: unknown): SkillSourceView {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    ((state as { from?: unknown }).from === 'market' || (state as { from?: unknown }).from === 'mine')
  ) {
    return (state as { from: SkillSourceView }).from;
  }
  return 'market';
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [marketSkills, setMarketSkills] = useState<Skill[]>(skills);
  const [sourceConfig, setSourceConfig] = useState<SourceItem[]>([]);
  const [role, setRole] = useState<Role | null>(() => readStoredRole());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [directoryDirty, setDirectoryDirty] = useState(false);
  const [syncingMarket, setSyncingMarket] = useState(false);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setRole(currentUser.role);
        localStorage.setItem(ROLE_STORAGE_KEY, currentUser.role);
      } else {
        setUser(null);
        setRole(null);
        localStorage.removeItem(ROLE_STORAGE_KEY);
      }
      setAuthChecked(true);
    });
    void refreshMarket();
  }, []);

  const visibleNavItems = navItems.filter(
    (item) => !adminOnlyViews.has(item.view) || role === 'admin',
  );
  const skillSource = sourceFromState(location.state);
  const activeView = location.pathname.startsWith('/skills/')
    ? skillSource
    : viewFromPath(location.pathname);

  function requestNavigate(path: string, options?: { replace?: boolean; state?: unknown }) {
    if (directoryDirty && !window.confirm('当前技能目录有未保存内容，确定要离开吗？')) {
      return;
    }
    navigate(path, options);
  }

  function openSkill(skillId: string, from: SkillSourceView = 'market') {
    requestNavigate(`/skills/${encodeURIComponent(skillId)}`, { state: { from } });
  }

  async function refreshMarket() {
    setSyncingMarket(true);
    try {
      const [skillItems, sources] = await Promise.all([listSkills(), listSources()]);
      if (skillItems.length) setMarketSkills(skillItems.map(skillFromApi));
      setSourceConfig(sources.sources);
    } finally {
      setSyncingMarket(false);
    }
  }

  async function logout() {
    await logoutOAuth();
    localStorage.removeItem(ROLE_STORAGE_KEY);
    setUser(null);
    setRole(null);
    requestNavigate('/market', { replace: true });
  }

  function routeAdmin(element: React.ReactNode) {
    return role === 'admin' ? element : <StatusPage title="无权限访问" description="当前账号无权限访问该管理页面。" actionLabel="返回技能市场" onAction={() => requestNavigate('/market')} />;
  }

  function SkillDetailRoute() {
    const { skillId = '' } = useParams();
    const decodedId = decodeURIComponent(skillId);
    const selectedSkill = marketSkills.find((skill) => skill.id === decodedId);
    const from = sourceFromState(location.state);

    if (!selectedSkill) {
      return <StatusPage title="技能不存在或已下架" description="没有找到当前链接对应的技能，可能已被删除、下架，或来源尚未同步。" actionLabel="返回技能市场" onAction={() => requestNavigate('/market')} />;
    }

    return (
      <Suspense fallback={<div className="page"><section className="empty-state"><p>加载中...</p></section></div>}>
        <SkillDetailPage
          backLabel={from === 'mine' ? '返回我的技能包' : '返回技能市场'}
          skill={selectedSkill}
          onBack={() => requestNavigate(from === 'mine' ? '/mine' : '/market')}
          onOpenDirectory={() => requestNavigate(`/skills/${encodeURIComponent(selectedSkill.id)}/files`, { state: { from } })}
        />
      </Suspense>
    );
  }

  function SkillDirectoryRoute() {
    const { skillId = '' } = useParams();
    const decodedId = decodeURIComponent(skillId);
    const selectedSkill = marketSkills.find((skill) => skill.id === decodedId);
    const from = sourceFromState(location.state);

    if (!selectedSkill) {
      return <StatusPage title="技能目录不可用" description="没有找到当前技能，无法打开目录内容。" actionLabel="返回技能市场" onAction={() => requestNavigate('/market')} />;
    }

    return (
      <Suspense fallback={<div className="page"><section className="empty-state"><p>加载中...</p></section></div>}>
        <SkillDirectoryPage
          skill={selectedSkill}
          onBack={() => requestNavigate(`/skills/${encodeURIComponent(selectedSkill.id)}`, { state: { from } })}
          onDirtyChange={setDirectoryDirty}
        />
      </Suspense>
    );
  }

  function StatusPage({
    title,
    description,
    actionLabel,
    onAction,
  }: {
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
  }) {
    return (
      <div className="page">
        <section className="empty-state status-page">
          <p className="eyebrow">Notice</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <button className="primary" type="button" onClick={onAction}>{actionLabel}</button>
        </section>
      </div>
    );
  }

  if (!authChecked) {
    return null;
  }

  if (!role) {
    return <LoginPage />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>CH</span>
          <div>
            <strong>ClawHub</strong>
            <small>中文技能市场</small>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {visibleNavItems.map((item) => (
            <button
              className={activeView === item.view ? 'active' : ''}
              key={item.view}
              type="button"
              onClick={() => navigate(viewPaths[item.view])}
            >
              <span>{item.label}</span>
              <small>{item.desc}</small>
            </button>
          ))}
        </nav>
        <div className="auth-panel">
          <strong>{role === 'admin' ? '管理员' : '普通用户'}</strong>
          <small>{role === 'admin' ? '可管理源、Git 与评价' : '可浏览、上传与维护自己的技能'}</small>
          <button type="button" onClick={logout}>退出登录</button>
        </div>
        <div className="git-status">
          <span className="status-dot" />
          <div>
            <strong>🔐 Git 授权</strong>
            <small>点击<a href="#" style={{color: "inherit", textDecoration: "underline"}}>了解如何授权</a></small>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <NotificationBell />
        </header>
        <Routes>
          <Route path="/" element={<Navigate replace to="/market" />} />
          <Route
            path="/market"
            element={
              <MarketPage
                skills={marketSkills}
                sourceConfig={sourceConfig}
                onOpenSkill={(skillId) => openSkill(skillId, 'market')}
                onSync={refreshMarket}
                syncInProgress={syncingMarket}
              />
            }
          />
          <Route path="/skills/:skillId" element={<SkillDetailRoute />} />
          <Route path="/skills/:skillId/files" element={<SkillDirectoryRoute />} />
          <Route
            path="/upload"
            element={
              <Suspense fallback={<div className="page"><section className="empty-state"><p>加载中...</p></section></div>}>
                <UploadPage
                  sourceConfig={sourceConfig}
                  onUploaded={(skill) =>
                    setMarketSkills((current) => [
                      skill,
                      ...current.filter((item) => item.id !== skill.id),
                    ])
                  }
                  onOpenMine={() => requestNavigate('/mine')}
                  onOpenSkill={(skillId) => openSkill(skillId, 'mine')}
                />
              </Suspense>
            }
          />
          <Route
            path="/mine"
            element={<MySkillsPage fallbackSkills={marketSkills} onOpenSkill={(skillId) => openSkill(skillId, 'mine')} />}
          />
          <Route
            path="/notifications"
            element={<NotificationCenter />}
          />
          <Route path="/reviews" element={routeAdmin(<Suspense fallback={<div className="page"><section className="empty-state"><p>加载中...</p></section></div>}><ReviewCenter /></Suspense>)} />
          <Route
            path="/sources"
            element={routeAdmin(
              <SourcesPage sources={sourceConfig} onSourcesChange={setSourceConfig} />,
            )}
          />
          <Route path="*" element={<StatusPage title="页面不存在" description="当前路径无效，可能是链接过期或地址输入有误。" actionLabel="返回技能市场" onAction={() => requestNavigate('/market', { replace: true })} />} />
        </Routes>
      </section>
    </main>
  );
}

export default App;
