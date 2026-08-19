const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const roomRoutes = require('./routes/roomRoutes');
const courseRoutes = require('./routes/courseRoutes');
const instructorRoutes = require('./routes/instructorRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const requestRoutes = require('./routes/requestRoutes');

const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Persistent Express Session Setup (30-day Cookie Lifetime)
app.use(session({
  secret: 'uet_ksk_centralized_timetable_persistent_secret_2026',
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days persistent session
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/requests', requestRoutes);

// Fallback to index.html for Single Page Architecture
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Port fallback launcher
function startServer(port) {
  const server = app.listen(port, async () => {
    try {
      await initDatabase();
      console.log('====================================');
      console.log('🏛️ UET KSK University Timetable Server Running!');
      console.log(`📍 Local URL: http://localhost:${port}`);
      console.log('====================================');
    } catch (err) {
      console.error('Failed to initialize database:', err);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server startup error:', err);
    }
  });
}

startServer(PORT);
