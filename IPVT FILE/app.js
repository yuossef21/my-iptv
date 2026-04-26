let api = null;
let currentType = '';
let currentStreamUrl = '';
let vjsPlayer = null;
let hlsInstance = null;

let allCurrentStreams = [];
let globalStreamsCache = { live: null, movies: null, series: null };
let searchTimeout = null;
let displayedCount = 0;
const CHUNK_SIZE = 40;
let scrollObserver = null;

let currentPlaylist = [];
let currentPlaylistIndex = -1;

// ===== كاشف الـ Codec =====
const CodecSupport = {
    h265: false,
    h264: false,
    async detect() {
        const v = document.createElement('video');
        this.h265 =
            v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') === 'probably' ||
            v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') === 'probably' ||
            v.canPlayType('video/mp4; codecs="hvc1"') !== '' ||
            v.canPlayType('video/mp4; codecs="hev1"') !== '';
        this.h264 = v.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '';
        console.log(`Codec → H.264: ${this.h264} | H.265/HEVC: ${this.h265}`);
    }
};

// ===== إعدادات HLS – أقصى قوة وسرعة رهيبة =====
function getHlsConfig(isLive) {
    return {
        // ===== Buffer متوازن لتجنب طرد السيرفر للبث المباشر =====
        maxBufferLength: isLive ? 15 : 120,
        maxMaxBufferLength: isLive ? 30 : 600,
        maxBufferSize: 64 * 1024 * 1024,   // 64 MB RAM
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeMaxRetry: 10,

        // ===== ABR – دائماً أعلى جودة وسرعة استجابة =====
        startLevel: -1,
        abrEwmaDefaultEstimate: 50 * 1024 * 1024,    // 50 Mbps
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.90,
        abrMaxWithRealBitrate: true,

        // ===== أداء قوي جداً =====
        enableWorker: true,
        progressive: true,
        lowLatencyMode: isLive,
        backBufferLength: isLive ? 10 : 90,
        maxFragLookUpTolerance: 0.2,

        // ===== تفادي خطأ ERR_CONTENT_LENGTH_MISMATCH =====
        enableFetch: false, // إجبار استخدام XHR لأنه يتجاهل أخطاء الطول الوهمية من سيرفرات IPTV

        // ===== Retry عنيف جداً لتعويض انقطاع السيرفر =====
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 500,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 15,
        fragLoadingRetryDelay: 500,

        // ===== CORS =====
        xhrSetup(xhr) { xhr.withCredentials = false; }
    };
}

const FALLBACK_IMAGE = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22300%22%20style%3D%22background%3A%230b0c10%22%3E%3Ctext%20fill%3D%22%233d4465%22%20y%3D%2250%25%22%20x%3D%2250%25%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216px%22%20font-weight%3D%22bold%22%3ENO%20IMAGE%3C%2Ftext%3E%3C%2Fsvg%3E";

const dom = {
    loginScreen: document.getElementById('login-screen'),
    dashScreen: document.getElementById('dashboard-screen'),
    playerScreen: document.getElementById('player-screen'),
    seriesModal: document.getElementById('series-modal'),
    searchInput: document.getElementById('search-input'),
    displayUser: document.getElementById('display-user'),
    loginForm: document.getElementById('login-form'),
    mainDash: document.getElementById('main-dash'),
    contentView: document.getElementById('content-view'),
    categoriesList: document.getElementById('categories-list'),
    streamsList: document.getElementById('streams-list'),
    contentTitle: document.getElementById('content-title'),
    playerTitle: document.getElementById('player-title'),
    engineSelect: document.getElementById('engine-select'),
    historyToggle: document.getElementById('history-toggle'),
};

// ===== إقلاع =====
let watchHistory = JSON.parse(localStorage.getItem('iptv_history')) || {};

function isAdultContent(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    return t.includes('18+') || t.includes('+18') || t.includes('xxx') || t.includes('adult') || t.includes('porn') || t.includes('للكبار');
}

