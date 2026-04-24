import { useState } from 'react';
import { XtreamAPI } from '../api';

export default function LoginScreen({ onLogin }) {
  const [url, setUrl]   = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const cleanUrl = url.trim().replace(/\/$/, '');
      const api  = new XtreamAPI({ url: cleanUrl, username: user, password: pass });
      const data = await api.authenticate(cleanUrl, user.trim(), pass.trim());

      if (data.user_info?.auth === 1) {
        const session = { url: cleanUrl, username: user.trim(), password: pass.trim() };
        localStorage.setItem('iptv_session', JSON.stringify(session));
        onLogin(session);
      } else {
        setError('بيانات الدخول غير صحيحة');
      }
    } catch {
      setError('خطأ بالاتصال. تأكد من الرابط أو الشبكة.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>PRO IPTV CORE</h1>
          <p>Senior Edition</p>
        </div>

        <div className="cors-notice">
          🔧 للأداء الأمثل: فعّل إضافة{' '}
          <a
            href="https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf"
            target="_blank" rel="noreferrer"
          >
            Allow CORS
          </a>{' '}
          في متصفحك
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>رابط السيرفر (مع البورت)</label>
            <input
              type="url"
              placeholder="http://example.com:8080"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>اسم المستخدم</label>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>كلمة المرور</label>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-btn btn-primary" disabled={loading}>
            {loading ? 'جاري التحقق...' : 'اتصال بالسيرفر'}
          </button>
          {error && <p className="error-msg">{error}</p>}
        </form>
      </div>
    </div>
  );
}
