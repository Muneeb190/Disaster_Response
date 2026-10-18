import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/incidents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, priority, status, verification, limit } = req.query;

    let query = `
      SELECT
        id, report_code, type, description, area_landmark,
        people_affected, people_trapped, injuries_reported,
        vulnerable_people, danger_increasing,
        ST_AsText(location) AS location,
        priority_score, priority_level, priority_reasons,
        life_threatening, previous_priority_score, previous_priority_level,
        verification_status, status, assigned_team_id,
        reporter_name, reporter_phone, ai_extracted,
        coordinator_notes, photo_url, created_at, updated_at
      FROM incidents
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (type) { query += ` AND type = $${idx++}`; params.push(type); }
    if (priority) { query += ` AND priority_level = $${idx++}`; params.push(priority); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (verification) { query += ` AND verification_status = $${idx++}`; params.push(verification); }

    query += ` ORDER BY priority_score DESC, created_at DESC`;

    if (limit) { query += ` LIMIT $${idx++}`; params.push(parseInt(limit as string, 10)); }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// GET /api/incidents/by-code/:code
router.get('/by-code/:code', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, ST_AsText(location) AS location FROM incidents WHERE report_code = $1`,
      [req.params.code.toUpperCase()]
    );
    if (rows.length === 0) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// GET /api/incidents/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, ST_AsText(location) AS location FROM incidents WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// POST /api/incidents
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      type, description, area_landmark, people_affected,
      people_trapped, injuries_reported, vulnerable_people,
      danger_increasing, latitude, longitude, reporter_name, reporter_phone,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO incidents (
        type, description, area_landmark, people_affected,
        people_trapped, injuries_reported, vulnerable_people,
        danger_increasing, location, reporter_name, reporter_phone
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ST_GeomFromText($9,4326),$10,$11)
      RETURNING *, ST_AsText(location) AS location`,
      [
        type, description, area_landmark || null, people_affected,
        people_trapped, injuries_reported, vulnerable_people, danger_increasing,
        `POINT(${longitude} ${latitude})`,
        reporter_name || null, reporter_phone || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// PATCH /api/incidents/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, unknown>;
    const { latitude, longitude, ...rest } = updates as Record<string, unknown> & { latitude?: number; longitude?: number };

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
      `UPDATE incidents SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *, ST_AsText(location) AS location`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

// POST /api/incidents/:id/recalculate
router.post('/:id/recalculate', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT recalculate_incident_priority($1, $2) AS result`,
      [req.params.id, 'coordinator']
    );
    res.json(rows[0]?.result ?? {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to recalculate priority' });
  }
});

// GET /api/incidents/:id/escalations
router.get('/:id/escalations', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM escalations WHERE incident_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch escalations' });
  }
});

// GET /api/incidents/:id/recommendations
router.get('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM recommend_teams($1)`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

export default router;
