import '../static/css/StatBadge.css';

export default function StatBadge({ label, value, theme, icon }) {
    return (
        <a className="stat-link">
            <div className="stat-badge" data-theme={theme}>
                <span className="stat-label">
                    {icon && <img src={icon} alt={label} className="badge-icon" />}
                    {label}
                </span>
                <span className="stat-value">{value !== null ? value.toLocaleString() : '-'}</span>
            </div>
        </a>
    );
}