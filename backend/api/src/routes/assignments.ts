import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/assignments
router.get('/', async (req: Request, res: Response) => {
  try {
    const { incident_id } = req.query;
    let query = `SELECT * FROM assignments`;
    const params: unknown[] = [];

    if (incident_id) {
      query += ` WHERE incident_id = $1`;
      params.push(incident_id);
    }

    query += ` ORDER BY assigned_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// GET /api/assignments/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM assignments WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// POST /api/assignments – calls the stored procedure
router.post('/', async (req: Request, res: Response) => {
  try {
    const { incidentId, teamId, resourceIds } = req.body;
    const { rows } = await pool.query(
      `SELECT create_assignment($1, $2, $3, $4) AS assignment_id`,
      [incidentId, teamId, resourceIds || [], 'coordinator']
    );
    res.status(201).json({ id: rows[0]?.assignment_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// PATCH /api/assignments/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, unknown>;
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE assignments SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// POST /api/assignments/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await pool.query(
      `SELECT cancel_assignment($1, $2, $3)`,
      [req.params.id, reason || 'Cancelled by coordinator', 'coordinator']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel assignment' });
  }
});

export default router;
