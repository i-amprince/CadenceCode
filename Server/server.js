const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const axios = require('axios');
const Code = require('./models/Code');
const authRoutes = require('./routes/Auth');
const roomRoutes = require('./routes/room');

const app = express();
const server = http.createServer(app);

app.use(express.json());
const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);


mongoose.connect('mongodb://localhost:27017/collab-editor', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const userSocketMap = {};

function getAllConnectedClients(roomId) {
  const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
  return clients.map((socketId) => ({
    socketId,
    username: userSocketMap[socketId]?.username,
    picture: userSocketMap[socketId]?.picture,
  }));
}

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  socket.on('JOIN', async ({ roomId, username, picture }) => {
    userSocketMap[socket.id] = { username, picture };
    socket.join(roomId);

    const clients = getAllConnectedClients(roomId);

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

    if (existingCode) {
      socket.emit('CODE_CHANGE', { code: existingCode });
    }
  });

  socket.on('CODE_CHANGE', ({ roomId, code }) => {
    socket.to(roomId).emit('CODE_CHANGE', { code });
  });

  socket.on('SAVE_CODE', async ({ roomId, code }) => {
  try {
    const room = await Code.findOne({ roomId });

    if (!room) {
      console.warn(`Room ${roomId} not found while saving code.`);
      return;
    }

    // Update the main code field
    room.code = code;

    // Add new checkpoint to the top of the array
    room.checkpoints.unshift({
      code,
      savedAt: new Date(),
    });

    // Trim the list to the latest 5 only
    room.checkpoints = room.checkpoints.slice(0, 5);

    await room.save();

    socket.emit('SAVE_SUCCESS');
    console.log(`💾 Code and checkpoint saved for room: ${roomId}`);
  } catch (err) {
    console.error('❌ Error saving checkpoint:', err);
  }
});


    //adeed now 
  socket.on('KICK_USER', ({ socketId }) => {
  const kickedSocket = io.sockets.sockets.get(socketId);
  if (kickedSocket) {
    kickedSocket.emit('KICKED');
    kickedSocket.disconnect();
  }
});


  socket.on('SYNC_CODE', ({ socketId, code }) => {
    io.to(socketId).emit('CODE_CHANGE', { code });
  });

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
        username: userSocketMap[socket.id]?.username,
      });
    });
    delete userSocketMap[socket.id];
    socket.leave();
  });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
