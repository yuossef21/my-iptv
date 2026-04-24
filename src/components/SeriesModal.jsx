import { useState, useEffect } from 'react';

export default function SeriesModal({ api, seriesId, seriesTitle, onPlayEpisode, onClose }) {
  const [seasons, setSeasons]       = useState({});
  const [activeSeason, setActiveSeason] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    api.getSeriesInfo(seriesId)
      .then(data => {
        if (!data?.episodes) throw new Error();
        setSeasons(data.episodes);
        setActiveSeason(Object.keys(data.episodes)[0]);
      })
      .catch(() => setError('فشل جلب تفاصيل المسلسل'))
      .finally(() => setLoading(false));
  }, [seriesId]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>{seriesTitle}</h3>
          <button className="btn-danger" onClick={onClose}>✖ إغلاق</button>
        </div>

        {loading && <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>جاري جلب البيانات...</div>}
        {error   && <div style={{ padding: 20, color: '#ef4444' }}>{error}</div>}

        {!loading && !error && (
          <>
            <div className="seasons-bar">
              {Object.keys(seasons).map(n => (
                <button
                  key={n}
                  className={`season-btn${activeSeason === n ? ' active' : ''}`}
                  onClick={() => setActiveSeason(n)}
                >
                  موسم {n}
                </button>
              ))}
            </div>

            <div className="episodes-grid">
              {(seasons[activeSeason] || []).map(ep => (
                <div
                  key={ep.id}
                  className="ep-card"
                  onClick={() => onPlayEpisode(ep)}
                >
                  <h4>{ep.title || `حلقة ${ep.episode_num}`}</h4>
                  <p>{ep.info?.duration || ''}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
