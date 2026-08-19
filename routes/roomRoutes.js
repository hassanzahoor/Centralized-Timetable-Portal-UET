const express = require('express');
const router = express.Router();
const { query, run, get } = require('../db/database');
const { isAuthenticated, canManageDepartment } = require('../middleware/auth');

// GET /api/rooms - List all rooms (LOGIN REQUIRED)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const rooms = await query(`
      SELECT r.*, d.name as department_name, d.code as department_code 
      FROM rooms r 
      LEFT JOIN departments d ON r.department_id = d.id 
      ORDER BY r.room_name ASC
    `);
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// POST /api/rooms - Add room (Dept Admin can only add rooms to their own dept, Super Admin can add to any)
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { room_name, building, capacity, room_type, department_id, chairs_count, projector, computers_count } = req.body;
    
    if (!room_name) {
      return res.status(400).json({ error: 'Room name is required.' });
    }

    const targetDeptId = department_id || (req.session.user ? req.session.user.department_id : null);

    if (!targetDeptId) {
      return res.status(400).json({ error: 'Department ID is required.' });
    }

    // Permission Check: Dept Admin can only add rooms to their OWN department!
    if (req.session.user.role === 'dept_admin' && Number(req.session.user.department_id) !== Number(targetDeptId)) {
      return res.status(403).json({ error: 'Forbidden. You can only add rooms to your own department!' });
    }

    const result = await run(
      'INSERT INTO rooms (room_name, building, capacity, room_type, department_id, chairs_count, projector, computers_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [room_name, building || 'Main Academic Block', capacity || 50, room_type || 'Lecture Hall', targetDeptId, chairs_count || capacity || 50, projector || 0, computers_count || 0]
    );

    res.json({ message: 'Room created successfully', id: result.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create room: ' + err.message });
  }
});

// PUT /api/rooms/:id - Update room details (Dept Coordinator can only edit rooms belonging to their department)
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const room = await get('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const { room_name, building, capacity, room_type, department_id, chairs_count, projector, computers_count } = req.body;

    if (!room_name) {
      return res.status(400).json({ error: 'Room name is required.' });
    }

    // Permission Check: Dept Admin can only edit rooms belonging to their OWN department!
    if (req.session.user.role === 'dept_admin' && Number(req.session.user.department_id) !== Number(room.department_id)) {
      return res.status(403).json({ error: 'Forbidden. You can only edit rooms belonging to your own department!' });
    }

    const targetDeptId = department_id || room.department_id;
    const finalChairs = Number(chairs_count) || Number(capacity) || room.capacity;
    const finalProjector = projector === 'Yes' || projector === 1 || projector === '1' ? 1 : 0;
    const finalComputers = Number(computers_count) || (room_type === 'Computer Lab' ? 40 : (room_type === 'Science Lab' ? 10 : 0));

    await run(
      'UPDATE ROOMS SET department_id = ?, capacity = ?, chairs_count = ?, room_type = ?, projector = ?, computers_count = ? WHERE id = ?',
      [targetDeptId, finalChairs, finalChairs, room_type || room.room_type, finalProjector, finalComputers, roomId]
    );

    res.json({ message: `Room "${room_name}" updated successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update room: ' + err.message });
  }
});

// DELETE /api/rooms/:id - Delete room (Dept Admin can only delete rooms from their own dept)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const room = await get('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    if (req.session.user.role === 'dept_admin' && Number(req.session.user.department_id) !== Number(room.department_id)) {
      return res.status(403).json({ error: 'Forbidden. You can only delete rooms belonging to your own department!' });
    }

    await run('DELETE FROM ROOMS WHERE id = ?', [roomId]);

    res.json({ message: `Room "${room.room_name}" and its schedule entries were deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete room: ' + err.message });
  }
});

// GET /api/rooms/availability - Check room availability (LOGIN REQUIRED)
router.get('/availability', isAuthenticated, async (req, res) => {
  try {
    const { day, start_time, end_time } = req.query;
    if (!day || !start_time || !end_time) {
      return res.status(400).json({ error: 'day, start_time, and end_time are required.' });
    }

    const occupiedRooms = await query(
      `SELECT room_id FROM timetable_entries 
       WHERE day_of_week = ? 
       AND (
         (start_time < ? AND end_time > ?) OR
         (start_time >= ? AND start_time < ?)
       )`,
      [day, end_time, start_time, start_time, end_time]
    );

    const occupiedIds = occupiedRooms.map(r => r.room_id);

    let sql = 'SELECT r.*, d.name as department_name FROM rooms r LEFT JOIN departments d ON r.department_id = d.id';
    let params = [];
    if (occupiedIds.length > 0) {
      sql += ` WHERE r.id NOT IN (${occupiedIds.map(() => '?').join(',')})`;
      params = occupiedIds;
    }

    const availableRooms = await query(sql, params);
    res.json({ available: availableRooms, occupiedCount: occupiedIds.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check room availability.' });
  }
});

module.exports = router;
