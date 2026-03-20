const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Network Bouncer: Handles CORS and massive buffer size for image uploads
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // Allows massive image uploads (100MB buffer)
});

// Master Game State
const players = {};
const hubs = {}; // Notes, Images, AI summaries for each hubId (id)

io.on('connection', (socket) => {
  console.log(`[+] New Connection Established: ${socket.id}`);

  // 🚀 SPAWN FIX: Spawning at Z: 25 safely on the South Road, perfectly outside the Central Fountain's concrete walls.
  players[socket.id] = {
    x: 0,
    y: 0,
    z: 25, 
    msg: "",
    action: "idle",
    rotationY: 0,
    username: `Student-${socket.id.substring(0,4)}` 
  };

  // Initialize their personal storage hub on join
  if (!hubs[socket.id]) {
    hubs[socket.id] = { notes: "", images: [] };
  }

  // Send current state to the new player
  socket.emit('currentPlayers', players);
  socket.emit('hubDataState', hubs); 
  socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

  // Update their username identity
  socket.on('setUsername', (customName) => {
    if (players[socket.id]) {
      console.log(`[Identity] ${socket.id.substring(0,4)} is now known as: ${customName}`);
      players[socket.id].username = customName;
      io.emit('currentPlayers', players);
    }
  });

  // Handle Player Movement (Arrow keys + Shift)
  socket.on('move', (movementData) => {
    if(players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].z = movementData.z;
      players[socket.id].action = movementData.action || "idle"; 
      players[socket.id].rotationY = movementData.rotationY || 0;
      
      socket.broadcast.emit('playerMoved', { 
        id: socket.id, 
        x: movementData.x, 
        z: movementData.z, 
        action: movementData.action,
        rotationY: movementData.rotationY 
      });
    }
  });

  // Handle Chat Ledger (Text Chat)
  socket.on('chat', (message) => {
    if(players[socket.id]) {
      const senderName = players[socket.id].username;
      console.log(`[Chat] ${senderName}: ${message}`);
      
      players[socket.id].msg = message;
      socket.broadcast.emit('chatMessage', { id: socket.id, sender: senderName, msg: message });

      // Expire chat from the 3D text field after 5s
      setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].msg = "";
          socket.broadcast.emit('chatMessage', { id: socket.id, sender: senderName, msg: "" });
        }
      }, 5000);
    }
  });

  // Hub Data Sync (AI Notes + Images)
  socket.on('updateHubData', (data) => {
    if (!hubs[data.hubId]) hubs[data.hubId] = { notes: "", images: [] };
    
    if (data.notes !== undefined) hubs[data.hubId].notes = data.notes;
    if (data.images !== undefined) hubs[data.hubId].images = data.images;
    
    socket.broadcast.emit('hubDataUpdated', { hubId: data.hubId, hubData: hubs[data.hubId] });
  });

  // WebRTC Signaling Router (For Voice Chat)
  socket.on('webrtc-offer', (data) => {
    socket.to(data.to).emit('webrtc-offer', { from: socket.id, offer: data.offer });
  });

  socket.on('webrtc-answer', (data) => {
    socket.to(data.to).emit('webrtc-answer', { from: socket.id, answer: data.answer });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    socket.to(data.to).emit('webrtc-ice-candidate', { from: socket.id, candidate: data.candidate });
  });

  socket.on('disconnect', () => {
    console.log(`[-] Student Disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Start the Master Server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=========================================`);
  console.log(`🟢 SPATIAL-CONNECT MASTER SERVER RUNNING`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Network: Listening on all local IPs`);
  console.log(`=========================================\n`);
});