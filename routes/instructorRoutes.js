const express = require('express');
const router = express.Router();
const { query, run } = require('../db/database');
const { isAuthenticated, requireDepartmentAccess } = require('../middleware/auth');

// GET /api/instructors - List instructors
router.get('/', async (req, res) => {
  try {
    const { department_id } = req.query;
    let sql = `
      SELECT i.*, d.name as department_name, d.code as department_code 
      FROM instructors i 
      JOIN departments d ON i.department_id = d.id
    `;
    let params = [];

    if (department_id) {
      sql += ' WHERE i.department_id = ?';
      params.push(department_id);
    }

    sql += ' ORDER BY i.name ASC';
    const instructors = await query(sql, params);
    res.json(instructors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch instructors.' });
  }
});

// GET /api/instructors/workload - Calculate faculty workload and utilization stats (Requirements 19-22)
router.get('/workload', async (req, res) => {
  try {
    const instructors = await query(`
      SELECT i.*, d.name as department_name, d.code as department_code 
      FROM instructors i 
      JOIN departments d ON i.department_id = d.id
      ORDER BY i.name ASC
    `);

    const timetableEntries = await query(`
      SELECT t.*, c.course_code, c.course_name, c.credit_hours 
      FROM timetable_entries t
      JOIN courses c ON t.course_id = c.id
    `);

    const workloadList = instructors.map(inst => {
      const assignedSlots = timetableEntries.filter(e => Number(e.instructor_id) === Number(inst.id));
      const totalSlots = assignedSlots.length;

      // Unique courses taught
      const courseMap = {};
      let totalCreditHours = 0;
      assignedSlots.forEach(slot => {
        if (!courseMap[slot.course_id]) {
          courseMap[slot.course_id] = slot;
          totalCreditHours += (Number(slot.credit_hours) || 3);
        }
      });

      const assignedCourses = Object.values(courseMap).map(c => `${c.course_code} - ${c.course_name}`);
      const maxTargetHours = Number(inst.max_credit_hours) || 12;
      const utilizationPct = Math.min(100, Math.round((totalCreditHours / maxTargetHours) * 100));

      // Color coding logic (Req 15, 16, 17, 18):
      // Green = 0-49% (100% / high availability), Yellow = 50-89% (medium utilization), Red = 90-100% (100% / full utilization)
      let workloadStatus = 'Available';
      let statusColor = '#16a34a'; // Green
      if (utilizationPct >= 90) {
        workloadStatus = 'Fully Utilized';
        statusColor = '#dc2626'; // Red
      } else if (utilizationPct >= 50) {
        workloadStatus = 'Moderate Workload';
        statusColor = '#eab308'; // Yellow/Orange
      }

      return {
        ...inst,
        phone: inst.phone || '+92 42 99029200',
        office_room: inst.office_room || 'Academic Block, Faculty Office',
        max_credit_hours: maxTargetHours,
        assigned_slots_count: totalSlots,
        total_credit_hours: totalCreditHours,
        assigned_courses: assignedCourses,
        utilization_pct: utilizationPct,
        workload_status: workloadStatus,
        status_color: statusColor
      };
    });

    res.json(workloadList);
  } catch (err) {
    console.error('Fetch workload error:', err);
    res.status(500).json({ error: 'Failed to calculate faculty workload metrics.' });
  }
});

// POST /api/instructors - Add instructor (RBAC protected)
router.post('/', isAuthenticated, requireDepartmentAccess('department_id'), async (req, res) => {
  try {
    const { name, email, designation, department_id, phone, office_room, max_credit_hours } = req.body;
    if (!name || !department_id) {
      return res.status(400).json({ error: 'Instructor name and department ID are required.' });
    }

    const result = await run(
      'INSERT INTO instructors (name, email, designation, department_id, phone, office_room, max_credit_hours) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        name, 
        email || '', 
        designation || 'Lecturer', 
        department_id,
        phone || '+92 42 99029200',
        office_room || 'Academic Block, Faculty Office',
        Number(max_credit_hours) || 12
      ]
    );

    res.json({ message: 'Instructor added successfully', id: result.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add instructor: ' + err.message });
  }
});

// PUT /api/instructors/:id - Update instructor (RBAC protected)
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const instId = Number(req.params.id);
    const { name, email, designation, department_id, phone, office_room, max_credit_hours } = req.body;

    const instructors = await query('SELECT * FROM instructors WHERE id = ?', [instId]);
    if (!instructors || instructors.length === 0) {
      return res.status(404).json({ error: 'Faculty member not found.' });
    }
    const inst = instructors[0];

    if (req.session.user.role === 'dept_admin' && Number(req.session.user.department_id) !== Number(inst.department_id)) {
      return res.status(403).json({ error: 'Forbidden. You can only edit faculty members belonging to your own department!' });
    }

    await run(
      'UPDATE INSTRUCTORS SET name = ?, email = ?, designation = ?, department_id = ?, phone = ?, office_room = ?, max_credit_hours = ? WHERE id = ?',
      [
        name || inst.name, 
        email !== undefined ? email : inst.email, 
        designation || inst.designation, 
        department_id || inst.department_id,
        phone !== undefined ? phone : inst.phone,
        office_room !== undefined ? office_room : inst.office_room,
        max_credit_hours !== undefined ? Number(max_credit_hours) : inst.max_credit_hours,
        instId
      ]
    );

    res.json({ message: 'Faculty member updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update faculty member: ' + err.message });
  }
});

// DELETE /api/instructors/:id - Delete instructor (RBAC protected)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const instId = Number(req.params.id);

    const instructors = await query('SELECT * FROM instructors WHERE id = ?', [instId]);
    if (!instructors || instructors.length === 0) {
      return res.status(404).json({ error: 'Faculty member not found.' });
    }
    const inst = instructors[0];

    if (req.session.user.role === 'dept_admin' && Number(req.session.user.department_id) !== Number(inst.department_id)) {
      return res.status(403).json({ error: 'Forbidden. You can only delete faculty members belonging to your own department!' });
    }

    await run('DELETE FROM INSTRUCTORS WHERE id = ?', [instId]);

    res.json({ message: `Faculty member "${inst.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete faculty member: ' + err.message });
  }
});

module.exports = router;
