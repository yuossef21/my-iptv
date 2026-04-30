import { useEffect, useRef, useState } from 'react';

function getHlsConfig(isLive) {
  return {
    maxBufferLength: isLive ? 60 : 120,
    maxMaxBufferLength: isLive ? 120 : 600,
    maxBufferSize: 256 * 1024 * 1024,
    startLevel: -1,
    enableWorker: true,
    lowLatencyMode: isLive,
    backBufferLength: isLive ? 30 : 120,
    manifestLoadingTimeOut: 15000,
    fragLoadingTimeOut: 30000,
    xhrSetup(xhr, url) {
      xhr.withCredentials = false;
    },
  };
}

export default function Player({ streamUrl, title, onClose }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);

  const [bw, setBw] = useState(null);
  const [quality, setQuality] = useState('');
  const [buffering, setBuffering] = useState(true);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    setErrMsg('');
    initPlayer();
    return destroyPlayer;
  }, [streamUrl]);

  function destroyPlayer() {
    if (hlsRef.current) {
      try { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); hlsRef.current.destroy(); } catch(e){}
      hlsRef.current = null;
    }
  }

  function initPlayer() {
    destroyPlayer();
    const video = videoRef.current;
    const url = streamUrl;
    const isLive = url.includes('/live/');
    const isVOD = url.includes('/movie/') || url.includes('/series/');
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    const isHLS = ext === 'm3u8' || ext === 'm3u';

    setBuffering(true);
    attachBufferEvents(video);

    if (isHLS && window.Hls?.isSupported()) {
      const Hls = window.Hls;
      const hls = new Hls(getHlsConfig(isLive));
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const lvls = hls.levels;
        if (lvls.length > 0) {
          hls.currentLevel = hls.loadLevel = lvls.length - 1;
          const top = lvls[lvls.length - 1];
          if (top?.height) {
            const lbl = top.height>=2160?'4K':top.height>=1080?'1080p':top.height>=720?'720p':`${top.height}p`;
            setQuality(lbl);
          }
        }
        safePlay(video);
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        const b = hls.bandwidthEstimate;
        if (b > 0) setBw((b / 1024 / 1024).toFixed(1));
      });

      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          if (d.type === 1) {
            setErrMsg('Network error, retrying...');
            setTimeout(() => hls.startLoad(), 2000);
          } else if (d.type === 2) {
            setErrMsg('Media error, recovering...');
            hls.recoverMediaError();
          } else {
            setErrMsg('Fatal error, reloading...');
            setTimeout(() => initPlayer(), 3000);
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      safePlay(video);
    } else {
      video.src = url;
      video.addEventListener('loadedmetadata', () => safePlay(video));
    }
  }

  function attachBufferEvents(video) {
    video.addEventListener('waiting', () => setBuffering(true));
    video.addEventListener('playing', () => setBuffering(false));
    video.addEventListener('canplay', () => setBuffering(false), { once: true });
  }

  function safePlay(v) {
    const p = v.play?.();
    if (p) p.catch(e => console.log('Play blocked:', e.name));
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }

  return (
    <div className="player-screen">
      <header className="player-header">
        <button className="btn-ghost" onClick={onClose}>✕ إغلاق</button>
        <span className="player-title">{title}</span>
        {quality && <span className="quality-badge">{quality}</span>}
      </header>

      <div ref={containerRef} className="player-container" onDoubleClick={toggleFullscreen}>
        <video
          ref={videoRef}
          id="main-video"
          controls
          playsInline
          style={{ width:'100%', height:'100%', objectFit:'contain', background:'#000' }}
        />

        {bw && <div id="bw-indicator">⚡ {bw} Mbps</div>}

        {buffering && (
          <div id="buffering-overlay">
            <div className="spinner" />
            <div>جاري التحميل...</div>
          </div>
        )}

        {errMsg && <div className="error-toast">{errMsg}</div>}
      </div>
    </div>
  );
}