// server/routes/print.js
// READ-ONLY route — fetches all data needed to render a printable Leave Card.
// This route does NOT modify any data.
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const round3 = (n) => Math.round(n * 1000) / 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Backwards formula — computes starting balance from the current real
// DB balance by reversing the selected year's activity.
//
//   For VL/SL (earned):   startBal = currentBal − (credits × 1.25) + daysUsed
//   For privilege leaves: startBal = currentBal + daysUsed
//
// ONLY accurate when selectedYear === currentDbYear, because "currentBal"
// from leave_balances always reflects the live cumulative state including ALL
// prior years. Using this for past years would include future-year activity.
// ─────────────────────────────────────────────────────────────────────────────
function computeBackwardsFormula(currentBalances, numCredits, appRows) {
  const leaveTypeMap = {
    'Vacation Leave':    'vacationLeave',
    'Sick Leave':        'sickLeave',
    'Special Leave':     'specialLeave',
    'Force Leave':       'forceLeave',
    'Wellness Leave':    'wellnessLeave',
    'Solo Parent Leave': 'soloParentLeave',
  };

  const deductions = {
    vacationLeave: 0, sickLeave: 0, specialLeave: 0,
    forceLeave: 0, wellnessLeave: 0, soloParentLeave: 0,
  };

  for (const app of appRows) {
    const key = leaveTypeMap[app.leave_type];
    if (key) deductions[key] += parseFloat(app.num_days);
  }

  const result = {
    vacationLeave:   round3(currentBalances.vacationLeave   - (numCredits * 1.25) + deductions.vacationLeave),
    sickLeave:       round3(currentBalances.sickLeave       - (numCredits * 1.25) + deductions.sickLeave),
    specialLeave:    round3(currentBalances.specialLeave    + deductions.specialLeave),
    forceLeave:      round3(currentBalances.forceLeave      + deductions.forceLeave),
    wellnessLeave:   round3(currentBalances.wellnessLeave   + deductions.wellnessLeave),
    soloParentLeave: round3(currentBalances.soloParentLeave + deductions.soloParentLeave),
  };

  // Clamp — starting balance can never be negative
  for (const k of Object.keys(result)) {
    if (result[k] < 0) result[k] = 0;
  }

  return result;
}