dom.familyToggle?.addEventListener('change', () => {
    if (currentType) document.querySelector(`.dash-card.${currentType}`)?.click();
});

document.addEventListener('DOMContentLoaded', async () => {
    await CodecSupport.detect();
    buildEngineOptions();

    // إعدادات الدخول التلقائي
    const autoUrl = "http://9tv.one:80";
    const autoUser = "23441138792";
    const autoPass = "76943549847";
    
    api = new XtreamAPI();
    try {
        const d = await api.authenticate(autoUrl, autoUser, autoPass);
        if (d.user_info) {
            const max = parseInt(d.user_info.max_connections) || 0;
            const active = parseInt(d.user_info.active_cons) || 0;
            if (max > 0 && active >= max) {
                setTimeout(() => {
                    alert(`⚠️ تحذير: لقد وصلت للحد الأقصى للأجهزة المتصلة (${active}/${max}).\nالسيرفر قد يمنع البث! يرجى إغلاق التطبيق من أجهزتك الأخرى فوراً ليعمل التطبيق بثبات.`);
                }, 1000);
            }
        }
    } catch(e) {}
    
    localStorage.setItem('iptv_session', JSON.stringify({ url: autoUrl, username: autoUser, password: autoPass }));
    
    showScreen(dom.dashScreen);
    dom.displayUser.textContent = `مرحباً بك في PRO IPTV`;
    
    // الدخول مباشرة لقسم الأفلام لسرعة الوصول
    setTimeout(() => {
        document.querySelector('.dash-card.movies')?.click();
    }, 500);

    // برمجة زر الرجوع للأندرويد
    if (window.Capacitor && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(()=>{});
            } else if (dom.playerScreen.classList.contains('active')) {
                document.getElementById('close-player-btn').click();
            } else if (dom.seriesModal.classList.contains('active')) {
                document.getElementById('close-modal-btn').click();
            } else if (dom.contentView.style.display !== 'none') {
                document.getElementById('back-to-dash-btn').click();
            } else if (dom.dashScreen.classList.contains('active') || dom.loginScreen.classList.contains('active')) {
                window.Capacitor.Plugins.App.exitApp();
            }
        });
    }
});

function buildEngineOptions() {
    const sel = dom.engineSelect;
    if (!sel) return;
    sel.innerHTML = '';
    [
        ['hlsjs', '⚡ Hls.js – بث مباشر (موصى به)'],
        ['videojs', '🎬 Video.js – HLS متقدم'],
        ['direct', '🔗 مباشر – أفلام / مسلسلات'],
        ['hevc_proxy', '🔴 4K HEVC Fallback'],
    ].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
        showNotification(`المحرك: ${sel.options[sel.selectedIndex].text}`);
        if (currentStreamUrl) triggerPlayer();
    });
}

// ===== تسجيل الدخول =====
dom.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let url = document.getElementById('server-url').value.trim().replace(/\/$/, '');
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const btn = document.getElementById('login-btn');
    btn.textContent = 'جاري التحقق...';
    document.getElementById('login-error').textContent = '';
    try {
        const t = new XtreamAPI();
        const d = await t.authenticate(url, user, pass);
        if (d.user_info?.auth === 1) {
            localStorage.setItem('iptv_session', JSON.stringify({ url, username: user, password: pass }));
            api = new XtreamAPI();
            dom.displayUser.textContent = `مرحباً، ${user}`;
            showScreen(dom.dashScreen);
        } else throw new Error();
    } catch {
        document.getElementById('login-error').textContent = 'خطأ بالاتصال. تأكد من الرابط أو الشبكة.';
    } finally { btn.textContent = 'اتصال بالسيرفر'; }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('iptv_session');
    api = null;
    globalStreamsCache = { live: null, movies: null, series: null };
    showScreen(dom.loginScreen);
});

