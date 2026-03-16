import { useNavigate } from 'react-router-dom';
import '../static/css/Pagination.css';

export default function Pagination({ current, total, searchParams }) {
    const navigate = useNavigate();

    if (!total || total <= 1) return null;

    function getUrl(p) {
        const params = new URLSearchParams(searchParams);
        params.set('page', p);
        params.delete('active_tab');
        return '/?' + params.toString();
    }

    function handleClick(e, p) {
        e.preventDefault();
        navigate(getUrl(p));
    }

    const pages = [];

    // Previous arrow
    pages.push(
        current > 1
            ? <a key="prev" href={getUrl(current - 1)} onClick={e => handleClick(e, current - 1)} className="page-btn arrow">‹</a>
            : <span key="prev" className="page-btn arrow disabled">‹</span>
    );

    // Page numbers
    if (current <= 4) {
        for (let p = 1; p <= Math.min(total, 5); p++) {
            pages.push(
                <a key={p} href={getUrl(p)} onClick={e => handleClick(e, p)}
                    className={`page-btn${p === current ? ' active' : ''}`}>{p}</a>
            );
        }
        if (total > 6) {
            pages.push(<span key="dots1" className="page-dots">...</span>);
            pages.push(<a key={total} href={getUrl(total)} onClick={e => handleClick(e, total)} className="page-btn">{total}</a>);
        }
    } else if (current > total - 4) {
        pages.push(<a key={1} href={getUrl(1)} onClick={e => handleClick(e, 1)} className="page-btn">1</a>);
        pages.push(<span key="dots1" className="page-dots">...</span>);
        for (let p = total - 4; p <= total; p++) {
            if (p > 0) pages.push(
                <a key={p} href={getUrl(p)} onClick={e => handleClick(e, p)}
                    className={`page-btn${p === current ? ' active' : ''}`}>{p}</a>
            );
        }
    } else {
        pages.push(<a key={1} href={getUrl(1)} onClick={e => handleClick(e, 1)} className="page-btn">1</a>);
        pages.push(<span key="dots1" className="page-dots">...</span>);
        for (let p = current - 1; p <= current + 1; p++) {
            pages.push(
                <a key={p} href={getUrl(p)} onClick={e => handleClick(e, p)}
                    className={`page-btn${p === current ? ' active' : ''}`}>{p}</a>
            );
        }
        pages.push(<span key="dots2" className="page-dots">...</span>);
        pages.push(<a key={total} href={getUrl(total)} onClick={e => handleClick(e, total)} className="page-btn">{total}</a>);
    }

    // Next arrow
    pages.push(
        current < total
            ? <a key="next" href={getUrl(current + 1)} onClick={e => handleClick(e, current + 1)} className="page-btn arrow">›</a>
            : <span key="next" className="page-btn arrow disabled">›</span>
    );

    return <div className="pagination">{pages}</div>;
}