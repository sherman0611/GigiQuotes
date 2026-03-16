import { useState, useEffect, useRef } from 'react';
import searchIcon from '../static/assets/search-icon.svg';
import '../static/css/popup.css';
import '../static/css/VideoSearchModal.css';

// Returns an array of word-boundary regexes, one per whitespace-separated term.
function buildTermRegexes(query) {
    return query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(term => {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escaped}\\b`, 'gi');
        });
}

// Returns true when every term regex matches somewhere in text (AND logic).
function allTermsMatch(text, regexes) {
    return regexes.every(re => { re.lastIndex = 0; return re.test(text); });
}

// Splits text into alternating plain/matched segments for highlighting.
function highlightMatches(text, regexes) {
    if (!regexes || regexes.length === 0) return text;

    const spans = [];
    for (const re of regexes) {
        const clone = new RegExp(re.source, re.flags);
        clone.lastIndex = 0;
        let m;
        while ((m = clone.exec(text)) !== null) {
            spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        }
    }

    if (spans.length === 0) return text;

    spans.sort((a, b) => a.start - b.start);
    const merged = [spans[0]];
    for (let i = 1; i < spans.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = spans[i];
        if (cur.start < prev.end) {
            prev.end = Math.max(prev.end, cur.end);
            prev.text = text.slice(prev.start, prev.end);
        } else {
            merged.push(cur);
        }
    }

    const parts = [];
    let last = 0;
    for (const span of merged) {
        if (span.start > last) parts.push(text.slice(last, span.start));
        parts.push(
            <mark key={span.start} className="search-highlight">{span.text}</mark>
        );
        last = span.end;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

export default function VideoSearchModal({ allQuotes, onSeek, onClose }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef(null);

    const termRegexes = query.trim() ? buildTermRegexes(query) : [];
    const results = termRegexes.length > 0
        ? allQuotes.filter(q => allTermsMatch(q.content, termRegexes))
        : [];

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    function handleResultClick(startTime) {
        onSeek(startTime);
        setOpen(false);
    }

    function formatTime(seconds) {
        const s = Math.floor(seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(sec).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
    }

    function handleBackdrop(e) {
        if (e.target === e.currentTarget) setOpen(false);
    }

    return (
        <>
            <button className="search-trigger-btn" onClick={() => setOpen(true)}>
                <img src={searchIcon} alt="Search transcript" />
            </button>

            {open && (
                <div className="popup-backdrop" onClick={handleBackdrop}>
                    <div
                        className="popup-panel search-panel"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2>Search Quote</h2>

                        <button
                            className="popup-close"
                            onClick={() => setOpen(false)}
                            aria-label="Close search"
                        >
                            &times;
                        </button>

                        <div className="content-container">

                        </div>

                        <div className="search-body">
                            <div className="search-input-wrapper">
                                <input
                                    ref={inputRef}
                                    className="search-input"
                                    type="text"
                                    placeholder="Search words (separate with space)..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                                {query && (
                                    <button
                                        className="search-input-clear"
                                        onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                                        aria-label="Clear search"
                                    >
                                        &times;
                                    </button>
                                )}
                            </div>

                            {results.length > 0 && (
                                <p className="search-result-count">
                                    {results.length} {results.length === 1 ? 'result' : 'results'} found
                                </p>
                            )}

                            {query.trim() && (
                                <div className="search-results">
                                    {results.length === 0 ? (
                                        <p className="search-no-results">
                                            No exact matches for "{query.trim()}".
                                        </p>
                                    ) : (
                                        results.map((quote, i) => (
                                            <button
                                                key={`${quote.vod_id}-${i}`}
                                                className="search-result"
                                                onClick={() => handleResultClick(quote.start_time)}
                                            >
                                                <span className="search-timestamp">
                                                    {formatTime(quote.start_time)}
                                                </span>
                                                <span className="search-content">
                                                    {highlightMatches(quote.content, termRegexes)}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}