// ===== الأقسام =====
document.querySelectorAll('.dash-card').forEach(card => {
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', async () => {
        currentType = card.dataset.type;
        dom.contentTitle.textContent = card.querySelector('h3').textContent;
        dom.mainDash.style.display = 'none';
        dom.contentView.style.display = 'flex';
        dom.searchInput.value = '';
        dom.categoriesList.innerHTML = '<div class="category-item">جاري التحميل...</div>';
        dom.streamsList.innerHTML = '';
        try { renderCategories(await api.getCategories(currentType)); }
        catch { dom.categoriesList.innerHTML = '<div class="category-item" style="color:red;">خطأ بالتحميل</div>'; }
    });
});

document.getElementById('back-to-dash-btn').addEventListener('click', () => {
    dom.contentView.style.display = 'none';
    dom.mainDash.style.display = 'grid';
});

function renderCategories(cats) {
    dom.categoriesList.innerHTML = '';
    const wrap = document.createElement('div');
    dom.categoriesList.appendChild(wrap);
    
    if (dom.familyToggle?.checked) {
        cats = cats?.filter(cat => !isAdultContent(cat.category_name)) || [];
    }

    if (!cats?.length) return wrap.innerHTML = '<div class="category-item">لا توجد أقسام</div>';
    cats.forEach((cat, i) => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.setAttribute('tabindex', '0');
        div.textContent = cat.category_name;
        div.onclick = () => {
            document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            dom.searchInput.value = '';
            loadStreams(cat.category_id);
        };
        wrap.appendChild(div);
        if (i === 0) div.click();
    });
}

async function loadStreams(catId) {
    dom.streamsList.innerHTML = '<h3 style="grid-column:1/-1;text-align:center;">جاري التحميل...</h3>';
    try { 
        let streams = await api.getStreams(currentType, catId) || []; 
        if (dom.familyToggle?.checked) {
            streams = streams.filter(s => !isAdultContent(s.name) && !isAdultContent(s.title));
        }
        allCurrentStreams = streams;
        renderStreamsList(allCurrentStreams, true); 
    }
    catch { dom.streamsList.innerHTML = '<h3 style="color:red;grid-column:1/-1;text-align:center;">خطأ بالتحميل</h3>'; }
}

function renderStreamsList(arr, isNew = false) {
    if (isNew) { dom.streamsList.innerHTML = ''; displayedCount = 0; if (scrollObserver) scrollObserver.disconnect(); }
    if (!arr?.length) { if (isNew) dom.streamsList.innerHTML = '<h3 style="grid-column:1/-1;text-align:center;">لا يوجد محتوى</h3>'; return; }
    arr.slice(displayedCount, displayedCount + CHUNK_SIZE).forEach(s => {
        const card = document.createElement('div');
        card.className = 'stream-card';
        card.setAttribute('tabindex', '0');
        const icon = s.stream_icon || s.cover || FALLBACK_IMAGE;
        const name = s.name || s.title;
        const id = s.stream_id || s.series_id;
        const ext = currentType === 'live' ? 'm3u8' : (s.container_extension || 'mp4');
        card.innerHTML = `<img loading="lazy" src="${icon}" onerror="this.src='${FALLBACK_IMAGE}'"><h4>${name}</h4>`;
        card.onclick = () => currentType === 'series' ? openSeriesModal(id, name) : openPlayer(id, name, ext);
        dom.streamsList.appendChild(card);
    });
    displayedCount += Math.min(CHUNK_SIZE, arr.length - displayedCount + CHUNK_SIZE);
    displayedCount = Math.min(displayedCount, arr.length + CHUNK_SIZE);
    // fix counter
    displayedCount = Math.min(arr.length, displayedCount);

    if (isNew && arr.length > 0) {
        setTimeout(() => dom.streamsList.querySelector('.stream-card')?.focus(), 100);
    }

    if (displayedCount < arr.length) {
        const s = Object.assign(document.createElement('div'), { style: 'height:20px;grid-column:1/-1' });
        dom.streamsList.appendChild(s);
        scrollObserver = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) { scrollObserver.unobserve(s); s.remove(); renderStreamsList(arr, false); }
        }, { root: dom.streamsList, rootMargin: '200px' });
        scrollObserver.observe(s);
    }
}

