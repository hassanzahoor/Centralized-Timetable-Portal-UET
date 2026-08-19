const express = require('express');
const router = express.Router();
const { query, run } = require('../db/database');
const { isAuthenticated, requireDepartmentAccess } = require('../middleware/auth');

// GET /api/courses - List courses (optionally filtered by department)
router.get('/', async (req, res) => {
  try {
    const { department_id } = req.query;
    let sql = `
      SELECT c.*, d.name as department_name, d.code as department_code, d.color as department_color 
      FROM courses c 
      JOIN departments d ON c.department_id = d.id
    `;
    let params = [];

    if (department_id) {
      sql += ' WHERE c.department_id = ?';
      params.push(department_id);
    }

    sql += ' ORDER BY c.semester ASC, c.course_code ASC';
    const courses = await query(sql, params);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch courses.' });
  }
});

// POST /api/courses - Add course (RBAC: Only department admin or Super admin)
router.post('/', isAuthenticated, requireDepartmentAccess('department_id'), async (req, res) => {
  try {
    const { course_code, course_name, department_id, credit_hours, semester, program } = req.body;
    if (!course_code || !course_name || !department_id) {
      return res.status(400).json({ error: 'Course code, name, and department ID are required.' });
    }

    const result = await run(
      'INSERT INTO courses (course_code, course_name, department_id, credit_hours, semester, program) VALUES (?, ?, ?, ?, ?, ?)',
      [course_code.toUpperCase(), course_name, department_id, credit_hours || 3, semester || 1, program || 'BS']
    );

    res.json({ message: 'Course created successfully', id: result.id });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Course code already exists.' });
    }
    res.status(500).json({ error: 'Failed to create course.' });
  }
});

module.exports = router;
