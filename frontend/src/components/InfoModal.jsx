import '../static/css/popup.css';
import '../static/css/InfoModal.css';
import githubIcon from '../static/assets/github-icon.svg'
import twitterIcon from '../static/assets/twitter-icon.svg'
import youtubeIcon from '../static/assets/youtube-icon.svg'

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
                <div className="creator-group">
                    <span>Freia</span>
                    <a href="https://github.com/sherman0611/GigiQuotes" target="_blank" rel="noreferrer" className="social-btn">
                        <img src={githubIcon} alt="GitHub" className="icon" />
                    </a>
                    <a href="https://x.com/freia_000" target="_blank" rel="noreferrer" className="social-btn">
                        <img src={twitterIcon} alt="Twitter" className="icon" />
                    </a>
                    <span className="separator">|</span>
                    <span>Gigi Murin</span>
                    <a href="https://www.youtube.com/@holoen_gigimurin" target="_blank" rel="noreferrer" className="social-btn">
                        <img src={youtubeIcon} alt="YouTube" className="icon" />
                    </a>
                </div>
            </div>
        </div>
    );
}