dom.searchInput.addEventListener('input', e => {
    const term = e.target.value.toLowerCase().trim();
    clearTimeout(searchTimeout);
    if (!term) { document.querySelector('.category-item.active')?.click(); return; }
    searchTimeout = setTimeout(async () => {
        dom.streamsList.innerHTML = '<h3 style="grid-column:1/-1;text-align:center;">جاري البحث...</h3>';
        try {
            if (!globalStreamsCache[currentType]) globalStreamsCache[currentType] = await api.getAllStreams(currentType);
            let filtered = (globalStreamsCache[currentType] || []).filter(s => (s.name || s.title || '').toLowerCase().includes(term));
            if (dom.familyToggle?.checked) {
                filtered = filtered.filter(s => !isAdultContent(s.name) && !isAdultContent(s.title));
            }
            renderStreamsList(filtered, true);
            document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        } catch { dom.streamsList.innerHTML = '<h3 style="color:red;grid-column:1/-1;text-align:center;">فشل البحث</h3>'; }
    }, 500);
});

// ===== المسلسلات =====
async function openSeriesModal(sid, stitle) {
    dom.seriesModal.classList.add('active');
    document.getElementById('series-title-display').textContent = stitle;
    const sc = document.getElementById('seasons-container');
    const ec = document.getElementById('episodes-container');
    sc.innerHTML = 'جاري جلب البيانات...'; ec.innerHTML = '';
    try {
        const d = await api.getSeriesInfo(sid);
        if (!d?.episodes) throw new Error();
        sc.innerHTML = '';
        Object.keys(d.episodes).forEach((n, i) => {
            const btn = document.createElement('button');
            btn.className = 'season-btn'; btn.textContent = `موسم ${n}`;
            btn.setAttribute('tabindex', '0');
            btn.onclick = () => { document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderEpisodes(d.episodes[n]); };
            sc.appendChild(btn);
            if (i === 0) { btn.click(); setTimeout(() => btn.focus(), 100); }
        });
    } catch { sc.innerHTML = '<span style="color:red">فشل جلب تفاصيل المسلسل</span>'; }
}

function renderEpisodes(eps) {
    const c = document.getElementById('episodes-container');
    c.innerHTML = '';
    eps.forEach((ep, index) => {
        const card = document.createElement('div');
        card.className = 'episode-card';
        card.setAttribute('tabindex', '0');
        const title = ep.title || `حلقة ${ep.episode_num}`;
        card.innerHTML = `<h4>${title}</h4><p style="font-size:.8rem;color:#888">${ep.info?.duration || ''}</p>`;
        card.onclick = () => { 
            dom.seriesModal.classList.remove('active'); 
            currentPlaylist = eps;
            currentPlaylistIndex = index;
            openPlayer(ep.id, title, ep.container_extension || 'mkv', 'series'); 
        };
        c.appendChild(card);
    });
}

document.getElementById('close-modal-btn').addEventListener('click', () => dom.seriesModal.classList.remove('active'));

// =======================================================
// ===== محرك المشغل مع حل H.265 / 4K شاشة سوداء ========
// =======================================================

function openPlayer(streamId, title, extension, forcedType = null) {
    dom.playerTitle.textContent = title;
    const type = forcedType || currentType;
    currentStreamUrl = api.getStreamUrl(type, streamId, extension);
    window._currentPlayerInfo = { streamId, title, extension, type };
    
    const nextBtn = document.getElementById('next-ep-btn');
    if (nextBtn) {
        if (type === 'series' && currentPlaylist.length > 0 && currentPlaylistIndex >= 0 && currentPlaylistIndex < currentPlaylist.length - 1) {
            nextBtn.style.display = 'inline-block';
            nextBtn.onclick = playNextEpisode;
        } else {
            nextBtn.style.display = 'none';
        }
    }

    showScreen(dom.playerScreen);
    triggerPlayer();
}

