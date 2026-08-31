// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const routes = require('./routes');
const { init } = require('./utils/memoryStore');
const wa = require('./services/whatsappService');
const { startScheduler } = require('./utils/campaignScheduler');
const {
  startOneDayReminderScheduler,
} = require('./utils/oneDayReminderScheduler');

// ✅ Create Express app BEFORE using middleware
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

//app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);

// ✅ Enable CORS globally
// Reflect the caller's Origin instead of "*" — the combination of
// `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`
// is invalid and causes browsers (and Flutter web via dart:html fetch) to reject
// the response with "Failed to fetch". Echoing the request Origin fixes this.
// const allowedOrigins = (process.env.CORS_ORIGINS || '')
//   .split(',')
//   .map((o) => o.trim())
//   .filter(Boolean);


// comment by abhi..
// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // Allow non-browser tools (no Origin header) and listed/localhost origins
//       if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
//         callback(null, origin || '*');
//       } else if (allowedOrigins.length === 0) {
//         // No explicit allow-list configured: allow any origin but without
//         // the invalid "* + credentials" combo (echo the origin instead).
//         callback(null, origin);
//       } else {
//         callback(new Error('Not allowed by CORS'));
//       }
//     },
//     credentials: true,
//   }),
// );

app.use(cors({
  origin:"*",
  credentials:true
}))


// ✅ Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

//For Checking Deployment 
app.get('/',(req,res)=>{
  res.json({
    success:true,
    message:'WhatsApp Suite API is running'
  });
});


// ✅ Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ✅ API routes
app.use('/api', routes);

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WhatsApp API',
    time: new Date().toISOString(),
  });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack || err.message);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error',
  });
});

// ✅ Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Share Socket.IO with WhatsApp service (QR + auth events)
wa.setSocketIO(io);
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;

async function start() {
  let isMongoConnected=false;
  try {
    const connect=typeof connectDB === 'function'? connectDB : connectDB.connectDB;
    if (connect) {
      isMongoConnected = await connect();
      console.log('MongoDB connected (or memory fallback)');
    }
  } catch (err) {
    console.error('DB connect:', err.message);
    console.log('Continuing with memory mode');
  }

  // Memory data sirf tab load hoga jab MongoDB connect nahi hoga
  if (!isMongoConnected) {
    try {
      await init();
    } catch (_) {}
  }

  // Restore previously saved WhatsApp sessions BEFORE starting schedulers
try {
  if (typeof wa.restoreSessions === 'function') {
    await wa.restoreSessions();
    console.log('[WA] Previous WhatsApp sessions restored');
  } else {
    console.log('[WA] restoreSessions function not available');
  }
} catch (error) {
  console.error('[WA] Session restore failed:', error.message);
}

// Start schedulers only after WhatsApp sessions are restored
startScheduler();
startOneDayReminderScheduler();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Another instance may still be running. ` +
          `Stop it (e.g. "taskkill /PID <pid> /F") or set a different PORT in your .env.`,
      );
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsApp Suite API running on port ${PORT}`);
    console.log('Demo login: admin@whatsappsuite.com / admin123');
  });
}

start();
