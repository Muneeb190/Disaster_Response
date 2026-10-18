import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db';
import incidentsRouter from './routes/incidents';
import teamsRouter from './routes/teams';
import resourcesRouter from './routes/resources';
import assignmentsRouter from './routes/assignments';
import alertsRouter from './routes/alerts';
import auditLogsRouter from './routes/auditLogs';
import dashboardRouter from './routes/dashboard';

const app = express();
const PORT = process.env.PORT || 3001;

// Parse allowed origins from env (comma-separated)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. Postman, Railway health checks)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Health check
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// API routes
app.use('/api/incidents', incidentsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/dashboard', dashboardRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ResQNet API running on port ${PORT}`);
});

export default app;
