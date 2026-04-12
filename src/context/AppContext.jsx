// src/context/AppContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import StorageService from '../services/StorageService';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [data, setData] = useState({
    employees: [],
    applications: [],
    ledger: []
  });
  const [loading, setLoading] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('elrms_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const refreshData = async () => {
    try {
      const employees = await StorageService.getEmployees();
      const applications = await StorageService.getApplications();
      const ledger = await StorageService.getLedger();
      setData({ employees, applications, ledger });
    } catch (err) {
      console.error('Failed to refresh data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('elrms_user', JSON.stringify(data.user));
        return { success: true };
      }
      return { success: false, message: data.message || 'Invalid credentials.' };
    } catch (err) {
      return { success: false, message: 'Server connection failed. Is the backend running?' };
    }
  };

  const logout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setUser(null);
    localStorage.removeItem('elrms_user');
    setShowLogoutModal(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const addEmployee = async (emp) => {
    await StorageService.addEmployee(emp);
    await refreshData();
  };

  const updateEmployee = async (emp) => {
    await StorageService.updateEmployee(emp);
    await refreshData();
  };

  const updateEmployeeBalances = async (id, balances) => {
    await StorageService.updateEmployeeBalances(id, balances);
    await refreshData();
  };

  const deleteEmployee = async (id) => {
    await StorageService.deleteEmployee(id);
    await refreshData();
  };

  const addApplication = async (app) => {
    await StorageService.addApplication(app);
    await refreshData();
  };

  const approveApplication = async (id) => {
    await StorageService.approveApplication(id);
    await refreshData();
  };

  const rejectApplication = async (id) => {
    await StorageService.rejectApplication(id);
    await refreshData();
  };

  const generateMonthlyCredits = async (m, y) => {
    await StorageService.generateMonthlyCredits(m, y);
    await refreshData();
  };

  return (
    <AppContext.Provider value={{ 
      ...data, 
      loading, 
      user,
      login,
      logout,
      isAuthenticated: !!user,
      addEmployee, 
      updateEmployee, 
      updateEmployeeBalances,
      deleteEmployee,
      addApplication,
      approveApplication,
      rejectApplication,
      generateMonthlyCredits,
      refreshData
    }}>
      {children}
      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#0f172a', margin: 0 }}>Confirm Logout</h2>
            </div>
            <p style={{ color: '#475569', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Are you sure you want to securely log out of the system?
            </p>
            <div className="modal-footer" style={{ marginTop: '0', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button 
                style={{ background: 'var(--danger)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={confirmLogout}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
