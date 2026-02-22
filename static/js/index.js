let currentPage = 1;
let isLoading = false;
let allLoaded = false;

const videoGrid = document.getElementById('video-grid');
const sentinel = document.getElementById('scroll-sentinel');
const spinner = document.getElementById('loading-spinner');

// Automatically detect current search and sort from URL
const urlParams = new URLSearchParams(window.location.search);
const currentSearch = urlParams.get('search') || '';
const currentSort = urlParams.get('sort') || 'newest';

// Load videos
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && !allLoaded && !currentSearch) {
        loadMoreVideos();
    }
}, { threshold: 0.1 });

if (sentinel) observer.observe(sentinel);

function dismissBanner() {
    const banner = document.getElementById('attentionBanner');
    if (banner) {
        banner.style.display = 'none';
        sessionStorage.setItem('bannerDismissed', 'true');
    }
}

async function updateStats() {
    const cacheKey = 'cached_stats_values';
    const cachedData = sessionStorage.getItem(cacheKey);

    if (cachedData) {
        applyStatsToDOM(JSON.parse(cachedData));
    }

    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        // Update cache and DOM with fresh data
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
        applyStatsToDOM(data);
    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

function applyStatsToDOM(data, animate = false) {
    const mappings = {
        'grem-count': data.grem,
        'cece-count': data.cece,
        'yaoi-count': data.yaoi,
        'yippee-count': data.yippee,
        'sixseven-count': data.sixseven
    };

    for (const [id, value] of Object.entries(mappings)) {
        const el = document.getElementById(id);
        if (el) {
            if (animate) {
                const startVal = parseInt(el.innerText.replace(/,/g, '')) || 0;
                animateValue(el, startVal, value, 1000);
            } else {
                el.innerText = value.toLocaleString();
            }
        }
    }
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

window.addEventListener('DOMContentLoaded', () => {
    // --- BANNER LOGIC ---
    const isBannerDismissed = sessionStorage.getItem('bannerDismissed');
    const banner = document.getElementById('attentionBanner');
    if (!isBannerDismissed && banner) {
        banner.style.display = 'block';
    }

    // --- STATS LOGIC ---
    const statsInitialized = sessionStorage.getItem('stats_initialized');
    const comingFromVideo = document.referrer.includes('/video/');
    const cachedStats = JSON.parse(sessionStorage.getItem('cached_stats_values') || '{}');

    // If we have no cache, OR we just came back from a video page (fresh data needed)
    if (!statsInitialized || comingFromVideo) {
        updateStats();
        sessionStorage.setItem('stats_initialized', 'true');
    } else if (cachedStats.grem !== undefined) {
        // Use the cache immediately if it exists
        applyStatsToDOM(cachedStats);
    }

    // --- SCROLL LOGIC ---
    const urlParams = new URLSearchParams(window.location.search);
    const isSearch = urlParams.get('search') !== null && urlParams.get('search') !== '';
    const isRandom = window.location.pathname === '/random-quotes';

    if (isSearch || isRandom) {
        requestAnimationFrame(() => {
            const controlsRow = document.querySelector('.controls-row');
            const topBar = document.querySelector('.top-bar');

            if (controlsRow) {
                const navHeight = topBar ? topBar.offsetHeight : 0;
                const scrollTarget = controlsRow.getBoundingClientRect().top + window.scrollY - navHeight - 20;

                window.scrollTo(0, scrollTarget);
            }
            document.body.classList.remove('loading-locked');
        });
    } else {
        document.body.classList.remove('loading-locked');
    }

    // --- EASTER EGG LOGIC ---
    initializeEasterEggs(); // Create the elements first

    const currentSearch = (urlParams.get('search') || '').toLowerCase();
    const pageParam = urlParams.get('page');
    const isInitialSearch = !pageParam || pageParam === '1';

    if (isInitialSearch) {
        const triggers = [
            { keys: ["6 7", "67", "six seven"], target: 'sixseven' },
            { keys: ["jump"], target: 'jump' },
            { keys: ["pregnant"], target: 'pregnant' }
        ];

        triggers.forEach(trigger => {
            if (trigger.keys.some(key => currentSearch.includes(key))) {
                const el = document.getElementById(trigger.target);
                if (el) {
                    el.classList.add(`${trigger.target}-active`);
                    setTimeout(() => el.classList.remove(`${trigger.target}-active`), 2000);
                }
            }
        });
    }

    // --- RANDOM QUOTES PATH ---
    if (window.location.pathname === '/random-quotes') {
        renderQuoteCards(initialQuotesData, 'quotes-container');
    } else if (typeof initialQuotesData !== 'undefined' && initialQuotesData.length > 0) {
        renderQuoteCards(initialQuotesData, 'quotes-container');
        renderPagination(currentPageNum, totalPages);
    }
});

function switchTab(evt, tabId) {
    // Hide all contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Show current tab and mark button active
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";

    // 1. Update the hidden input in the search form (already there)
    const tabInput = document.getElementById('activeTabInput');
    if (tabInput) {
        tabInput.value = tabName;
    }

    // 2. NEW: Update the Sort links hrefs
    const sortLinks = document.querySelectorAll('.sort-link');
    sortLinks.forEach(link => {
        let url = new URL(link.href, window.location.origin);
        url.searchParams.set('active_tab', tabName);
        link.href = url.pathname + url.search;
    });
}

async function loadMoreVideos() {
    isLoading = true;
    spinner.style.display = 'block';
    currentPage++;

    try {
        const response = await fetch(`/api/videos?page=${currentPage}&sort=${currentSort}&search=${encodeURIComponent(currentSearch)}`);
        const data = await response.json();

        if (data.videos.length === 0) {
            allLoaded = true;
            if (currentSearch) {
                spinner.style.display = 'none';
            }
            return;
        }

        data.videos.forEach(video => {
            const card = document.createElement('a');
            card.href = `/video/${video.vod_id}`;
            card.className = 'card';
            card.innerHTML = `
                <img src="https://img.youtube.com/vi/${video.vod_id}/mqdefault.jpg" alt="Thumbnail">
                <div class="card-content">
                    <h3>${video.title}</h3>
                    <p class="video-date">${video.upload_date}</p>
                </div>
            `;
            videoGrid.appendChild(card);
        });
    } catch (error) {
        console.error("Scroll error:", error);
    } finally {
        isLoading = false;
        // Additional check to hide spinner if everything is loaded
        if (allLoaded && currentSearch) {
            spinner.style.display = 'none';
        }
    }
}

function loadVideo(event, containerId, vodId, startTime) {
    pauseAllVideos()
    event.preventDefault();
    event.stopPropagation();

    // LOAD NEW VIDEO: Replace the clicked container with the new iframe
    const currentContainer = document.getElementById(containerId);
    const startSeconds = Math.floor(startTime);
    const embedUrl = `https://www.youtube.com/embed/${vodId}?start=${startSeconds}&autoplay=1&enablejsapi=1`;

    currentContainer.innerHTML = `
        <iframe 
            width="100%" 
            height="100%" 
            src="${embedUrl}" 
            frameborder="0" 
            allow="autoplay; encrypted-media" 
            allowfullscreen>
        </iframe>
    `;
}

function pauseAllVideos() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
    });
}

