import { useEffect, useRef, useState } from 'react';

function getHlsConfig(isLive) {
  return {
    maxBufferLength:           isLive ? 60  : 120,
    maxMaxBufferLength:        isLive ? 120 : 600,
    maxBufferSize:             256 * 1024 * 1024,
    maxBufferHole:             0.1,
    highBufferWatchdogPeriod:  3,
    nudgeMaxRetry:             10,
    startLevel:                -1,
    abrEwmaDefaultEstimate:    60 * 1024 * 1024,
    abrBandWidthFactor:        0.95,
    abrBandWidthUpFactor:      0.90,
    abrMaxWithRealBitrate:     true,
    enableWorker:              true,
    progressive:               true,
    lowLatencyMode:            isLive,
    backBufferLength:          isLive ? 30 : 120,
    maxFragLookUpTolerance:    0.1,
    manifestLoadingTimeOut:    10000,
    manifestLoadingMaxRetry:   10,
    manifestLoadingRetryDelay: 300,
    levelLoadingTimeOut:       10000,
    levelLoadingMaxRetry:      10,
    levelLoadingRetryDelay:    300,
    fragLoadingTimeOut:        25000,
    fragLoadingMaxRetry:       10,
    fragLoadingRetryDelay:     300,
    xhrSetup(xhr)         { xhr.withCredentials = false; },
    fetchSetup(ctx, init) { init.credentials = 'omit'; return new Request(ctx.url, init); },
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

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    initPlayer();
    return destroyPlayer;
  }, [streamUrl, engine]);

  function destroyPlayer() {
    if (hlsRef.current) {
      try { hlsRef.current.stopLoad(); hlsRef.current.detachMedia(); hlsRef.current.destroy(); } catch(e){}
      hlsRef.current = null;
    }
  }

  // streamUrl يأتي دائماً كـ /api/proxy?url=... من api.js
  // لذلك لا مشكلة Mixed Content
  function initPlayer() {
    destroyPlayer();
    const video = videoRef.current;
    const url   = streamUrl;

    // هل الرابط الأصلي live أو vod؟ نكشف من داخل الـ query string
    const innerUrl   = decodeURIComponent(url.split('url=')[1] || '');
    const isLive     = innerUrl.includes('/live/');
    const isVOD      = innerUrl.includes('/movie/') || innerUrl.includes('/series/');
    const ext        = innerUrl.split('.').pop().toLowerCase().split('?')[0];
    const isHLS      = ext === 'm3u8' || ext === 'm3u';

    setBuffering(true); setHevcWarn(false); setBw(null); setQuality('');
    attachBufferEvents(video);

    if (engine === 'direct') {
      playDirect(video, url);
    } else if (engine === 'hevc_proxy') {
      playHEVCFallback(video, url, innerUrl);
    } else {
      // hlsjs — الـ url هو /api/proxy?url=... وهو https دائماً ✅
      if (isHLS && window.Hls?.isSupported()) {
        playHlsJS(video, url, isLive, innerUrl);
      } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari: يحتاج الرابط الأصلي لكن عبر البروكسي
        video.src = url; safePlay(video);
      } else if (isVOD) {
        playDirect(video, url);
      } else {
        playHlsJS(video, url, isLive, innerUrl);
      }
    }
  }

  function playHlsJS(video, url, isLive, innerUrl) {
    const Hls = window.Hls;
    const hls = new Hls(getHlsConfig(isLive));
    hlsRef.current = hls;
    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
      const lvls = hls.levels;
      const top  = lvls[lvls.length - 1];
      hls.currentLevel = hls.loadLevel = hls.nextAutoLevel = lvls.length - 1;
      if (top?.height) {
        const lbl = top.height>=2160?'4K UHD':top.height>=1080?'FHD 1080p':top.height>=720?'HD 720p':`${top.height}p`;
        setQuality(lbl);
      }
      safePlay(video);
    });

    hls.on(Hls.Events.FRAG_LOADED, () => {
      const b = hls.bandwidthEstimate;
      if (b > 0) setBw((b/1024/1024).toFixed(1));
    });

    let errCnt=0, mediaErrCnt=0;
    hls.on(Hls.Events.ERROR, (_,d) => {
      if (!d.fatal) {
        if (d.details===Hls.ErrorDetails.BUFFER_STALLED_ERROR||d.details===Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) hls.startLoad();
        return;
      }
      errCnt++;
      if (d.type===Hls.ErrorTypes.NETWORK_ERROR) setTimeout(()=>hls.startLoad(), Math.min(errCnt*500,4000));
      else if (d.type===Hls.ErrorTypes.MEDIA_ERROR) { mediaErrCnt++; if(mediaErrCnt<=3) hls.recoverMediaError(); else setTimeout(()=>checkHEVC(video,url,innerUrl),1500); }
      else setTimeout(()=>initPlayer(),3000);
    });

    setTimeout(()=>checkHEVC(video,url,innerUrl), 4000);
  }

  function checkHEVC(video, proxyUrl, innerUrl) {
    if (!video.paused && video.currentTime > 0.5 && video.videoWidth === 0) {
      setHevcWarn(true);
      // جرب نسخة mp4 عبر البروكسي
      const mp4inner = innerUrl.replace(/\.m3u8(\?.*)?$/, '.mp4');
      const mp4proxy = `/api/proxy?url=${encodeURIComponent(mp4inner)}`;
      rebuildPlay(video, mp4proxy, proxyUrl);
    }
  }

  function rebuildPlay(video, primary, fallback) {
    destroyPlayer();
    video.src = primary; video.load();
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth > 0) safePlay(video);
      else { video.src = fallback; video.load(); safePlay(video); }
    }, { once: true });
    video.addEventListener('error', () => { video.src = fallback; video.load(); safePlay(video); }, { once: true });
    safePlay(video);
  }

  function playHEVCFallback(video, proxyUrl, innerUrl) {
    const mp4inner = innerUrl.replace(/\.m3u8(\?.*)?$/, '.mp4');
    const mp4proxy = `/api/proxy?url=${encodeURIComponent(mp4inner)}`;
    video.src = mp4proxy;
    video.addEventListener('error', () => { video.src = proxyUrl; safePlay(video); }, { once: true });
    safePlay(video);
  }

  function playDirect(video, url) {
    video.src = url;
    video.addEventListener('error', () => {
      // إن فشل جرب البروكسي (للـ VOD)
      if (!video.src.includes('/api/proxy')) {
        video.src = `/api/proxy?url=${encodeURIComponent(url)}`; safePlay(video);
      }
    }, { once: true });
    safePlay(video);
  }

  function attachBufferEvents(video) {
    video.addEventListener('waiting', ()=>setBuffering(true));
    video.addEventListener('playing', ()=>setBuffering(false));
    video.addEventListener('canplay', ()=>setBuffering(false), { once: true });
  }

  function safePlay(v) {
    const p = v.play?.();
    if (p) p.catch(e => e.name !== 'AbortError' && console.warn('Play blocked:', e.name));
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(()=>{});
    else document.exitFullscreen();
  }

  const qualityColor = quality.includes('4K')?'#f59e0b':quality.includes('FHD')?'#60a5fa':'#94a3b8';

  return (
    <div className="player-screen">
      <header className="player-header">
        <button className="btn-ghost" onClick={onClose} style={{flexShrink:0}}>⬅ إغلاق</button>
        <span className="player-title">{title}</span>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          {quality && <span style={{color:qualityColor,fontSize:12,fontWeight:700,background:'#1e2538',padding:'3px 8px',borderRadius:5}}>🎯 {quality}</span>}
          <div className="engine-selector">
            <label>المحرك:</label>
            <select value={engine} onChange={e=>setEngine(e.target.value)}>
              <option value="hlsjs">⚡ Hls.js</option>
              <option value="direct">🔗 مباشر</option>
              <option value="hevc_proxy">🔴 4K HEVC</option>
            </select>
          </div>
        </div>
      </header>

      <div ref={containerRef} className="player-container" onDoubleClick={toggleFullscreen}>
        <video ref={videoRef} id="main-video" controls preload="auto"
          style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}
          playsInline /* ضروري للـ iOS */
        />

        {bw && <div id="bw-indicator">⚡ {bw} Mbps</div>}

        {buffering && (
          <div id="buffering-overlay">
            <div style={{textAlign:'center'}}>
              <div className="spinner"/>
              <div style={{color:'#fff',fontSize:14,marginTop:8}}>جاري التحميل…</div>
            </div>
          </div>
        )}

        {hevcWarn && (
          <div id="hevc-warning">
            <strong>⚠️ البث 4K يستخدم H.265/HEVC</strong><br/>
            يتم محاولة H.264 تلقائياً…<br/>
            <small style={{opacity:.85}}>للحل الدائم: استخدم <b>Edge</b> أو <b>Safari</b></small>
          </div>
        )}
      </div>
    </div>
  );
}
