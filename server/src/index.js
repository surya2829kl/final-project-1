import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import DailyActivity from './models/DailyActivity.js';
import api from './routes/api.js';
import auth from './routes/auth.js';

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', auth);
app.use('/api', api);

app.use((error, _req, res, _next) => {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Something went wrong on the server.' });
});

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required. Copy server/.env.example to server/.env and configure MongoDB.');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is required and must be at least 32 characters. Add a random secret to server/.env.');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await DailyActivity.collection.dropIndex('day_1');
  } catch (error) {
    if (error.code !== 27 && error.codeName !== 'IndexNotFound') throw error;
  }
  app.listen(port, () => {
    console.log(`FitFlow API listening on http://localhost:${port}`);
  });
} catch (error) {
  console.error('Unable to connect to MongoDB:', error.message);
  process.exit(1);
}
