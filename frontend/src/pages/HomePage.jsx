import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import '../static/css/HomePage.css';
import Navbar from '../components/Navbar';
import StatBadge from '../components/StatBadge';
import Pagination from '../components/Pagination';
import QuoteCard from '../components/QuoteCard';
import VideoCard from '../components/VideoCard';
import gremIcon from '../static/assets/grem-icon.png';
import searchIcon from '../static/assets/search-icon.svg';
import sixsevenIcon from '../static/assets/sixseven.png';
import jumpIcon from '../static/assets/jump.png';
import pregnantIcon from '../static/assets/pregnant.png';

// ─── Constants ───────────────────────────────────────────────────────────────

const EASTER_EGG_TRIGGERS = [
    { keys: ['6 7', '67', 'six seven'], id: 'sixseven', img: sixsevenIcon },
    { keys: ['jump'], id: 'jump', img: jumpIcon },
    { keys: ['pregnant'], id: 'pregnant', img: pregnantIcon },
];

const STATS_CACHE_KEY = 'cached_stats_values';
const STATS_INIT_KEY = 'stats_initialized';
const BANNER_DISMISS_KEY = 'bannerDismissed';

const EMPTY_STATS = { grem: null, cece: null, yaoi: null, yippee: null, sixseven: null };

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchJSON(url, signal) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ─── SearchGuide ─────────────────────────────────────────────────────────────

function SearchGuide() {
    const [open, setOpen] = useState(false);

    return (
        <div className={`search-guide${open ? ' active' : ''}`} id="searchGuide">
            <div className="guide-header" onClick={() => setOpen(o => !o)}>
                <h3>🔍 Search Tips</h3>
                <svg className="arrow-down-icon" viewBox="0 0 32 32">
                    <path d="M29.994,10.183L15.363,24.812L0.733,10.184c-0.977-0.978-0.977-2.561,0-3.536c0.977-0.977,2.559-0.976,3.536,0l11.095,11.093L26.461,6.647c0.977-0.976,2.559-0.976,3.535,0C30.971,7.624,30.971,9.206,29.994,10.183z" />
                </svg>
            </div>
            <div className="guide-collapsible-content">
                <div className="guide-grid">
                    <div className="guide-item">
                        <strong>Simple Search</strong>
                        <code>Whimsy</code>
                        <span>Finds any videos & quotes containing the word.</span>
                    </div>
                    <div className="guide-item">
                        <strong>Find by VOD ID</strong>
                        <code>15aufXwBIKw</code>
                        <span>Finds the specific video & quotes using its VOD ID.</span>
                    </div>
                    <div className="guide-item">
                        <strong>Search Inside a Video</strong>
                        <code>lVi3Wb7WShU, yippee</code>
                        <span>Find specific words spoken within that exact video.</span>
                    </div>
                    <div className="guide-item">
                        <strong>Multiple Keywords</strong>
                        <code>League of Legends, Mori Calliope</code>
                        <span>Finds videos & quotes containing either words.</span>
                    </div>
                </div>
                <p className="guide-note">
                    💡 Use a <strong>comma (,)</strong> to separate phrases. Searches match whole words only.
                </p>
            </div>
        </div>
    );
}

// ─── EasterEggs ──────────────────────────────────────────────────────────────

function EasterEggs({ query }) {
    const [active, setActive] = useState(null);

    useEffect(() => {
        if (!query) return;
        const q = query.toLowerCase();
        const match = EASTER_EGG_TRIGGERS.find(t => t.keys.some(k => q.includes(k)));
        if (!match) return;

        setActive(match);
        const timer = setTimeout(() => setActive(null), 2000);
        return () => clearTimeout(timer);
    }, [query]);

    if (!active) return null;
    return (
        <div id={active.id} className={`easter-egg-hidden ${active.id}-active`}>
            <img src={active.img} alt={`${active.id} Easter Egg`} />
        </div>
    );
}

// ─── Custom hooks ─────────────────────────────────────────────────────────────

function useStats() {
    const [stats, setStats] = useState(() => {
        const cached = sessionStorage.getItem(STATS_CACHE_KEY);
        return cached ? JSON.parse(cached) : EMPTY_STATS;
    });

    useEffect(() => {
        const initialized = sessionStorage.getItem(STATS_INIT_KEY);
        const comingFromVideo = document.referrer.includes('/video/');
        if (initialized && !comingFromVideo) return;

        fetchJSON('/api/stats')
            .then(data => {
                setStats(data);
                sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data));
                sessionStorage.setItem(STATS_INIT_KEY, 'true');
            })
            .catch(console.error);
    }, []);

    return stats;
}

