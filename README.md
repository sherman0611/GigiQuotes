👧 Gigi Quotes (Gigi Murin Transcript Search)
A full-stack web application designed to help fans search, discover, and share specific moments from Gigi Murin's (Hololive EN) livestreams. The app features a searchable database of speech-to-text transcripts, video filtering, and an interactive synchronized video player.

🚀 Features
Global Search: Search through thousands of transcribed lines across all indexed VODs.

Synchronized Playback: Clicking a quote jumps the YouTube player to that exact timestamp.

Smart Highlighting: The transcript sidebar automatically scrolls and highlights the active line as the video plays.

Live Stats: A "Grem Counter" and other fun metrics tracking frequently used catchphrases.

Infinite Scroll: Seamless browsing of the video catalog and search results.

Shareable Links: Generate YouTube links with precise timestamps to share specific quotes on social media.

🛠️ Technical Stack
Frontend: Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom Variables/Flexbox).

Backend: Python (Flask).

Database: PostgreSQL.

Integration: YouTube Iframe Player API.

⚠️ Security & Performance Audit
Based on a recent code review, the following areas are prioritized for the next update:

Security Fixes Required
SQL Injection: Move from f-string query building to parameterized queries in app.py for pagination and sorting limits.

Credential Management: Move database passwords from get_db_connection() into an .env file or environment variables.

Regex Safety: Implement PostgreSQL statement timeouts to prevent ReDoS (Regular Expression Denial of Service) attacks from complex search strings.

Performance Optimizations
Database Indexing: Add GIN indexes for the quotes table to speed up pattern matching (~*) searches.

Stats Caching: The /api/stats endpoint currently performs six full table scans per request. This should be consolidated into a single query or cached via a Materialized View.

DOM Efficiency: Throttling the requestAnimationFrame highlighter in details.js to reduce CPU usage during playback.

📥 Installation & Setup
1. Prerequisites
Python 3.9+

PostgreSQL 13+

Node.js (Optional, for CSS/JS minification)

2. Database Setup
Create a database named gigi_quotes_db and run the initial schema (not included in this repo) to create video_catalog and quotes tables.

3. Environment Configuration
Create a .env file in the root directory:

Code snippet
DB_HOST=127.0.0.1
DB_NAME=gigi_quotes_db
DB_USER=postgres
DB_PASS=your_password_here
FLASK_ENV=development
4. Install Dependencies
Bash
pip install flask psycopg2-binary
5. Run the Application
Bash
python app.py
The app will be available at http://localhost:5000.

📂 Project Structure
app.py: Flask server, API routes, and database logic.

static/js/:

index.js: Main landing page logic, infinite scroll, and stats fetching.

details.js: YouTube API integration and transcript synchronization.

main.js: Global utilities (sharing, modals, UI helpers).

templates/: Jinja2 HTML templates.

🗺️ Roadmap
[ ] Implement user-submitted timestamps.

[ ] Add "Dark Mode" toggle.

[ ] Migrate to a single-pass SQL query for the stats dashboard.

[ ] Add fuzzy search support for better typo tolerance in quotes.

🤝 Contributing
This is a solo-maintained project. If you find a bug or have a feature request, please open an issue or contact me on Twitter!

Disclaimer: This is a fan-made project and is not officially affiliated with Hololive or Cover Corp.
