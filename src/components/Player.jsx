import { useEffect, useRef, useState } from 'react';

function getHlsConfig(isLive) {
  return {
    // ===== Buffer أقصى درجة =====
    maxBufferLength:           isLive ? 60  : 120,
    maxMaxBufferLength:        isLive ? 120 : 600,
    maxBufferSize:             256 * 1024 * 1024,
    maxBufferHole:             0.1,
    highBufferWatchdogPeriod:  3,
    nudgeMaxRetry:             10,

    // ===== ABR – دائماً أعلى جودة =====
    startLevel:                -1,
    abrEwmaDefaultEstimate:    60 * 1024 * 1024,
    abrBandWidthFactor:        0.95,
    abrBandWidthUpFactor:      0.90,
    abrMaxWithRealBitrate:     true,

    // ===== أداء =====
    enableWorker:              true,
    progressive:               true,
    lowLatencyMode:            isLive,
    backBufferLength:          isLive ? 30 : 120,
    maxFragLookUpTolerance:    0.1,

    // ===== Retry =====
    manifestLoadingTimeOut:    15000,
    manifestLoadingMaxRetry:   6,
    manifestLoadingRetryDelay: 500,
    levelLoadingTimeOut:       15000,
    levelLoadingMaxRetry:      6,
    levelLoadingRetryDelay:    500,
    fragLoadingTimeOut:        30000,
    fragLoadingMaxRetry:       6,
    fragLoadingRetryDelay:     500,

    // ===== CORS – بدون credentials =====
    xhrSetup(xhr, url) {
      xhr.withCredentials = false;
    },
    fetchSetup(context, initParams) {
      initParams.credentials = 'omit';
      initParams.mode = 'cors';
      return new Request(context.url, initParams);
    },
  };
}

