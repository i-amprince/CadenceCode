# CadenceCode: Real-Time Collaborative Code Editor

[![Deployment](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://cadence-code.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Tech Stack](https://img.shields.io/badge/Tech-MERN%20+%20Socket.IO-green?style=for-the-badge)](https://github.com/i-amprince/CadenceCode)

---

## 🚀 Overview

**Live Demo: [cadence-code.vercel.app](https://cadence-code.vercel.app/)**

CadenceCode is a powerful, real-time collaborative code editor that allows developers to write, execute, and verbally discuss code together in a shared, persistent environment. Whether you're pair programming, conducting technical interviews, or brainstorming with a team, CadenceCode provides a seamless and interactive experience with integrated voice chat, multi-language support, and a modern, glass-morphism UI.

---

## ✨ Features

CadenceCode comes packed with features designed to enhance your collaborative coding experience:

*   **Google Login:** Secure and convenient one-click authentication using Google OAuth 2.0.
*   **Real User Avatars:** See your collaborators' actual Google profile pictures for a more personal connection.
*   **Dynamic Room System:** Easily create or join private coding rooms with unique IDs.
*   **Real-Time Collaboration:** Experience instant code synchronization, allowing all users in a room to see changes as they happen.
*   **Integrated Voice Chat (WebRTC):** Communicate seamlessly with your team using built-in, real-time voice calls, complete with speaking indicators.
*   **Enhanced User Management:** The room owner, clearly identified in the user list, has the ability to remove disruptive users.
*   **Multi-File Support:** Organize your projects efficiently by adding, editing, and switching between multiple files within a single room.
*   **Owner-Only File Deletion:** The room owner has the exclusive right to remove any file from the project.
*   **Multi-Language Compatibility:** Write and run code in popular languages including **JavaScript, Python, C++,** and **Java**.
*   **Cloud Code Execution:** Execute your code in the cloud via the **Judge0 API** and view the output instantly in the resizable console.
*   **Code Checkpoints:** Never lose your work! Save and restore code checkpoints for individual files directly from the editor.
*   **Integrated In-Room Chat:** Communicate effortlessly with your collaborators through the built-in, mobile-friendly text chat panel.
*   **Persistent Rooms:** Rooms are persistent. You can safely close and later reopen a room with the same ID to continue working with all your files and progress preserved.
*   **Responsive & Modern UI:** Enjoy a sleek, professional, and mobile-friendly interface inspired by glass-morphism for a comfortable coding experience on any device.

---

## 💻 Technologies Used

CadenceCode is built using a modern and robust tech stack:

### Frontend

*   **React.js:** A powerful JavaScript library for building interactive user interfaces.
*   **React Router:** For declarative routing within the application.
*   **React Hot Toast:** Elegant and responsive notifications.
*   **CodeMirror:** A versatile in-browser code editor with auto-completion and language support.
*   **Socket.IO Client:** For real-time, bidirectional communication.

### Backend

*   **Node.js & Express.js:** For building a scalable and robust REST API.
*   **MongoDB Atlas:** A fully-managed cloud database for flexible and scalable data storage.
*   **Mongoose:** An elegant MongoDB object modeling tool for Node.js.
*   **JSON Web Tokens (JWT):** For secure authentication and authorization.
*   **Socket.IO:** Enables live code synchronization, chat, and user management.
*   **Judge0 API:** A robust and scalable online judge system for remote code execution.

### Real-Time Communication

*   **WebSockets (Socket.IO):** Powers the live code synchronization and in-room chat.
*   **WebRTC:** Powers real-time, peer-to-peer voice communication.

### Authentication

*   **Google OAuth 2.0:** Secure and industry-standard authentication protocol for user login.

---

## 📸 Screenshots

1.  **Login Page**
    ![Login Page](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/1.png)
    *Secure and simple Google OAuth login.*

2.  **Room Entry**
    ![Room Entry](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/2.png)
    *Create or join a room with a unique Room ID and your username.*

3.  **Main Editor (Owner's View)**
    ![Main Editor (Owner's View)](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/3.png)
    *Collaborative editor with a modern glass-morphism design, user panel with profile pictures, voice controls, and owner-exclusive file deletion rights.*

4.  **Main Editor (Collaborator's View)**
    ![Main Editor (Collaborator's View)](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/4.png)
    *Experience seamless collaboration with real-time code sync, integrated text chat, and voice call controls.*

5.  **Code Execution**
    ![Code Execution](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/5.png)
    *Execute code and view the output instantly in the resizable console.*

6.  **Checkpoints**
    ![Checkpoints](https://raw.githubusercontent.com/i-amprince/CadenceCode/main/frontend/src/Images/6.png)
    *Easily save and restore previous versions of your code for any file.*

---

## 📦 Getting Started

Follow these steps to get CadenceCode up and running on your local machine.

### Prerequisites

*   Node.js (LTS version recommended)
*   npm (Node Package Manager)
*   A **MongoDB Atlas** account and a connection string.
*   A **Google Cloud Project** with an OAuth 2.0 Client ID configured.
*   A **RapidAPI** account to obtain a Judge0 API Key.

### Installation

#### 1. Clone the repository:
```bash
git clone https://github.com/i-amprince/CadenceCode.git
cd CadenceCode
```

### Backend Setup

#### 2. Navigate to the `Server` directory and install dependencies:
```bash
cd Server
npm install
```

#### 3. Create a `.env` file in the `Server` folder:
Create a file named `.env` and populate it with your environment variables. Refer to `.env.example` for the structure.
```env
# Server Configuration
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
CLIENT_URL=http://localhost:3000

# API Keys
JUDGE0_API_KEY=your_judge0_api_key
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com

# Authentication
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_super_strong_random_jwt_secret

# CORS Configuration
# Use "*" for development if you face issues, but be more specific in production.
CORS_ORIGIN=*
```
*   Replace `your_mongodb_atlas_connection_string` with your actual connection string from MongoDB Atlas.
*   Replace `your_judge0_api_key` with your key from RapidAPI.
*   Replace `your_google_client_id` with your Google OAuth 2.0 Client ID.
*   Replace `your_super_strong_random_jwt_secret` with a long, random, and secret key.

#### 4. Start the backend server:
```bash
npm start
```
The backend server will run on `http://localhost:5000`.

### Frontend Setup

#### 5. Navigate to the `frontend` directory and install dependencies:
```bash
cd ../frontend
npm install
```

#### 6. Create a `.env` file in the `frontend` folder:
```env
# The backend URL for the React app to connect to.
# For local development, this points to your local server.
# For production, this points to your deployed backend.
REACT_APP_BACKEND_URL=http://localhost:5000

# Google Client ID for the frontend authentication flow.
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
```
*   Ensure `your_google_client_id` is the **same** one used in the backend.

#### 7. Start the frontend development server:
```bash
npm start
```
The application will open in your browser, typically at **[http://localhost:3000](http://localhost:3000)**.

---

## 🤝 Contributing

Contributions are always welcome! If you have suggestions for improvements, new features, or bug fixes, please feel free to open an issue or submit a pull request.

---

## 📝 License

This project is licensed under the MIT License.

---

> Built with ❤️ by [Prince](https://github.com/i-amprince)