function playNextEpisode() {
    if (currentPlaylistIndex >= 0 && currentPlaylistIndex < currentPlaylist.length - 1) {
        currentPlaylistIndex++;
        const nextEp = currentPlaylist[currentPlaylistIndex];
        const title = nextEp.title || `حلقة ${nextEp.episode_num}`;
        openPlayer(nextEp.id, title, nextEp.container_extension || 'mkv', 'series');
    }
}

function triggerPlayer() {
    const video = resetPlayerEnvironment();
    const engine = dom.engineSelect.value;
    const url = currentStreamUrl;
    const isLive = url.includes('/live/');
    const isVOD = url.includes('/movie/') || url.includes('/series/');
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    const isHLS = ext === 'm3u8' || ext === 'm3u';
    const isMKV = ext === 'mkv';
    const isTS = ext === 'ts';

    const wrap = document.getElementById('player-container');
    wrap.ondblclick = () => document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen().catch(() => { });

    attachBufferingEvents(video);
    showBufferingOverlay(true);

    const onEnded = () => {
        if (window._currentPlayerInfo?.type === 'series' && currentPlaylistIndex >= 0 && currentPlaylistIndex < currentPlaylist.length - 1) {
            playNextEpisode();
        }
    };
    video.addEventListener('ended', onEnded);

    // حفظ سجل المشاهدة واستئنافه
    let lastSave = 0;
    video.addEventListener('timeupdate', () => {
        if (!dom.historyToggle?.checked || !window._currentPlayerInfo?.streamId || isLive) return;
        const now = Date.now();
        if (now - lastSave > 5000 && video.currentTime > 5) {
            watchHistory[window._currentPlayerInfo.streamId] = video.currentTime;
            localStorage.setItem('iptv_history', JSON.stringify(watchHistory));
            lastSave = now;
        }
    });

    video.addEventListener('canplay', () => {
        if (dom.historyToggle?.checked && window._currentPlayerInfo?.streamId && !isLive) {
            const savedTime = watchHistory[window._currentPlayerInfo.streamId];
            if (savedTime > 10 && video.currentTime < 5) {
                video.currentTime = savedTime;
                showNotification('تم استئناف المشاهدة من حيث توقفت ⏱️');
            }
        }
    }, { once: true });

    if (engine === 'videojs') playWithVideoJS(video, url, isHLS, isMKV, isTS);
    else if (engine === 'direct') playDirectVideo(video, url);
    else if (engine === 'hevc_proxy') playHEVCFallback(video, url);
    else {
        // hlsjs (افتراضي)
        if (isHLS && Hls.isSupported()) playWithHlsJS(video, url, isLive);
        else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; safePlay(video); }
        else if (isVOD) playDirectVideo(video, url);
        else playWithHlsJS(video, url, isLive);
    }
}

