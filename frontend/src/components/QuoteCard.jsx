import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom'
import '../static/css/QuoteCard.css'
import { timeToSeconds, formatDate, formatTime } from '../utils.js';

export default function QuoteCard({ quote, onShare }) {
    const [playing, setPlaying] = useState(false);
    const iframeRef = useRef(null);
    const seconds = timeToSeconds(quote.time);
    const uniqueId = `quote-v-${quote.vod_id}-${seconds}`;

    // Listen for other cards starting — pause this iframe
    useEffect(() => {
        function handleOtherPlay(e) {
            if (e.detail.id !== uniqueId && iframeRef.current) {
                iframeRef.current.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
                    '*'
                );
            }
        }
        window.addEventListener('quote-card-play', handleOtherPlay);
        return () => window.removeEventListener('quote-card-play', handleOtherPlay);
    }, [uniqueId]);

    function handlePlay(e) {
        e.preventDefault();
        e.stopPropagation();
        // Notify all other cards to pause
        window.dispatchEvent(new CustomEvent('quote-card-play', { detail: { id: uniqueId } }));
        setPlaying(true);
    }

    return (
        <Link to={`/video/${quote.vod_id}`} className="quote-card">
            <div className="video" id={uniqueId} onClick={handlePlay}>
                {playing ? (
                    <iframe
                        ref={iframeRef}
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${quote.vod_id}?start=${Math.floor(seconds)}&autoplay=1&enablejsapi=1`}
                        frameBorder="0"
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                    />
                ) : (
                    <>
                        <img
                            src={`https://img.youtube.com/vi/${quote.vod_id}/hqdefault.jpg`}
                            className="lazy-thumb"
                            alt="Thumbnail"
                        />
                        <div className="video-play-button">
                            <svg className="play-icon" id="video" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </>
                )}
            </div>
            <div className="info">
                <span id="title">{quote.title}</span>
                <div className="quote-text-container" onClick={handlePlay}>
                    <p className="matching-text" dangerouslySetInnerHTML={{ __html: `"${quote.content}"` }} />
                    <span className="jump-hint">
                        <svg className="play-icon" id="quote" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Click to play at {formatTime(quote.time)}
                    </span>
                </div>
                <div className="meta">
                    <p>{formatDate(quote.upload_date)}</p>
                    <button
                        className="share-btn"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); onShare(quote.vod_id, seconds); }}
                    >
                        Share
                    </button>
                </div>
            </div>
        </Link>
    );
}