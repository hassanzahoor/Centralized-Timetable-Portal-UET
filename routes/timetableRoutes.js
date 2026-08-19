const express = require('express');
const router = express.Router();
const { query, run, get } = require('../db/database');
const { isAuthenticated, canManageDepartment } = require('../middleware/auth');

// Helper to check room collision
const isRoomOccupied = async (roomId, dayOfWeek, startTime, endTime, excludeId = null) => {
  let sql = `
    SELECT t.*, c.course_code, c.course_name, d.name as department_name, r.room_name 
    FROM timetable_entries t
    JOIN courses c ON t.course_id = c.id
    JOIN departments d ON t.department_id = d.id
    JOIN rooms r ON t.room_id = r.id
    WHERE t.day_of_week = ? AND t.room_id = ? 
    AND (t.start_time < ? AND t.end_time > ?)
  `;
  let params = [dayOfWeek, roomId, endTime, startTime];
  if (excludeId) {
    sql += ' AND t.id != ?';
    params.push(excludeId);
  }
  return await get(sql, params);
};

// GET /api/timetable - Get entries with filters (LOGIN REQUIRED)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { department_id, semester, day, room_id, search } = req.query;

    let sql = `
      SELECT t.*, 
             c.course_code, c.course_name, c.credit_hours, c.program,
             i.name as instructor_name, i.email as instructor_email, i.designation as instructor_designation,
             r.room_name, r.building as room_building, r.capacity as room_capacity, r.room_type, r.projector as room_projector, r.computers_count as room_computers,
             d.name as department_name, d.code as department_code, d.color as department_color
      FROM timetable_entries t
      JOIN courses c ON t.course_id = c.id
      JOIN instructors i ON t.instructor_id = i.id
      JOIN rooms r ON t.room_id = r.id
      JOIN departments d ON t.department_id = d.id
      WHERE 1=1
    `;

    const params = [];

    if (department_id) {
      sql += ' AND t.department_id = ?';
      params.push(department_id);
    }
    if (semester) {
      sql += ' AND t.semester = ?';
      params.push(semester);
    }
    if (day) {
      sql += ' AND t.day_of_week = ?';
      params.push(day);
    }
    if (room_id) {
      sql += ' AND t.room_id = ?';
      params.push(room_id);
    }
    if (search) {
      sql += ' AND (c.course_code LIKE ? OR c.course_name LIKE ? OR i.name LIKE ? OR r.room_name LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY t.day_of_week ASC, t.start_time ASC';

    const entries = await query(sql, params);
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch timetable entries.' });
  }
});

// Helper to get existing course or auto-create a new course
const resolveOrCreateCourse = async (course_id, course_input, department_id, semester) => {
  if (course_id && !isNaN(Number(course_id))) {
    const existing = await get('SELECT * FROM courses WHERE id = ?', [Number(course_id)]);
    if (existing) return existing;
  }

  const rawInput = (course_input || course_id || '').toString().trim();
  if (!rawInput) return null;

  let code = rawInput;
  let name = rawInput;

  if (rawInput.includes('-')) {
    const parts = rawInput.split('-');
    code = parts[0].trim().toUpperCase();
    name = parts.slice(1).join('-').trim() || code;
  }

  let course = await get(
    'SELECT * FROM courses WHERE department_id = ? AND (LOWER(course_code) = LOWER(?) OR LOWER(course_name) = LOWER(?))',
    [department_id, code, name]
  );

  if (!course) {
    const newRes = await run(
      'INSERT INTO courses (course_code, course_name, department_id, credit_hours, semester) VALUES (?, ?, ?, ?, ?)',
      [code, name, department_id, 3, semester || 1]
    );
    course = await get('SELECT * FROM courses WHERE id = ?', [newRes.id]);
  }

  return course;
};

