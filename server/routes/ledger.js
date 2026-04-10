// server/routes/ledger.js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/ledger — Get all ledger entries (newest first)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM ledger ORDER BY date DESC, id DESC`
    );

    const ledger = rows.map(row => ({
      id: row.id,
      date: row.date,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      transaction: row.transaction_desc,
      status: row.status,
      balancesAfter: row.bal_vacation_leave !== null ? {
        vacationLeave: parseFloat(row.bal_vacation_leave),
        sickLeave: parseFloat(row.bal_sick_leave),
        specialLeave: parseFloat(row.bal_special_leave),
        forceLeave: parseFloat(row.bal_force_leave),
        wellnessLeave: parseFloat(row.bal_wellness_leave),
        soloParentLeave: parseFloat(row.bal_solo_parent_leave),
      } : null
    }));

    res.json(ledger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
