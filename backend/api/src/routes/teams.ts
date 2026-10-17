import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/teams
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, ST_AsText(location) AS location FROM rescue_teams ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// GET /api/teams/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, ST_AsText(location) AS location FROM rescue_teams WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// POST /api/teams
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, capabilities, equipment, capacity, latitude, longitude } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO rescue_teams (name, capabilities, equipment, capacity, location)
       VALUES ($1, $2, $3, $4, ST_GeomFromText($5, 4326))
       RETURNING *, ST_AsText(location) AS location`,
      [name, capabilities, equipment, capacity, `POINT(${longitude} ${latitude})`]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// PATCH /api/teams/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, ...rest } = req.body as Record<string, unknown> & { latitude?: number; longitude?: number };

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(rest)) {
      fields.push(`${key} = $${idx++}`);
      params.push(value);
    }

    if (latitude !== undefined && longitude !== undefined) {
      fields.push(`location = ST_GeomFromText($${idx++}, 4326)`);
      params.push(`POINT(${longitude} ${latitude})`);
      fields.push(`last_location_update = NOW()`);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE rescue_teams SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *, ST_AsText(location) AS location`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

export default router;
