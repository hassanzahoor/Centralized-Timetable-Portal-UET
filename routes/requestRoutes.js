const express = require('express');
const router = express.Router();
const { run, query, get } = require('../db/database');
const { isAuthenticated } = require('../middleware/auth');

// Helper to check room collision
const isRoomOccupied = async (roomId, dayOfWeek, startTime, endTime) => {
  const sql = `
    SELECT t.* 
    FROM timetable_entries t
    WHERE t.day_of_week = ? AND t.room_id = ? 
    AND (t.start_time < ? AND t.end_time > ?)
  `;
  return await get(sql, [dayOfWeek, roomId, endTime, startTime]);
};

// GET /api/requests - List room requests for user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    let requests = [];

    if (user.role === 'admin') {
      requests = await query('SELECT * FROM room_requests');
    } else {
      const allReqs = await query('SELECT * FROM room_requests');
      requests = allReqs.filter(r => 
        Number(r.owning_department_id) === Number(user.department_id) || 
        Number(r.requesting_department_id) === Number(user.department_id)
      );
    }

    res.json(requests);
  } catch (err) {
    console.error('Fetch requests error:', err);
    res.status(500).json({ error: 'Failed to fetch room requests.' });
  }
});

// POST /api/requests - Submit a cross-department room request
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Forbidden. Super Admin does not send department room requests.' });
    }

    const { room_id, day_of_week, start_time, end_time, course_code, course_name, section, semester, notes } = req.body;

    if (!room_id || !day_of_week || !start_time || !end_time) {
      return res.status(400).json({ error: 'Target room, day, start time, and end time are required.' });
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
      return res.status(400).json({ error: 'Saturday and Sunday are university holidays. Room requests can only be submitted Monday through Friday.' });
    }
    if (start_time < '13:00' && end_time > '12:00') {
      return res.status(400).json({ error: '12:00 PM to 01:00 PM is Lunch / Recess Break. Room requests cannot be submitted during break.' });
    }
    if (day_of_week === 'Friday' && start_time < '14:00' && end_time > '13:00') {
      return res.status(400).json({ error: '01:00 PM to 02:00 PM is Jummah Prayer Break on Friday. Room requests cannot be submitted during break.' });
    }

    const targetRoom = await get('SELECT * FROM rooms WHERE id = ?', [room_id]);
    if (!targetRoom) {
      return res.status(404).json({ error: 'Target room not found.' });
    }

    if (Number(targetRoom.department_id) === Number(user.department_id)) {
      return res.status(400).json({ error: 'This room already belongs to your department. Use Add Schedule Slot directly.' });
    }

    // MANDATORY VACANCY CHECK: Room MUST be free during requested time slot!
    const conflict = await isRoomOccupied(targetRoom.id, day_of_week, start_time, end_time);
    if (conflict) {
      return res.status(400).json({ 
        error: `Room "${targetRoom.room_name}" is ALREADY OCCUPIED on ${day_of_week} (${start_time} - ${end_time}). Requests can only be submitted for vacant rooms.` 
      });
    }

    const requestingDeptId = user.department_id;
    const owningDeptId = targetRoom.department_id || 1;

    const result = await run(
      `INSERT INTO room_requests 
       (requesting_department_id, owning_department_id, room_id, day_of_week, start_time, end_time, course_code, course_name, section, semester, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestingDeptId,
        owningDeptId,
        targetRoom.id,
        day_of_week,
        start_time,
        end_time,
        course_code || `${user.department_code || 'CS'}-REQ`,
        course_name || 'Requested Guest Lecture',
        section || `${user.department_code || 'CS'}-1A`,
        semester || 1,
        notes || ''
      ]
    );

    res.json({
      message: `Room request submitted successfully to ${targetRoom.department_name} for room ${targetRoom.room_name}!`,
      requestId: result.id
    });

  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ error: 'Failed to submit room request: ' + err.message });
  }
});

// POST /api/requests/:id/approve - Approve room request & allocate room in timetable
router.post('/:id/approve', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    const reqId = Number(req.params.id);

    const roomReq = await get('SELECT * FROM room_requests WHERE id = ?', [reqId]);
    if (!roomReq) {
      return res.status(404).json({ error: 'Room request not found.' });
    }

    if (user.role !== 'admin' && Number(roomReq.owning_department_id) !== Number(user.department_id)) {
      return res.status(403).json({ error: 'Forbidden. Only the owner department coordinator can approve this request.' });
    }

    if (roomReq.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${roomReq.status}.` });
    }

    // Re-verify room vacancy
    const conflict = await isRoomOccupied(roomReq.room_id, roomReq.day_of_week, roomReq.start_time, roomReq.end_time);
    if (conflict) {
      return res.status(400).json({ error: 'Cannot approve request: Room is occupied during this time slot.' });
    }

    // Get or create course for requesting department
    let course = await get('SELECT * FROM courses WHERE department_id = ? AND course_code = ?', [roomReq.requesting_department_id, roomReq.course_code]);
    if (!course) {
      const newCourseRes = await run(
        'INSERT INTO courses (course_code, course_name, department_id, credit_hours) VALUES (?, ?, ?, ?)',
        [roomReq.course_code, roomReq.course_name, roomReq.requesting_department_id, 3]
      );
      course = { id: newCourseRes.id };
    }

    // Get default instructor for requesting department
    const reqInsts = await query('SELECT * FROM instructors WHERE department_id = ?', [roomReq.requesting_department_id]);
    const defaultInstId = reqInsts[0] ? reqInsts[0].id : 1;

    const targetRoom = await get('SELECT * FROM rooms WHERE id = ?', [roomReq.room_id]);

    // Insert allocated slot into timetable_entries ONLY for requested time slot
    await run(
      `INSERT INTO timetable_entries 
       (department_id, course_id, instructor_id, room_id, day_of_week, start_time, end_time, section, semester, session_type, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomReq.requesting_department_id,
        course.id,
        defaultInstId,
        roomReq.room_id,
        roomReq.day_of_week,
        roomReq.start_time,
        roomReq.end_time,
        roomReq.section,
        roomReq.semester,
        targetRoom && targetRoom.room_type === 'Computer Lab' ? 'Lab' : 'Lecture',
        `Approved cross-dept allocation (Request #${roomReq.id})`
      ]
    );

    // Update status to approved
    await run('UPDATE room_requests SET status = ? WHERE id = ?', ['approved', roomReq.id]);

    res.json({ message: `Room request #${roomReq.id} APPROVED! Room "${targetRoom ? targetRoom.room_name : ''}" has been allocated for ${roomReq.day_of_week} (${roomReq.start_time}-${roomReq.end_time}).` });

  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ error: 'Failed to approve request: ' + err.message });
  }
});

