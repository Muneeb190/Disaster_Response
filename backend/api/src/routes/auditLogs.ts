import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/audit-logs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, limit = '20' } = req.query;

    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;

    if (entity_type) { query += ` AND entity_type = $${idx++}`; params.push(entity_type); }
    if (entity_id) { query += ` AND entity_id = $${idx++}`; params.push(entity_id); }

    query += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(parseInt(limit as string, 10));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
