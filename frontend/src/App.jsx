import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import VideoPage from './pages/VideoPage';
import ClickerPage from './pages/ClickerPage';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/random-quotes" element={<HomePage randomMode />} />
                <Route path="/video/:vod_id" element={<VideoPage />} />
                <Route path="/shoebox" element={<ClickerPage />} />
            </Routes>
        </BrowserRouter>
    );
}