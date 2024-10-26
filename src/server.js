import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = process.env.NODE_ENV === 'production' ? '/data' : join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database setup with persistent storage
const dbPath = join(dataDir, 'lawyers.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    console.log('Database path:', dbPath);
  }
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://cute-bunny-5f3990.netlify.app'
}));
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS lawyers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    barNumber TEXT,
    city TEXT,
    zip TEXT,
    profilePhoto TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('Database table initialized');
    }
  });
});

// API Routes
app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    // Validate required fields
    const requiredFields = ['firstName', 'lastName'];
    
    for (const row of data) {
      const missingFields = requiredFields.filter(field => !row[field]);
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
    }

    // Insert data into database
    data.forEach(row => {
      db.run(
        `INSERT INTO lawyers (firstName, lastName, phone, email, barNumber, city, zip, profilePhoto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.firstName,
          row.lastName,
          row.phone || null,
          row.email || null,
          row.barNumber || null,
          row.city || null,
          row.zip || null,
          row.profilePhoto || null
        ],
        function(err) {
          if (err) {
            console.error('Error inserting record:', err);
          }
        }
      );
    });

    res.json({ success: true, message: `Imported ${data.length} records` });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});