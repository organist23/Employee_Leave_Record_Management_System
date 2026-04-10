// src/services/StorageService.js
// Replaced: localStorage → MySQL via Express API
// All function signatures preserved for AppContext compatibility

const API_BASE = 'http://localhost:5000/api';

class StorageService {
  constructor() {
    // Trigger yearly reset check on startup
    this.checkAndResetYearlyPrivileges();
  }

  // ==================== EMPLOYEES ====================

  async getEmployees() {
    const res = await fetch(`${API_BASE}/employees`);
    if (!res.ok) throw new Error('Failed to fetch employees');
    return res.json();
  }

  async getEmployeeById(id) {
    const res = await fetch(`${API_BASE}/employees/${id}`);
    if (!res.ok) throw new Error('Failed to fetch employee');
    return res.json();
  }

  async addEmployee(employee) {
    const res = await fetch(`${API_BASE}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employee)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add employee');
    }
    return res.json();
  }

  async updateEmployee(updatedEmp) {
    const res = await fetch(`${API_BASE}/employees/${updatedEmp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedEmp)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update employee');
    }
    return res.json();
  }

  async updateEmployeeBalances(employeeId, newBalances) {
    const res = await fetch(`${API_BASE}/employees/${employeeId}/balances`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBalances)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update balances');
    }
    return res.json();
  }

  async deleteEmployee(id) {
    const res = await fetch(`${API_BASE}/employees/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete employee');
    return res.json();
  }

  // ==================== APPLICATIONS ====================

  async getApplications() {
    const res = await fetch(`${API_BASE}/applications`);
    if (!res.ok) throw new Error('Failed to fetch applications');
    return res.json();
  }

  async addApplication(app) {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create application');
    }
    return res.json();
  }

  async approveApplication(appId) {
    const res = await fetch(`${API_BASE}/applications/${appId}/approve`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to approve application');
    }
    return res.json();
  }

  async rejectApplication(appId) {
    const res = await fetch(`${API_BASE}/applications/${appId}/reject`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to reject application');
    }
    return res.json();
  }

  // ==================== LEDGER ====================

  async getLedger() {
    const res = await fetch(`${API_BASE}/ledger`);
    if (!res.ok) throw new Error('Failed to fetch ledger');
    return res.json();
  }

  // ==================== SYSTEM ====================

  async generateMonthlyCredits(month, year) {
    const res = await fetch(`${API_BASE}/system/credits/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to generate credits');
    }
    return res.json();
  }

  async checkAndResetYearlyPrivileges() {
    try {
      await fetch(`${API_BASE}/system/yearly-reset`, {
        method: 'POST'
      });
    } catch (err) {
      console.warn('Yearly reset check failed (backend may not be running yet):', err.message);
    }
  }
}

export default new StorageService();