// POST /api/requests/:id/reject - Reject room request
router.post('/:id/reject', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    const reqId = Number(req.params.id);

    const roomReq = await get('SELECT * FROM room_requests WHERE id = ?', [reqId]);
    if (!roomReq) {
      return res.status(404).json({ error: 'Room request not found.' });
    }

    if (user.role !== 'admin' && Number(roomReq.owning_department_id) !== Number(user.department_id)) {
      return res.status(403).json({ error: 'Forbidden. Only the owner department coordinator can reject this request.' });
    }

    if (roomReq.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${roomReq.status}.` });
    }

    await run('UPDATE room_requests SET status = ? WHERE id = ?', ['rejected', roomReq.id]);

    res.json({ message: `Room request #${roomReq.id} has been rejected.` });

  } catch (err) {
    console.error('Reject request error:', err);
    res.status(500).json({ error: 'Failed to reject request: ' + err.message });
  }
});

// DELETE /api/requests/:id - Delete / cancel a room request
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    const reqId = Number(req.params.id);

    const roomReq = await get('SELECT * FROM room_requests WHERE id = ?', [reqId]);
    if (!roomReq) {
      return res.status(404).json({ error: 'Room request not found.' });
    }

    const isRequestingDept = Number(roomReq.requesting_department_id) === Number(user.department_id);
    const isOwningDept = Number(roomReq.owning_department_id) === Number(user.department_id);
    const isAdmin = user.role === 'admin';

    if (!isAdmin && !isRequestingDept && !isOwningDept) {
      return res.status(403).json({ error: 'Forbidden. You can only delete room requests associated with your department.' });
    }

    // If request was approved, also clean up the associated timetable entry if present
    if (roomReq.status === 'approved') {
      const entries = await query('SELECT * FROM timetable_entries T WHERE 1=1');
      const match = entries.find(e => 
        Number(e.department_id) === Number(roomReq.requesting_department_id) &&
        Number(e.room_id) === Number(roomReq.room_id) &&
        e.day_of_week === roomReq.day_of_week &&
        e.start_time === roomReq.start_time &&
        e.end_time === roomReq.end_time
      );
      if (match) {
        await run('DELETE FROM timetable_entries WHERE id = ?', [match.id]);
      }
    }

    await run('DELETE FROM room_requests WHERE id = ?', [roomReq.id]);

    res.json({ message: `Room request #${reqId} has been deleted successfully.` });
  } catch (err) {
    console.error('Delete request error:', err);
    res.status(500).json({ error: 'Failed to delete request: ' + err.message });
  }
});

module.exports = router;
