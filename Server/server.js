// server/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // For making API requests
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

const userSocketMap = {}; //store id and name in here

function getAllConnectedClients(roomId) {
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    return clients.map((socketId) => ({
        socketId,
        username: userSocketMap[socketId],
    }));
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('JOIN', ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);
        io.in(roomId).emit('JOINED', {
            clients,
            username,
            socketId: socket.id,
        });
    });

    socket.on('CODE_CHANGE', ({ roomId, code }) => {
        socket.to(roomId).emit('CODE_CHANGE', { code });
    });

    socket.on('SYNC_CODE', ({ socketId, code }) => {
        io.to(socketId).emit('CODE_CHANGE', { code });
    });

    // The RUN_CODE listener that calls the Judge0 API
    socket.on('RUN_CODE', async ({ code, languageId }) => {
        const L_ID = languageId || 93; // Default to JavaScript if not provided

        const submissionOptions = {
            method: 'POST',
            url: 'https://judge0-ce.p.rapidapi.com/submissions',
            params: { base64_encoded: 'false', fields: '*' },
            headers: {
                'content-type': 'application/json',
                'X-RapidAPI-Key': 'd79b06c1ccmshf3d09d3d252ce64p17a1c7jsna1919a91c387', // Your key value
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

            // Function to poll for the result
            const checkStatus = async () => {
                const resultOptions = {
                    method: 'GET',
                    url: `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
                    params: { base64_encoded: 'false', fields: '*' },
                    headers: {
                        'X-RapidAPI-Key': 'd79b06c1ccmshf3d09d3d252ce64p17a1c7jsna1919a91c387', // Your key value
                        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
                    },
                };

                const resultResponse = await axios.request(resultOptions);
                const statusId = resultResponse.data.status.id;

                if (statusId === 1 || statusId === 2) { // In Queue or Processing
                    setTimeout(checkStatus, 2000); // Check again in 2 seconds
                    return;
                }

                // Execution finished, format and send the output
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

            checkStatus(); // Start polling
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

const PORT = 5000;
server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));