// GET /api/print/:employeeId?year=2026
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const year          = parseInt(req.query.year) || new Date().getFullYear();
    const currentDbYear = new Date().getFullYear();

    // 1. Employee profile + current live balances
    const [empRows] = await pool.execute(
      `SELECT e.*, lb.vacation_leave, lb.sick_leave, lb.special_leave,
              lb.force_leave, lb.wellness_leave, lb.solo_parent_leave
       FROM employees e
       LEFT JOIN leave_balances lb ON e.id = lb.employee_id
       WHERE e.id = ?`,
      [employeeId]
    );
    if (empRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empRows[0];
    const employee = {
      id:             emp.id,
      fullName:       emp.full_name,
      position:       emp.position,
      status:         emp.status,
      civilStatus:    emp.civil_status,
      entranceOfDuty: emp.entrance_of_duty,
      office:         emp.office,
      gsisPolicy:     emp.gsis_policy,
      tin:            emp.tin,
    };

    // Current live balances — always accurate for TODAY's date
    const currentBalances = {
      vacationLeave:   parseFloat(emp.vacation_leave)   || 0,
      sickLeave:       parseFloat(emp.sick_leave)        || 0,
      specialLeave:    parseFloat(emp.special_leave)     || 0,
      forceLeave:      parseFloat(emp.force_leave)       || 0,
      wellnessLeave:   parseFloat(emp.wellness_leave)    || 0,
      soloParentLeave: parseFloat(emp.solo_parent_leave) || 0,
    };

    // 2. Ledger entries for this employee in the selected year (chronological)
    const [ledgerRows] = await pool.execute(
      `SELECT * FROM ledger
       WHERE employee_id = ? AND YEAR(date) = ?
       ORDER BY date ASC, id ASC`,
      [employeeId, year]
    );
    const ledger = ledgerRows.map(r => ({
      id:          r.id,
      date:        r.date,
      transaction: r.transaction_desc,
      status:      r.status,
      balancesAfter: r.bal_vacation_leave !== null ? {
        vacationLeave:   parseFloat(r.bal_vacation_leave),
        sickLeave:       parseFloat(r.bal_sick_leave),
        specialLeave:    parseFloat(r.bal_special_leave),
        forceLeave:      parseFloat(r.bal_force_leave),
        wellnessLeave:   parseFloat(r.bal_wellness_leave),
        soloParentLeave: parseFloat(r.bal_solo_parent_leave),
      } : null,
    }));

    // 3. Generated credit periods for the selected year
    const [periodRows] = await pool.execute(
      `SELECT period_key FROM generated_periods WHERE period_key LIKE ?`,
      [`${year}-%`]
    );
    const generatedPeriods = periodRows.map(r => r.period_key);

    // 4. Approved applications for this employee in the selected year
    const [appRows] = await pool.execute(
      `SELECT * FROM leave_applications
       WHERE employee_id = ? AND status = 'Approved'
         AND YEAR(date_from) = ?
       ORDER BY date_from ASC`,
      [employeeId, year]
    );
    const applications = appRows.map(r => ({
      id:        r.id,
      leaveType: r.leave_type,
      dateFrom:  r.date_from,
      dateTo:    r.date_to,
      numDays:   parseFloat(r.num_days),
      reason:    r.reason,
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Compute "Balance Brought Forward" — balance at Jan 1 of selected year,
    //    before any credits or deductions for that year.
    //
    //  CURRENT YEAR → Backwards formula.
    //    Accurate because currentBalances reflects ALL history up to today, and
    //    reversing only this year's activity gives the exact Jan 1 opening.
    //
    //  PAST YEAR → Last ledger snapshot before Jan 1 of the selected year.
    //    Your yearly-reset writes a complete balance snapshot per employee at
    //    each year boundary, so this is always available after the first reset.
    //    Fallback: backwards formula (for employees with no prior ledger data).
    // ─────────────────────────────────────────────────────────────────────────
    let startingBalances;

    if (year === currentDbYear) {
      // ── CURRENT YEAR ──────────────────────────────────────────────────────
      startingBalances = computeBackwardsFormula(
        currentBalances,
        generatedPeriods.length,
        appRows
      );
    } else {
      // ── PAST YEAR: try ledger snapshot first ──────────────────────────────
      const [prevSnap] = await pool.execute(
        `SELECT * FROM ledger
         WHERE employee_id = ?
           AND date < ?
           AND bal_vacation_leave IS NOT NULL
         ORDER BY date DESC, id DESC
         LIMIT 1`,
        [employeeId, `${year}-01-01 00:00:00`]
      );

      if (prevSnap.length > 0) {
        // Reliable snapshot found (yearly reset or any prior ledger entry)
        const s = prevSnap[0];
        startingBalances = {
          vacationLeave:   parseFloat(s.bal_vacation_leave),
          sickLeave:       parseFloat(s.bal_sick_leave),
          specialLeave:    parseFloat(s.bal_special_leave),
          forceLeave:      parseFloat(s.bal_force_leave),
          wellnessLeave:   parseFloat(s.bal_wellness_leave),
          soloParentLeave: parseFloat(s.bal_solo_parent_leave),
        };
      } else {
        // No prior ledger history — best-effort backwards formula
        startingBalances = computeBackwardsFormula(
          currentBalances,
          generatedPeriods.length,
          appRows
        );
      }
    }

    res.json({
      employee,
      year,
      startingBalances,
      currentBalances,
      ledger,
      generatedPeriods,
      applications,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
