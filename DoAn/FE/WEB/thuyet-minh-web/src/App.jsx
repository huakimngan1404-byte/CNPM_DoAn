import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, AudioLines, BookOpen,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass,
  Filter, Globe2, Headphones, LayoutDashboard, Map,
  LogOut, MapPin, Menu, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { initialSites, languages as initialLanguages } from './data.js';
import SiteMap from './components/SiteMap.jsx';
import {
  createSite,
  createLanguage,
  deleteSite,
  deleteLanguage,
  fetchActiveLanguages,
  fetchAdminLanguages,
  fetchAdminSites,
  fetchActiveVisitors,
  fetchListenStats,
  fetchRecentActivity,
  fetchSiteNarration,
  apiBaseUrl,
  heartbeatVisitor,
  leaveVisitor,
  loginAdmin,
  recordNarrationListen,
  updateSite,
  updateLanguage,
  updateAdminCredentials,
} from './services/api.js';

const navSections = [
  {
    title: 'TỔNG QUAN',
    items: [{ id: 'dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard }],
  },
  {
    title: 'NỘI DUNG',
    items: [
      { id: 'places', label: 'Quản lý di tích', icon: MapPin, count: '12' },
      { id: 'narrations', label: 'Bài thuyết minh', icon: BookOpen },
      { id: 'languages', label: 'Ngôn ngữ', icon: Globe2 },
    ],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { id: 'map', label: 'Bản đồ & GPS', icon: Map },
      { id: 'settings', label: 'Cài đặt', icon: Settings2 },
    ],
  },
];

const sectionTitles = {
  dashboard: ['Bảng điều khiển'],
  places: ['Quản lý di tích'],
  narrations: ['Bài thuyết minh'],
  languages: ['Ngôn ngữ'],
  map: ['Bản đồ & GPS'],
  settings: ['Cài đặt hệ thống'],
};

const supportedLanguages = initialLanguages;

const adminAuthRequired = true;
const adminTokenStorageKey = 'ditichq1-admin-token';

function createVisitorSessionId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const value = Math.floor(Math.random() * 16);
      return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
    });
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const listenSiteCode = params.get('listen');
  if (listenSiteCode) {
    return <ListenerDemo siteCode={listenSiteCode} siteName={params.get('name') || 'Điểm di tích Quận 1'} />;
  }
  return <AdminApp />;
}

function AdminApp() {
  const [account, setAccount] = useState({ displayName: 'Admin Q1', username: '' });
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => adminAuthRequired
      ? Boolean(sessionStorage.getItem(adminTokenStorageKey))
      : sessionStorage.getItem('ditichq1-admin-authenticated') === 'true',
  );

  useEffect(() => {
    const handleExpiredSession = () => {
      setIsAuthenticated(false);
      setAccount({ displayName: 'Admin Q1', username: '' });
    };
    window.addEventListener('ditichq1-admin-auth-expired', handleExpiredSession);
    return () => window.removeEventListener('ditichq1-admin-auth-expired', handleExpiredSession);
  }, []);

  const login = async (username, password) => {
    const session = await loginAdmin(username, password);
    sessionStorage.setItem(adminTokenStorageKey, session.access_token);
    setAccount({ displayName: session.display_name || session.username, username: session.username });
    setIsAuthenticated(true);
    return true;
  };

  const updateAccount = (updates) => {
    setAccount({ displayName: updates.username, username: updates.username });
  };

  const logout = () => {
    sessionStorage.removeItem(adminTokenStorageKey);
    sessionStorage.removeItem('ditichq1-admin-authenticated');
    setIsAuthenticated(false);
    setAccount({ displayName: 'Admin Q1', username: '' });
  };

  return isAuthenticated
    ? <AdminDashboard account={account} onAccountUpdate={updateAccount} onLogout={logout} authRequired={adminAuthRequired} />
    : <AdminLogin onLogin={login} />;
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (!await onLogin(username, password)) {
        setError('Tên đăng nhập hoặc mật khẩu không đúng.');
        return;
      }
      setError('');
    } catch (loginError) {
      setError(loginError.message || 'Không thể đăng nhập. Kiểm tra kết nối Backend.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand-mark"><MapPin size={22} strokeWidth={2.4} /></div>
        <span className="login-eyebrow">HERITAGE AUDIO GUIDE</span>
        <h1>Đăng nhập quản trị</h1>
        <p>Đăng nhập để tiếp tục vào không gian quản trị Di Tích Q1.</p>
        <label className="login-field">
          <span>Tên đăng nhập</span>
          <input
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Nhập tên đăng nhập"
            required
          />
        </label>
        <label className="login-field">
          <span>Mật khẩu</span>
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nhập mật khẩu"
            required
          />
        </label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="button button-primary login-submit" type="submit" disabled={submitting}>{submitting ? 'Đang xác thực…' : 'Đăng nhập'}</button>
      </form>
    </main>
  );
}