export default function Player({ streamUrl, title, onClose }) {
  const videoRef     = useRef(null);
  const hlsRef       = useRef(null);
  const containerRef = useRef(null);

  const [engine, setEngine]       = useState('hlsjs');
  const [bw, setBw]               = useState(null);
  const [quality, setQuality]     = useState('');
  const [buffering, setBuffering] = useState(true);
  const [hevcWarn, setHevcWarn]   = useState(false);
  const [errMsg, setErrMsg]       = useState('');

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    setErrMsg('');
    initPlayer();
    return destroyPlayer;
  }, [streamUrl, engine]);

  function destroyPlayer() {
    if (hlsRef.current) {
      try { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); hlsRef.current.destroy(); } catch(e){}
      hlsRef.current = null;
    }
  }

  function initPlayer() {
    destroyPlayer();
    const video = videoRef.current;

    // streamUrl = رابط مباشر من سيرفر IPTV
    const url    = streamUrl;
    const isLive = url.includes('/live/');
    const isVOD  = url.includes('/movie/') || url.includes('/series/');
    const ext    = url.split('.').pop().toLowerCase().split('?')[0];
    const isHLS  = ext === 'm3u8' || ext === 'm3u';

    setBuffering(true); setHevcWarn(false); setBw(null); setQuality('');
    attachBufferEvents(video);

    if (engine === 'direct') {
      playDirect(video, url);
    } else if (engine === 'hevc_proxy') {
      // للـ 4K: جرب نسخة mp4
      const mp4 = url.replace(/\.m3u8(\?.*)?$/, '.mp4');
      playDirect(video, mp4, url);
    } else {
      // hlsjs — الافتراضي
      if (isHLS && window.Hls?.isSupported()) {
        playHlsJS(video, url, isLive);
      } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari: native HLS
        video.src = url;
        safePlay(video);
      } else if (isVOD) {
        playDirect(video, url);
      } else {
        playHlsJS(video, url, isLive);
      }
    }
  }

  function playHlsJS(video, url, isLive) {
    const Hls = window.Hls;
    const hls = new Hls(getHlsConfig(isLive));
    hlsRef.current = hls;

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
      const lvls = hls.levels;
      const top  = lvls[lvls.length - 1];

      // قفل على أعلى جودة
      hls.currentLevel = hls.loadLevel = hls.nextAutoLevel = lvls.length - 1;

      if (top?.height) {
        const lbl = top.height>=2160?'4K UHD':top.height>=1080?'FHD 1080p':top.height>=720?'HD 720p':`${top.height}p`;
        setQuality(lbl);
      }
      safePlay(video);
    });

    hls.on(Hls.Events.FRAG_LOADED, () => {
      const b = hls.bandwidthEstimate;
      if (b > 0) setBw((b / 1024 / 1024).toFixed(1));
    });

    let errCnt = 0, mediaErrCnt = 0;
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) {
        if (d.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            d.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
          hls.startLoad();
        }
        return;
      }
      errCnt++;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setErrMsg('🔄 خطأ شبكة، إعادة الاتصال...');
        setTimeout(() => { setErrMsg(''); hls.startLoad(); }, Math.min(errCnt * 1000, 5000));
      } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
        mediaErrCnt++;
        if (mediaErrCnt <= 3) hls.recoverMediaError();
        else setTimeout(() => checkHEVC(video, url), 1500);
      } else {
        setErrMsg('⚠️ خطأ، إعادة التشغيل...');
        setTimeout(() => { setErrMsg(''); initPlayer(); }, 3000);
      }
    });

    // كاشف الشاشة السوداء H.265
    setTimeout(() => checkHEVC(video, url), 4500);
  }

  function checkHEVC(video, url) {
    if (!video.paused && video.currentTime > 0.5 && video.videoWidth === 0) {
      setHevcWarn(true);
      const mp4 = url.replace(/\.m3u8(\?.*)?$/, '.mp4');
      rebuildPlay(video, mp4, url);
    }
  }

  function rebuildPlay(video, primary, fallback) {
    destroyPlayer();
    video.src = primary;
    video.load();
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth > 0) safePlay(video);
      else { video.src = fallback; video.load(); safePlay(video); }
    }, { once: true });
    video.addEventListener('error', () => {
      video.src = fallback; video.load(); safePlay(video);
    }, { once: true });
    safePlay(video);
  }

  function playDirect(video, url, fallback = null) {
    video.src = url;
    video.addEventListener('error', () => {
      if (fallback) { video.src = fallback; safePlay(video); }
    }, { once: true });
    safePlay(video);
  }

  function attachBufferEvents(video) {
    video.addEventListener('waiting', () => setBuffering(true));
    video.addEventListener('playing', () => setBuffering(false));
    video.addEventListener('canplay', () => setBuffering(false), { once: true });
  }

  function safePlay(v) {
    const p = v.play?.();
    if (p) p.catch(e => e.name !== 'AbortError' && console.warn('Play blocked:', e.name));
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }

  const qualityColor = quality.includes('4K') ? '#f59e0b' : quality.includes('FHD') ? '#60a5fa' : '#94a3b8';

  return (
    <div className="player-screen">
      <header className="player-header">
        <button className="btn-ghost" onClick={onClose} style={{ flexShrink: 0 }}>⬅ إغلاق</button>
        <span className="player-title">{title}</span>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {quality && (
            <span style={{ color:qualityColor, fontSize:12, fontWeight:700, background:'#1e2538', padding:'3px 8px', borderRadius:5 }}>
              🎯 {quality}
            </span>
          )}
          <div className="engine-selector">
            <label>المحرك:</label>
            <select value={engine} onChange={e => setEngine(e.target.value)}>
              <option value="hlsjs">⚡ Hls.js (موصى به)</option>
              <option value="direct">🔗 مباشر</option>
              <option value="hevc_proxy">🔴 4K HEVC</option>
            </select>
          </div>
        </div>
      </header>

      <div ref={containerRef} className="player-container" onDoubleClick={toggleFullscreen}>
        <video
          ref={videoRef}
          id="main-video"
          controls
          preload="auto"
          playsInline
          style={{ width:'100%', height:'100%', objectFit:'contain', background:'#000' }}
        />

        {/* مؤشر السرعة */}
        {bw && <div id="bw-indicator">⚡ {bw} Mbps</div>}

        {/* Buffering */}
        {buffering && (
          <div id="buffering-overlay">
            <div style={{ textAlign:'center' }}>
              <div className="spinner" />
              <div style={{ color:'#fff', fontSize:14, marginTop:8 }}>جاري التحميل…</div>
            </div>
          </div>
        )}

        {/* رسالة خطأ مؤقتة */}
        {errMsg && (
          <div style={{
            position:'absolute', bottom:70, left:'50%', transform:'translateX(-50%)',
            background:'rgba(0,0,0,.8)', color:'#fff', padding:'8px 18px',
            borderRadius:8, fontSize:13, zIndex:200, whiteSpace:'nowrap'
          }}>{errMsg}</div>
        )}

        {/* تحذير H.265 */}
        {hevcWarn && (
          <div id="hevc-warning">
            <strong>⚠️ البث 4K يستخدم H.265/HEVC</strong><br />
            يتم محاولة H.264 تلقائياً…<br />
            <small style={{ opacity:.85 }}>للحل الدائم: استخدم <b>Edge</b> أو <b>Safari</b></small>
          </div>
        )}
      </div>
    </div>
  );
}
