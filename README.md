# CadenceCode: Real-Time Collaborative Code Editor

---

## 🚀 Overview

CadenceCode is a powerful, real-time collaborative code editor that allows developers to write, execute, and verbally discuss code together in a shared environment. Whether you're pair programming, conducting technical interviews, or brainstorming with a team, CadenceCode provides a seamless and interactive experience with voice chat, multi-language support, and robust collaboration features.

---

## ✨ Features

CadenceCode comes packed with features designed to enhance your collaborative coding experience:

* **Google Login:** Secure and convenient authentication using Google OAuth 2.0.
* **Real User Avatars:** See your collaborators' actual Google profile pictures for a more personal connection.
* **Dynamic Room System:** Easily create or join private coding rooms with unique IDs and optional password protection.
* **Real-Time Collaboration:** Experience instant code synchronization, allowing all users in a room to see changes as they happen.
* **Integrated Voice Chat (WebRTC):** Communicate seamlessly with your team using built-in, real-time voice calls. Includes mute/unmute controls for each participant and speaking indicators.
* **Enhanced User Management:** The room owner can kick disruptive users. The owner is clearly identified in the user list.
* **Multi-File Support:** Organize your projects efficiently by adding, editing, and switching between multiple files within a single room.
* **Remove File (Owner Only):** The room owner has the exclusive right to remove any file from the project.
* **Multi-Language Compatibility:** Write and run code in popular languages including **JavaScript, Python, C++,** and **Java**.
* **Cloud Code Execution:** Execute your code in the cloud via the **Judge0 API** and view the output instantly.
* **Checkpoints:** Never lose your work! Save and restore code checkpoints for individual files directly from the editor.
* **Integrated In-Room Chat:** Communicate effortlessly with your collaborators through the built-in text chat panel.
* **Responsive & Modern UI:** Enjoy a sleek, dark-themed, and mobile-friendly interface for a comfortable coding experience on any device.

---

## 💻 Technologies Used

CadenceCode is built using a modern and robust tech stack:

### Frontend

* **React:** A powerful JavaScript library for building interactive user interfaces.
* **React Router:** For declarative routing within the application.
* **React Hot Toast:** Elegant and responsive notifications.
* **CodeMirror:** A versatile in-browser code editor with auto-completion.
* **@react-oauth/google:** Seamless Google OAuth integration for React applications.
* **Avatar:** For displaying user avatars.
* **CSS Modules:** For scoped and modular styling.

### Backend

* **Node.js:** A JavaScript runtime for building scalable server-side applications.
* **Express.js:** A fast, unopinionated, minimalist web framework for Node.js.
* **MongoDB:** A NoSQL database for flexible data storage.
* **Mongoose:** An elegant MongoDB object modeling for Node.js.
* **JWT (JSON Web Tokens):** For secure authentication and authorization.
* **Google Auth Library:** For interacting with Google APIs.
* **Judge0 API:** A robust and scalable online judge system for code execution.

### Real-Time Communication

* **WebSockets (Socket.IO):** Enables live code synchronization and in-room chat.
* **WebRTC:** Powers real-time peer-to-peer voice communication.

### Authentication

* **Google OAuth 2.0:** Secure and industry-standard authentication protocol.

### Other

* **REST API:** For efficient client-server communication.
* **CORS:** To handle cross-origin resource sharing.
* **Environment Variables:** For secure configuration management.

---

## 📸 Screenshots

1. **Login Page**

   ![Login Page](src/Images/1.png)
   *Google OAuth login for secure authentication.*

2. **Room Entry**

   ![Room Entry](src/Images/2.png)
   *Enter Room ID, Username, and Room Password to join or create a room.*

3. **Main Editor (Owner's View)**

   ![Main Editor (Owner's View)](src/Images/3.png)
   *Collaborative editor with an enhanced user panel showing profile pictures, owner status, and voice controls. The owner has exclusive rights to remove files (note the × on tabs).*

4. **Main Editor (Collaborator's View)**

   ![Main Editor (Collaborator's View)](src/Images/4.png)
   *Experience seamless collaboration with real-time code sync, integrated text chat, and voice call controls.*

5. **Code Execution**

   ![Code Execution](src/Images/5.png)
   *Execute the code currently open in the editor and view the output instantly in the console.*

6. **Checkpoints**

   ![Checkpoints](src/Images/6.png)
   *Easily save and restore previous versions of your code for any file, ensuring you never lose progress.*

---

## 📦 Getting Started

Follow these steps to get CadenceCode up and running on your local machine.

### Prerequisites

* Node.js (LTS version recommended)
* npm (Node Package Manager)
* MongoDB (local instance or cloud-hosted)
* A Google Cloud Project with OAuth 2.0 Client ID configured.
* A RapidAPI account to obtain a Judge0 API Key.

### Installation

#### Clone the repository:

```bash
git clone https://github.com/i-amprince/CadenceCode.git
```

#### Navigate to the project directory:

```bash
cd CadenceCode
```

### Backend Setup

#### Navigate to the `Server` directory:

```bash
cd Server
```

#### Install backend dependencies:

```bash
npm install
```

#### Create a `.env` file:

Create a file named `.env` in the `Server` folder and populate it with your environment variables. You can refer to `.env.example` for the structure.

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/collab-editor
CLIENT_URL=http://localhost:3000

JUDGE0_API_KEY=your_judge0_api_key
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com

GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_super_strong_jwt_secret
```
* Replace `your_judge0_api_key` with your actual Judge0 API Key from RapidAPI.
* Replace `your_google_client_id` with your Google OAuth 2.0 Client ID.
* Replace `your_super_strong_jwt_secret` with a strong, random secret key for JWT.

#### Start the backend server:

```bash
npm start
```
The backend server will typically run on `http://localhost:5000`.

### Frontend Setup

#### Navigate back to the project root directory:

```bash
cd ../
```

#### Install frontend dependencies:

```bash
npm install
```

#### Create a `.env` file:

Create a file named `.env` in the root (frontend) folder and add your Google Client ID:

```env
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
```
* Replace `your_google_client_id` with the same Google OAuth 2.0 Client ID used in the backend.

#### Start the frontend development server:

```bash
npm start
```
The application will open in your browser, typically at [http://localhost:3000](http://localhost:3000).

---

## 🤝 Contributing

Contributions are always welcome! If you have suggestions for improvements, new features, or bug fixes, please feel free to open an issue or submit a pull request.

---

## 📝 License

This project is licensed under the MIT License

---

> Built with ❤️ by [Prince](https://github.com/i-amprince)