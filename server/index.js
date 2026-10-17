import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, query } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await query('SELECT NOW() as now, version() as version');
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: dbRes.rows[0].now,
      version: dbRes.rows[0].version,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
    });
  }
});

// ==================== INCIDENTS ====================

// List incidents
app.get('/api/incidents', async (req, res) => {
  try {
    const { type, priority, status, verification, limit } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (type) {
      conditions.push(`type = $${idx++}`);
      values.push(type);
    }
    if (priority) {
      conditions.push(`priority_level = $${idx++}`);
      values.push(priority);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }
    if (verification) {
      conditions.push(`verification_status = $${idx++}`);
      values.push(verification);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = limit ? `LIMIT $${idx++}` : '';
    if (limit) values.push(parseInt(limit, 10));

    const sql = `
      SELECT id, report_code, type, description, area_landmark, people_affected,
             people_trapped, injuries_reported, vulnerable_people, danger_increasing,
             ST_AsText(location) as location,
             priority_score, priority_level, priority_reasons, life_threatening,
             previous_priority_score, previous_priority_level, verification_status,
             status, assigned_team_id, reporter_name, reporter_phone, ai_extracted,
             coordinator_notes, photo_url, created_at, updated_at
      FROM incidents
      ${whereClause}
      ORDER BY priority_score DESC, created_at DESC
      ${limitClause}
    `;

    const result = await query(sql, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single incident by ID
app.get('/api/incidents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT id, report_code, type, description, area_landmark, people_affected,
             people_trapped, injuries_reported, vulnerable_people, danger_increasing,
             ST_AsText(location) as location,
             priority_score, priority_level, priority_reasons, life_threatening,
             previous_priority_score, previous_priority_level, verification_status,
             status, assigned_team_id, reporter_name, reporter_phone, ai_extracted,
             coordinator_notes, photo_url, created_at, updated_at
      FROM incidents
      WHERE id = $1
    `;
    const result = await query(sql, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single incident by report code
app.get('/api/incidents/code/:reportCode', async (req, res) => {
  try {
    const { reportCode } = req.params;
    const sql = `
      SELECT id, report_code, type, description, area_landmark, people_affected,
             people_trapped, injuries_reported, vulnerable_people, danger_increasing,
             ST_AsText(location) as location,
             priority_score, priority_level, priority_reasons, life_threatening,
             previous_priority_score, previous_priority_level, verification_status,
             status, assigned_team_id, reporter_name, reporter_phone, ai_extracted,
             coordinator_notes, photo_url, created_at, updated_at
      FROM incidents
      WHERE UPPER(report_code) = UPPER($1)
    `;
    const result = await query(sql, [reportCode]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create incident
app.post('/api/incidents', async (req, res) => {
  try {
    const {
      type,
      description,
      area_landmark,
      people_affected = 0,
      people_trapped = 'unknown',
      injuries_reported = 'unknown',
      vulnerable_people = 'unknown',
      danger_increasing = 'unknown',
      latitude,
      longitude,
      reporter_name,
      reporter_phone,
    } = req.body;

    const sql = `
      INSERT INTO incidents (
        type, description, area_landmark, people_affected,
        people_trapped, injuries_reported, vulnerable_people, danger_increasing,
        location, reporter_name, reporter_phone
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography, $11, $12)
      RETURNING id, report_code, type, description, area_landmark, people_affected,
                people_trapped, injuries_reported, vulnerable_people, danger_increasing,
                ST_AsText(location) as location, priority_score, priority_level,
                priority_reasons, life_threatening, verification_status, status,
                created_at, updated_at
    `;

    const values = [
      type,
      description,
      area_landmark || null,
      people_affected,
      people_trapped,
      injuries_reported,
      vulnerable_people,
      danger_increasing,
      longitude,
      latitude,
      reporter_name || null,
      reporter_phone || null,
    ];

    const result = await query(sql, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update incident
app.patch('/api/incidents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'status',
      'verification_status',
      'coordinator_notes',
      'assigned_team_id',
      'people_trapped',
      'injuries_reported',
      'vulnerable_people',
      'danger_increasing',
      'people_affected',
      'description',
      'area_landmark',
    ];

    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of Object.keys(req.body)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields provided to update' });

    values.push(id);
    const sql = `
      UPDATE incidents
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, report_code, type, description, area_landmark, people_affected,
                people_trapped, injuries_reported, vulnerable_people, danger_increasing,
                ST_AsText(location) as location, priority_score, priority_level,
                priority_reasons, life_threatening, verification_status, status,
                assigned_team_id, coordinator_notes, updated_at
    `;

    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recalculate priority
app.post('/api/incidents/:id/recalculate', async (req, res) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor || 'coordinator';
    const result = await query(
      'SELECT * FROM recalculate_incident_priority($1::uuid, $2::text)',
      [id, actor]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEAMS ====================

app.get('/api/teams', async (req, res) => {
  try {
    const sql = `
      SELECT id, team_code, name, capabilities, equipment, capacity, status,
             ST_AsText(location) as location, current_assignment_id,
             last_location_update, created_at, updated_at
      FROM rescue_teams
      ORDER BY name ASC
    `;
    const result = await query(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teams', async (req, res) => {
  try {
    const { name, capabilities = [], equipment = [], capacity = 4, latitude, longitude } = req.body;
    const sql = `
      INSERT INTO rescue_teams (name, capabilities, equipment, capacity, location)
      VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)
      RETURNING id, team_code, name, capabilities, equipment, capacity, status,
                ST_AsText(location) as location, created_at, updated_at
    `;
    const result = await query(sql, [name, capabilities, equipment, capacity, longitude, latitude]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, ...rest } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of Object.keys(rest)) {
      if (['name', 'capabilities', 'equipment', 'capacity', 'status'].includes(key)) {
        updates.push(`${key} = $${idx++}`);
        values.push(rest[key]);
      }
    }

    if (latitude !== undefined && longitude !== undefined) {
      updates.push(`location = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)::geography`);
      updates.push(`last_location_update = NOW()`);
      values.push(longitude, latitude);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    const sql = `
      UPDATE rescue_teams
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, team_code, name, capabilities, equipment, capacity, status,
                ST_AsText(location) as location, last_location_update, updated_at
    `;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teams/recommendations/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const result = await query('SELECT * FROM recommend_teams($1::uuid)', [incidentId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RESOURCES ====================

app.get('/api/resources', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, type, quantity_available, quantity_reserved,
             ST_AsText(location) as location, low_stock_threshold,
             created_at, updated_at
      FROM resources
      ORDER BY name ASC
    `;
    const result = await query(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resources', async (req, res) => {
  try {
    const { name, type, quantity_available = 0, quantity_reserved = 0, low_stock_threshold = 5, latitude, longitude } = req.body;
    let sql, values;
    if (latitude !== undefined && longitude !== undefined) {
      sql = `
        INSERT INTO resources (name, type, quantity_available, quantity_reserved, low_stock_threshold, location)
        VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography)
        RETURNING id, name, type, quantity_available, quantity_reserved, ST_AsText(location) as location, low_stock_threshold, created_at, updated_at
      `;
      values = [name, type, quantity_available, quantity_reserved, low_stock_threshold, longitude, latitude];
    } else {
      sql = `
        INSERT INTO resources (name, type, quantity_available, quantity_reserved, low_stock_threshold)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, type, quantity_available, quantity_reserved, ST_AsText(location) as location, low_stock_threshold, created_at, updated_at
      `;
      values = [name, type, quantity_available, quantity_reserved, low_stock_threshold];
    }
    const result = await query(sql, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, ...rest } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of Object.keys(rest)) {
      if (['name', 'type', 'quantity_available', 'quantity_reserved', 'low_stock_threshold'].includes(key)) {
        updates.push(`${key} = $${idx++}`);
        values.push(rest[key]);
      }
    }

    if (latitude !== undefined && longitude !== undefined) {
      updates.push(`location = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)::geography`);
      values.push(longitude, latitude);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    const sql = `
      UPDATE resources
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, name, type, quantity_available, quantity_reserved, ST_AsText(location) as location, low_stock_threshold, updated_at
    `;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Resource not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ASSIGNMENTS ====================

app.get('/api/assignments', async (req, res) => {
  try {
    const sql = `
      SELECT id, incident_id, team_id, resource_ids, status, assigned_at,
             dispatched_at, completed_at, cancelled_at, cancellation_reason, notes, updated_at
      FROM assignments
      ORDER BY assigned_at DESC
    `;
    const result = await query(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assignments/incident/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const sql = `
      SELECT id, incident_id, team_id, resource_ids, status, assigned_at,
             dispatched_at, completed_at, cancelled_at, cancellation_reason, notes, updated_at
      FROM assignments
      WHERE incident_id = $1
      ORDER BY assigned_at DESC
    `;
    const result = await query(sql, [incidentId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments', async (req, res) => {
  try {
    const { incidentId, teamId, resourceIds = [], actor = 'coordinator' } = req.body;
    const sql = 'SELECT create_assignment($1::uuid, $2::uuid, $3::uuid[], $4::text) as assignment_id';
    const result = await query(sql, [incidentId, teamId, resourceIds, actor]);
    res.status(201).json({ assignment_id: result.rows[0].assignment_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of Object.keys(req.body)) {
      if (['status', 'notes', 'dispatched_at', 'completed_at'].includes(key)) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    const sql = `
      UPDATE assignments
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '', actor = 'coordinator' } = req.body;
    await query('SELECT cancel_assignment($1::uuid, $2::text, $3::text)', [id, reason, actor]);
    res.json({ message: 'Assignment cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ALERTS ====================

app.get('/api/alerts', async (req, res) => {
  try {
    const sql = `
      SELECT id, incident_id, type, severity, message, acknowledged, acknowledged_at, dedup_key, created_at
      FROM alerts
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const result = await query(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alerts/:id/ack', async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `
      UPDATE alerts
      SET acknowledged = true, acknowledged_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ESCALATIONS & AUDIT LOGS ====================

app.get('/api/escalations/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const sql = `
      SELECT id, incident_id, previous_score, new_score, previous_level, new_level, reason,
             acknowledged, acknowledged_by, acknowledged_at, created_at
      FROM escalations
      WHERE incident_id = $1
      ORDER BY created_at DESC
    `;
    const result = await query(sql, [incidentId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const { entityType, entityId, limit = 20 } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (entityType) {
      conditions.push(`entity_type = $${idx++}`);
      values.push(entityType);
    }
    if (entityId) {
      conditions.push(`entity_id = $${idx++}`);
      values.push(entityId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit, 10));

    const sql = `
      SELECT id, actor, action, entity_type, entity_id, previous_values, new_values, reason, created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `;

    const result = await query(sql, values);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DASHBOARD SUMMARY ====================

app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const [incidentsRes, teamsRes, resourcesRes, assignmentsRes, alertsRes] = await Promise.all([
      query('SELECT status, priority_level FROM incidents'),
      query('SELECT status, capacity FROM rescue_teams'),
      query('SELECT quantity_available, quantity_reserved, low_stock_threshold, type FROM resources'),
      query('SELECT status FROM assignments'),
      query('SELECT acknowledged FROM alerts'),
    ]);

    const incData = incidentsRes.rows;
    const teamData = teamsRes.rows;
    const resData = resourcesRes.rows;
    const asgnData = assignmentsRes.rows;
    const alertData = alertsRes.rows;

    const openIncidents = incData.filter((i) => !['resolved', 'cancelled'].includes(i.status)).length;
    const criticalIncidents = incData.filter((i) => i.priority_level === 'critical' && !['resolved', 'cancelled'].includes(i.status)).length;
    const availableTeams = teamData.filter((t) => t.status === 'available').length;
    const resourceShortages = resData.filter((r) => r.quantity_available <= r.low_stock_threshold).length;
    const resolvedIncidents = incData.filter((i) => i.status === 'resolved').length;
    const activeAssignments = asgnData.filter((a) => ['assigned', 'dispatched'].includes(a.status)).length;
    const unacknowledgedAlerts = alertData.filter((a) => !a.acknowledged).length;

    res.json({
      openIncidents,
      criticalIncidents,
      availableTeams,
      resourceShortages,
      totalIncidents: incData.length,
      resolvedIncidents,
      totalTeams: teamData.length,
      totalResources: resData.length,
      activeAssignments,
      unacknowledgedAlerts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`ResQNet PostgreSQL API server running on port ${PORT}`);
});
