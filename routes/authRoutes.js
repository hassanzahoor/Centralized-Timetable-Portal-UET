const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { get, run, query } = require('../db/database');
const { isAuthenticated } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await get(
      `SELECT u.*, d.name as department_name, d.code as department_code, d.color as department_color 
       FROM users u 
       LEFT JOIN departments d ON u.department_id = d.id 
       WHERE u.username = ?`,
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Set Session
    const userData = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      department_name: user.department_name,
      department_code: user.department_code,
      department_color: user.department_color
    };

    req.session.user = userData;

    res.json({
      message: 'Login successful',
      user: userData
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false, user: null });
});

// POST /api/auth/restore - Auto-restore persistent session on server restart
router.post('/restore', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username required for session restore.' });
    }

    const user = await get(
      `SELECT u.*, d.name as department_name, d.code as department_code, d.color as department_color 
       FROM users u 
       LEFT JOIN departments d ON u.department_id = d.id 
       WHERE u.username = ?`,
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const userData = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      department_name: user.department_name,
      department_code: user.department_code,
      department_color: user.department_color
    };

    req.session.user = userData;

    res.json({
      message: 'Session restored successfully.',
      user: userData
    });
  } catch (err) {
    console.error('Session Restore Error:', err);
    res.status(500).json({ error: 'Server error during session restore.' });
  }
});

// PUT /api/auth/profile - Update user profile and login credentials
router.put('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { full_name, email, username, current_password, new_password } = req.body;

    if (!full_name || !username || !current_password) {
      return res.status(400).json({ error: 'Full name, username, and current password are required.' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Incorrect current password. Authorization failed.' });
    }

    // Check username uniqueness if changed
    if (username.trim() !== user.username) {
      const existingUser = await get('SELECT * FROM users WHERE username = ? AND id != ?', [username.trim(), userId]);
      if (existingUser) {
        return res.status(400).json({ error: `Username "${username}" is already taken by another account.` });
      }
    }

    // Hash new password if provided
    let newHash = user.password_hash;
    if (new_password && new_password.trim().length > 0) {
      newHash = await bcrypt.hash(new_password.trim(), 10);
    }

    // Update database
    await run(
      'UPDATE USERS SET full_name = ?, email = ?, username = ?, password_hash = ? WHERE id = ?',
      [full_name.trim(), (email || '').trim(), username.trim(), newHash, userId]
    );

    // Fetch updated user with department info
    const updatedUser = await get(
      `SELECT u.*, d.name as department_name, d.code as department_code, d.color as department_color 
       FROM users u 
       LEFT JOIN departments d ON u.department_id = d.id 
       WHERE u.id = ?`,
      [userId]
    );

    const userData = {
      id: updatedUser.id,
      username: updatedUser.username,
      full_name: updatedUser.full_name,
      email: updatedUser.email,
      role: updatedUser.role,
      department_id: updatedUser.department_id,
      department_name: updatedUser.department_name,
      department_code: updatedUser.department_code,
      department_color: updatedUser.department_color
    };

    req.session.user = userData;

    res.json({
      message: 'Account settings and credentials updated successfully!',
      user: userData
    });

  } catch (err) {
    console.error('Update Profile Error:', err);
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

module.exports = router;