// ===== Hls.js – Buffer أقصى + كاشف 4K HEVC =====
function playWithHlsJS(video, url, isLive) {
    hlsInstance = new Hls(getHlsConfig(isLive));
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(video);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
        const lvls = hlsInstance.levels;
        const top = lvls[lvls.length - 1];
        console.log(`HLS جاهز | ${lvls.length} مستويات | أعلى: ${top?.height || '?'}p`);

        // قفل على أعلى جودة
        hlsInstance.currentLevel = lvls.length - 1;
        hlsInstance.loadLevel = lvls.length - 1;
        hlsInstance.nextAutoLevel = lvls.length - 1;

        updateQualityInfo(top);
        safePlay(video);
    });

    hlsInstance.on(Hls.Events.FRAG_LOADED, () => {
        const bw = hlsInstance.bandwidthEstimate;
        if (bw > 0) updateBandwidthDisplay(bw);
    });

    // ===== Auto-Reconnect المخفي السريع =====
    let errCnt = 0, mediaErrCnt = 0;
    const errorHandler = (_, d) => {
        if (!d.fatal) {
            if (d.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
                d.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
                hlsInstance.startLoad();
            }
            return;
        }
        
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (d.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || d.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
                // خطأ في جزء من الفيديو (شائع جداً في البث المباشر)، نحاول جلبه مجدداً بدون تدمير المشغل
                console.warn("Fragment error, retrying...");
                hlsInstance.startLoad();
            } else {
                console.warn("السيرفر قطع الاتصال بشكل كامل! جاري إعادة الاتصال السريع المخفي...");
                const currentTime = video.currentTime;
                
                // إعادة بناء المشغل في الخلفية في أجزاء من الثانية
                setTimeout(() => {
                    if(!dom.playerScreen.classList.contains('active')) return;
                    if(hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
                    
                    hlsInstance = new Hls(getHlsConfig(isLive));
                    hlsInstance.loadSource(url);
                    hlsInstance.attachMedia(video);
                    
                    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (currentTime > 0 && !isLive) video.currentTime = currentTime;
                        safePlay(video);
                    });
                    hlsInstance.on(Hls.Events.ERROR, errorHandler);
                    
                    hlsInstance.on(Hls.Events.FRAG_LOADED, () => {
                        const bw = hlsInstance.bandwidthEstimate;
                        if (bw > 0) updateBandwidthDisplay(bw);
                    });
                }, 300);
            }
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaErrCnt++;
            if (mediaErrCnt <= 3) { hlsInstance.recoverMediaError(); }
            else { setTimeout(() => checkAndHandleHEVC(video, url), 1500); }
        } else {
            setTimeout(() => dom.playerScreen.classList.contains('active') && triggerPlayer(), 2000);
        }
    };
    hlsInstance.on(Hls.Events.ERROR, errorHandler);

    // كاشف شاشة سوداء بعد 4 ثوان
    setTimeout(() => checkAndHandleHEVC(video, url), 4000);
}

// ===== كاشف H.265 / شاشة سوداء =====
function checkAndHandleHEVC(video, url) {
    // الصوت يعمل لكن لا صورة = H.265 codec غير مدعوم
    const hasAudio = !video.paused && video.currentTime > 0.5;
    const noVideo = video.videoWidth === 0;
    const blackFlag = hasAudio && noVideo;

    if (blackFlag) {
        console.warn('H.265/HEVC مكشوف – شاشة سوداء مع صوت');
        showHEVCWarning();
        // جرب بدون HLS (mp4/H.264 مباشر)
        const mp4url = url.replace(/\.m3u8(\?.*)?$/, '.mp4');
        rebuildAndPlay(mp4url, url);
    }
}

// ===== إعادة بناء العنصر ومحاولة H.264 =====
function rebuildAndPlay(primaryUrl, fallbackUrl) {
    if (hlsInstance) { try { hlsInstance.stopLoad(); hlsInstance.detachMedia(); hlsInstance.destroy(); } catch (e) { } hlsInstance = null; }

    const wrapDiv = document.getElementById('video-wrapper');
    wrapDiv.innerHTML = '';
    const v = document.createElement('video');
    v.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000';
    v.controls = true; v.preload = 'auto';
    wrapDiv.appendChild(v);
    attachBufferingEvents(v);

    v.src = primaryUrl;
    v.addEventListener('loadedmetadata', () => {
        if (v.videoWidth > 0) { console.log('H.264 fallback نجح!'); safePlay(v); }
        else fallToProxy(v, fallbackUrl);
    }, { once: true });
    v.addEventListener('error', () => fallToProxy(v, fallbackUrl), { once: true });
    safePlay(v);
}

function fallToProxy(v, url) {
    console.warn('فشل التشغيل المباشر. تأكد من تفعيل إضافة CORS.');
    showNotification('خطأ بالتشغيل: تأكد من تفعيل إضافة Allow CORS في المتصفح');
}

