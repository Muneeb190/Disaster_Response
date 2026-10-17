import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/resources
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, ST_AsText(location) AS location FROM resources ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// GET /api/resources/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, ST_AsText(location) AS location FROM resources WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Resource not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch resource' });
  }
});

// POST /api/resources
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type, quantity_available, quantity_reserved, latitude, longitude, low_stock_threshold } = req.body;

    let locationExpr = 'NULL';
    const params: unknown[] = [name, type, quantity_available, quantity_reserved, low_stock_threshold];
    let idx = params.length + 1;

    if (latitude !== undefined && longitude !== undefined) {
      locationExpr = `ST_GeomFromText($${idx++}, 4326)`;
      params.push(`POINT(${longitude} ${latitude})`);
    }

    const { rows } = await pool.query(
      `INSERT INTO resources (name, type, quantity_available, quantity_reserved, low_stock_threshold, location)
       VALUES ($1, $2, $3, $4, $5, ${locationExpr})
       RETURNING *, ST_AsText(location) AS location`,
      params
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create resource' });
  }
});

// PATCH /api/resources/:id
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
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE resources SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *, ST_AsText(location) AS location`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Resource not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update resource' });
  }
});

export default router;
