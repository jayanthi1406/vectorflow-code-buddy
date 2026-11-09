const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Configure dotenv to load variables from backend/.env
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS and express.json middleware
app.use(cors());
app.use(express.json());

// Helper function to map Mongoose readyState numbers to readable status strings
const getMongoConnectionStatus = () => {
  const connectionStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return connectionStates[mongoose.connection.readyState] || 'unknown';
};

// Monitor MongoDB Atlas connection events
mongoose.connection.on('connected', () => {
  console.log('MongoDB Atlas connection established successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB Atlas disconnected.');
});

// Root route for initial verification
app.get('/', (req, res) => {
  res.json({
    message: 'Code Buddy Backend API is running.',
    healthEndpoint: '/api/health',
  });
});

// Health check endpoint reporting server and MongoDB connection status
app.get('/api/health', (req, res) => {
  const readyState = mongoose.connection.readyState;
  const isConnected = readyState === 1;

  res.status(isConnected ? 200 : 503).json({
    status: isConnected ? 'ok' : 'degraded',
    server: 'healthy',
    database: {
      status: getMongoConnectionStatus(),
      readyState,
    },
    timestamp: new Date().toISOString(),
  });
});

// Connect to MongoDB Atlas
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Database connection error: MONGO_URI is not defined in the backend environment.');
    return;
  }

  try {
    await mongoose.connect(mongoUri);
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
  }
};

// Start the server
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Code Buddy server running on port ${PORT}`);
  });
};

startServer();

module.exports = app;

