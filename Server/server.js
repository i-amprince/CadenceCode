const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const Code = require('./models/Code'); // MongoDB model

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/collab-editor', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// Map socketId to username
const userSocketMap = {};

// Helper: Get all clients in room
function getAllConnectedClients(roomId) {
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    return clients.map((socketId) => ({
        socketId,
        username: userSocketMap[socketId],
    }));
}

// Socket.IO logic
io.on('connection', (socket) => {
    console.log('🟢 User connected:', socket.id);

    socket.on('JOIN', async ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);

        // Load saved code from DB
        let existingCode = '';
        try {
            const doc = await Code.findOne({ roomId });
            if (doc) existingCode = doc.code;
        } catch (err) {
            console.error('Error loading code:', err);
        }

        io.in(roomId).emit('JOINED', {
            clients,
            username,
            socketId: socket.id,
        });

        // Sync code only to the new user
        if (existingCode) {
            socket.emit('CODE_CHANGE', { code: existingCode });
        }
    });

    // Broadcast code to others (but don't save in DB here)
    socket.on('CODE_CHANGE', ({ roomId, code }) => {
        socket.to(roomId).emit('CODE_CHANGE', { code });
    });

    // Manually save code on Save button click
    socket.on('SAVE_CODE', async ({ roomId, code }) => {
        try {
            await Code.findOneAndUpdate(
                { roomId },
                { code },
                { upsert: true, new: true }
            );

             socket.emit('SAVE_SUCCESS');
            console.log(`💾 Code saved manually for room: ${roomId}`);
        } catch (err) {
            console.error('Error saving code:', err);
        }
    });

    socket.on('SYNC_CODE', ({ socketId, code }) => {
        io.to(socketId).emit('CODE_CHANGE', { code });
    });

    // Run code using Judge0
    socket.on('RUN_CODE', async ({ code, languageId }) => {
        const L_ID = languageId || 93;

        const submissionOptions = {
            method: 'POST',
            url: 'https://judge0-ce.p.rapidapi.com/submissions',
            params: { base64_encoded: 'false', fields: '*' },
            headers: {
                'content-type': 'application/json',
                'X-RapidAPI-Key': 'd79b06c1ccmshf3d09d3d252ce64p17a1c7jsna1919a91c387',
                'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
            },
            data: {
                language_id: L_ID,
                source_code: code,
            },
        };

        try {
            const submissionResponse = await axios.request(submissionOptions);
            const token = submissionResponse.data.token;

            const checkStatus = async () => {
                const resultOptions = {
                    method: 'GET',
                    url: `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
                    params: { base64_encoded: 'false', fields: '*' },
                    headers: {
                        'X-RapidAPI-Key': 'd79b06c1ccmshf3d09d3d252ce64p17a1c7jsna1919a91c387',
                        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
                    },
                };

                const resultResponse = await axios.request(resultOptions);
                const statusId = resultResponse.data.status.id;

                if (statusId === 1 || statusId === 2) {
                    setTimeout(checkStatus, 2000);
                    return;
                }

                let output = [];
                if (resultResponse.data.stdout) {
                    output.push(...resultResponse.data.stdout.split('\n'));
                }
                if (resultResponse.data.stderr) {
                    output.push(...`[Error] ${resultResponse.data.stderr}`.split('\n'));
                }
                if (resultResponse.data.compile_output) {
                    output.push(...`[Compiler Error] ${resultResponse.data.compile_output}`.split('\n'));
                }

                output.push(`[Finished in ${resultResponse.data.time || 0}s, Memory: ${resultResponse.data.memory || 0}KB]`);
                socket.emit('CODE_OUTPUT', { output });
            };

            checkStatus();
        } catch (error) {
            let errorMessage = 'An API error occurred.';
            if (error.response && error.response.data) {
                errorMessage = error.response.data.error || JSON.stringify(error.response.data);
            }
            console.error('API Error:', errorMessage);
            socket.emit('CODE_OUTPUT', { output: [errorMessage] });
        }
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.to(roomId).emit('DISCONNECTED', {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

// Start server
const PORT = 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