document.querySelector('.search-form').addEventListener('submit', function (e) {
    const searchInput = this.querySelector('.search-input');
    if (!searchInput.value.trim()) {
        e.preventDefault(); // Prevent form submission
        searchInput.classList.add('shake-error');
        setTimeout(() => {
            searchInput.classList.remove('shake-error');
        }, 400);
    }
});

function timeToSeconds(timeStr) {
    if (typeof timeStr === 'number') return timeStr;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return 0;
}

function renderQuoteCards(quotes, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = quotes.map((quote, index) => {
        const uniqueId = `${containerId}-v-${index}-${quote.vod_id}`;

        const content = quote.content || "";
        const displayTime = quote.time || "0:00";
        const formattedUploadDate = formatDate(quote.upload_date);
        const seconds = timeToSeconds(quote.time);

        return `
            <a href="/video/${quote.vod_id}" class="quote-search-card">
                <div class="quote-card-video" id="${uniqueId}" 
                    onclick="loadVideo(event, '${uniqueId}', '${quote.vod_id}', ${seconds})">
                    <img src="https://img.youtube.com/vi/${quote.vod_id}/hqdefault.jpg" class="lazy-thumb" alt="Thumbnail">
                    <div class="video-play-button">
                        <svg class="play-icon" id="video" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
                <div class="quote-card-info">
                    <span id="title">${quote.title}</span>
                    <div class="quote-text-container" onclick="loadVideo(event, '${uniqueId}', '${quote.vod_id}', ${seconds})">
                        <p class="matching-text">"${content}"</p>
                        <span class="jump-hint">
                            <svg class="play-icon" id="quote" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            Click to play at ${displayTime}
                        </span>
                    </div>
                    <div class="quote-card-meta">
                        <span class="video-date">${formattedUploadDate}</span>
                        <button class="share-btn" onclick="handleShareClick(event, '${quote.vod_id}', ${seconds})">Share</button>
                    </div>
                </div>
            </a>`;
    }).join('');
}

