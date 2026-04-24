import { useState, useEffect } from 'react';
import { XtreamAPI } from './api';
import LoginScreen  from './components/LoginScreen';
import Dashboard    from './components/Dashboard';
import ContentView  from './components/ContentView';
import Player       from './components/Player';

// تحميل Hls.js من CDN (أخف من npm)
function loadHlsScript() {
  if (window.Hls) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

export default function App() {
  const [session, setSession]   = useState(null);
  const [api, setApi]           = useState(null);
  const [screen, setScreen]     = useState('login');   // login | dashboard | content | player
  const [contentType, setContentType] = useState('');
  const [playerInfo, setPlayerInfo]   = useState(null); // { url, title }

  // استعادة الجلسة من localStorage
  useEffect(() => {
    loadHlsScript();
    const saved = localStorage.getItem('iptv_session');
    if (saved) {
      const s = JSON.parse(saved);
      setSession(s);
      setApi(new XtreamAPI(s));
      setScreen('dashboard');
    }
  }, []);

  function handleLogin(s) {
    setSession(s);
    setApi(new XtreamAPI(s));
    setScreen('dashboard');
  }

  function handleLogout() {
    localStorage.removeItem('iptv_session');
    setSession(null); setApi(null);
    setScreen('login');
  }

  function handleSelectType(type) {
    setContentType(type);
    setScreen('content');
  }

  function handlePlay(streamId, title, extension, type) {
    const url = api.getStreamUrl(type, streamId, extension);
    setPlayerInfo({ url, title });
    setScreen('player');
  }

  function handleClosePlayer() {
    setPlayerInfo(null);
    setScreen('content');
  }

  return (
    <div className="app-layout" style={{ height:'100vh', display:'flex', flexDirection:'column' }}>
      {screen === 'login' && (
        <LoginScreen onLogin={handleLogin} />
      )}

      {screen === 'dashboard' && (
        <Dashboard
          username={session?.username}
          onSelect={handleSelectType}
          onLogout={handleLogout}
        />
      )}

      {screen === 'content' && api && (
        <ContentView
          api={api}
          contentType={contentType}
          username={session?.username}
          onPlay={handlePlay}
          onBack={() => setScreen('dashboard')}
          onLogout={handleLogout}
        />
      )}

      {screen === 'player' && playerInfo && (
        <Player
          streamUrl={playerInfo.url}
          title={playerInfo.title}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
}
