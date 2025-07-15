// src/socket.js

import { io } from 'socket.io-client';

// The server URL
const URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Create a single socket instance
// `autoConnect: false` is crucial - we will manually connect/disconnect
export const socket = io(URL, {
    autoConnect: false,
});