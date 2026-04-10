// server/index.js
import express from 'express';
import cors from 'cors';
import employeesRouter from './routes/employees.js';
import applicationsRouter from './routes/applications.js';
import ledgerRouter from './routes/ledger.js';
import systemRouter from './routes/system.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/system', systemRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 ELRMS Backend running on http://localhost:${PORT}`);
});
