const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const MAX_MESSAGE_LENGTH = 2000;
const MAX_USER_ID_LENGTH = 50;
const USER_ID_PATTERN = /^.+#\d+$/;

app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handling middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let users = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', (rawUserId) => {
    if (typeof rawUserId !== 'string' || rawUserId.trim().length === 0) {
      return socket.emit('error_message', { error: 'User ID is required and must be a non-empty string.' });
    }
    const userId = rawUserId.trim();
    if (userId.length > MAX_USER_ID_LENGTH) {
      return socket.emit('error_message', { error: `User ID must not exceed ${MAX_USER_ID_LENGTH} characters.` });
    }
    if (!USER_ID_PATTERN.test(userId)) {
      return socket.emit('error_message', { error: 'User ID must follow the format TAG#NUMBER (e.g. FRZ#1500).' });
    }
    users[socket.id] = { id: userId };
    socket.emit('registered', { userId });
  });

  socket.on('send_message', (data) => {
    if (!data || typeof data !== 'object') {
      return socket.emit('error_message', { error: 'Message payload must be an object with "user" and "message" fields.' });
    }
    if (!users[socket.id]) {
      return socket.emit('error_message', { error: 'You must register before sending messages.' });
    }
    if (typeof data.message !== 'string' || data.message.trim().length === 0) {
      return socket.emit('error_message', { error: 'The "message" field is required and must be a non-empty string.' });
    }
    if (data.message.length > MAX_MESSAGE_LENGTH) {
      return socket.emit('error_message', { error: `Message must not exceed ${MAX_MESSAGE_LENGTH} characters.` });
    }
    io.emit('receive_message', { user: users[socket.id].id, message: data.message });
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

const SHUTDOWN_TIMEOUT = 10000;

function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Shutdown timed out. Forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
