import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/alerts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `UPDATE alerts SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

export default router;
