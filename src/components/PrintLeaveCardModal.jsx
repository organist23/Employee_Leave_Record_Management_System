// src/components/PrintLeaveCardModal.jsx
// Self-contained print component — does NOT modify any application state.
// Fetches read-only data from /api/print and renders a printable leave card.
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Printer, Loader } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The 6 leave categories, paired for 3 printed pages
const LEAVE_PAGES = [
  {
    left: { key: 'vacationLeave', label: 'VACATION LEAVE', dbCol: 'Vacation Leave', isEarned: true, acronym: 'VL' },
    right: { key: 'sickLeave', label: 'SICK LEAVE', dbCol: 'Sick Leave', isEarned: true, acronym: 'SL' },
  },
  {
    left: { key: 'specialLeave', label: 'SPECIAL LEAVE', dbCol: 'Special Leave', isEarned: false, acronym: 'SPL' },
    right: { key: 'forceLeave', label: 'FORCE LEAVE', dbCol: 'Force Leave', isEarned: false, acronym: 'FL' },
  },
  {
    left: { key: 'wellnessLeave', label: 'WELLNESS LEAVE', dbCol: 'Wellness Leave', isEarned: false, acronym: 'WL' },
    right: { key: 'soloParentLeave', label: 'SOLO PARENT LEAVE', dbCol: 'Solo Parent Leave', isEarned: false, acronym: 'SPL' },
  },
];

const API_BASE = 'http://localhost:5000/api';

