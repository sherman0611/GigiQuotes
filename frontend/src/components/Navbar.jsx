import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../static/css/Navbar.css';
import githubIcon from '../static/assets/github-icon.svg'
import twitterIcon from '../static/assets/twitter-icon.svg'
import youtubeIcon from '../static/assets/youtube-icon.svg'
import infoIcon from '../static/assets/info-icon.svg'
import InfoModal from './InfoModal'
import ShareModal from './ShareModal'

export default function Navbar({ shareTarget = null, onShareClose }) {
    const [infoOpen, setInfoOpen] = useState(false);
    const location = useLocation();

    const handleHomeClick = (e) => {
        if (location.pathname === '/') {
            e.preventDefault();
            window.location.href = '/';
        }
    };

    return (
        <>
            {infoOpen && <InfoModal onClose={() => setInfoOpen(false)} />}
            {shareTarget && (
                <ShareModal
                    videoId={shareTarget.videoId}
                    seconds={shareTarget.seconds}
                    onClose={onShareClose}
                />
            )}

            <header className="top-bar">
                <div className="top-bar-container">
                    <div id="left">
                        <div className="creator-group">
                            <span><span className="desktop-text">Created by </span>Freia</span>
                            <a href="https://github.com/sherman0611/GigiQuotes" target="_blank" rel="noreferrer" className="social-btn">
                                <img src={githubIcon} alt="GitHub" className="icon" />
                            </a>
                            <a href="https://x.com/freia_000" target="_blank" rel="noreferrer" className="social-btn">
                                <img src={twitterIcon} alt="Twitter" className="icon" />
                            </a>
                            <span className="separator">|</span>
                            <span><span className="desktop-text">Subscribe to </span>Gigi Murin<span className="desktop-text">!</span></span>
                            <a href="https://www.youtube.com/@holoen_gigimurin" target="_blank" rel="noreferrer" className="social-btn">
                                <img src={youtubeIcon} alt="YouTube" className="icon" />
                            </a>
                        </div>
                        <button onClick={() => setInfoOpen(true)} className="info-btn">
                            <img src={infoIcon} alt="Info" className="icon" />
                        </button>
                    </div>
                    <Link
                        to="/"
                        className="home-button"
                        onClick={handleHomeClick}
                    >
                        Gigi Quotes👧
                    </Link>
                    <div id="right">
                        <button onClick={() => window.scrollTo({ top: 0 })} className="top-bar-btn">
                            <svg className="play-icon" id="up-arrow" viewBox="0 0 24 24">
                                <path d="M13 19V7.83L17.59 12.42L19 11L12 4L5 11L6.41 12.41L11 7.83V19H13Z" />
                            </svg>
                            Back to Top
                        </button>
                    </div>
                </div>
            </header>
        </>
    )
}