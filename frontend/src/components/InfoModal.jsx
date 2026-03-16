import '../static/css/popup.css';
import '../static/css/InfoModal.css';

export default function InfoModal({ onClose }) {
    function handleBackdrop(e) {
        if (e.target === e.currentTarget) onClose();
    }

    return (
        <div className="popup-backdrop" onClick={handleBackdrop}>
            <div className="popup-panel info-panel">
                <button className="popup-close" onClick={onClose} aria-label="Close">&times;</button>
                <h2 className="popup-title">About Gigi Quotes</h2>
                <div className="info-body">
                    <p>This is a fan-made site dedicated to Gigi Murin! You can look up video transcripts & words being said during streams and capture the moment!</p>
                </div>
                <p className="info-disclaimer">
                    This is a fan project and is not affiliated with Hololive Production or COVER Corporation. All rights belong to their respective owners.
                </p>
            </div>
        </div>
    );
}