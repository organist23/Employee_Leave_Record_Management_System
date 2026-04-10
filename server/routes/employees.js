// server/routes/employees.js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Helper: Build employee object with balances from joined row
function buildEmployeeObj(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    status: row.status,
    isActive: !!row.is_active,
    civilStatus: row.civil_status,
    gsisPolicy: row.gsis_policy,
    position: row.position,
    entranceOfDuty: row.entrance_of_duty,
    tin: row.tin,
    office: row.office,
    balances: {
      vacationLeave: parseFloat(row.vacation_leave) || 0,
      sickLeave: parseFloat(row.sick_leave) || 0,
      specialLeave: parseFloat(row.special_leave) || 0,
      forceLeave: parseFloat(row.force_leave) || 0,
      wellnessLeave: parseFloat(row.wellness_leave) || 0,
      soloParentLeave: parseFloat(row.solo_parent_leave) || 0,
    }
  };
}

// Helper: Add ledger entry
async function addLedgerEntry(conn, employeeId, transaction, status, balances) {
  await conn.execute(
    `INSERT INTO ledger (employee_id, employee_name, transaction_desc, status,
      bal_vacation_leave, bal_sick_leave, bal_special_leave,
      bal_force_leave, bal_wellness_leave, bal_solo_parent_leave)
     VALUES (?, (SELECT COALESCE((SELECT full_name FROM employees WHERE id = ?), 'System')),
      ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId,
      employeeId,
      transaction,
      status,
      balances ? balances.vacationLeave : null,
      balances ? balances.sickLeave : null,
      balances ? balances.specialLeave : null,
      balances ? balances.forceLeave : null,
      balances ? balances.wellnessLeave : null,
      balances ? balances.soloParentLeave : null,
    ]
  );
}

// GET /api/employees — Get all employees with balances
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.*, lb.vacation_leave, lb.sick_leave, lb.special_leave,
              lb.force_leave, lb.wellness_leave, lb.solo_parent_leave
       FROM employees e
       LEFT JOIN leave_balances lb ON e.id = lb.employee_id
       ORDER BY e.id`
    );
    const employees = rows.map(buildEmployeeObj);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:id — Get single employee
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.*, lb.vacation_leave, lb.sick_leave, lb.special_leave,
              lb.force_leave, lb.wellness_leave, lb.solo_parent_leave
       FROM employees e
       LEFT JOIN leave_balances lb ON e.id = lb.employee_id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(buildEmployeeObj(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees — Create new employee
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id, fullName, status, civilStatus, gsisPolicy, position, entranceOfDuty, tin, office } = req.body;

    await conn.execute(
      `INSERT INTO employees (id, full_name, status, is_active, civil_status, gsis_policy, position, entrance_of_duty, tin, office)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [id, fullName, status || 'PERMANENT', civilStatus || 'SINGLE', gsisPolicy || '', position, entranceOfDuty, tin || '', office]
    );

    // Insert default leave balances
    await conn.execute(
      `INSERT INTO leave_balances (employee_id, vacation_leave, sick_leave, special_leave, force_leave, wellness_leave, solo_parent_leave)
       VALUES (?, 0.000, 0.000, 3.000, 5.000, 5.000, 7.000)`,
      [id]
    );

    const defaultBalances = {
      vacationLeave: 0, sickLeave: 0, specialLeave: 3,
      forceLeave: 5, wellnessLeave: 5, soloParentLeave: 7
    };

    await addLedgerEntry(conn, id, 'Employee Registered', 'COMPLETED', defaultBalances);
    await conn.commit();

    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/employees/:id — Update employee profile
router.put('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { fullName, status, civilStatus, gsisPolicy, position, entranceOfDuty, tin, office } = req.body;

    await conn.execute(
      `UPDATE employees SET full_name=?, status=?, civil_status=?, gsis_policy=?, position=?, entrance_of_duty=?, tin=?, office=?
       WHERE id=?`,
      [fullName, status, civilStatus, gsisPolicy || '', position, entranceOfDuty, tin || '', office, req.params.id]
    );

    // Get current balances for ledger snapshot
    const [balRows] = await conn.execute(
      `SELECT * FROM leave_balances WHERE employee_id = ?`, [req.params.id]
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

    await addLedgerEntry(conn, req.params.id, 'Profile Information Updated by Admin', 'COMPLETED', balances);
    await conn.commit();

    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/employees/:id/balances — Update leave balances (manual correction)
router.put('/:id/balances', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const newBalances = req.body; // { vacationLeave: 5, sickLeave: 3, ... }

    // Get current balances
    const [balRows] = await conn.execute(
      `SELECT * FROM leave_balances WHERE employee_id = ?`, [req.params.id]
    );
    if (balRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    const old = balRows[0];
    const fieldMap = {
      vacationLeave: 'vacation_leave',
      sickLeave: 'sick_leave',
      specialLeave: 'special_leave',
      forceLeave: 'force_leave',
      wellnessLeave: 'wellness_leave',
      soloParentLeave: 'solo_parent_leave'
    };

    const labelMap = {
      vacationLeave: 'VL', sickLeave: 'SL', specialLeave: 'Special',
      forceLeave: 'Force', wellnessLeave: 'Wellness', soloParentLeave: 'Solo Parent'
    };

    const changes = [];
    const updates = {};

    Object.keys(newBalances).forEach(key => {
      const dbCol = fieldMap[key];
      if (!dbCol) return;
      const oldValue = parseFloat(old[dbCol] || 0);
      const newValue = parseFloat(newBalances[key]);
      if (oldValue !== newValue) {
        updates[dbCol] = newValue;
        changes.push(`${labelMap[key]}: ${oldValue.toFixed(3)} -> ${newValue.toFixed(3)}`);
      }
    });

    if (changes.length === 0) {
      await conn.rollback();
      return res.json({ success: true, message: 'No changes detected' });
    }

    // Build dynamic UPDATE
    const setClauses = Object.keys(updates).map(col => `${col} = ?`).join(', ');
    const values = Object.values(updates);
    await conn.execute(
      `UPDATE leave_balances SET ${setClauses} WHERE employee_id = ?`,
      [...values, req.params.id]
    );

    // Get updated balances for ledger snapshot
    const [updatedRows] = await conn.execute(
      `SELECT * FROM leave_balances WHERE employee_id = ?`, [req.params.id]
    );
    const upd = updatedRows[0];
    const updatedBalances = {
      vacationLeave: parseFloat(upd.vacation_leave),
      sickLeave: parseFloat(upd.sick_leave),
      specialLeave: parseFloat(upd.special_leave),
      forceLeave: parseFloat(upd.force_leave),
      wellnessLeave: parseFloat(upd.wellness_leave),
      soloParentLeave: parseFloat(upd.solo_parent_leave),
    };

    const transactionDesc = `Manual Correction: ${changes.join(', ')}`;
    await addLedgerEntry(conn, req.params.id, transactionDesc, 'COMPLETED', updatedBalances);
    await conn.commit();

    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/employees/:id — Delete employee
router.delete('/:id', async (req, res) => {
  try {
    await pool.execute(`DELETE FROM employees WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
