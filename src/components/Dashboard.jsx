export default function Dashboard({ username, onSelect, onLogout }) {
  const sections = [
    { type: 'live',   icon: '📡', title: 'LIVE TV',  sub: 'البث المباشر', cls: 'live'   },
    { type: 'movies', icon: '🎬', title: 'MOVIES',   sub: 'الأفلام',      cls: 'movies' },
    { type: 'series', icon: '📺', title: 'SERIES',   sub: 'المسلسلات',    cls: 'series' },
  ];

  return (
    <>
      <header className="main-header">
        <span className="logo-text">PRO IPTV CORE</span>
        <div className="user-zone">
          <span className="user-name">مرحباً، {username}</span>
          <button className="btn-danger" onClick={onLogout}>تسجيل الخروج</button>
        </div>
      </header>
      <div className="dashboard">
        <div className="dash-grid">
          {sections.map(s => (
            <div key={s.type} className={`dash-card ${s.cls}`} onClick={() => onSelect(s.type)}>
              <div className="dash-card-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