const PrintLeaveCardModal = ({ employee, onClose }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [printData, setPrintData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const printRef = useRef(null);

  // Fetch print data whenever year changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/print/${employee.id}?year=${year}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch print data');
        }
        const data = await res.json();
        setPrintData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [employee.id, year]);

  const handlePrint = () => {
    window.print();
  };

  // Build the rows for a specific leave-type pair for the selected year.
  // Uses PURE ARITHMETIC — no ledger snapping for approvals.
  // Starting balance was computed backwards from the real DB balance, so
  // iterating forward always arrives at the correct current balance.
  const buildRows = (leftType, rightType) => {
    if (!printData) return [];

    const rows = [];
    const { startingBalances, generatedPeriods, applications, ledger } = printData;

    const round3 = (n) => Math.round(n * 1000) / 1000;

    let leftBalance = round3(startingBalances[leftType.key] || 0);
    let rightBalance = round3(startingBalances[rightType.key] || 0);

    // Determine the employee's hiring month to skip pre-hire rows
    const hireDate = new Date(printData.employee.entranceOfDuty);
    const hireYear = hireDate.getFullYear();
    const hireMonth = hireDate.getMonth(); // 0-indexed

    for (let m = 0; m < 12; m++) {
      const periodKey = `${year}-${String(m + 1).padStart(2, '0')}`;
      const creditGenerated = generatedPeriods.includes(periodKey);
      const isBeforeHire = (year === hireYear && m < hireMonth) || year < hireYear;

      // Approved applications filed in this month for each type
      const leftApps = applications.filter(a => {
        const d = new Date(a.dateFrom);
        return d.getMonth() === m && a.leaveType === leftType.dbCol;
      });
      const rightApps = applications.filter(a => {
        const d = new Date(a.dateFrom);
        return d.getMonth() === m && a.leaveType === rightType.dbCol;
      });

      // ── Credit row (earned leaves only, VL & SL) ──────────────────────────
      if (creditGenerated && !isBeforeHire) {
        const leftEarned = leftType.isEarned ? '1.25' : '';
        const rightEarned = rightType.isEarned ? '1.25' : '';

        if (leftType.isEarned) leftBalance = round3(leftBalance + 1.25);
        if (rightType.isEarned) rightBalance = round3(rightBalance + 1.25);

        // Always show the updated running balance after the credit — government form standard
        rows.push({
          period: `As of ${MONTH_NAMES[m]}`,
          particular: '',
          leftEarned,
          leftWPay: '',
          leftWOPay: '',
          leftBalance: leftType.isEarned ? formatBal(leftBalance) : '',
          rightEarned,
          rightWPay: '',
          rightWOPay: '',
          rightBalance: rightType.isEarned ? formatBal(rightBalance) : '',
          remarks: '',
        });
      }

      // ── Leave deduction rows ───────────────────────────────────────────────
      const maxApps = Math.max(leftApps.length, rightApps.length);
      for (let i = 0; i < maxApps; i++) {
        const la = leftApps[i];
        const ra = rightApps[i];

        let leftWPay = '', leftWOPay = '';
        let rightWPay = '', rightWOPay = '';
        let period = '', particular = '';

        if (la) {
          const paid = Math.min(la.numDays, leftBalance);
          const unpaid = Math.max(0, la.numDays - paid);
          leftBalance = round3(leftBalance - paid);
          if (paid > 0) leftWPay = formatNum(paid);
          if (unpaid > 0) leftWOPay = formatNum(unpaid);

          const from = new Date(la.dateFrom);
          const to = new Date(la.dateTo);
          period = formatDateRange(from, to);
          particular = `${leftType.acronym} - ${la.numDays.toFixed(2)}`;
        }

        if (ra) {
          const paid = Math.min(ra.numDays, rightBalance);
          const unpaid = Math.max(0, ra.numDays - paid);
          rightBalance = round3(rightBalance - paid);
          if (paid > 0) rightWPay = formatNum(paid);
          if (unpaid > 0) rightWOPay = formatNum(unpaid);

          if (!period) {
            const from = new Date(ra.dateFrom);
            const to = new Date(ra.dateTo);
            period = formatDateRange(from, to);
          }
          if (!particular) {
            particular = `${rightType.acronym} - ${ra.numDays.toFixed(2)}`;
          }
        }

        rows.push({
          period,
          particular,
          leftEarned: '',
          leftWPay,
          leftWOPay,
          leftBalance: la ? formatBal(leftBalance) : '',
          rightEarned: '',
          rightWPay,
          rightWOPay,
          rightBalance: ra ? formatBal(rightBalance) : '',
          remarks: '',
        });
      }

      // ── Manual corrections — the ONLY case where we snap to ledger ─────────
      const monthLedger = ledger.filter(l => new Date(l.date).getMonth() === m);
      const corrections = monthLedger.filter(l =>
        l.transaction.includes('Manual Correction') && l.balancesAfter
      );
      for (const corr of corrections) {
        leftBalance = corr.balancesAfter[leftType.key];
        rightBalance = corr.balancesAfter[rightType.key];
        rows.push({
          period: '',
          particular: 'Balance Adjustment',
          leftEarned: '',
          leftWPay: '',
          leftWOPay: '',
          leftBalance: formatBal(leftBalance),
          rightEarned: '',
          rightWPay: '',
          rightWOPay: '',
          rightBalance: formatBal(rightBalance),
          remarks: 'ADJ',
        });
      }
    }

    // Pad table to minimum 25 visible rows
    while (rows.length < 25) {
      rows.push({
        period: '', particular: '',
        leftEarned: '', leftWPay: '', leftWOPay: '', leftBalance: '',
        rightEarned: '', rightWPay: '', rightWOPay: '', rightBalance: '',
        remarks: '',
      });
    }

    return rows;
  };

  const formatBal = (val) => {
    if (val === '' || val === null || val === undefined) return '';
    return parseFloat(val).toFixed(3);
  };

  const formatNum = (val) => {
    if (val === 0) return '';
    return Number.isInteger(val) ? String(val) : val.toFixed(3);
  };

  const formatDateRange = (from, to) => {
    const fMonth = MONTH_NAMES[from.getMonth()];
    const fDay = from.getDate();
    const tDay = to.getDate();
    if (fDay === tDay) return `${fMonth}. ${fDay}`;
    return `${fMonth}. ${fDay}-${tDay}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  // Generate year options (5 years back, 1 year forward)
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear - 5; y <= currentYear + 1; y++) {
    yearOptions.push(y);
  }

  const renderPage = (pageConfig, pageIndex) => {
    const { left, right } = pageConfig;
    const rows = buildRows(left, right);
    const emp = printData.employee;
    const startBal = printData.startingBalances;

    return (
      <div className="print-page" key={pageIndex}>
        {/* Header */}
        <div className="print-title">EMPLOYEE'S LEAVE CARD</div>
        <table className="print-header-table">
          <tbody>
            <tr>
              <td className="print-label">Name</td>
              <td className="print-value print-value-wide">{emp.fullName}</td>
              <td className="print-label">Civil Status</td>
              <td className="print-value">{emp.civilStatus}</td>
              <td className="print-label-right">GSIS POLICY NO.</td>
              <td className="print-value print-value-gsis">{emp.gsisPolicy}</td>
            </tr>
            <tr>
              <td className="print-label">Position</td>
              <td className="print-value print-value-wide">{emp.position}</td>
              <td className="print-label">Entrance of Duty</td>
              <td className="print-value">{formatDate(emp.entranceOfDuty)}</td>
              <td className="print-label-right">TIN</td>
              <td className="print-value print-value-gsis">{emp.tin}</td>
            </tr>
            <tr>
              <td className="print-label">Status</td>
              <td className="print-value print-value-wide">{emp.status}</td>
              <td className="print-label">Office</td>
              <td className="print-value">{emp.office}</td>
              <td className="print-label-right">EID</td>
              <td className="print-value print-value-gsis">{emp.id}</td>
            </tr>
          </tbody>
        </table>

        {/* Main Leave Table */}
        <table className="print-leave-table">
          <thead>
            {/* Row 1: Category group headers */}
            <tr>
              <th rowSpan="3" className="print-col-period">Period</th>
              <th rowSpan="3" className="print-col-particular">Particular</th>
              <th colSpan="4" className="print-group-header">{left.label}</th>
              <th colSpan="4" className="print-group-header">{right.label}</th>
              <th rowSpan="3" className="print-col-remarks">REMARKS</th>
            </tr>
            {/* Row 2: Sub-headers */}
            <tr>
              <th rowSpan="2" className="print-sub-header">Earned</th>
              <th className="print-sub-header">Absence Under Time</th>
              <th rowSpan="2" className="print-sub-header">Leave w/o Pay</th>
              <th rowSpan="2" className="print-sub-header print-col-balance">Balance</th>
              <th rowSpan="2" className="print-sub-header">Earned</th>
              <th className="print-sub-header">Absence Under Time</th>
              <th rowSpan="2" className="print-sub-header">Leave w/o Pay</th>
              <th rowSpan="2" className="print-sub-header print-col-balance">Balance</th>
            </tr>
            {/* Row 3: w/ Pay sub-sub-header */}
            <tr>
              <th className="print-sub-sub-header">w/ Pay</th>
              <th className="print-sub-sub-header">w/ Pay</th>
            </tr>
          </thead>
          <tbody>
            {/* Year separator row */}
            <tr className="print-year-row">
              <td colSpan="10"></td>
              <td></td>
            </tr>
            {/* Balance Brought Forward */}
            <tr className="print-balance-fwd-row">
              <td className="print-year-label">{printData.year}</td>
              <td className="print-particular-fwd">BALANCE BROUGHT<br />FORWARDED</td>
              <td></td>
              <td></td>
              <td></td>
              <td className="print-col-balance print-bal-value">{formatBal(startBal[left.key])}</td>
              <td></td>
              <td></td>
              <td></td>
              <td className="print-col-balance print-bal-value">{formatBal(startBal[right.key])}</td>
              <td></td>
            </tr>
            {/* Data rows */}
            {rows.map((row, idx) => (
              <tr key={idx} className="print-data-row">
                <td className="print-cell-period">{row.period}</td>
                <td className="print-cell-particular">{row.particular}</td>
                <td className="print-cell-num">{row.leftEarned}</td>
                <td className="print-cell-num">{row.leftWPay}</td>
                <td className="print-cell-num">{row.leftWOPay}</td>
                <td className="print-col-balance print-cell-num">{row.leftBalance}</td>
                <td className="print-cell-num">{row.rightEarned}</td>
                <td className="print-cell-num">{row.rightWPay}</td>
                <td className="print-cell-num">{row.rightWOPay}</td>
                <td className="print-col-balance print-cell-num">{row.rightBalance}</td>
                <td className="print-cell-remarks">{row.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      {/* Modal overlay — visible on screen, hidden when printing */}
      <div className="modal-overlay print-hide">
        <div className="modal-content premium-card glass" style={{ maxWidth: '500px' }}>
          <div className="modal-header">
            <h2>Print Leave Card</h2>
            <button className="icon-btn" onClick={onClose}><X size={24} /></button>
          </div>

          <div className="employee-strip">
            <p>Employee: <strong>{employee.fullName}</strong> ({employee.id})</p>
          </div>

          <div className="form-group" style={{ margin: '1.5rem 0' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Select Year</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem' }}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {error && (
            <div className="error-box" style={{ marginBottom: '1rem' }}>
              <span>{error}</span>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn-muted" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn-primary flex-btn"
              onClick={handlePrint}
              disabled={loading || !printData}
            >
              {loading ? <Loader size={18} className="spin" /> : <Printer size={18} />}
              <span>{loading ? 'Loading...' : 'Print Leave Card'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Printable area — rendered via Portal directly under <body> so @media print works */}
      {printData && ReactDOM.createPortal(
        <div className="print-area" ref={printRef}>
          {LEAVE_PAGES.map((pageConfig, idx) => renderPage(pageConfig, idx))}
        </div>,
        document.body
      )}
    </>
  );
};

export default PrintLeaveCardModal;
