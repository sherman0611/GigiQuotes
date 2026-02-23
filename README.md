# 👧 Gigi Quotes www.gigiquotes.com
> An interactive transcript search and video synchronization engine for Gigi Murin (Hololive EN).

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Framework-Flask-lightgrey.svg)](https://flask.palletsprojects.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://www.postgresql.org/)

Gigi Quotes is a full-stack web application designed to help fans search, discover, and share specific moments from Gigi Murin's livestreams. It parses thousands of lines of speech-to-text data, allowing users to jump to the exact second a phrase was uttered.

---

## ✨ Key Features

* **🔍 Global Search:** Search through the entire transcript database instantly.
* **⏱️ Frame-Sync Playback:** Clicking a quote jumps the YouTube player to that specific timestamp.
* **📜 Auto-Scrolling Sidebar:** The transcript sidebar automatically tracks the video's current time.
* **📊 Counters:** Live statistics tracking catchphrase occurrences (Grems, Cece, Yippee, etc.).
* **📱 Shareable Timestamps:** Generate social-media-ready links with embedded YouTube time codes.

---

## 🛠️ Technical Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Backend** | Python, Flask |
| **Database** | PostgreSQL |
| **APIs** | YouTube Iframe Player API |