// ===== تحذير HEVC واضح للمستخدم =====
function showHEVCWarning() {
    document.getElementById('hevc-warning')?.remove();
    const d = document.createElement('div');
    d.id = 'hevc-warning';
    d.style.cssText = `
        position:absolute;bottom:70px;left:50%;transform:translateX(-50%);
        background:rgba(220,38,38,.93);color:#fff;padding:14px 24px;
        border-radius:10px;font-size:13px;z-index:200;text-align:center;
        max-width:500px;line-height:1.7;box-shadow:0 4px 20px rgba(0,0,0,.6);
        animation:fadeIn .3s ease;`;
    d.innerHTML = `
        <strong>⚠️ البث 4K يستخدم H.265 / HEVC</strong><br>
        المتصفح لا يدعمه. يتم محاولة H.264 تلقائياً…<br>
        <small style="opacity:.85">للحل الدائم: استخدم <b>Microsoft Edge</b> أو <b>Safari على Mac</b>
        — فهما يدعمان H.265 بشكل كامل</small><br>
        <small style="opacity:.7">أو اضغط على <b>"4K HEVC Fallback"</b> من قائمة المحرك</small>`;
    document.getElementById('player-container')?.appendChild(d);
    setTimeout(() => d.remove(), 10000);
}

// ===== HEVC Fallback يدوي =====
function playHEVCFallback(video, url) {
    const mp4 = url.replace(/\.m3u8(\?.*)?$/, '.mp4');
    video.src = mp4; video.preload = 'auto';
    video.addEventListener('error', () => {
        console.warn('فشل تشغيل HEVC Fallback');
        showNotification('خطأ في تشغيل الفيديو.');
    }, { once: true });
    safePlay(video);
}

// ===== Video.js =====
function playWithVideoJS(video, url, isHLS, isMKV, isTS) {
    const mime = isHLS ? 'application/x-mpegURL' : isMKV ? 'video/x-matroska' : isTS ? 'video/mp2t' : 'video/mp4';
    vjsPlayer = videojs(video, {
        controls: true, autoplay: false, preload: 'auto',
        html5: {
            vhs: {
                overrideNative: true,
                limitRenditionByPlayerDimensions: false,
                useDevicePixelRatio: true,
                bandwidth: 60000000,
                enableLowInitialPlaylist: false,
                smoothQualityChange: true,
                maxPlaylistRetries: 10,
            },
            nativeAudioTracks: false, nativeVideoTracks: false,
        },
        liveui: url.includes('/live/'),
    });
    vjsPlayer.src({ src: url, type: mime });
    vjsPlayer.ready(() => safePlay(vjsPlayer));
    vjsPlayer.on('ended', () => {
        if (window._currentPlayerInfo?.type === 'series' && currentPlaylistIndex >= 0 && currentPlaylistIndex < currentPlaylist.length - 1) {
            playNextEpisode();
        }
    });
    vjsPlayer.on('error', () => setTimeout(() => dom.playerScreen.classList.contains('active') && triggerPlayer(), 3000));
}

// ===== مشغل مباشر VOD =====
function playDirectVideo(video, url) {
    video.src = url; video.preload = 'auto';
    video.addEventListener('loadedmetadata', () => console.log(`VOD ${video.videoWidth}×${video.videoHeight}`), { once: true });
    video.addEventListener('error', () => {
        console.warn('فشل تشغيل VOD');
        showNotification('تعذر تشغيل الفيديو. هل إضافة Allow CORS مفعلة؟');
    }, { once: true });
    safePlay(video);
}

// ===== مؤشرات =====
function updateBandwidthDisplay(bw) {
    const mbps = (bw / 1024 / 1024).toFixed(1);
    let el = document.getElementById('bw-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bw-indicator';
        el.style.cssText = 'position:absolute;top:10px;left:10px;z-index:100;background:rgba(0,0,0,.75);color:#4ade80;padding:4px 12px;border-radius:5px;font-size:12px;font-family:monospace;pointer-events:none;letter-spacing:.5px';
        document.getElementById('player-container')?.appendChild(el);
    }
    el.textContent = `⚡ ${mbps} Mbps`;
}

function updateQualityInfo(level) {
    const el = document.getElementById('quality-info');
    if (!el || !level) return;
    const h = level.height;
    const lbl = h >= 2160 ? '4K UHD' : h >= 1080 ? 'FHD 1080p' : h >= 720 ? 'HD 720p' : h ? `${h}p` : '';
    el.textContent = lbl ? `🎯 ${lbl}` : '';
    el.style.color = h >= 2160 ? '#f59e0b' : h >= 1080 ? '#60a5fa' : '#94a3b8';
    el.style.fontWeight = 'bold';
}

