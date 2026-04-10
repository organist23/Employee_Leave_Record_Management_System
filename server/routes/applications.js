// server/routes/applications.js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Helper: Add ledger entry
async function addLedgerEntry(conn, employeeId, transaction, status) {
  // Get current balances for snapshot
  const [balRows] = await conn.execute(
    `SELECT * FROM leave_balances WHERE employee_id = ?`, [employeeId]
  );
  const bal = balRows[0];
  const balances = bal ? {
    vacationLeave: parseFloat(bal.vacation_leave),
    sickLeave: parseFloat(bal.sick_leave),
    specialLeave: parseFloat(bal.special_leave),
    forceLeave: parseFloat(bal.force_leave),
    wellnessLeave: parseFloat(bal.wellness_leave),
    soloParentLeave: parseFloat(bal.solo_parent_leave),
  } : null;

  await conn.execute(
    `INSERT INTO ledger (employee_id, employee_name, transaction_desc, status,
      bal_vacation_leave, bal_sick_leave, bal_special_leave,
      bal_force_leave, bal_wellness_leave, bal_solo_parent_leave)
     VALUES (?, (SELECT COALESCE((SELECT full_name FROM employees WHERE id = ?), 'System')),
      ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId, employeeId, transaction, status,
      balances ? balances.vacationLeave : null,
      balances ? balances.sickLeave : null,
      balances ? balances.specialLeave : null,
      balances ? balances.forceLeave : null,
      balances ? balances.wellnessLeave : null,
      balances ? balances.soloParentLeave : null,
    ]
  );
}

// Mapping from leave type name to DB column
const typeToColumn = {
  'Vacation Leave': 'vacation_leave',
  'Sick Leave': 'sick_leave',
  'Special Leave': 'special_leave',
  'Force Leave': 'force_leave',
  'Wellness Leave': 'wellness_leave',
  'Solo Parent Leave': 'solo_parent_leave'
};

// GET /api/applications — Get all
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM leave_applications ORDER BY applied_at DESC`
    );
    const applications = rows.map(row => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      type: row.leave_type,
      dateFrom: row.date_from,
      dateTo: row.date_to,
      numDays: parseFloat(row.num_days),
      reason: row.reason,
      status: row.status,
      appliedAt: row.applied_at
    }));
    res.json(applications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications — Create new leave application
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { employeeId, employeeName, type, dateFrom, dateTo, numDays, reason } = req.body;

    await conn.execute(
      `INSERT INTO leave_applications (employee_id, employee_name, leave_type, date_from, date_to, num_days, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Approval')`,
      [employeeId, employeeName, type, dateFrom, dateTo, numDays, reason || '']
    );

    await addLedgerEntry(conn, employeeId, `Leave Request: ${numDays} Days ${type}`, 'Pending Approval');
    await conn.commit();

    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/applications/:id/approve — Approve application (with deduction logic)
router.post('/:id/approve', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get application
    const [appRows] = await conn.execute(
      `SELECT * FROM leave_applications WHERE id = ?`, [req.params.id]
    );
    if (appRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appRows[0];
    if (app.status !== 'Pending Approval') {
      await conn.rollback();
      return res.status(400).json({ error: 'Application is not pending' });
    }

    // Update application status
    await conn.execute(
      `UPDATE leave_applications SET status = 'Approved' WHERE id = ?`, [req.params.id]
    );

    const dbColumn = typeToColumn[app.leave_type];
    if (!dbColumn) {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown leave type' });
    }

    // Get current balance
    const [balRows] = await conn.execute(
      `SELECT * FROM leave_balances WHERE employee_id = ?`, [app.employee_id]
    );
    if (balRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Employee balances not found' });
    }

    const currentBalance = parseFloat(balRows[0][dbColumn]);
    const appliedDays = parseFloat(app.num_days);

    // Determine if earned or privilege leave
    const isEarnedLeave = dbColumn === 'vacation_leave' || dbColumn === 'sick_leave';

    if (!isEarnedLeave) {
      // STRICT ENFORCEMENT for Privileges
      if (currentBalance < appliedDays) {
        await conn.rollback();
        return res.status(400).json({ error: `Insufficient ${app.leave_type} privileges.` });
      }

      const newBalance = currentBalance - appliedDays;
      await conn.execute(
        `UPDATE leave_balances SET ${dbColumn} = ? WHERE employee_id = ?`,
        [newBalance, app.employee_id]
      );

      await addLedgerEntry(conn, app.employee_id, `Approved: ${appliedDays.toFixed(3)} Days ${app.leave_type}`, 'Approved');
    } else {
      // EARNED LEAVE (VL/SL) - Support Split (with pay / without pay)
      const paidDays = Math.min(appliedDays, currentBalance);
      const unpaidDays = Math.max(0, appliedDays - paidDays);
      const newBalance = currentBalance - paidDays;

      await conn.execute(
        `UPDATE leave_balances SET ${dbColumn} = ? WHERE employee_id = ?`,
        [newBalance, app.employee_id]
      );

      const detail = unpaidDays > 0
        ? `${app.num_days} Days ${app.leave_type} (${paidDays.toFixed(3)} Under Time w/ Pay, ${unpaidDays.toFixed(3)} w/o Pay)`
        : `${app.num_days} Days ${app.leave_type} (All Under Time w/ Pay)`;

      await addLedgerEntry(conn, app.employee_id, `Approved: ${detail}`, 'Approved');
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/applications/:id/reject — Reject application
router.post('/:id/reject', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [appRows] = await conn.execute(
      `SELECT * FROM leave_applications WHERE id = ?`, [req.params.id]
    );
    if (appRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appRows[0];
    await conn.execute(
      `UPDATE leave_applications SET status = 'Rejected' WHERE id = ?`, [req.params.id]
    );

    await addLedgerEntry(conn, app.employee_id, `Rejected: ${app.num_days} Days ${app.leave_type}`, 'Rejected');
    await conn.commit();

    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

export default router;
