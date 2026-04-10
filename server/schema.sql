-- ============================================================
-- ELRMS Database Schema
-- Employee Leave Record Management System
-- Paste this into SQLyog to create your database
-- ============================================================

CREATE DATABASE IF NOT EXISTS elrms_db;
USE elrms_db;

-- ============================================================
-- TABLE: admin_users
-- Stores admin login credentials
-- ============================================================
CREATE TABLE admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Administrator',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default admin account
INSERT INTO admin_users (username, password, role)
VALUES ('admin', 'admin123', 'Administrator');


-- ============================================================
-- TABLE: employees
-- Stores employee profile information
-- ============================================================
CREATE TABLE employees (
    id VARCHAR(20) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    status ENUM('PERMANENT','CASUAL','CONTRACTUAL') DEFAULT 'PERMANENT',
    is_active TINYINT(1) DEFAULT 1,
    civil_status ENUM('SINGLE','MARRIED','WIDOWED','SEPARATED') DEFAULT 'SINGLE',
    gsis_policy VARCHAR(50) DEFAULT '',
    position VARCHAR(100) NOT NULL,
    entrance_of_duty DATE NOT NULL,
    tin VARCHAR(30) DEFAULT '',
    office VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: leave_balances
-- 1:1 relationship with employees
-- Stores the 6-category balance system
-- ============================================================
CREATE TABLE leave_balances (
    employee_id VARCHAR(20) PRIMARY KEY,
    vacation_leave DECIMAL(10,3) DEFAULT 0.000,
    sick_leave DECIMAL(10,3) DEFAULT 0.000,
    special_leave DECIMAL(10,3) DEFAULT 3.000,
    force_leave DECIMAL(10,3) DEFAULT 5.000,
    wellness_leave DECIMAL(10,3) DEFAULT 5.000,
    solo_parent_leave DECIMAL(10,3) DEFAULT 7.000,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: leave_applications
-- Stores all leave requests (pending, approved, rejected)
-- ============================================================
CREATE TABLE leave_applications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    num_days DECIMAL(10,3) NOT NULL,
    reason TEXT DEFAULT '',
    status ENUM('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: ledger
-- Complete audit trail / transaction log
-- ============================================================
CREATE TABLE ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    employee_id VARCHAR(20) NOT NULL,
    employee_name VARCHAR(100) DEFAULT 'System',
    transaction_desc TEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    bal_vacation_leave DECIMAL(10,3) DEFAULT NULL,
    bal_sick_leave DECIMAL(10,3) DEFAULT NULL,
    bal_special_leave DECIMAL(10,3) DEFAULT NULL,
    bal_force_leave DECIMAL(10,3) DEFAULT NULL,
    bal_wellness_leave DECIMAL(10,3) DEFAULT NULL,
    bal_solo_parent_leave DECIMAL(10,3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: system_config
-- Tracks generated periods and yearly resets
-- ============================================================
CREATE TABLE system_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TABLE: generated_periods
-- Tracks which month/year credits have been generated
-- ============================================================
CREATE TABLE generated_periods (
    period_key VARCHAR(10) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SEED DATA: Initial employees (matches current localStorage)
-- ============================================================
INSERT INTO employees (id, full_name, status, is_active, civil_status, gsis_policy, position, entrance_of_duty, tin, office)
VALUES
    ('EMP-2013-001', 'PARAGAS, BRENDALIE C.', 'PERMANENT', 1, 'MARRIED', '2001556677', 'MUNICIPAL ACCOUNTANT', '2013-09-02', '123-456-789', 'MACCO'),
    ('EMP-2013-002', 'GUIMBA, KEIPHIL P..', 'PERMANENT', 1, 'SINGLE', '2456465456', 'MUNICIPAL ACCOUNTANT', '2025-09-02', '123-456-789', 'HR'),
    ('EMP-2013-003', 'MANGUPAG, CHRISTINE C.', 'PERMANENT', 1, 'MARRIED', '2023424232', 'MUNICIPAL ACCOUNTANT', '2013-09-02', '123-456-789', 'MACCO');

INSERT INTO leave_balances (employee_id, vacation_leave, sick_leave, special_leave, force_leave, wellness_leave, solo_parent_leave)
VALUES
    ('EMP-2013-001', 0.000, 0.000, 3.000, 5.000, 5.000, 7.000),
    ('EMP-2013-002', 0.000, 0.000, 3.000, 5.000, 5.000, 7.000),
    ('EMP-2013-003', 0.000, 0.000, 3.000, 5.000, 5.000, 7.000);

-- Initial system config
INSERT INTO system_config (config_key, config_value)
VALUES ('last_reset_year', '2026');

-- Initial ledger entry
INSERT INTO ledger (employee_id, employee_name, transaction_desc, status, bal_vacation_leave, bal_sick_leave, bal_special_leave, bal_force_leave, bal_wellness_leave, bal_solo_parent_leave)
VALUES ('EMP-2013-001', 'PARAGAS, BRENDALIE C.', 'Initial Balance Setup', 'COMPLETED', 0.000, 0.000, 3.000, 5.000, 5.000, 7.000);