// ===== Buffering Overlay =====
function attachBufferingEvents(v) {
    v.addEventListener('waiting', () => showBufferingOverlay(true));
    v.addEventListener('playing', () => showBufferingOverlay(false));
    v.addEventListener('canplay', () => showBufferingOverlay(false), { once: true });
}

function showBufferingOverlay(show) {
    let el = document.getElementById('buffering-overlay');
    if (show && !el) {
        el = document.createElement('div');
        el.id = 'buffering-overlay';
        el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:50;pointer-events:none';
        el.innerHTML = `<div style="text-align:center"><div style="width:52px;height:52px;border:3px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 10px"></div><div style="color:#fff;font-size:14px;font-weight:500">جاري التحميل…</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
        document.getElementById('player-container')?.appendChild(el);
    } else if (!show && el) { el.remove(); }
}

// ===== إشعار =====
function showNotification(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#1e293b;color:#f8fafc;padding:12px 20px;border-radius:8px;border-left:3px solid #3b82f6;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.4);animation:fadeIn .3s ease';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ===== safePlay =====
function safePlay(el) {
    const p = el.play?.();
    if (p) p.catch(e => e.name !== 'AbortError' && console.warn('Play blocked:', e.name));
}

// ===== إغلاق المشغل =====
document.getElementById('close-player-btn').addEventListener('click', () => {
    resetPlayerEnvironment();
    showScreen(dom.dashScreen);
    dom.mainDash.style.display = 'none';
    dom.contentView.style.display = 'flex';
    document.fullscreenElement && document.exitFullscreen();
});

// ===== تنظيف كامل =====
function resetPlayerEnvironment() {
    const wrap = document.getElementById('player-container');
    if (wrap) wrap.ondblclick = null;
    if (vjsPlayer) { try { vjsPlayer.pause(); vjsPlayer.dispose(); } catch (e) { } vjsPlayer = null; }
    if (hlsInstance) { try { hlsInstance.stopLoad(); hlsInstance.detachMedia(); hlsInstance.destroy(); } catch (e) { } hlsInstance = null; }
    if (wrap) {
        wrap.innerHTML = `<div id="video-wrapper"><video id="main-video" class="video-js vjs-default-skin" controls preload="auto" style="width:100%;height:100%;object-fit:contain;background:#000;"></video></div>`;
    }
    return document.getElementById('main-video');
}

// ===== تنقل الشاشات =====
function showScreen(el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    el?.classList.add('active');
}

// ===== إخفاء شريط الإشعارات في وضع ملء الشاشة (للأندرويد) =====
document.addEventListener('fullscreenchange', () => {
    if (window.Capacitor && window.Capacitor.Plugins.StatusBar) {
        if (document.fullscreenElement) {
            window.Capacitor.Plugins.StatusBar.hide().catch(e => console.warn(e));
        } else {
            window.Capacitor.Plugins.StatusBar.show().catch(e => console.warn(e));
        }
    }
});

// ===== دعم الريموت كنترول (TV Remote) =====
document.addEventListener('keydown', (e) => {
    // دعم زر OK / Enter للتحديد
    if (e.key === 'Enter' || e.keyCode === 13) {
        const active = document.activeElement;
        // إذا كان العنصر المحدد قابل للضغط وليس مربع نص
        if (active && active.tagName !== 'INPUT' && typeof active.click === 'function') {
            active.click();
            e.preventDefault();
        }
    }
    // دعم زر OK للتشغيل والإيقاف أثناء عرض الفيديو
    if ((e.key === 'Enter' || e.keyCode === 13) && dom.playerScreen.classList.contains('active')) {
        const video = document.getElementById('main-video');
        if (video) {
            if (video.paused) video.play();
            else video.pause();
        }
    }
});