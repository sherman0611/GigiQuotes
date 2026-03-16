import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import '../static/css/VideoPage.css';
import { formatDate, formatTime } from '../utils.js';
import Navbar from '../components/Navbar';
import TranscriptSearch from '../components/VideoSearchModal';

const INITIAL_LOAD_COUNT = 10;
const QUOTES_PER_LOAD = 10;

// ── Sub-component for sidebar loading / error / empty states ─────────────────

function SidebarStatus({ isLoading, error, isEmpty, onRetry }) {
    if (isLoading) {
        return (
            <div className="sidebar-status-container">
                <div className="spinner" />
                <p>Fetching transcripts...</p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="sidebar-status-container">
                <p className="error-text">{error}</p>
                <button className="retry-btn" onClick={onRetry}>↺ Retry</button>
            </div>
        );
    }
    if (isEmpty) {
        return (
            <div className="sidebar-status-container">
                <p>No transcriptions available yet.</p>
            </div>
        );
    }
    return null;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function VideoPage() {
    const { vod_id } = useParams();

    const [video, setVideo] = useState(null);
    const [allQuotes, setAllQuotes] = useState([]);
    const [renderedQuotes, setRenderedQuotes] = useState([]);
    const [activeQuoteIndex, setActiveQuoteIndex] = useState(-1);
    const [shareTarget, setShareTarget] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Mutable refs — grouped by concern
    const allQuotesRef = useRef([]);
    const renderedCountRef = useRef(0);
    const activeQuoteIndexRef = useRef(-1);

    const playerRef = useRef(null);
    const rafRef = useRef(null);
    const lastTickRef = useRef(0);

    const scrollContainerRef = useRef(null);
    const isUserScrollingRef = useRef(false);
    const scrollDebounceRef = useRef(null);

    useEffect(() => {
        if (video?.title) {
            document.title = `Gigi Quotes👧 - ${video.title}`;
        }
    }, [video]);

    // ── Data fetching ────────────────────────────────────────────────────────

    const fetchVideoData = useCallback(() => {
        setIsLoading(true);
        setError(null);
        fetch(`/api/video/${vod_id}`)
            .then(r => {
                if (!r.ok) throw new Error('Failed to load transcripts.');
                return r.json();
            })
            .then(({ video, quotes = [] }) => {
                setVideo(video);
                setAllQuotes(quotes);
                allQuotesRef.current = quotes;
                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError(err.message);
                setIsLoading(false);
            });
    }, [vod_id]);

    useEffect(() => { fetchVideoData(); }, [fetchVideoData]);

    useEffect(() => {
        if (allQuotes.length === 0) return;
        const initial = allQuotes.slice(0, INITIAL_LOAD_COUNT);
        setRenderedQuotes(initial);
        renderedCountRef.current = initial.length;
    }, [allQuotes]);

    // ── Pagination helpers ───────────────────────────────────────────────────

    const loadNextChunk = useCallback(() => {
        const quotes = allQuotesRef.current;
        const from = renderedCountRef.current;
        if (from >= quotes.length) return;
        const batch = quotes.slice(from, from + QUOTES_PER_LOAD);
        renderedCountRef.current = from + batch.length;
        setRenderedQuotes(prev => [...prev, ...batch]);
    }, []);

    const loadQuotesUpTo = useCallback(async (targetTime) => {
        const quotes = allQuotesRef.current;
        while (renderedCountRef.current < quotes.length) {
            const lastRendered = quotes[renderedCountRef.current - 1];
            if (targetTime <= (lastRendered?.end_time ?? 0)) break;
            const from = renderedCountRef.current;
            const batch = quotes.slice(from, from + QUOTES_PER_LOAD);
            if (batch.length === 0) break;
            renderedCountRef.current = from + batch.length;
            setRenderedQuotes(prev => [...prev, ...batch]);
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }, []);

    // ── Scroll listener (infinite load + user-scroll detection) ─────────────

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const onScroll = () => {
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
                loadNextChunk();
            }
            isUserScrollingRef.current = true;
            clearTimeout(scrollDebounceRef.current);
            scrollDebounceRef.current = setTimeout(() => {
                isUserScrollingRef.current = false;
            }, 2000);
        };
        container.addEventListener('scroll', onScroll);
        return () => container.removeEventListener('scroll', onScroll);
    }, [loadNextChunk]);

    // ── YouTube player setup ─────────────────────────────────────────────────

    useEffect(() => {
        if (!video?.vod_id) return;
        const initPlayer = () => {
            playerRef.current = new window.YT.Player('player-iframe', {
                events: { onStateChange: onPlayerStateChange },
            });
        };
        if (window.YT?.Player) {
            initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = initPlayer;
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            document.body.appendChild(script);
        }
        return () => cancelAnimationFrame(rafRef.current);
    }, [video?.vod_id]);

    // ── Playback sync ────────────────────────────────────────────────────────

    // Scrolls the transcript panel to keep the active quote centred, unless
    // the user is currently scrolling manually.
    const scrollToQuote = useCallback((el, force = false) => {
        const container = scrollContainerRef.current;
        if (!container || (!force && isUserScrollingRef.current)) return;
        const top = el.offsetTop - container.offsetHeight / 2 + el.offsetHeight / 2;
        container.scrollTo({ top, behavior: 'smooth' });
    }, []);

    // Finds the quote matching `currentTime`, updates the active index, and
    // optionally scrolls to it.
    const syncActiveQuote = useCallback((currentTime, forceScroll = false) => {
        for (const el of document.querySelectorAll('.quote-item')) {
            const start = parseFloat(el.dataset.start);
            const end = parseFloat(el.dataset.end);
            if (currentTime < start || currentTime > end) continue;

            const idx = parseInt(el.dataset.index, 10);
            const indexChanged = activeQuoteIndexRef.current !== idx;
            if (indexChanged) {
                activeQuoteIndexRef.current = idx;
                setActiveQuoteIndex(idx);
            }
            if (indexChanged || forceScroll) {
                scrollToQuote(el, forceScroll);
            }
            return;
        }
    }, [scrollToQuote]);

    // rAF loop — polls the player every ~200 ms while playing.
    const startHighlightLoop = useCallback((timestamp) => {
        const player = playerRef.current;
        if (!player?.getCurrentTime) {
            rafRef.current = requestAnimationFrame(startHighlightLoop);
            return;
        }
        if (timestamp - lastTickRef.current > 200) {
            lastTickRef.current = timestamp;
            const currentTime = player.getCurrentTime();
            const lastRendered = allQuotesRef.current[renderedCountRef.current - 1];
            const needsMoreQuotes =
                currentTime > (lastRendered?.end_time ?? 0) &&
                renderedCountRef.current < allQuotesRef.current.length;

            if (needsMoreQuotes) {
                loadQuotesUpTo(currentTime);
            } else {
                syncActiveQuote(currentTime);
            }
        }
        rafRef.current = requestAnimationFrame(startHighlightLoop);
    }, [loadQuotesUpTo, syncActiveQuote]);

    function onPlayerStateChange(event) {
        if (event.data === window.YT.PlayerState.PLAYING) {
            startHighlightLoop();
        } else {
            cancelAnimationFrame(rafRef.current);
        }
    }

    // ── Public actions ───────────────────────────────────────────────────────

    const seekToTime = useCallback(async (seconds) => {
        const player = playerRef.current;
        if (!player?.seekTo) return;
        player.seekTo(seconds, true);
        player.playVideo();
        await loadQuotesUpTo(seconds);
        syncActiveQuote(seconds, true);
    }, [loadQuotesUpTo, syncActiveQuote]);

    const jumpToCurrent = useCallback(async () => {
        const player = playerRef.current;
        if (!player?.getCurrentTime) return;
        const currentTime = player.getCurrentTime();
        await loadQuotesUpTo(currentTime);
        syncActiveQuote(currentTime, true);
    }, [loadQuotesUpTo, syncActiveQuote]);

    const openShareModal = useCallback((e, vodId, startTime) => {
        e.stopPropagation();
        setShareTarget({ videoId: vodId, seconds: Math.floor(startTime) });
    }, []);

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="video-page">
            <Navbar shareTarget={shareTarget} onShareClose={() => setShareTarget(null)} />

            <main>
                <div className="video-main">
                    <div className="video-wrapper">
                        <iframe
                            id="player-iframe"
                            src={`https://www.youtube.com/embed/${video?.vod_id}?enablejsapi=1`}
                            frameBorder="0"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                            title="video-player"
                        />
                    </div>
                    <div className="video-info">
                        <h1>{video?.title || 'Loading video...'}</h1>
                        <h2>{formatDate(video?.upload_date)}</h2>
                    </div>
                </div>

                <div className="quotes-sidebar">
                    <div className="sidebar-header">
                        <span>Transcripts</span>
                        <button
                            id="jump-to-current"
                            className="jump-btn"
                            title="Jump to current transcript"
                            onClick={jumpToCurrent}
                            disabled={isLoading || !!error}
                        >
                            Jump to Current
                        </button>
                    </div>

                    <div className="scroll-container" ref={scrollContainerRef}>
                        <SidebarStatus
                            isLoading={isLoading}
                            error={error}
                            isEmpty={!isLoading && !error && allQuotes.length === 0}
                            onRetry={fetchVideoData}
                        />

                        {!isLoading && !error && (
                            <div id="transcript-content">
                                {renderedQuotes.map((quote, index) => (
                                    <div
                                        key={`${quote.vod_id}-${index}`}
                                        className={`quote-item${activeQuoteIndex === index ? ' active' : ''}`}
                                        id={`quote-${index}`}
                                        data-start={quote.start_time}
                                        data-end={quote.end_time}
                                        data-index={index}
                                        onClick={() => seekToTime(quote.start_time)}
                                    >
                                        <div className="quote-header">
                                            <span className="timestamp">{formatTime(quote.start_time)}</span>
                                            <button
                                                className="share-btn"
                                                onClick={(e) => openShareModal(e, quote.vod_id, quote.start_time)}
                                            >
                                                Share
                                            </button>
                                        </div>
                                        <span className="quote-content">{quote.content}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <TranscriptSearch allQuotes={allQuotes} onSeek={seekToTime} />
        </div>
    );
}