function AdminDashboard({ account, onAccountUpdate, onLogout, authRequired }) {
  const [activePage, setActivePage] = useState('dashboard');
  const [sites, setSites] = useState(initialSites);
  const [languages, setLanguages] = useState(supportedLanguages);
  const [languageLoadError, setLanguageLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Tất cả trạng thái');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [backendStatus, setBackendStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    fetchAdminSites()
      .then((records) => {
        if (!active) return;
        setSites(records);
        setBackendStatus('connected');
      })
      .catch(() => {
        if (active) setBackendStatus('offline');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetchAdminLanguages()
      .then((records) => {
        if (!active) return;
        setLanguages(records);
        setLanguageLoadError('');
      })
      .catch((error) => {
        if (active) setLanguageLoadError(error.message);
      });
    return () => { active = false; };
  }, []);

  const filteredSites = useMemo(() => sites.filter((site) => {
    const matchesQuery = `${site.name} ${site.address} ${site.category}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'Tất cả trạng thái' || site.status === statusFilter;
    return matchesQuery && matchesStatus;
  }), [sites, search, statusFilter]);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const replaceLanguages = (records) => {
    setLanguages(records);
    setLanguageLoadError('');
  };

  const openCreate = () => {
    setEditingSite(null);
    setIsModalOpen(true);
  };

  const openEdit = (site) => {
    setEditingSite(site);
    setIsModalOpen(true);
  };

  const saveSite = async (formData) => {
    if (editingSite) {
      await updateSite(editingSite.code, formData);
    } else {
      await createSite(formData);
    }
    const records = await fetchAdminSites();
    setSites(records);
    setBackendStatus('connected');
    setIsModalOpen(false);
    notify(editingSite ? 'Đã cập nhật di tích trong Backend.' : 'Đã thêm di tích vào Backend.');
  };

  const removeSite = async (site) => {
    if (!window.confirm(`Bạn có chắc muốn xóa "${site.name}"? Thao tác này sẽ xóa dữ liệu di tích khỏi Backend.`)) return;
    try {
      await deleteSite(site.code);
      setSites((current) => current.filter((item) => item.code !== site.code));
      notify(`Đã xóa "${site.name}" khỏi Backend.`);
    } catch (error) {
      notify(`Không thể xóa di tích: ${error.message}`);
    }
  };

  const page = sectionTitles[activePage];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><MapPin size={20} strokeWidth={2.4} /></div>
          <div><strong>Di Tích <span>Q1</span></strong><small>HERITAGE AUDIO GUIDE</small></div>
          <button className="icon-button sidebar-close" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-select">
          <div className="workspace-avatar">Q1</div>
          <div className="workspace-copy"><strong>Quản trị viên</strong><small>Không gian dự án</small></div>
        </div>
        <nav className="side-nav" aria-label="Điều hướng chính">
          {navSections.map((section) => (
            <div className="nav-group" key={section.title}>
              <div className="nav-caption">{section.title}</div>
              {section.items.map(({ id, label, icon: Icon, count }) => (
                <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => { setActivePage(id); setSidebarOpen(false); }}>
                  <Icon size={18} strokeWidth={1.9} /><span>{label}</span>{count && <span className="nav-count">{id === 'places' ? sites.length : count}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card" hidden>
            <div className="help-icon"><CircleHelp size={17} /></div>
            <strong>Cần hỗ trợ?</strong>
            <p>Xem hướng dẫn sử dụng trang quản trị.</p>
            <button onClick={() => notify('Tài liệu hướng dẫn sẽ sớm được cập nhật.')}>Trung tâm trợ giúp <ArrowRight size={14} /></button>
          </div>
          <button className="profile-row" onClick={() => setActivePage('settings')}>
            <div className="profile-avatar">AD</div>
            <div className="profile-copy"><strong>{account.displayName}</strong><small>Quản trị viên</small></div>
            <MoreHorizontal size={20} className="muted-icon" />
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Mở menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>Di Tích Q1</span><ChevronRight size={14} /><strong>{page[0]}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-user"><div className="profile-avatar">AD</div><span>{account.displayName}</span></div>
            <button className="logout-button" onClick={onLogout}><LogOut size={15} /><span>Đăng xuất</span></button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <h1>{page[0]}</h1>
              <p>{page[1]}</p>
            </div>
            
            {/* Trang Quản lý di tích */}
            {activePage === 'places' && (
              <button className="button button-primary" onClick={openCreate}>
                <Plus size={17} /> Thêm di tích
              </button>
            )}
            
            {/* Trang Bài thuyết minh -> Thêm bài thuyết minh */}
            {activePage === 'narrations' && (
              <button className="button button-primary" onClick={() => notify('Form thêm bài thuyết minh sẽ hiển thị ở đây.')}>
                <Plus size={17} /> Thêm bài thuyết minh
              </button>
            )}

          </div>
          {activePage === 'dashboard' && <Dashboard sites={sites} languages={languages} onNavigate={setActivePage} />}
          {activePage === 'places' && <PlacesPage sites={filteredSites} totalSites={sites.length} allSites={sites} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onEdit={openEdit} onDelete={removeSite} />}
          {activePage === 'narrations' && <NarrationsPage notify={notify} languages={languages.filter((language) => language.is_active)} />}
          {activePage === 'languages' && <LanguagesPage languages={languages} loadError={languageLoadError} onLanguagesChange={replaceLanguages} notify={notify} />}
          {activePage === 'map' && <MapPage notify={notify} sites={sites} />}
          {activePage === 'settings' && <SettingsPage account={account} onAccountUpdate={onAccountUpdate} notify={notify} authRequired={authRequired} />}
        </div>
        <footer className="footer"><span>© 2026 Di Tích Q1</span><span>Hệ thống thuyết minh di tích lịch sử Quận 1</span><span className="system-status"><i /> {backendStatus === 'connected' ? 'Đã kết nối Backend' : backendStatus === 'offline' ? 'Đang dùng dữ liệu mẫu · Backend chưa kết nối' : 'Đang kết nối Backend…'}</span></footer>
      </main>

      {isModalOpen && <SiteModal site={editingSite} onClose={() => setIsModalOpen(false)} onSave={saveSite} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}</div>}
    </div>
  );
}

function Dashboard({ sites, languages, onNavigate }) {
  const activeCount = sites.filter((site) => site.status === 'Đang hoạt động').length;
  const activeLanguages = languages.filter((language) => language.is_active);
  const narrationCount = sites.length * activeLanguages.length;
  const [activeVisitors, setActiveVisitors] = useState(null);
  const [visitorError, setVisitorError] = useState('');
  const [recentActivity, setRecentActivity] = useState([]);
  const [activityError, setActivityError] = useState('');
  const [listenPeriod, setListenPeriod] = useState('day');
  const [listenDate, setListenDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [listenDevice, setListenDevice] = useState('all');
  const [listenStats, setListenStats] = useState(null);
  const [listenError, setListenError] = useState('');

  useEffect(() => {
    let active = true;
    const refreshActiveVisitors = async () => {
      try {
        const count = await fetchActiveVisitors();
        if (!active) return;
        setActiveVisitors(count);
        setVisitorError('');
      } catch (error) {
        if (active) setVisitorError(error.message);
      }
    };
    refreshActiveVisitors();
    const interval = window.setInterval(refreshActiveVisitors, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshRecentActivity = async () => {
      try {
        const events = await fetchRecentActivity();
        if (!active) return;
        setRecentActivity(events);
        setActivityError('');
      } catch (error) {
        if (active) setActivityError(error.message);
      }
    };

    refreshRecentActivity();
    const interval = window.setInterval(refreshRecentActivity, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const requestedListenDate = listenPeriod === 'day' ? listenDate : listenDate.slice(0, 7);
  useEffect(() => {
    let active = true;
    const refreshListenStats = async () => {
      try {
        const stats = await fetchListenStats(listenPeriod, requestedListenDate, listenDevice);
        if (!active) return;
        setListenStats(stats);
        setListenError('');
      } catch (error) {
        if (!active) return;
        setListenStats(null);
        setListenError(error.message);
      }
    };

    refreshListenStats();
    const interval = window.setInterval(refreshListenStats, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [listenPeriod, requestedListenDate, listenDevice]);

  const chartBuckets = listenStats?.buckets ?? [];
  const chartMaximum = Math.max(1, ...chartBuckets.map((bucket) => bucket.count));
  const chartPoints = chartBuckets.map((bucket, index) => ({
    ...bucket,
    x: chartBuckets.length <= 1 ? 360 : (index * 720) / (chartBuckets.length - 1),
    y: 188 - (bucket.count / chartMaximum) * 172,
  }));
  const chartLine = chartPoints.map(({ x, y }) => `${x},${y}`).join(' ');
  const chartArea = chartPoints.length
    ? `0,204 ${chartLine} 720,204`
    : '';
  const chartLabelIndexes = chartPoints.length <= 5
    ? chartPoints.map((_, index) => index)
    : [0, Math.round((chartPoints.length - 1) / 4), Math.round((chartPoints.length - 1) / 2), Math.round(((chartPoints.length - 1) * 3) / 4), chartPoints.length - 1];
  const chartLabels = [...new Set(chartLabelIndexes)].map((index) => chartPoints[index]);
  const chartScale = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(chartMaximum * ratio));
  const topSitesData = (listenStats?.top_sites ?? []).map((site, index) => ({
    id: site.site_code,
    title: site.site_name,
    listens: site.count,
    tone: ['orange', 'blue', 'green', 'violet'][index % 4],
  }));
  const maxListens = Math.max(1, ...topSitesData.map((site) => site.listens));
  const periodDescription = listenPeriod === 'day'
    ? new Date(`${listenDate}T12:00:00`).toLocaleDateString('vi-VN')
    : new Date(`${requestedListenDate}-01T12:00:00`).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  return (
    <div className="dashboard-content">
      
      {/* BỐ CỤC CHIA CỘT MỚI */}
      <div className="dashboard-main-layout">
        
        {/* CỘT TRÁI */}
        <div className="dashboard-left-column">
          <section className="stats-grid">
            <StatCard label="Người đang truy cập" value={activeVisitors === null ? '—' : String(activeVisitors)} icon={Headphones} iconTone="blue" />
            <StatCard label="Điểm di tích" value={String(sites.length)} icon={MapPin} iconTone="orange" />
            <StatCard label="Bài thuyết minh" value={String(narrationCount)} icon={AudioLines} iconTone="violet" />
            <StatCard label="Ngôn ngữ hỗ trợ" value={String(activeLanguages.length)} icon={Globe2} iconTone="green" />
          </section>

          <div className="panel listening-panel">
            <div className="panel-heading">
              <div><h3>Lượt nghe thuyết minh</h3><p>Thống kê hoạt động của người dùng</p></div>
              <div className="listen-filters">
                <select
                  className="select-button"
                  aria-label="Khoảng thời gian thống kê"
                  value={listenPeriod}
                  onChange={(event) => setListenPeriod(event.target.value)}
                >
                  <option value="day">Theo ngày</option>
                  <option value="month">Theo tháng</option>
                </select>
                <input
                  className="select-button listen-date-filter"
                  aria-label={listenPeriod === 'day' ? 'Chọn ngày thống kê' : 'Chọn tháng thống kê'}
                  type={listenPeriod === 'day' ? 'date' : 'month'}
                  value={listenPeriod === 'day' ? listenDate : requestedListenDate}
                  onChange={(event) => setListenDate(
                    listenPeriod === 'day' ? event.target.value : `${event.target.value}-01`,
                  )}
                />
                <select
                  className="select-button"
                  aria-label="Lọc theo thiết bị"
                  value={listenDevice}
                  onChange={(event) => setListenDevice(event.target.value)}
                >
                  <option value="all">Tất cả thiết bị</option>
                  <option value="web">Website</option>
                  <option value="android">Android</option>
                  <option value="ios">iPhone / iPad</option>
                </select>
              </div>
            </div>
            <div className="chart-legend"><span className="legend-dot" /> Lượt nghe <span className="legend-period">{periodDescription}</span></div>
            <div className="chart-wrap">
              <div className="chart-ylabels">{chartScale.map((value, index) => <span key={index}>{value.toLocaleString('vi-VN')}</span>)}</div>
              <div className="chart-area">
                <div className="chart-gridlines"><i /><i /><i /><i /><i /></div>
                <svg viewBox="0 0 720 204" preserveAspectRatio="none" role="img" aria-label={`Biểu đồ ${listenStats?.total ?? 0} lượt nghe`}>
                  <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ea5538" stopOpacity=".18" /><stop offset="100%" stopColor="#ea5538" stopOpacity="0" /></linearGradient></defs>
                  {chartArea && <polygon points={chartArea} fill="url(#chartFill)" />}
                  {chartLine && <polyline points={chartLine} fill="none" stroke="#e95a3f" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
                  {chartPoints.length > 0 && <circle cx={chartPoints[chartPoints.length - 1].x} cy={chartPoints[chartPoints.length - 1].y} r="5.5" fill="#fff" stroke="#e95a3f" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
                </svg>
                <div className="chart-xlabels">{chartLabels.map((bucket) => <span key={bucket.label}>{listenPeriod === 'day' ? bucket.label.slice(0, 2) : Number(bucket.label)}</span>)}</div>
              </div>
            </div>
            <div className="chart-bottom">
              <span>{listenError || `Tổng cộng ${listenStats?.total?.toLocaleString('vi-VN') ?? '—'} lượt nghe trong kỳ đã chọn.`}</span>
              <span>{listenDevice === 'all' ? 'Mọi thiết bị' : listenDevice === 'web' ? 'Website' : listenDevice === 'android' ? 'Android' : 'iPhone / iPad'}</span>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI */}
        <div className="dashboard-right-column">
          <div className="panel top-places-panel">
            <div className="panel-heading"><div><h3>Di tích nổi bật</h3><p>Được nghe nhiều nhất trong kỳ đã chọn</p></div><button className="more-button" aria-label="Tùy chọn"><MoreHorizontal size={20} /></button></div>
            
            {/* RENDER DANH SÁCH 8 DI TÍCH TỰ ĐỘNG */}
            <div className="top-place-list">
              {topSitesData.map((site, index) => {
                const percent = Math.round((site.listens / maxListens) * 100);
                return (
                  <TopPlace 
                    key={site.id}
                    rank={`0${index + 1}`.slice(-2)} 
                    title={site.title} 
                    subtitle="Lượt nghe" 
                    value={site.listens.toLocaleString('vi-VN')} 
                    percent={percent} 
                    tone={site.tone} 
                  />
                );
              })}
              {topSitesData.length === 0 && <div className="empty-state"><AudioLines size={23} /><strong>Chưa có lượt nghe</strong><span>Dữ liệu sẽ xuất hiện khi có người bắt đầu nghe thuyết minh.</span></div>}
            </div>

            <button className="panel-link" onClick={() => onNavigate('places')}>Xem tất cả di tích <ArrowRight size={15} /></button>
          </div>
        </div> 
      </div>
    </div>
  );
}

function ListenerDemo({ siteCode, siteName }) {
  const [narrationLanguages, setNarrationLanguages] = useState(supportedLanguages);
  const [languageLoadError, setLanguageLoadError] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('vi');
  const [narration, setNarration] = useState(null);
  const [narrationLoading, setNarrationLoading] = useState(true);
  const [narrationError, setNarrationError] = useState('');
  const [narrationAttempt, setNarrationAttempt] = useState(0);
  const [audioPlaybackError, setAudioPlaybackError] = useState('');
  const countedAudioUrlRef = useRef('');
  const selectedLanguageInfo = narrationLanguages.find(
    (language) => language.code === selectedLanguage,
  );

  useEffect(() => {
    let active = true;
    fetchActiveLanguages()
      .then((languages) => {
        if (!active) return;
        setNarrationLanguages(languages);
        setLanguageLoadError('');
      })
      .catch((error) => {
        if (active) setLanguageLoadError(error.message);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (narrationLanguages.length && !narrationLanguages.some((language) => language.code === selectedLanguage)) {
      setSelectedLanguage(narrationLanguages[0].code);
    }
  }, [narrationLanguages, selectedLanguage]);

  useEffect(() => {
    const sessionId = createVisitorSessionId();

    const sendHeartbeat = () => {
      if (document.visibilityState === 'hidden') return;
      heartbeatVisitor(sessionId).catch((error) => {
        console.error('Không thể cập nhật phiên nghe trực tiếp:', error);
      });
    };
    const leave = () => {
      leaveVisitor(sessionId).catch((error) => {
        console.error('Không thể kết thúc phiên nghe trực tiếp:', error);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
      else leave();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', leave);
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 15000);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setNarration(null);
    setNarrationLoading(true);
    setNarrationError('');
    setAudioPlaybackError('');
    fetchSiteNarration(siteCode, selectedLanguage)
      .then((record) => {
        if (!active) return;
        setNarration(record);
      })
      .catch((error) => {
        if (!active) return;
        setNarrationError(error.message);
      })
      .finally(() => {
        if (active) setNarrationLoading(false);
      });
    return () => { active = false; };
  }, [siteCode, selectedLanguage, narrationAttempt]);

  const audioUrl = narration?.audio_url
    ? (narration.audio_url.startsWith('http') ? narration.audio_url : `${apiBaseUrl}${narration.audio_url}`)
    : '';

  return (
    <main className="listener-page">
      <header className="listener-header">
        <a href={window.location.pathname} className="listener-brand">
          <span><MapPin size={19} /></span>
          <strong>Di Tích <i>Q1</i></strong>
        </a>
        <span className="listener-live">Thuyết minh di tích</span>
      </header>
      <section className="listener-card">
        <div className="listener-card-icon"><AudioLines size={26} /></div>
        <span className="listener-kicker">THUYẾT MINH DI TÍCH · QUẬN 1</span>
        <h1>{narration?.name || siteName}</h1>
        <p>Chào mừng bạn đến với trải nghiệm thuyết minh đa ngôn ngữ. Nhấn phát để bắt đầu nghe nội dung tại điểm tham quan.</p>
        <div className="listener-session-state">Chọn ngôn ngữ và nhấn phát để nghe bài thuyết minh.</div>
        <label className="listener-language">
          <span>Ngôn ngữ thuyết minh</span>
          <select
            aria-label="Ngôn ngữ thuyết minh"
            value={selectedLanguage}
            onChange={(event) => {
              setNarration(null);
              setNarrationLoading(true);
              setSelectedLanguage(event.target.value);
            }}
          >
            {narrationLanguages.map((language) => (
              <option key={language.code} value={language.code}>{language.name}</option>
            ))}
          </select>
        </label>
        {languageLoadError && <p className="listener-audio-warning">Không tải được danh sách ngôn ngữ mới nhất: {languageLoadError}</p>}
        {audioUrl ? (
          <div className="listener-audio">
            <strong><Headphones size={17} /> Bài thuyết minh · {selectedLanguageInfo?.name}</strong>
            <audio
              key={`${selectedLanguage}-${audioUrl}`}
              controls
              preload="none"
              src={audioUrl}
              onPlay={() => {
                if (countedAudioUrlRef.current === audioUrl) return;
                countedAudioUrlRef.current = audioUrl;
                recordNarrationListen(siteCode, selectedLanguage, 'web').catch((error) => {
                  console.error('Không thể ghi nhận lượt nghe:', error);
                });
              }}
              onEnded={() => { countedAudioUrlRef.current = ''; }}
              onError={() => setAudioPlaybackError(`Không phát được audio ${selectedLanguageInfo?.name} từ Backend.`)}
            >Trình duyệt không hỗ trợ phát âm thanh.</audio>
          </div>
        ) : (
          <div className="listener-audio-placeholder">
            {narrationLoading ? `Đang tải bài thuyết minh ${selectedLanguageInfo?.name}…` : narrationError}
          </div>
        )}
        {audioPlaybackError && <p className="listener-audio-warning">{audioPlaybackError}</p>}
        {narrationError && !narrationLoading && (
          <div className="listener-speech-actions">
            <button className="listener-retry" onClick={() => setNarrationAttempt((attempt) => attempt + 1)}>Thử tải lại</button>
          </div>
        )}
      </section>
      <footer className="listener-footer">Bạn có thể nghe bài thuyết minh trực tiếp trên trang này.</footer>
    </main>
  );
}

function StatCard({ label, value, icon: Icon, iconTone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconTone}`}>
        <Icon size={19} strokeWidth={2} />
      </div>
      <span className="stat-label">{label}</span>
      <div className="stat-value-row">
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function TopPlace({ rank, title, subtitle, value, percent, tone }) {
  return <div className="top-place"><span className="top-rank">{rank}</span><div className={`top-place-icon ${tone}`}><MapPin size={16} /></div><div className="top-place-copy"><strong>{title}</strong><span>{subtitle}</span></div><div className="top-place-score"><strong>{value}</strong><div className="mini-progress"><i style={{ width: `${percent}%` }} /></div></div></div>;
}

function PlaceThumb({ site }) {
  return site.image ? <img className={`place-thumb ${site.color}`} src={site.image} alt="" /> : <div className={`place-thumb ${site.color}`}><MapPin size={17} /></div>;
}

function LanguagePills({ codes }) {
  if (!codes.length) return <span className="language-pills-empty">Chưa có</span>;
  return <div className="language-pills">{codes.map((code) => <span key={code} title={code}>{code}</span>)}</div>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${status === 'Bản nháp' ? 'draft' : 'published'}`}><i />{status}</span>;
}

function ActivityItem({ icon: Icon, tone, title, description, time }) {
  return <div className="activity-item"><div className={`activity-icon ${tone}`}><Icon size={16} /></div><div className="activity-copy"><strong>{title}</strong><span>{description}</span><small>{time}</small></div></div>;
}

const activityDetails = {
  created: { icon: MapPin, tone: 'orange', title: 'Đã thêm di tích' },
  updated: { icon: Activity, tone: 'blue', title: 'Đã cập nhật di tích' },
  deleted: { icon: Trash2, tone: 'violet', title: 'Đã xóa di tích' },
};

function formatActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Thời gian không xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function PlacesPage({ sites, totalSites, allSites, search, setSearch, statusFilter, setStatusFilter, onEdit, onDelete }) {
  const activeCount = allSites.filter((site) => site.status === 'Đang hoạt động').length;
  const draftCount = allSites.length - activeCount;
  return (
    <section className="panel places-panel">
      <div className="table-toolbar">
        <div className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên di tích, địa chỉ..." /></div>
        <label className="filter-select"><Filter size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Tất cả trạng thái</option><option>Đang hoạt động</option><option>Bản nháp</option></select><ChevronDown size={14} /></label>
        <button className="button button-secondary small-button" onClick={() => setStatusFilter('Tất cả trạng thái')}><Filter size={15} /> Bộ lọc</button>
      </div>
      <div className="places-table-wrap">
        <table className="places-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả" /></th><th>TÊN DI TÍCH</th><th>VỊ TRÍ</th><th>NGÔN NGỮ</th><th>TRẠNG THÁI</th><th /></tr></thead>
          <tbody>{sites.map((site) => <tr key={site.id}>
            <td><input type="checkbox" aria-label={`Chọn ${site.name}`} /></td>
            <td><div className="place-cell"><PlaceThumb site={site} /><div><strong>{site.name}</strong><small>{site.category}</small></div></div></td>
            <td className="address-cell"><MapPin size={13} />{site.address}</td>
            <td><LanguagePills codes={site.languages} /></td>
            <td><StatusBadge status={site.status} /></td>
            <td><div className="site-row-actions">
              <button className="row-more" aria-label={`Sửa ${site.name}`} title="Sửa di tích" onClick={() => onEdit(site)}><Pencil size={14} /><span>Sửa</span></button>
              <button className="row-more delete-action" aria-label={`Xóa ${site.name}`} title="Xóa di tích" onClick={() => onDelete(site)}><Trash2 size={14} /><span>Xóa</span></button>
            </div></td>
          </tr>)}</tbody>
        </table>
        {sites.length === 0 && <div className="empty-state"><Search size={23} /><strong>Không tìm thấy di tích</strong><span>Thử thay đổi từ khóa hoặc bộ lọc của bạn.</span></div>}
      </div>
      <div className="pagination"><span>Hiển thị <strong>{sites.length}</strong> trong <strong>{totalSites}</strong> di tích</span><div><button aria-label="Trang trước" disabled><ChevronLeft size={16} /></button><button className="current-page">1</button><button aria-label="Trang sau" disabled><ChevronRight size={16} /></button></div></div>
    </section>
  );
}

function NarrationsPage({ notify, languages }) {
  const [selectedLang, setSelectedLang] = useState('Tất cả ngôn ngữ');
  const [search, setSearch] = useState('');
  const [sites, setSites] = useState([]);
  const [loadingId, setLoadingId] = useState('');
  const [activeId, setActiveId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const audioRef = useRef(null);
  const requestId = useRef(0);
  const countedNarrationIdRef = useRef('');

  useEffect(() => {
    let active = true;
    fetchAdminSites()
      .then((records) => {
        if (active) setSites(records);
      })
      .catch((error) => {
        if (active) notify(`Không tải được danh sách di tích: ${error.message}`);
      });
    return () => {
      active = false;
      requestId.current += 1;
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!audioUrl) return undefined;
    const player = audioRef.current;
    if (!player) return undefined;
    let active = true;
    player.play()
      .then(() => {
        if (active) {
          setIsPlaying(true);
          setAudioError('');
        }
      })
      .catch((error) => {
        if (active) {
          setIsPlaying(false);
          setAudioError(`Trình duyệt chưa tự phát được audio. Dùng trình phát bên dưới để bấm phát: ${error.message}`);
        }
      });
    return () => {
      active = false;
      player.pause();
    };
  }, [audioUrl]);

  const narrationLanguages = selectedLang === 'Tất cả ngôn ngữ'
    ? languages
    : languages.filter((language) => language.name === selectedLang);
  useEffect(() => {
    if (selectedLang !== 'Tất cả ngôn ngữ' && !languages.some((language) => language.name === selectedLang)) {
      setSelectedLang('Tất cả ngôn ngữ');
    }
  }, [languages, selectedLang]);
  const narrations = sites.flatMap((site) => narrationLanguages.map((language) => ({
    id: `${site.code}-${language.code}`,
    site,
    language,
  }))).filter(({ site }) => (
    `${site.name} ${site.category} ${site.address}`.toLowerCase().includes(search.trim().toLowerCase())
  ));
  const playNarration = async (item) => {
    const id = item.id;
    const player = audioRef.current;
    if (!player) return;

    if (activeId === id && player.src) {
      if (player.paused) {
        try {
          await player.play();
          setIsPlaying(true);
          setAudioError('');
        } catch (error) {
          setAudioError(`Không phát được bài thuyết minh: ${error.message}`);
        }
      } else {
        player.pause();
        setIsPlaying(false);
      }
      return;
    }

    const currentRequest = ++requestId.current;
    setLoadingId(id);
    setActiveId('');
    setIsPlaying(false);
    setAudioUrl('');
    setAudioError('');
    player.pause();
    player.removeAttribute('src');
    player.load();

    try {
      if (!item.site.code) {
        throw new Error(`Không tìm thấy mã di tích "${item.site.name}" trong Backend.`);
      }
      const narration = await fetchSiteNarration(
        item.site.code,
        item.language.code,
      );
      if (currentRequest !== requestId.current) return;
      if (!narration.audio_url) {
        throw new Error('Backend chưa tạo file audio cho bài thuyết minh này.');
      }
      const resolvedAudioUrl = narration.audio_url.startsWith('http')
        ? narration.audio_url
        : `${apiBaseUrl}${narration.audio_url}`;
      setAudioUrl(resolvedAudioUrl);
      setActiveId(id);
    } catch (error) {
      if (currentRequest === requestId.current) {
        setAudioError(error.message);
        notify(error.message);
      }
    } finally {
      if (currentRequest === requestId.current) setLoadingId('');
    }
  };

  return <section className="panel content-list-panel"><div className="content-toolbar"><div className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên di tích, địa chỉ..." /></div><label className="filter-select"><Globe2 size={15} /><select value={selectedLang} onChange={(event) => setSelectedLang(event.target.value)}><option>Tất cả ngôn ngữ</option>{languages.map((language) => <option key={language.code}>{language.name}</option>)}</select><ChevronDown size={14} /></label><span className="narration-total">{narrations.length} bài thuyết minh</span></div>
    <div className="narration-list">{narrations.map((item, index) => {
      const isActive = activeId === item.id;
      return <div className="narration-row" key={item.id}><div className={`narration-icon tone-${index % 4}`}><AudioLines size={19} /></div><div className="narration-title"><strong>{item.site.name}</strong><span>{item.site.category} <i /> {item.language.name}</span></div><button className="play-preview" aria-label={loadingId === item.id ? `Đang tải ${item.site.name}` : isActive && isPlaying ? `Tạm dừng ${item.site.name}` : `Nghe ${item.site.name}`} title={loadingId === item.id ? 'Đang tải audio' : isActive && isPlaying ? 'Tạm dừng' : 'Nghe thử'} disabled={loadingId === item.id || sites.length === 0} onClick={() => playNarration(item)}>{loadingId === item.id ? <span className="play-loading">…</span> : isActive && isPlaying ? <Pause size={15} /> : <Play size={15} />}</button><button className="row-more" aria-label="Tùy chọn"><MoreHorizontal size={18} /></button></div>;
    })}{narrations.length === 0 && <div className="empty-state"><Search size={23} /><strong>Không tìm thấy bài thuyết minh</strong><span>Thay đổi từ khóa hoặc bộ lọc để xem các di tích hiện có.</span></div>}</div>
    <div className="narration-audio-player" hidden={!audioUrl}><strong>{narrations.find((item) => item.id === activeId)?.site.name}</strong><audio ref={audioRef} controls={Boolean(audioUrl)} preload="none" src={audioUrl || undefined} onPlay={() => {
      setIsPlaying(true);
      if (countedNarrationIdRef.current === activeId) return;
      countedNarrationIdRef.current = activeId;
      const item = narrations.find((narration) => narration.id === activeId);
      if (item) {
        recordNarrationListen(item.site.code, item.language.code, 'web').catch((error) => {
          console.error('Không thể ghi nhận lượt nghe:', error);
        });
      }
    }} onPause={() => setIsPlaying(false)} onEnded={() => { setActiveId(''); setIsPlaying(false); countedNarrationIdRef.current = ''; }} onError={() => { if (audioUrl) setAudioError('Không tải được file audio từ Backend.'); }} /></div>
    {audioError && <p className="listener-audio-warning">{audioError}</p>}
  </section>;
}

function LanguagesPage({ languages, loadError, onLanguagesChange, notify }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingLanguage, setEditingLanguage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const activeLanguages = languages.filter((language) => language.is_active);
  const languageCoverage = languages.length
    ? (activeLanguages.length / languages.length) * 100
    : 0;
  const filteredLanguages = languages.filter((language) => {
    const matchesSearch = `${language.name} ${language.code}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' ? language.is_active : !language.is_active);
    return matchesSearch && matchesStatus;
  });
  const addableLanguages = supportedLanguages.filter(
    (language) => !languages.some((current) => current.code === language.code),
  );

  const refreshLanguages = async () => {
    const records = await fetchAdminLanguages();
    onLanguagesChange(records);
  };

  const saveLanguage = async (formData) => {
    if (editingLanguage) {
      await updateLanguage(editingLanguage.code, {
        ...formData,
        is_active: editingLanguage.is_active,
      });
    } else {
      await createLanguage(formData);
    }
    setIsModalOpen(false);
    setActionError('');
    notify(editingLanguage ? 'Đã cập nhật ngôn ngữ.' : 'Đã thêm ngôn ngữ.');
    try {
      await refreshLanguages();
    } catch (error) {
      setActionError(`Đã lưu nhưng không thể tải lại danh sách: ${error.message}`);
    }
  };

  const toggleLanguage = async (language) => {
    try {
      await updateLanguage(language.code, {
        ...language,
        is_active: !language.is_active,
      });
      setActionError('');
      notify(language.is_active ? 'Đã tắt ngôn ngữ.' : 'Đã bật ngôn ngữ.');
      try {
        await refreshLanguages();
      } catch (error) {
        setActionError(`Đã đổi trạng thái nhưng không thể tải lại danh sách: ${error.message}`);
      }
    } catch (error) {
      setActionError(`Không thể đổi trạng thái ngôn ngữ: ${error.message}`);
    }
  };

  const removeLanguage = async (language) => {
    if (!window.confirm(`Xóa "${language.name}" khỏi danh sách ngôn ngữ? Ngôn ngữ sẽ không còn dùng được cho bài thuyết minh mới.`)) return;
    try {
      await deleteLanguage(language.code);
      setActionError('');
      notify(`Đã xóa ngôn ngữ ${language.name}.`);
      try {
        await refreshLanguages();
      } catch (error) {
        setActionError(`Đã xóa nhưng không thể tải lại danh sách: ${error.message}`);
      }
    } catch (error) {
      setActionError(`Không thể xóa ngôn ngữ: ${error.message}`);
    }
  };

  return <div className="language-page">
    <section className="panel language-overview">
      <div className="language-overview-icon"><Globe2 size={22} /></div>
      <div><span>NGÔN NGỮ ĐANG HOẠT ĐỘNG</span><strong>{activeLanguages.length} <small>/ {languages.length}</small></strong></div>
      <div className="language-overview-bar"><div><i style={{ width: `${languageCoverage}%` }} /></div><small>Ngôn ngữ có thể dùng để dịch và tạo audio</small></div>
    </section>
    <section className="panel language-panel">
      <div className="panel-heading language-manager-heading">
        <div><h3>Danh sách ngôn ngữ</h3><p>Quản lý các ngôn ngữ được hỗ trợ bởi Backend</p></div>
        <button className="button button-primary" onClick={() => { setEditingLanguage(null); setIsModalOpen(true); }} disabled={!addableLanguages.length}>
          <Plus size={16} /> Thêm ngôn ngữ
        </button>
      </div>
      <div className="language-toolbar">
        <label className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã ngôn ngữ..." /></label>
        <label className="filter-select"><Filter size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="active">Đang bật</option><option value="inactive">Đang tắt</option></select><ChevronDown size={14} /></label>
      </div>
      {loadError && <div className="language-error" role="alert">Không tải được danh sách ngôn ngữ: {loadError}</div>}
      {actionError && <div className="language-error" role="alert">{actionError}</div>}
      <div className="language-list">{filteredLanguages.map((language) => (
        <div className="language-row" key={language.code}>
          <span className="language-flag">{language.flag}</span>
          <div className="language-name"><strong>{language.name}</strong><small>{language.code.toUpperCase()}</small></div>
          <div className="language-places"><strong>{language.places}</strong><span>di tích đã có bản dịch</span></div>
          <span className={`language-status ${language.is_active ? 'is-active' : 'is-inactive'}`}>{language.is_active ? 'Đang bật' : 'Đang tắt'}</span>
          <div className="language-actions">
            <button className="icon-button" title="Sửa tên và biểu tượng" aria-label={`Sửa ${language.name}`} onClick={() => { setEditingLanguage(language); setIsModalOpen(true); }}><Pencil size={15} /></button>
            <button className="icon-button" title={language.is_active ? 'Tắt ngôn ngữ' : 'Bật ngôn ngữ'} aria-label={`${language.is_active ? 'Tắt' : 'Bật'} ${language.name}`} disabled={language.code === 'vi'} onClick={() => toggleLanguage(language)}><Check size={15} /></button>
            <button className="icon-button language-delete" title="Xóa ngôn ngữ" aria-label={`Xóa ${language.name}`} disabled={language.code === 'vi'} onClick={() => removeLanguage(language)}><Trash2 size={15} /></button>
          </div>
        </div>
      ))}{filteredLanguages.length === 0 && <div className="language-empty">Không có ngôn ngữ phù hợp với bộ lọc.</div>}</div>
    </section>
    {isModalOpen && <LanguageModal
      language={editingLanguage}
      availableLanguages={addableLanguages}
      onClose={() => setIsModalOpen(false)}
      onSave={saveLanguage}
    />}
  </div>;
}

function LanguageModal({ language, availableLanguages, onClose, onSave }) {
  const [code, setCode] = useState(language?.code ?? availableLanguages[0]?.code ?? '');
  const [name, setName] = useState(language?.name ?? '');
  const [flag, setFlag] = useState(language?.flag ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!code || !name.trim() || !flag.trim()) {
      setError('Nhập đầy đủ tên, biểu tượng và mã ngôn ngữ.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ code, name: name.trim(), flag: flag.trim() });
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="site-modal language-modal" onSubmit={submit}>
    <div className="modal-head"><div><span className="modal-icon"><Globe2 size={18} /></span><div><h2>{language ? 'Chỉnh sửa ngôn ngữ' : 'Thêm ngôn ngữ'}</h2><p>Thông tin được lưu vào Backend.</p></div></div><button type="button" className="icon-button" aria-label="Đóng" onClick={onClose} disabled={saving}><X size={19} /></button></div>
    <div className="modal-body">
      <label>Mã ngôn ngữ <em>*</em><select value={code} disabled={Boolean(language)} onChange={(event) => setCode(event.target.value)}>{language ? <option value={language.code}>{language.code.toUpperCase()}</option> : availableLanguages.map((available) => <option key={available.code} value={available.code}>{available.code.toUpperCase()} · {available.name}</option>)}</select></label>
      <label>Tên hiển thị <em>*</em><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Ví dụ: Tiếng Việt" /></label>
      <label>Biểu tượng <em>*</em><input value={flag} onChange={(event) => setFlag(event.target.value)} maxLength={16} placeholder="Ví dụ: 🇻🇳" /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
    </div>
    <div className="modal-foot"><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Hủy</button><button className="button button-primary" type="submit" disabled={saving || (!language && !availableLanguages.length)}>{saving ? 'Đang lưu…' : language ? 'Lưu thay đổi' : 'Thêm ngôn ngữ'} {!saving && <ArrowRight size={15} />}</button></div>
  </form></div>;
}

function MapPage({ notify, sites }) {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [gpsWatching, setGpsWatching] = useState(false);
  const watchId = useRef(null);
  const mappedSites = useMemo(() => sites.filter((site) => {
    const lat = Number(site.lat ?? site.location?.coordinates?.[1]);
    const lng = Number(site.lng ?? site.location?.coordinates?.[0]);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90
      && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  }).map((site) => ({
    ...site,
    lat: Number(site.lat ?? site.location.coordinates[1]),
    lng: Number(site.lng ?? site.location.coordinates[0]),
  })), [sites]);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
  }, []);

  const locateUser = () => {
    if (!navigator.geolocation) {
      notify('Trình duyệt này không hỗ trợ định vị GPS.');
      return;
    }
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setGpsWatching(false);
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => setCurrentLocation([coords.latitude, coords.longitude]),
      (error) => {
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setGpsWatching(false);
        notify(`Không lấy được vị trí GPS: ${error.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    setGpsWatching(true);
  };

  return <div className="map-page">
    <section className="panel map-large-panel">
      <div className="panel-heading">
        <div>
          <h3>Vị trí các điểm di tích</h3>
          <p>Quận 1, Thành phố Hồ Chí Minh · {mappedSites.length} di tích từ dữ liệu</p>
        </div>
        <button className="button button-secondary small-button" onClick={locateUser}>
          <Compass size={15} /> {gpsWatching ? 'Dừng định vị' : 'Bật định vị'}
        </button>
      </div>
      {mappedSites.length
        ? <SiteMap sites={mappedSites} currentLocation={currentLocation} />
        : <p className="map-empty">Chưa có di tích với tọa độ hợp lệ trong Backend.</p>}
    </section>
    <section className="gps-side">
      <div className="panel gps-status-panel">
        <div className="gps-status-head">
          <span className="gps-icon"><ShieldCheck size={19} /></span>
          <span className="gps-online"><i /> {gpsWatching ? 'ĐANG THEO DÕI' : 'GPS TẮT'}</span>
        </div>
        <h3>GPS & Geofence</h3>
        <p>{currentLocation
          ? `Vị trí hiện tại: ${currentLocation[0].toFixed(5)}, ${currentLocation[1].toFixed(5)}.`
          : 'Bật định vị để hiển thị vị trí hiện tại trên bản đồ. GPS chỉ được theo dõi khi bạn bật nút.'}</p>
        <div className="radius-setting"><div><span>Bán kính kích hoạt mặc định</span><strong>100 <small>mét</small></strong></div><p>Áp dụng cố định cho tất cả di tích.</p></div>
      </div>
      <div className="panel gps-help-panel">
        <div className="gps-help-icon"><CircleHelp size={17} /></div>
        <div><strong>Bản đồ dữ liệu thật</strong><p>Chọn một điểm đánh dấu để xem tên, địa chỉ và tọa độ. Bản đồ nền dùng OpenStreetMap.</p></div>
      </div>
    </section>
  </div>;
}

function SettingsPage({ account, onAccountUpdate, notify, authRequired }) {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [username, setUsername] = useState(account.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (authRequired) {
    const updateCredentials = async (event) => {
      event.preventDefault();
      setError('');
      if (username.trim().length < 3) {
        setError('Tên đăng nhập cần có ít nhất 3 ký tự.');
        return;
      }
      if (newPassword.length < 8) {
        setError('Mật khẩu mới cần có ít nhất 8 ký tự.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
        return;
      }

      setSaving(true);
      try {
        const session = await updateAdminCredentials(
          currentPassword,
          username.trim(),
          newPassword,
        );
        onAccountUpdate({ username: session.username });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        notify('Đã đổi thông tin đăng nhập.');
      } catch (updateError) {
        setError(updateError.message || 'Không thể cập nhật thông tin đăng nhập.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div><h3>Thông tin tài khoản</h3><p>Đổi tài khoản quản trị. Thay đổi được lưu an toàn trên Backend.</p></div>
        </div>
        <form className="settings-form" onSubmit={updateCredentials}>
          <label>Tên đăng nhập
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label>Mật khẩu hiện tại <em>*</em>
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <label>Mật khẩu mới <em>*</em>
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          <label>Xác nhận mật khẩu mới <em>*</em>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          {error && <div className="settings-error" role="alert">{error}</div>}
          <button className="button button-primary settings-save" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thông tin đăng nhập'}</button>
          <p className="settings-security-note">Mật khẩu được lưu dưới dạng mã băm trong cơ sở dữ liệu, không lưu trong trình duyệt.</p>
        </form>
      </section>
    );
  }

  const saveAccount = (event) => {
    event.preventDefault();
    if (displayName.trim().length < 2 || username.trim().length < 3) {
      setError('Tên hiển thị cần ít nhất 2 ký tự và tên đăng nhập ít nhất 3 ký tự.');
      return;
    }
    if (!currentPassword) {
      setError('Nhập mật khẩu hiện tại để xác nhận thay đổi.');
      return;
    }
    if (newPassword && newPassword.length < 4) {
      setError('Mật khẩu mới cần có ít nhất 4 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return;
    }

    try {
      onAccountUpdate({ displayName, username, currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      notify('Đã cập nhật thông tin tài khoản.');
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div><h3>Thông tin tài khoản</h3><p>Cập nhật thông tin dùng để đăng nhập quản trị.</p></div>
      </div>
      <form className="settings-form" onSubmit={saveAccount}>
        <label>Tên hiển thị
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
        </label>
        <label>Tên đăng nhập
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>Mật khẩu hiện tại <em>*</em>
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <label>Mật khẩu mới <span className="field-hint">(để trống nếu không đổi)</span>
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </label>
        <label>Xác nhận mật khẩu mới
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="settings-error" role="alert">{error}</div>}
        <button className="button button-primary settings-save" type="submit">Lưu thông tin tài khoản</button>
      </form>
      <p className="settings-security-note">Lưu ý: đăng nhập hiện tại là tiện ích demo phía trình duyệt, chưa thay thế xác thực an toàn ở Backend.</p>
    </section>
  );
}

function SiteModal({ site, onClose, onSave }) {
  const [name, setName] = useState(site?.name ?? '');
  const [code, setCode] = useState(site?.code ?? '');
  const [address, setAddress] = useState(site?.address ?? '');
  const [category, setCategory] = useState(site?.category ?? 'Di tích lịch sử');
  const [lat, setLat] = useState(site?.lat === '' || site?.lat == null ? '' : String(site.lat));
  const [lng, setLng] = useState(site?.lng === '' || site?.lng == null ? '' : String(site.lng));
  const [description, setDescription] = useState(site?.description ?? '');
  const [status, setStatus] = useState(site?.status ?? 'Bản nháp');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (name.trim().length < 2 || address.trim().length < 2 || description.trim().length < 10) {
      setError('Nhập tên, địa chỉ hợp lệ và nội dung thuyết minh ít nhất 10 ký tự.');
      return;
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setError('Tọa độ không hợp lệ. Vĩ độ từ -90 đến 90, kinh độ từ -180 đến 180.');
      return;
    }
    const siteCode = site?.code || code.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteCode) || siteCode.length < 2 || siteCode.length > 80) {
      setError('Mã di tích chỉ gồm chữ thường, số và dấu gạch ngang, ví dụ: dinh-doc-lap.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        code: siteCode,
        name: name.trim(),
        address: address.trim(),
        category,
        lat: latitude,
        lng: longitude,
        description: description.trim(),
        status,
      });
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="site-modal" onSubmit={submit}>
    <div className="modal-head"><div><span className="modal-icon"><MapPin size={18} /></span><div><h2>{site ? 'Chỉnh sửa di tích' : 'Thêm di tích mới'}</h2><p>Thông tin sẽ được lưu trực tiếp vào Backend.</p></div></div><button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}><X size={19} /></button></div>
    <div className="modal-body">
      <label>Tên di tích <em>*</em><input autoFocus value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!site) setCode(slugify(value)); setError(''); }} placeholder="Ví dụ: Dinh Độc Lập" /></label>
      <label>Mã di tích <em>*</em><input value={code} readOnly={Boolean(site)} onChange={(event) => { setCode(event.target.value); setError(''); }} placeholder="dinh-doc-lap" /><small className="field-hint">Mã URL duy nhất, dùng chữ thường, số và dấu gạch ngang.</small></label>
      <label>Địa chỉ <em>*</em><div className="input-with-icon"><MapPin size={15} /><input value={address} onChange={(event) => { setAddress(event.target.value); setError(''); }} placeholder="Số nhà, tên đường..." /></div></label>
      <div className="form-columns"><label>Vĩ độ GPS <em>*</em><input type="number" min="-90" max="90" step="any" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="10.7769" /></label><label>Kinh độ GPS <em>*</em><input type="number" min="-180" max="180" step="any" value={lng} onChange={(event) => setLng(event.target.value)} placeholder="106.6952" /></label></div>
      <div className="form-columns"><label>Loại hình<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Di tích lịch sử</option><option>Lịch sử</option><option>Kiến trúc</option><option>Bảo tàng</option><option>Văn hóa</option></select></label><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Bản nháp</option><option>Đang hoạt động</option></select></label></div>
      <label>Nội dung thuyết minh <em>*</em><textarea rows="4" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Nhập nội dung để hệ thống dùng cho thuyết minh và tạo audio..." /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
    </div>
    <div className="modal-foot"><button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Hủy</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : site ? 'Lưu thay đổi' : 'Tạo di tích'} {!saving && <ArrowRight size={15} />}</button></div>
  </form></div>;
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default App;
