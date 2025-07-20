import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

import { ChatController } from './controllers/ChatController';
import { ScriptController } from './controllers/ScriptController';
import databaseService from './services/database';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const chatController = new ChatController(io);
const scriptController = new ScriptController(io);

app.use('/api/chat', chatController.getRouter());
app.use('/api/scripts', scriptController.getRouter());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

async function startServer() {
  try {
    // Connect to MongoDB
    await databaseService.connect();
    console.log('Connected to MongoDB successfully');

    // Start the server
    server.listen(PORT, () => {
      console.log(`ScriptForge server running on port ${PORT}`);
      console.log(`MongoDB URI: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/scriptforge'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await databaseService.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await databaseService.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();