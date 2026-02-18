let player;
let highlightReq;
let currentlyRenderedCount = 0;
let isRendering = false;

const INITIAL_LOAD_COUNT = 10;
const QUOTES_PER_LOAD = 10;

document.addEventListener('DOMContentLoaded', () => {
    const noTranscriptsMsg = document.getElementById('no-transcripts-msg');

    // Use ALL_QUOTES directly (the constant defined in your HTML)
    if (typeof ALL_QUOTES !== 'undefined' && ALL_QUOTES.length > 0) {
        if (noTranscriptsMsg) noTranscriptsMsg.style.display = 'none';
        renderNextChunk(INITIAL_LOAD_COUNT);
    } else {
        if (noTranscriptsMsg) noTranscriptsMsg.style.display = 'block';
    }

    // 2. Setup Infinite Scroll
    const container = document.getElementById('transcript-container');
    if (container) {
        container.addEventListener('scroll', () => {
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
                renderNextChunk(QUOTES_PER_LOAD);
            }
        });
    }

    // 3. Setup Jump Button
    const jumpBtn = document.getElementById('jump-to-current');
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const activeQuote = document.querySelector('.quote-item.active');
            if (activeQuote) scrollToElement(activeQuote);
        });
    }
});

/**
 * Renders a batch of quotes. 
 * count: number of quotes to render in this batch
 */
async function renderNextChunk(count = QUOTES_PER_LOAD) {
    if (currentlyRenderedCount >= ALL_QUOTES.length || isRendering) return;

    isRendering = true;
    const container = document.getElementById('transcript-content');
    const spinner = document.getElementById('loading-spinner');

    if (spinner) spinner.style.display = 'flex';

    // We don't need a timeout for the initial load to keep it fast
    const nextBatch = ALL_QUOTES.slice(currentlyRenderedCount, currentlyRenderedCount + count);
    const fragment = document.createDocumentFragment();

    nextBatch.forEach((quote, index) => {
        const globalIndex = currentlyRenderedCount + index;
        const div = document.createElement('div');
        div.className = 'quote-item';
        div.id = `quote-${globalIndex}`;
        div.setAttribute('data-start', quote.start_time);
        div.setAttribute('data-end', quote.end_time);
        div.onclick = () => seekToTime(quote.start_time);

        div.innerHTML = `
            <div class="quote-header">
                <span class="timestamp">${formatTimestamp(quote.start_time)}</span>
            </div>
            <span class="quote-content">${quote.content}</span>
            <button class="share-btn" onclick="handleShareClick(event, '${quote.vod_id}', ${quote.start_time})">Share</button>
        `;
        fragment.appendChild(div);
    });

    container.appendChild(fragment);
    currentlyRenderedCount += nextBatch.length;

    if (spinner) spinner.style.display = 'none';
    isRendering = false;
}

// ... rest of the functions (ensureQuoteIsLoaded, highlightAndScrollTo, etc.) remain the same

async function ensureQuoteIsLoaded(targetTime) {
    const lastQuote = document.querySelector('#transcript-content .quote-item:last-child');
    const lastTime = lastQuote ? parseFloat(lastQuote.getAttribute('data-end')) : 0;

    if (targetTime > lastTime && currentlyRenderedCount < ALL_QUOTES.length) {
        await renderNextChunk();
        // Wait for a browser "reflow" so offsetTop is calculated
        await new Promise(resolve => requestAnimationFrame(resolve));
        return ensureQuoteIsLoaded(targetTime);
    }
    return Promise.resolve();
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player-iframe', {
        events: { 'onStateChange': onPlayerStateChange }
    });
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.PLAYING) {
        updateHighlighter();
    } else {
        cancelAnimationFrame(highlightReq);
    }
}

async function updateHighlighter() {
    if (!player || typeof player.getCurrentTime !== 'function') return;

    const currentTime = player.getCurrentTime();

    // 1. Ensure the quote exists in the DOM
    await ensureQuoteIsLoaded(currentTime);

    // 2. Find and Highlight
    highlightAndScrollTo(currentTime);

    highlightReq = requestAnimationFrame(updateHighlighter);
}

function highlightAndScrollTo(currentTime) {
    const quoteElements = document.querySelectorAll('.quote-item');

    for (let el of quoteElements) {
        const start = parseFloat(el.getAttribute('data-start'));
        const end = parseFloat(el.getAttribute('data-end'));

        if (currentTime >= start && currentTime <= end) {
            if (!el.classList.contains('active')) {
                document.querySelector('.quote-item.active')?.classList.remove('active');
                el.classList.add('active');
                scrollToElement(el);
            }
            break;
        }
    }
}

function scrollToElement(el) {
    const scrollContainer = document.getElementById('transcript-container');
    if (!el || !scrollContainer) return;

    // We use requestAnimationFrame to ensure the browser has the correct coordinates
    requestAnimationFrame(() => {
        const targetScroll = el.offsetTop - (scrollContainer.offsetHeight / 2) + (el.offsetHeight / 2);
        scrollContainer.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });
    });
}

async function seekToTime(seconds) {
    if (player && typeof player.seekTo === 'function') {
        player.seekTo(seconds, true);
        player.playVideo();

        await ensureQuoteIsLoaded(seconds);
        highlightAndScrollTo(seconds);
    }
}

function formatTimestamp(seconds) {
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return hrs > 0 ?
        `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}` :
        `${mins}:${secs.toString().padStart(2, '0')}`;
}