function renderPagination(current, total) {
    const containers = document.querySelectorAll('.pagination');
    if (total <= 1) {
        containers.forEach(el => {
            el.style.display = 'none';
            el.innerHTML = '';
        });
        return;
    }

    let html = '';
    const getUrl = (p) => {
        const url = new URL(window.location.href);
        url.searchParams.set('page', p);
        url.searchParams.set('active_tab', 'Quotes');
        return url.pathname + url.search;
    };

    // Previous Arrow
    html += current > 1
        ? `<a href="${getUrl(current - 1)}" class="page-btn arrow">‹</a>`
        : `<span class="page-btn arrow disabled">‹</span>`;

    // Page Numbers
    if (current <= 4) {
        for (let p = 1; p <= Math.min(total, 5); p++) {
            html += `<a href="${getUrl(p)}" class="page-btn ${p === current ? 'active' : ''}">${p}</a>`;
        }
        if (total > 6) {
            html += `<span class="page-dots">...</span><a href="${getUrl(total)}" class="page-btn">${total}</a>`;
        }
    } else if (current > total - 4) {
        html += `<a href="${getUrl(1)}" class="page-btn">1</a><span class="page-dots">...</span>`;
        // Reduce from 6 to 4 for a tighter fit on small screens
        for (let p = total - 4; p <= total; p++) {
            if (p > 0) html += `<a href="${getUrl(p)}" class="page-btn ${p === current ? 'active' : ''}">${p}</a>`;
        }
    } else {
        html += `<a href="${getUrl(1)}" class="page-btn">1</a><span class="page-dots">...</span>`;
        // Only show 1 page before and after current on mobile-style logic
        // Or keep current - 2 to current + 2 but rely on the CSS flex-wrap
        for (let p = current - 1; p <= current + 1; p++) {
            html += `<a href="${getUrl(p)}" class="page-btn ${p === current ? 'active' : ''}">${p}</a>`;
        }
        html += `<span class="page-dots">...</span><a href="${getUrl(total)}" class="page-btn">${total}</a>`;
    }

    // Next Arrow
    html += current < total
        ? `<a href="${getUrl(current + 1)}" class="page-btn arrow">›</a>`
        : `<span class="page-btn arrow disabled">›</span>`;

    containers.forEach(container => {
        container.innerHTML = html;
        container.style.display = 'flex';
    });
}

function initializeEasterEggs() {
    const eggConfig = [
        { id: 'sixseven', img: '../static/assets/sixseven.png' },
        { id: 'jump', img: '../static/assets/jump.png' },
        { id: 'pregnant', img: '../static/assets/pregnant.png' }
    ];

    eggConfig.forEach(egg => {
        if (!document.getElementById(egg.id)) {
            const div = document.createElement('div');
            div.id = egg.id;
            div.className = 'easter-egg-hidden';
            div.innerHTML = `<img src="${egg.img}" alt="${egg.id} Easter Egg">`;
            document.body.appendChild(div);
        }
    });
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);

    // Returns format: "Sat, Jan 17, 2026"
    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function toggleSearchTips() {
    const guide = document.getElementById('searchGuide');
    if (guide) {
        guide.classList.toggle('active');
    }
}