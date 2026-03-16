import { Link } from 'react-router-dom'
import '../static/css/VideoCard.css';
import { formatDate } from '../utils.js';

export default function VideoCard({ video }) {
    return (
        <Link to={`/video/${video.vod_id}`} className="video-card">
            <img src={`https://img.youtube.com/vi/${video.vod_id}/mqdefault.jpg`} alt="Thumbnail" />
            <div>
                <h3>{video.title}</h3>
                <p>{formatDate(video.upload_date)}</p>
            </div>
        </Link>
    );
}