// POST /api/timetable - Add new timetable slot (Dept Coordinator ONLY)
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { department_id, course_id, course_input, instructor_id, room_id, day_of_week, start_time, end_time, section, semester, session_type, notes } = req.body;

    if (!department_id || (!course_id && !course_input) || !room_id || !day_of_week || !start_time || !end_time || !section || !semester) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (!canManageDepartment(req.session.user, department_id)) {
      return res.status(403).json({ error: 'Forbidden. You can only edit your assigned department schedule.' });
    }

    // MANDATORY Time Constraints Validation (University operating hours: 07:30 AM to 04:00 PM)
    if (start_time < '07:30') {
      return res.status(400).json({ error: 'Classes cannot start earlier than 07:30 AM (University Opening Time).' });
    }
    if (end_time > '16:00') {
      return res.status(400).json({ error: 'Classes cannot end later than 04:00 PM / 16:00 (University Closing Time).' });
    }
    if (end_time <= start_time) {
      return res.status(400).json({ error: `End time (${end_time}) must be higher than Start time (${start_time}).` });
    }

    if (day_of_week === 'Saturday' || day_of_week === 'Sunday') {
      return res.status(400).json({ error: 'Saturday and Sunday are university holidays. Classes can only be scheduled Monday through Friday.' });
    }
    if (start_time < '13:00' && end_time > '12:00') {
      return res.status(400).json({ error: '12:00 PM to 01:00 PM is Lunch / Recess Break. Classes cannot be scheduled during break.' });
    }
    if (day_of_week === 'Friday' && start_time < '14:00' && end_time > '13:00') {
      return res.status(400).json({ error: '01:00 PM to 02:00 PM is Jummah Prayer Break on Friday. Classes cannot be scheduled during break.' });
    }

    const courseObj = await resolveOrCreateCourse(course_id, course_input, department_id, semester);
    if (!courseObj) {
      return res.status(400).json({ error: 'Valid course code or name is required.' });
    }

    const targetRoom = await get('SELECT * FROM rooms WHERE id = ?', [room_id]);
    if (!targetRoom) {
      return res.status(404).json({ error: 'Target room not found.' });
    }

    // MANDATORY Room Vacancy Check
    const roomConflict = await isRoomOccupied(room_id, day_of_week, start_time, end_time);
    if (roomConflict) {
      return res.status(409).json({ 
        error: `Room "${roomConflict.room_name}" is ALREADY occupied by ${roomConflict.course_code} on ${day_of_week} (${roomConflict.start_time} - ${roomConflict.end_time})!` 
      });
    }

    // Check if the selected room belongs to ANOTHER department
    const isRoomOwner = targetRoom.department_id && Number(targetRoom.department_id) === Number(department_id);
    const isAdmin = req.session.user && req.session.user.role === 'admin';

    if (!isRoomOwner && !isAdmin) {
      // Room belongs to another department! Create a Room Request instead of direct allocation
      const owningDeptId = targetRoom.department_id || 1;

      const reqResult = await run(
        `INSERT INTO room_requests 
         (requesting_department_id, owning_department_id, room_id, day_of_week, start_time, end_time, course_code, course_name, section, semester, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          department_id,
          owningDeptId,
          targetRoom.id,
          day_of_week,
          start_time,
          end_time,
          courseObj.course_code,
          courseObj.course_name,
          section.toUpperCase(),
          semester,
          notes || 'Submitted via Schedule Manager'
        ]
      );

      const owningDept = await get('SELECT * FROM departments WHERE id = ?', [owningDeptId]);
      const owningDeptName = owningDept ? owningDept.name : 'the owner department';

      return res.status(202).json({
        isRequest: true,
        message: `Room "${targetRoom.room_name}" belongs to ${owningDeptName}. A Room Allocation Request (#${reqResult.id}) has been submitted to them for approval instead of direct allocation!`,
        requestId: reqResult.id
      });
    }

    const result = await run(
      `INSERT INTO timetable_entries 
       (department_id, course_id, instructor_id, room_id, day_of_week, start_time, end_time, section, semester, session_type, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [department_id, courseObj.id, instructor_id || 1, room_id, day_of_week, start_time, end_time, section.toUpperCase(), semester, session_type || 'Lecture', notes || '']
    );

    res.json({ message: 'Timetable slot created successfully', id: result.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create timetable slot: ' + err.message });
  }
});

// PUT /api/timetable/:id - Edit timetable slot (Dept Coordinator ONLY)
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const entryId = req.params.id;
    const { department_id, course_id, course_input, instructor_id, room_id, day_of_week, start_time, end_time, section, semester, session_type, notes } = req.body;

    const existing = await get('SELECT * FROM timetable_entries WHERE id = ?', [entryId]);
    if (!existing) {
      return res.status(404).json({ error: 'Timetable slot not found.' });
    }

    if (!canManageDepartment(req.session.user, existing.department_id) || !canManageDepartment(req.session.user, department_id)) {
      return res.status(403).json({ error: 'Forbidden. You can only edit your assigned department schedule.' });
    }

    // MANDATORY Time Constraints Validation (University operating hours: 07:30 AM to 04:00 PM)
    if (start_time < '07:30') {
      return res.status(400).json({ error: 'Classes cannot start earlier than 07:30 AM (University Opening Time).' });
    }
    if (end_time > '16:00') {
      return res.status(400).json({ error: 'Classes cannot end later than 04:00 PM / 16:00 (University Closing Time).' });
    }
    if (end_time <= start_time) {
      return res.status(400).json({ error: `End time (${end_time}) must be higher than Start time (${start_time}).` });
    }

    if (day_of_week === 'Saturday' || day_of_week === 'Sunday') {
      return res.status(400).json({ error: 'Saturday and Sunday are university holidays. Classes can only be scheduled Monday through Friday.' });
    }
    if (start_time < '13:00' && end_time > '12:00') {
      return res.status(400).json({ error: '12:00 PM to 01:00 PM is Lunch / Recess Break. Classes cannot be scheduled during break.' });
    }
    if (day_of_week === 'Friday' && start_time < '14:00' && end_time > '13:00') {
      return res.status(400).json({ error: '01:00 PM to 02:00 PM is Jummah Prayer Break on Friday. Classes cannot be scheduled during break.' });
    }

    const courseObj = await resolveOrCreateCourse(course_id, course_input, department_id, semester);
    if (!courseObj) {
      return res.status(400).json({ error: 'Valid course code or name is required.' });
    }

    const roomConflict = await isRoomOccupied(room_id, day_of_week, start_time, end_time, entryId);
    if (roomConflict) {
      return res.status(409).json({ 
        error: `Room "${roomConflict.room_name}" is ALREADY occupied by ${roomConflict.course_code} on ${day_of_week} (${roomConflict.start_time} - ${roomConflict.end_time})!` 
      });
    }

    await run(
      `UPDATE timetable_entries 
       SET department_id = ?, course_id = ?, instructor_id = ?, room_id = ?, day_of_week = ?, start_time = ?, end_time = ?, section = ?, semester = ?, session_type = ?, notes = ? 
       WHERE id = ?`,
      [department_id, courseObj.id, instructor_id || 1, room_id, day_of_week, start_time, end_time, section.toUpperCase(), semester, session_type || 'Lecture', notes || '', entryId]
    );

    res.json({ message: 'Timetable slot updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update timetable slot: ' + err.message });
  }
});

// DELETE /api/timetable/clear-department/:deptId - Clear ALL slots for a department in 1 click (Dept Coordinator ONLY)
router.delete('/clear-department/:deptId', isAuthenticated, async (req, res) => {
  try {
    const deptId = Number(req.params.deptId);

    if (!canManageDepartment(req.session.user, deptId)) {
      return res.status(403).json({ error: 'Forbidden. You can only clear timetable slots for your own department!' });
    }

    const result = await run('DELETE FROM TIMETABLE_ENTRIES WHERE DEPARTMENT_ID = ?', [deptId]);
    res.json({ message: `Successfully cleared ${result.changes} scheduled timetable slots for this department. Rooms and credentials remain intact!` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear department timetable: ' + err.message });
  }
});

// DELETE /api/timetable/:id - Delete single timetable slot (Occupant Dept OR Room Owner Dept)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const entryId = req.params.id;
    const existing = await get('SELECT * FROM timetable_entries WHERE id = ?', [entryId]);
    if (!existing) {
      return res.status(404).json({ error: 'Timetable slot not found.' });
    }

    const room = await get('SELECT * FROM rooms WHERE id = ?', [existing.room_id]);

    const isOccupantDept = Number(req.session.user.department_id) === Number(existing.department_id);
    const isRoomOwnerDept = room && Number(req.session.user.department_id) === Number(room.department_id);
    const isAdmin = req.session.user.role === 'admin';

    if (!isAdmin && !isOccupantDept && !isRoomOwnerDept) {
      return res.status(403).json({ error: 'Forbidden. Only the room owner department or occupant department can delete this schedule slot.' });
    }

    await run('DELETE FROM timetable_entries WHERE id = ?', [entryId]);
    res.json({ message: 'Timetable slot deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete timetable slot.' });
  }
});

module.exports = router;
