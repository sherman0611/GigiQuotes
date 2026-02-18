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

const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && !allLoaded) {
        loadMoreVideos();
    }
}, { threshold: 0.1 });

if (sentinel) observer.observe(sentinel);

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
            // Only show the message if the user is NOT searching
            if (!currentSearch) {
                spinner.innerHTML = "<p>No more vods found.</p>";
            } else {
                spinner.style.display = 'none'; // Simply hide the spinner if search has no more results
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
            <div class="quote-search-card">
                <div class="quote-card-video" id="${uniqueId}" 
                    onclick="loadVideo(event, '${uniqueId}', '${quote.vod_id}', ${seconds})">
                    <img src="https://img.youtube.com/vi/${quote.vod_id}/hqdefault.jpg" class="lazy-thumb" alt="Thumbnail">
                    <div class="video-play-button"><span class="play-icon">▶</span></div>
                </div>
                <div class="quote-card-info">
                    <a href="/video/${quote.vod_id}" class="quote-title-link"><h3>${quote.title}</h3></a>
                    <div class="quote-text-container" onclick="loadVideo(event, '${uniqueId}', '${quote.vod_id}', ${seconds})">
                        <p class="matching-text">"...${content}..."</p>
                        <span class="jump-hint">▶ Click to play at ${displayTime}</span>
                    </div>
                    <div class="quote-card-meta">
                        <span class="video-date">${formattedUploadDate}</span>
                        <button class="share-btn" onclick="handleShareClick(event, '${quote.vod_id}', ${seconds})">Share</button>
                    </div>
                </div>
            </div>`;
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
        for (let p = 1; p <= Math.min(total, 7); p++) {
            html += `<a href="${getUrl(p)}" class="page-btn ${p === current ? 'active' : ''}">${p}</a>`;
        }
        if (total > 8) {
            html += `<span class="page-dots">...</span><a href="${getUrl(total)}" class="page-btn">${total}</a>`;
        }
    } else if (current > total - 4) {
        html += `<a href="${getUrl(1)}" class="page-btn">1</a><span class="page-dots">...</span>`;
        for (let p = total - 6; p <= total; p++) {
            if (p > 0) html += `<a href="${getUrl(p)}" class="page-btn ${p === current ? 'active' : ''}">${p}</a>`;
        }
    } else {
        html += `<a href="${getUrl(1)}" class="page-btn">1</a><span class="page-dots">...</span>`;
        for (let p = current - 2; p <= current + 2; p++) {
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

window.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/random-quotes') {
        renderQuoteCards(initialQuotesData, 'quotes-container');
    } else if (typeof initialQuotesData !== 'undefined' && initialQuotesData.length > 0) {
        renderQuoteCards(initialQuotesData, 'quotes-container');
        renderPagination(currentPageNum, totalPages);
    }
});