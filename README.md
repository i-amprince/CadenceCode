# CadenceCode: Real-Time Collaborative Code Editor

[![Deployment](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://cadence-code.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Tech Stack](https://img.shields.io/badge/Tech-MERN%20+%20Socket.IO%20+%20Redis-green?style=for-the-badge)](https://github.com/i-amprince/CadenceCode)
[![CI](https://github.com/i-amprince/CadenceCode/actions/workflows/ci.yml/badge.svg?branch=feature/redis-security-scaling)](https://github.com/i-amprince/CadenceCode/actions/workflows/ci.yml)

---

## 🚀 Overview

**Live Demo: [cadence-code.vercel.app](https://cadence-code.vercel.app/)**

CadenceCode is a real-time collaborative code editor that lets developers write, run, and talk through code together in a shared, persistent room. It is built for pair programming, technical interviews, and team brainstorming, with integrated voice chat, multi-language execution, and a glass-morphism UI.

Under the hood, edits are merged with a **CRDT (Yjs)** so simultaneous typing never overwrites anyone's work, the backend can run as **multiple instances kept in sync through Redis**, and code execution runs in a **separate BullMQ worker**.

---

## ✨ Features

### Collaboration
*   **Conflict-free real-time editing:** Every file is a Yjs CRDT. Users typing in the same file at the same time are merged character by character instead of the last save winning.
*   **Offline edits survive reconnects:** On reconnect, client and server exchange Yjs state vectors and send each other only the edits the other side is missing.
*   **Multi-file rooms:** Add, edit, and switch between multiple files in one room.
*   **Code checkpoints:** Save and restore the 5 most recent versions of each file.
*   **Persistent rooms:** Close a room and reopen it later with the same ID; all files are saved in MongoDB.
*   **In-room text chat** and **voice chat (WebRTC)** with speaking indicators.

### Code Execution
*   **JavaScript, Python, C++, and Java** executed in the cloud via the **Judge0 API**, with output in a resizable console.
*   **Background job queue:** Runs are processed by a **BullMQ** worker with retries, exponential backoff, a 20-second execution timeout, and a cap of 5 concurrent runs per worker.

### Security
*   **Google login (OAuth 2.0)** with real profile pictures.
*   **Authenticated WebSockets:** The login JWT is verified in the Socket.IO handshake. User identity always comes from the verified token, never from data the client sends.
*   **Password-protected rooms:** Passwords are hashed with **bcrypt**. Entering the password adds you to the room's member list, which is checked on every socket event and room API call.
*   **Server-enforced owner rights:** Only the room owner can remove users or delete files. A removed user must enter the password again to return.
*   **Rate limiting (Redis):** 10 code runs per user per minute and 10 password attempts per user per room per minute, enforced across all server instances.

### Scalability
*   **Horizontal scaling:** The **Socket.IO Redis adapter** lets several backend instances serve the same room. User lists and voice chat work across instances.
*   **Cross-instance document sync:** Each instance keeps an in-memory copy of a room's document. Updates are forwarded between instances through Redis, and a newly opened room merges the live copies held by other instances.
*   **Safe concurrent saves:** Saves merge with the stored document and use a version check (optimistic concurrency), so two servers saving at once never lose edits.
*   **Memory cleanup:** A room's document is saved and freed when its last user on that server leaves.

---

## 🏗️ Architecture

```text
   Browser (React + CodeMirror + Yjs)        Browser
                 │                              │
                 └──────────┐        ┌──────────┘
                            ▼        ▼
                        Load balancer
                       │              │
        ┌──────────────▼──┐        ┌──▼──────────────┐
        │  API server A   │◄──────►│  API server B   │   Socket.IO + Express
        │  Y.Doc copies   │ Redis  │  Y.Doc copies   │   JWT-verified sockets
        └───┬─────────┬───┘        └───┬─────────┬───┘
            │         │                │         │
            │         ▼                ▼         │
            │   ┌──────────────────────────┐     │
            │   │ Redis                    │     │
            │   │ • Socket.IO adapter      │     │
            │   │ • peer Yjs updates       │     │
            │   │ • BullMQ queue           │     │
            │   │ • rate-limit counters    │     │
            │   └────────────┬─────────────┘     │
            │                ▼                   │
            │      BullMQ worker ──► Judge0 API  │
            ▼                                    ▼
        ┌──────────────────────────────────────────┐
        │ MongoDB Atlas: rooms, members, Yjs state, │
        │ checkpoints                               │
        └──────────────────────────────────────────┘
```

**How an edit travels:** a keystroke creates a small Yjs update in the browser → the server checks the user is a room member, applies the update to its copy, broadcasts it to the room (on every instance, via the Redis adapter) and forwards it to the other servers' copies → MongoDB is updated after a 750 ms debounce, merging with whatever is already stored.

**How a code run travels:** Run → the server checks membership and the rate limit → a job is added to the BullMQ queue in Redis → the worker submits it to Judge0 and polls for the result → the result returns to the user.

---

## 💻 Technologies Used

### Frontend
*   **React.js** and **React Router**
*   **CodeMirror 6** with **y-codemirror.next** for collaborative editing
*   **Yjs**: CRDT for conflict-free shared documents
*   **Socket.IO Client**
*   **React Hot Toast** for notifications

### Backend
*   **Node.js** and **Express.js**
*   **Socket.IO** with the **Redis adapter** for real-time, multi-instance communication
*   **Yjs** on the server as the source of truth for room documents
*   **MongoDB Atlas** and **Mongoose**
*   **Redis** (via **ioredis**) for pub/sub, rate limiting, and the job queue
*   **BullMQ** for background code execution
*   **JSON Web Tokens (JWT)** and **bcrypt**
*   **Judge0 API** for running code

### Real-Time Communication
*   **WebSockets (Socket.IO):** code sync, chat, presence, and user management
*   **WebRTC:** peer-to-peer voice chat

### Authentication
*   **Google OAuth 2.0**

---

## 📸 Screenshots

1.  **Login Page**
    ![Login Page](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/1.png)
    *Secure and simple Google OAuth login.*

2.  **Room Entry**
    ![Room Entry](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/2.png)
    *Create or join a password-protected room with a unique Room ID and your username.*

3.  **Main Editor (Owner's View)**
    ![Main Editor (Owner's View)](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/3.png)
    *Collaborative editor with a user panel, voice controls, and owner-only rights to remove users and delete files.*

4.  **Main Editor (Collaborator's View)**
    ![Main Editor (Collaborator's View)](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/4.png)
    *Real-time code sync, integrated text chat, and voice call controls.*

5.  **Code Execution**
    ![Code Execution](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/5.png)
    *Execute code and view the output in the resizable console.*

6.  **Checkpoints**
    ![Checkpoints](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/6.png)
    *Save and restore previous versions of any file.*

---

## 📦 Getting Started

### Prerequisites

*   **Node.js** (LTS) and **npm**
*   A **MongoDB Atlas** connection string
*   A **Redis** database: a free hosted one (Redis Cloud, Upstash, Render) or a local one (Linux/macOS, or WSL/Memurai on Windows)
*   A **Google Cloud** project with an OAuth 2.0 Client ID
*   A **RapidAPI** account with a Judge0 API key

### 1. Clone the repository
```bash
git clone https://github.com/i-amprince/CadenceCode.git
cd CadenceCode
```

### 2. Backend setup
```bash
cd Server
npm install
```

Create `Server/.env`:
```env
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string

# Redis: Socket.IO adapter, BullMQ queue, rate limits
# Use redis:// for plain connections, rediss:// when TLS is enabled
REDIS_URL=redis://default:your_password@your_redis_host:port

# Run the BullMQ worker inside the API process (simplest setup)
RUN_WORKER_IN_API=true

JUDGE0_API_KEY=your_judge0_api_key
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com

GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=a_long_random_secret

# Optional: only if MongoDB fails with "querySrv ECONNREFUSED"
# (some machines cannot resolve the SRV records used by mongodb+srv:// URLs)
# DNS_SERVERS=8.8.8.8,1.1.1.1
```

Start the backend:
```bash
npm start            # API + Socket.IO (+ worker when RUN_WORKER_IN_API=true)
npm run worker       # separate worker process, if RUN_WORKER_IN_API is not true
npm run dev          # API with auto-restart during development
```
The backend runs on `http://localhost:5000`. On a successful start it logs `Server running`, `Code-run worker ready`, and `MongoDB connected`.

### 3. Frontend setup
```bash
cd ../frontend
npm install
```

Create `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
```
Use the **same** Google Client ID as the backend.

```bash
npm start
```
The app opens at **[http://localhost:3000](http://localhost:3000)**.

> **Allowed origins:** the backend accepts requests from `http://localhost:3000` and `https://cadence-code.vercel.app`. If you host the frontend elsewhere, add its URL to `ALLOWED_ORIGINS` in `Server/server.js`.

---

## 🧪 Testing

The backend has **43 automated integration tests** (Node's built-in test runner) that run the real server code over HTTP and Socket.IO, with in-memory stand-ins for MongoDB, Redis and the BullMQ queue. No database, Redis or secrets are needed.

```bash
cd Server
npm test
```

| Suite | What it covers |
| --- | --- |
| `test/server.test.js` | Login required for REST and sockets, room membership, bcrypt passwords (including upgrading old plain-text ones), owner-only kick and delete, spoofed identity fields ignored, password-guess and code-run rate limits, code runs through the queue, concurrent edits converging, offline edits recovered on reconnect, debounced saves, freeing idle rooms |
| `test/multi-instance.test.js` | Two server instances sharing one database: a newly opened room picks up another server's unsaved edits, live updates forwarded between servers, concurrent saves keeping both servers' edits, version-conflict retry, reload after unloading, and two servers converting the same legacy room at once |

**GitHub Actions** runs the server tests and a production build of the frontend on every push and pull request (`.github/workflows/ci.yml`).

---

## ☁️ Deployment

The live demo runs the frontend on **Vercel** and the backend on **Render**.

**Backend (Render web service)**
*   Root directory: `Server` · Build: `npm install` · Start: `npm start`
*   Environment: `MONGO_URI`, `REDIS_URL`, `RUN_WORKER_IN_API=true`, `JUDGE0_API_KEY`, `JUDGE0_API_HOST`, `GOOGLE_CLIENT_ID`, `JWT_SECRET`
*   To run several instances, set `RUN_WORKER_IN_API=false` and run `npm run worker` as a separate background worker.

**Frontend (Vercel)**
*   Root directory: `frontend`
*   Environment: `REACT_APP_BACKEND_URL` (your Render URL), `REACT_APP_GOOGLE_CLIENT_ID`

**Services**
*   **MongoDB Atlas:** allow `0.0.0.0/0` in Network Access, because Render's IP addresses change.
*   **Redis:** set the eviction policy to `noeviction`, so queued jobs are never dropped when memory is full.

---

## 🗂️ Versions

| Version | Tag | Branch | What it added |
| --- | --- | --- | --- |
| v1 | `v1-before-yjs` | | Original editor: whole-file sync over Socket.IO |
| v2 | `v2-yjs-consistency` | `feature/yjs-consistency` | Yjs CRDT editing, so concurrent edits merge instead of overwriting |
| v3 | `v3-redis-bullmq` | `feature/redis-security-scaling` | Authenticated sockets, room membership, bcrypt, Redis horizontal scaling, BullMQ code execution, rate limiting |

---

## 🤝 Contributing

Contributions are always welcome! If you have suggestions for improvements, new features, or bug fixes, please feel free to open an issue or submit a pull request.

---

## 📝 License

This project is licensed under the MIT License.

---

> Built with ❤️ by [Prince](https://github.com/i-amprince)
