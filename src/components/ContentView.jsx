import { useState, useEffect, useRef } from 'react';
import SeriesModal from './SeriesModal';
import { proxyImg } from '../api';

const FALLBACK_IMG = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22300%22%20style%3D%22background%3A%230b0c10%22%3E%3Ctext%20fill%3D%22%233d4465%22%20y%3D%2250%25%22%20x%3D%2250%25%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216px%22%20font-weight%3D%22bold%22%3ENO%20IMAGE%3C%2Ftext%3E%3C%2Fsvg%3E";
const CHUNK = 40;

export default function ContentView({ api, contentType, username, onPlay, onBack, onLogout }) {
  const [categories, setCategories]   = useState([]);
  const [activeCat, setActiveCat]     = useState(null);
  const [streams, setStreams]          = useState([]);
  const [displayed, setDisplayed]     = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [searchTerm, setSearchTerm]   = useState('');
  const [allCache, setAllCache]       = useState(null);
  const [seriesOpen, setSeriesOpen]   = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sentinelRef = useRef(null);
  const observerRef = useRef(null);
  const searchTimer = useRef(null);
  const streamsRef  = useRef([]);
  streamsRef.current = streams;

  const titles = { live:'📡 LIVE TV', movies:'🎬 MOVIES', series:'📺 SERIES' };

  useEffect(() => {
    setLoadingCats(true); setAllCache(null);
    api.getCategories(contentType)
      .then(cats => { setCategories(cats||[]); if (cats?.length) selectCategory(cats[0]); })
      .catch(() => setCategories([]))
      .finally(() => setLoadingCats(false));
  }, [contentType]);

  function selectCategory(cat) {
    setActiveCat(cat.category_id); setSearchTerm('');
    setLoadingStreams(true); setSidebarOpen(false);
    api.getStreams(contentType, cat.category_id)
      .then(data => { const s=data||[]; setStreams(s); setDisplayed(s.slice(0,CHUNK)); })
      .catch(() => { setStreams([]); setDisplayed([]); })
      .finally(() => setLoadingStreams(false));
  }

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!sentinelRef.current) return;
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting)
        setDisplayed(prev => streamsRef.current.slice(0, prev.length + CHUNK));
    }, { rootMargin:'300px' });
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [streams]);

  function handleSearch(e) {
    const term = e.target.value; setSearchTerm(term);
    clearTimeout(searchTimer.current);
    if (!term.trim()) { const cat=categories.find(c=>c.category_id===activeCat); if(cat) selectCategory(cat); return; }
    searchTimer.current = setTimeout(async () => {
      setLoadingStreams(true);
      try {
        const all = allCache || await api.getAllStreams(contentType);
        if (!allCache) setAllCache(all);
        const f = (all||[]).filter(s=>(s.name||s.title||'').toLowerCase().includes(term.toLowerCase()));
        setStreams(f); setDisplayed(f.slice(0,CHUNK)); setActiveCat(null);
      } finally { setLoadingStreams(false); }
    }, 500);
  }

  function handleStreamClick(s) {
    const id=s.stream_id||s.series_id, ext=contentType==='live'?'m3u8':(s.container_extension||'mp4'), name=s.name||s.title;
    if (contentType==='series') setSeriesOpen({id,title:name});
    else onPlay(id,name,ext,contentType);
  }

  return (
    <>
      <header className="main-header">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button className="btn-ghost mobile-only" onClick={()=>setSidebarOpen(!sidebarOpen)} style={{fontSize:20,padding:'6px 12px'}}>☰</button>
          <span className="logo-text">PRO IPTV CORE</span>
        </div>
        <div className="user-zone">
          <span className="user-name desktop-only">مرحباً، {username}</span>
          <button className="btn-ghost desktop-only" onClick={onBack}>⬅ الرئيسية</button>
          <button className="btn-danger" onClick={onLogout}>خروج</button>
        </div>
      </header>

      <div className="content-view">
        <div className="content-toolbar">
          <button className="btn-ghost mobile-only" onClick={onBack} style={{padding:'6px 10px'}}>⬅</button>
          <h2 className="section-title">{titles[contentType]}</h2>
          <div className="search-box">
            <input type="text" placeholder="🔍 بحث في السيرفر..." value={searchTerm} onChange={handleSearch}/>
          </div>
        </div>

        <div className="content-body">
          {sidebarOpen && <div className="sidebar-overlay" onClick={()=>setSidebarOpen(false)}/>}

          <aside className={`sidebar${sidebarOpen?' sidebar-open':''}`}>
            <div className="sidebar-head">
              <span style={{fontWeight:700,fontSize:14}}>الأقسام</span>
              <button className="btn-ghost" onClick={()=>setSidebarOpen(false)} style={{padding:'4px 8px',fontSize:13}}>✕</button>
            </div>
            {loadingCats
              ? <div className="cat-item">جاري التحميل...</div>
              : categories.map(cat=>(
                  <div key={cat.category_id} className={`cat-item${activeCat===cat.category_id?' active':''}`} onClick={()=>selectCategory(cat)}>
                    {cat.category_name}
                  </div>
                ))
            }
          </aside>

          <main className="streams-area">
            {loadingStreams ? (
              <div className="status-msg"><div className="mini-spinner"/><span style={{marginTop:12}}>جاري التحميل...</span></div>
            ) : displayed.length===0 ? (
              <div className="status-msg">لا يوجد محتوى</div>
            ) : displayed.map((s,i)=>{
              const rawIcon = s.stream_icon||s.cover;
              const icon = rawIcon ? proxyImg(rawIcon) : FALLBACK_IMG;
              const name = s.name||s.title;
              return (
                <div key={`${s.stream_id||s.series_id}-${i}`} className="stream-card" onClick={()=>handleStreamClick(s)}>
                  <img loading="lazy" src={icon} alt={name} onError={e=>{e.target.onerror=null;e.target.src=FALLBACK_IMG;}}/>
                  <div className="stream-card-name">{name}</div>
                </div>
              );
            })}
            {displayed.length<streams.length && <div ref={sentinelRef} style={{height:20,gridColumn:'1/-1'}}/>}
          </main>
        </div>
      </div>

      {seriesOpen && (
        <SeriesModal api={api} seriesId={seriesOpen.id} seriesTitle={seriesOpen.title}
          onPlayEpisode={ep=>{setSeriesOpen(null);onPlay(ep.id,ep.title||`حلقة ${ep.episode_num}`,ep.container_extension||'mkv','series');}}
          onClose={()=>setSeriesOpen(null)}/>
      )}
    </>
  );
}
