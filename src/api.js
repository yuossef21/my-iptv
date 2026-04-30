// src/api.js

const PROXY_URL = 'https://iptv-proxy.yuossefmohammed575.workers.dev';

function toProxyUrl(targetUrl) {
  if (!targetUrl) return targetUrl;
  let url = targetUrl;
  if (url.startsWith('http://')) {
    url = 'https://' + url.substring(7);
  }
  return `${PROXY_URL}?url=${encodeURIComponent(url)}`;
}

export function proxyImg(url) {
  if (!url) return null;
  return toProxyUrl(url);
}

export class XtreamAPI {
  constructor(session) {
    this.session = session;
  }

  buildUrl(action, extraParams = '') {
    const target = `${this.session.url}/player_api.php?username=${this.session.username}&password=${this.session.password}&action=${action}${extraParams}`;
    return toProxyUrl(target);
  }

  getStreamUrl(type, streamId, extension = 'm3u8') {
    const { url, username, password } = this.session;
    let direct;
    if (type === 'live') direct = `${url}/live/${username}/${password}/${streamId}.${extension}`;
    else if (type === 'series') direct = `${url}/series/${username}/${password}/${streamId}.${extension}`;
    else direct = `${url}/movie/${username}/${password}/${streamId}.${extension}`;
    
    return toProxyUrl(direct);
  }

  async fetchAPI(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  async authenticate(url, user, pass) {
    const target = `${url}/player_api.php?username=${user}&password=${pass}`;
    return this.fetchAPI(toProxyUrl(target));
  }

  async getCategories(type) {
    const action = type === 'live' ? 'get_live_categories'
      : type === 'movies' ? 'get_vod_categories'
      : 'get_series_categories';
    return this.fetchAPI(this.buildUrl(action));
  }

  async getStreams(type, categoryId) {
    const action = type === 'live' ? 'get_live_streams'
      : type === 'movies' ? 'get_vod_streams'
      : 'get_series';
    return this.fetchAPI(this.buildUrl(action, `&category_id=${categoryId}`));
  }

  async getAllStreams(type) {
    const action = type === 'live' ? 'get_live_streams'
      : type === 'movies' ? 'get_vod_streams'
      : 'get_series';
    return this.fetchAPI(this.buildUrl(action));
  }

  async getSeriesInfo(seriesId) {
    return this.fetchAPI(this.buildUrl('get_series_info', `&series_id=${seriesId}`));
  }
}