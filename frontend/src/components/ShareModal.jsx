import { useState } from 'react';
import '../static/css/popup.css';
import '../static/css/ShareModal.css';

export default function ShareModal({ videoId, seconds, onClose }) {
    const [copied, setCopied] = useState(false);
    const time = Math.floor(seconds);
    const url = `https://youtu.be/${videoId}?t=${time}`;
    const tweetText = encodeURIComponent(`${url}\n\nFind more Gigi Murin👧 quotes on https://gigiquotes.com !`);

    function handleCopy() {
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    function handleBackdrop(e) {
        if (e.target === e.currentTarget) onClose();
    }

    return (
        <div className="popup-backdrop" onClick={handleBackdrop}>
            <div className="popup-panel share-panel">
                <button className="popup-close" onClick={onClose} aria-label="Close">&times;</button>
                <h2>Share Quote</h2>
                <a
                    href={`https://twitter.com/intent/tweet?text=${tweetText}`}
                    target="_blank"
                    rel="noreferrer"
                    className="share-x-btn"
                >
                    Share on Twitter (X)
                </a>
                <div className="share-link-row">
                    <input className="share-link-input" type="text" readOnly value={url} />
                    <button className="share-copy-btn" onClick={handleCopy}>
                        {copied ? 'Saved!' : 'Copy'}
                    </button>
                </div>
            </div>
        </div>
    );
}