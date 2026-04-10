// server/routes/auth.js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// POST /api/auth/login — Verify admin credentials against MySQL
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.execute(
      `SELECT id, username, role FROM admin_users WHERE username = ? AND password = ?`,
      [email, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = rows[0];
    res.json({
      success: true,
      user: { email: user.username, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
