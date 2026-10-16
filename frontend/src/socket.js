// src/socket.js

import { io } from 'socket.io-client';

// The server URL
const URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Create a single socket instance
export const socket = io(URL, {
    autoConnect: false, //we ll use socket.connect and disconnect functions to handle
    // Sent on every (re)connect; the server rejects sockets without a valid JWT.
    auth: (cb) => cb({ token: localStorage.getItem('token') }),
});

// For REST calls: the server reads the user from this token, not from the body.
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