function useScrollDirection() {
    const [scrollDir, setScrollDir] = useState('up');
    const [isHovered, setIsHovered] = useState(false);
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentY = window.scrollY;
            if (currentY > lastScrollY.current && currentY > 50) {
                setScrollDir('down');
                setIsHovered(false);
            } else {
                setScrollDir('up');
            }
            lastScrollY.current = currentY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return { scrollDir, isHovered, setIsHovered };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function scrollToControls() {
    requestAnimationFrame(() => {
        setTimeout(() => {
            const controlsRow = document.querySelector('.controls-row');
            const topBar = document.querySelector('.top-bar');
            if (controlsRow) {
                const navHeight = topBar ? topBar.offsetHeight : 0;
                const scrollTarget = controlsRow.getBoundingClientRect().top + window.scrollY - navHeight - 20;
                window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }
        }, 50);
        document.body.classList.remove('loading-locked');
    });
}

// ─── HomePage ────────────────────────────────────────────────────────────────

export default function HomePage({ randomMode = false }) {
    useEffect(() => {
        document.title = "Gigi Quotes👧 - Find Gigi Murin Quotes!";
    }, []);

    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const query = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'newest';
    const pageParam = parseInt(searchParams.get('page') || '1', 10);

    // ── State ──────────────────────────────────────────────────────────────
    const [videos, setVideos] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [totalQuotes, setTotalQuotes] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [activeTab, setActiveTab] = useState('Videos');
    const [shareTarget, setShareTarget] = useState(null);
    const [searchInput, setSearchInput] = useState(query);
    const [shakeSearch, setShakeSearch] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [bannerVisible, setBannerVisible] = useState(
        () => sessionStorage.getItem(BANNER_DISMISS_KEY) !== 'true'
    );

    // ── Refs ───────────────────────────────────────────────────────────────
    // Infinite scroll
    const infinitePageRef = useRef(1);
    const allLoadedRef = useRef(false);
    const isLoadingRef = useRef(false);
    const videoGridRef = useRef(null);
    const sentinelRef = useRef(null);
    // Video result cache — avoids re-fetching videos on quote pagination changes
    const cachedVideosRef = useRef({ key: null, data: [] });

    // ── Derived flags ──────────────────────────────────────────────────────
    const isRandom = randomMode || location.pathname === '/random-quotes';
    const showQuotesTab = query || isRandom;

    // ── Custom hooks ───────────────────────────────────────────────────────
    const stats = useStats();
    const { scrollDir, isHovered, setIsHovered } = useScrollDirection();

    // ── Sync search input with URL ─────────────────────────────────────────
    useEffect(() => { setSearchInput(query); }, [query]);

    // ── Main data fetch ────────────────────────────────────────────────────
    useEffect(() => {
        infinitePageRef.current = 1;
        allLoadedRef.current = false;

        const controller = new AbortController();
        const { signal } = controller;

        // Random quotes mode
        if (isRandom) {
            setVideos([]);
            setIsLoading(true);
            setFetchError(false);

            fetchJSON('/api/random-quotes', signal)
                .then(data => {
                    scrollToControls();
                    setQuotes(data.quotes);
                    setTotalQuotes(data.quotes.length);
                    setActiveTab('Quotes');
                })
                .catch(err => { if (err.name !== 'AbortError') { console.error(err); setFetchError(true); } })
                .finally(() => setIsLoading(false));

            return () => controller.abort();
        }

        // Search mode
        if (query) {
            const cacheKey = `${query}::${sort}`;
            const isPageChange = cachedVideosRef.current.key === cacheKey;

            if (!isPageChange) setVideos([]);

            setIsLoading(true);
            setFetchError(false);

            const params = new URLSearchParams({ search: query, sort, page: pageParam });
            if (isPageChange) params.set('quotes_only', 'true');

            fetchJSON(`/api/search?${params}`, signal)
                .then(data => {
                    if (!isPageChange) {
                        const videoRes = data.video_results || [];
                        cachedVideosRef.current = { key: cacheKey, data: videoRes };
                        setVideos(videoRes);
                        if (videoRes.length === 0 && (data.total_quotes || 0) > 0) {
                            setActiveTab('Quotes');
                        } else {
                            setActiveTab('Videos');
                        }
                    }
                    setQuotes(data.quote_results || []);
                    setTotalQuotes(data.total_quotes || 0);
                    setTotalPages(parseInt(data.total_pages, 10) || 1);
                    scrollToControls();
                })
                .catch(err => { if (err.name !== 'AbortError') { console.error(err); setFetchError(true); } })
                .finally(() => setIsLoading(false));

            return () => controller.abort();
        }

        // Initial page load / no search
        setVideos([]);
        setIsLoading(true);
        setFetchError(false);
        fetchJSON(`/api/videos?page=1&sort=${sort}`, signal)
            .then(data => setVideos(data.videos || []))
            .catch(err => { if (err.name !== 'AbortError') { console.error(err); setFetchError(true); } })
            .finally(() => setIsLoading(false));

        return () => controller.abort();
    }, [query, sort, pageParam, isRandom, retryKey]);

    // ── Infinite scroll (browse mode only) ────────────────────────────────
    const loadMoreVideos = useCallback(async () => {
        if (isLoading || isLoadingRef.current || allLoadedRef.current || query || videos.length === 0) {
            return;
        }

        isLoadingRef.current = true;
        setIsLoadingMore(true);
        infinitePageRef.current += 1;

        try {
            const data = await fetchJSON(`/api/videos?page=${infinitePageRef.current}&sort=${sort}`);
            if (!data.videos || data.videos.length === 0) {
                allLoadedRef.current = true;
            } else {
                setVideos(prev => [...prev, ...data.videos]);
            }
        } catch (e) {
            console.error(e);
            infinitePageRef.current -= 1;
        } finally {
            isLoadingRef.current = false;
            setIsLoadingMore(false);
        }
    }, [sort, query, videos.length, isLoading]);

    // ── IntersectionObserver — triggers loadMoreVideos when sentinel is visible ──
    useEffect(() => {
        if (query || isRandom) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) loadMoreVideos(); },
            { rootMargin: '300px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMoreVideos, query, isRandom]);

    // ── Handlers ───────────────────────────────────────────────────────────
    function handleSearchSubmit(e) {
        e.preventDefault();
        if (!searchInput.trim()) {
            setShakeSearch(true);
            setTimeout(() => setShakeSearch(false), 400);
            return;
        }
        navigate('/?' + new URLSearchParams({ search: searchInput.trim(), sort }).toString());
    }

    function handleSortClick(newSort) {
        const params = new URLSearchParams(searchParams);
        params.set('sort', newSort);
        params.delete('page');
        navigate('/?' + params.toString());
    }

    function handleBannerDismiss() {
        setBannerVisible(false);
        sessionStorage.setItem(BANNER_DISMISS_KEY, 'true');
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <>
            <div className="home-page">
                <Navbar shareTarget={shareTarget} onShareClose={() => setShareTarget(null)} />

                <EasterEggs query={query} />

                <main>
                    {/* Announcement Banner */}
                    {bannerVisible && (
                        <div className="announcement-banner" id="attentionBanner">
                            <div className="banner-content">
                                <span className="banner-icon">⚠️</span>
                                <p>
                                    <strong>Attention:</strong> This website is maintained by one person! Bugs or
                                    incorrect speech-to-text translations may occur. Kindly send DMs to my Twitter
                                    to report any issues. Thank you for your support!!!
                                </p>
                                <button className="banner-close" onClick={handleBannerDismiss}>
                                    &times;
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="stats-container">
                        <StatBadge label="Grems" value={stats.grem} theme="grem" icon={gremIcon} />
                        <StatBadge label="Cecilia Immergreen" value={stats.cece} theme="cece" />
                        <StatBadge label="Yaoi" value={stats.yaoi} />
                        <StatBadge label="Yippee" value={stats.yippee} />
                        <StatBadge label="6 7" value={stats.sixseven} />
                    </div>

                    {/* Search Guide */}
                    <SearchGuide />

                    {/* Controls */}
                    <div className="controls-row">
                        <form className="search-form" onSubmit={handleSearchSubmit}>
                            <input
                                type="text"
                                placeholder="Search titles or words..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                className={`search-input${shakeSearch ? ' shake-error' : ''}`}
                            />
                            <button type="submit" className="controls-btn" id="search-btn">
                                <img src={searchIcon} alt="Search" />
                            </button>
                            {query && (
                                <a href="/" className="controls-btn clear-btn">
                                    <div id="clear-icon">&times;</div> Clear
                                </a>
                            )}
                        </form>

                        {query && (videos.length > 0 || totalQuotes > 0) && (
                            <div className="tabs-header">
                                {[
                                    { id: 'Videos', count: videos.length, disabled: videos.length === 0 },
                                    { id: 'Quotes', count: totalQuotes, disabled: totalQuotes === 0 },
                                ].map(({ id, count, disabled }) => (
                                    <button
                                        key={id}
                                        className={`tab-link${activeTab === id ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                                        onClick={() => { if (!disabled) { setActiveTab(id); scrollToControls(); } }}
                                        disabled={disabled}
                                        title={disabled ? `No ${id.toLowerCase()} results` : ''}
                                    >
                                        {id} ({count})
                                    </button>
                                ))}
                            </div>
                        )}

                        {(activeTab === 'Videos' || !query) && !isRandom && videos.length > 0 && (
                            <div className="sort-container">
                                <button
                                    className={`controls-btn${sort === 'newest' ? ' active' : ''}`}
                                    onClick={() => handleSortClick('newest')}
                                >
                                    Newest
                                </button>
                                <button
                                    className={`controls-btn${sort === 'oldest' ? ' active' : ''}`}
                                    onClick={() => handleSortClick('oldest')}
                                >
                                    Oldest
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="content-area">

                        {/* Loading Spinner */}
                        {(isLoading || (isRandom && quotes.length === 0 && !fetchError)) && (
                            <div className="content-loading">
                                <div className="content-spinner" />
                                <p>Loading…</p>
                            </div>
                        )}

                        {/* Fetch Error */}
                        {!isLoading && fetchError && (
                            <div className="fetch-error">
                                <p>Something went wrong while fetching data</p>
                                <button
                                    className="retry-btn"
                                    onClick={() => setRetryKey(k => k + 1)}
                                >
                                    ↺ Retry
                                </button>
                            </div>
                        )}

                        {!isLoading && !fetchError && (<>
                            {/* Videos Tab */}
                            <div
                                id="Videos"
                                className={`tab-content${activeTab === 'Videos' || !query ? ' active' : ''}`}
                                style={{ display: activeTab === 'Videos' || !query ? 'block' : 'none' }}
                            >
                                {videos.length > 0 && (
                                    <div id="video-grid" className="grid" ref={videoGridRef}>
                                        {videos.map(video => (
                                            <VideoCard key={video.vod_id} video={video} />
                                        ))}
                                    </div>
                                )}

                                {!query && !isRandom && !allLoadedRef.current && (
                                    <div ref={sentinelRef} style={{ height: '50px' }} />
                                )}
                            </div>

                            {/* Quotes Tab */}
                            {showQuotesTab && (
                                <div
                                    className={`tab-content${activeTab === 'Quotes' || isRandom ? ' active' : ''}`}
                                    style={{ display: activeTab === 'Quotes' || isRandom ? 'block' : 'none' }}
                                >
                                    {quotes.length > 0 && (
                                        <>
                                            <Pagination current={pageParam} total={totalPages} searchParams={searchParams} />
                                            <div className="quote-results-list" id="quotes-container">
                                                {quotes.map((quote, i) => (
                                                    <QuoteCard
                                                        key={`${quote.vod_id}-${i}`}
                                                        quote={quote}
                                                        onShare={(videoId, seconds) => setShareTarget({ videoId, seconds })}
                                                    />
                                                ))}
                                            </div>
                                            <Pagination current={pageParam} total={totalPages} searchParams={searchParams} />
                                        </>
                                    )}
                                </div>
                            )}

                            {/* No results */}
                            {query && !isLoading && videos.length === 0 && totalQuotes === 0 && (
                                <div className="no-results-warning">
                                    <h2>No exact matches found for "{query}"</h2>
                                    <p>Try searching following the searching tips!</p>
                                    <a href="/" className="clear-search-link">View all videos</a>
                                </div>
                            )}
                        </>)}

                    </div>
                </main>

                {!query && (
                    <a
                        href="/random-quotes"
                        id="random-quote-btn"
                        className={`${scrollDir === 'down' ? 'scrolling-down' : ''} ${isHovered ? 'hover-locked' : ''}`}
                        onMouseEnter={() => setIsHovered(true)}
                    >
                        {isRandom ? 'Random Quotes Again!' : 'Random Quotes!'}
                    </a>
                )}

                {isLoadingMore && (
                    <div className="bottom-flash-overlay visible" />
                )}
            </div>
        </>
    );
}