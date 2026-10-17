import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/dashboard/summary
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [incidents, teams, resources, assignments, alerts] = await Promise.all([
      pool.query(`SELECT status, priority_level FROM incidents`),
      pool.query(`SELECT status FROM rescue_teams`),
      pool.query(`SELECT quantity_available, quantity_reserved, low_stock_threshold FROM resources`),
      pool.query(`SELECT status FROM assignments`),
      pool.query(`SELECT acknowledged FROM alerts`),
    ]);

    const incidentData = incidents.rows;
    const teamData = teams.rows;
    const resourceData = resources.rows;
    const assignmentData = assignments.rows;
    const alertData = alerts.rows;

    res.json({
      openIncidents: incidentData.filter((r) => !['resolved', 'cancelled'].includes(r.status)).length,
      criticalIncidents: incidentData.filter(
        (r) => r.priority_level === 'critical' && !['resolved', 'cancelled'].includes(r.status)
      ).length,
      availableTeams: teamData.filter((r) => r.status === 'available').length,
      resourceShortages: resourceData.filter(
        (r) => r.quantity_available <= r.low_stock_threshold
      ).length,
      totalIncidents: incidentData.length,
      resolvedIncidents: incidentData.filter((r) => r.status === 'resolved').length,
      totalTeams: teamData.length,
      totalResources: resourceData.length,
      activeAssignments: assignmentData.filter((r) =>
        ['assigned', 'dispatched'].includes(r.status)
      ).length,
      unacknowledgedAlerts: alertData.filter((r) => !r.acknowledged).length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
