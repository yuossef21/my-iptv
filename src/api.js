// src/api.js — كل طلبات الشبكة تمر عبر /api/proxy لحل Mixed Content

export function proxyImg(url) {
  if (!url) return null;
  if (url.startsWith('http://')) return `/api/proxy?url=${encodeURIComponent(url)}`;
  return url;
}

export function proxyStream(url) {
  if (!url) return url;
  if (url.startsWith('http://')) return `/api/proxy?url=${encodeURIComponent(url)}`;
  return url;
}

export class XtreamAPI {
  constructor(session) {
    this.session = session;
  }

  buildUrl(action, extraParams = '') {
    const target = `${this.session.url}/player_api.php?username=${this.session.username}&password=${this.session.password}&action=${action}${extraParams}`;
    return `/api/proxy?url=${encodeURIComponent(target)}`;
  }

  getStreamUrl(type, streamId, extension = 'm3u8') {
    const { url, username, password } = this.session;
    let direct;
    if (type === 'live')   direct = `${url}/live/${username}/${password}/${streamId}.${extension}`;
    else if (type === 'series') direct = `${url}/series/${username}/${password}/${streamId}.${extension}`;
    else direct = `${url}/movie/${username}/${password}/${streamId}.${extension}`;
    return `/api/proxy?url=${encodeURIComponent(direct)}`;
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
    return this.fetchAPI(`/api/proxy?url=${encodeURIComponent(target)}`);
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