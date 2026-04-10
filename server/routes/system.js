// server/routes/system.js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// POST /api/credits/generate — Generate monthly credits (+1.25 VL/SL)
router.post('/credits/generate', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { month, year } = req.body;
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;

    // Check if already generated
    const [existing] = await conn.execute(
      `SELECT * FROM generated_periods WHERE period_key = ?`, [periodKey]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(400).json({ error: `Credits for ${month}/${year} have already been generated.` });
    }

    // Add 1.25 to VL and SL for all active employees
    await conn.execute(
      `UPDATE leave_balances lb
       JOIN employees e ON lb.employee_id = e.id
       SET lb.vacation_leave = lb.vacation_leave + 1.250,
           lb.sick_leave = lb.sick_leave + 1.250
       WHERE e.is_active = 1`
    );

    // Record the period
    await conn.execute(
      `INSERT INTO generated_periods (period_key) VALUES (?)`, [periodKey]
    );

    // Add ledger entry
    await conn.execute(
      `INSERT INTO ledger (employee_id, employee_name, transaction_desc, status)
       VALUES ('SYSTEM', 'System', ?, 'COMPLETED')`,
      [`Generated Monthly 1.25 Credits for ${month}/${year}`]
    );

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/system/yearly-reset — Reset yearly privilege balances
router.post('/yearly-reset', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const currentYear = new Date().getFullYear();

    // Check last reset year
    const [configRows] = await conn.execute(
      `SELECT config_value FROM system_config WHERE config_key = 'last_reset_year'`
    );
    const lastReset = configRows.length > 0 ? parseInt(configRows[0].config_value) : 0;

    if (currentYear <= lastReset) {
      await conn.rollback();
      return res.json({ success: true, message: 'Already reset for this year' });
    }

    // Reset privilege balances for all employees
    await conn.execute(
      `UPDATE leave_balances
       SET special_leave = 3.000,
           force_leave = 5.000,
           wellness_leave = 5.000,
           solo_parent_leave = 7.000`
    );

    // Add ledger entries for each employee
    const [employees] = await conn.execute(`SELECT id, full_name FROM employees`);
    for (const emp of employees) {
      const [balRows] = await conn.execute(
        `SELECT * FROM leave_balances WHERE employee_id = ?`, [emp.id]
      );
      const bal = balRows[0];

      await conn.execute(
        `INSERT INTO ledger (employee_id, employee_name, transaction_desc, status,
          bal_vacation_leave, bal_sick_leave, bal_special_leave,
          bal_force_leave, bal_wellness_leave, bal_solo_parent_leave)
         VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
        [
          emp.id, emp.full_name,
          `Annual Reset: Privilege balances restored for ${currentYear}`,
          parseFloat(bal.vacation_leave), parseFloat(bal.sick_leave),
          3.000, 5.000, 5.000, 7.000
        ]
      );
    }

    // Update system config
    await conn.execute(
      `INSERT INTO system_config (config_key, config_value) VALUES ('last_reset_year', ?)
       ON DUPLICATE KEY UPDATE config_value = ?`,
      [String(currentYear), String(currentYear)]
    );

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
