# 👧 GigiQuotes

**GigiQuotes** is an interactive transcript search and video synchronization engine dedicated to the Hololive EN VTuber, **Gigi Murin**. 

The application allows fans to search through thousands of lines of speech-to-text data from Gigi's livestreams. When a user finds a specific quote, the integrated YouTube player instantly jumps to the exact second that phrase was uttered.

🔗 **Live Demo:** [gigiquotes.com](https://www.gigiquotes.com)

---

## ✨ Key Features

* 🔍 **Global Search:** Instant full-text search across the entire transcript database.
* ⏱️ **Frame-Sync Playback:** Clicking a search result syncs the YouTube player to that specific timestamp.
* 📜 **Dynamic Sidebar:** A transcript sidebar that tracks the video's current playback time in real-time.
* 📱 **Responsive Design:** Optimized for both desktop and mobile viewing.

---

## 🛠️ The Tech Behind GigiQuotes

GigiQuotes is built as a modern full-stack web application, leveraging containerization for consistent deployment.

### Architecture Overview
The system follows a classic **Client-Server-Database** architecture:

* **Frontend (React):** A reactive UI that manages state for the YouTube IFrame Player API. It handles real-time synchronization between the video's current time and the transcript highlights.
* **Backend (FastAPI):** A high-performance Python API that handles search queries and data retrieval. It uses asynchronous endpoints to ensure low-latency responses during high-traffic stream events.
* **Database (PostgreSQL):** A relational database storing thousands of timestamped transcript rows. It is optimized for text-based indexing to make the "Global Search" feature snappy.
* **Deployment (Docker):** The entire stack is containerized using Docker Compose, allowing the frontend, backend, and database to communicate within a private virtual network.

---

## 🤝 Contributing

Contributions are welcome to improve the website! Whether you're fixing a bug, adding a new feature, or improving the transcript data, your help is welcome.

---

## ⚠️ Disclaimer

This is a **fan-made project** and is not officially affiliated with **Hololive, COVER Corp, or Gigi Murin**. All video content and associated imagery are the property of their respective owners.
