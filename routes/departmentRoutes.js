const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, run, get } = require('../db/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// GET /api/departments/resource-sharing - Campus-level resource sharing, independent allocation, and inter-dept support metrics (Requirements 11-18)
router.get('/resource-sharing', isAuthenticated, async(req, res) => {
    try {
        const departments = await query('SELECT * FROM departments ORDER BY name ASC');
        const rooms = await query('SELECT * FROM rooms');
        const timetableEntries = await query('SELECT * FROM timetable_entries');
        const roomRequests = await query('SELECT * FROM room_requests');

        // 1. Determine Shared vs Independent Rooms
        let totalRooms = rooms.length;
        let sharedRoomCount = 0;
        let independentRoomCount = 0;

        const roomSharingDetails = rooms.map(room => {
            const entriesForRoom = timetableEntries.filter(t => Number(t.room_id) === Number(room.id));
            const deptsUsingRoom = new Set(entriesForRoom.map(t => Number(t.department_id)));

            // Approved requests for room
            const requestsForRoom = roomRequests.filter(r => Number(r.room_id) === Number(room.id) && r.status === 'approved');
            requestsForRoom.forEach(r => deptsUsingRoom.add(Number(r.requesting_department_id)));

            const isShared = deptsUsingRoom.size > 1;
            if (isShared) {
                sharedRoomCount++;
            } else {
                independentRoomCount++;
            }

            return {
                id: room.id,
                room_name: room.room_name,
                owning_department_id: room.department_id,
                room_type: room.room_type,
                is_shared: isShared,
                departments_count: deptsUsingRoom.size
            };
        });

        const sharedResourcePct = totalRooms > 0 ? Math.round((sharedRoomCount / totalRooms) * 100 * 10) / 10 : 0;
        const independentResourcePct = totalRooms > 0 ? Math.round((independentRoomCount / totalRooms) * 100 * 10) / 10 : 0;

        // 2. Inter-Departmental Support Matrix
        // Support provided by department A to department B = cross-department schedule entries or approved requests
        const interDeptSupport = departments.map(owningDept => {
            const owningRooms = rooms.filter(r => Number(r.department_id) === Number(owningDept.id));
            const owningRoomIds = new Set(owningRooms.map(r => r.id));

            let totalSupportedSlots = 0;
            let crossDeptSlots = 0;
            const recipientDepts = {};

            timetableEntries.forEach(entry => {
                if (owningRoomIds.has(Number(entry.room_id))) {
                    totalSupportedSlots++;
                    if (Number(entry.department_id) !== Number(owningDept.id)) {
                        crossDeptSlots++;
                        recipientDepts[entry.department_id] = (recipientDepts[entry.department_id] || 0) + 1;
                    }
                }
            });

            const supportProvidedPct = totalSupportedSlots > 0 ? Math.round((crossDeptSlots / totalSupportedSlots) * 100 * 10) / 10 : 0;

            return {
                department_id: owningDept.id,
                department_name: owningDept.name,
                department_code: owningDept.code,
                total_rooms: owningRooms.length,
                total_slots_hosted: totalSupportedSlots,
                cross_department_slots_provided: crossDeptSlots,
                support_provided_pct: supportProvidedPct,
                recipient_breakdown: recipientDepts
            };
        });

        // 3. Consolidated Campus Availability Color Scheme Metrics (Req 15, 16, 17, 18)
        // Green (100% available / 0-49% utilization), Yellow (50-89% moderate utilization), Red (90-100% full utilization)
        let greenAvailableCount = 0;
        let yellowMediumCount = 0;
        let redFullCount = 0;

        const roomStatusList = rooms.map(room => {
            const entries = timetableEntries.filter(e => Number(e.room_id) === Number(room.id));
            const activeSlots = entries.length;
            const maxSlotsPerWeek = 40; // 8 slots/day * 5 days
            const utilPct = Math.min(100, Math.round((activeSlots / maxSlotsPerWeek) * 100));

            let status = 'Available';
            let colorCode = '#16a34a'; // Green (Req 15)

            if (utilPct >= 90) {
                status = 'Fully Utilized';
                colorCode = '#dc2626'; // Red (Req 17)
                redFullCount++;
            } else if (utilPct >= 50) {
                status = 'Moderate Utilization';
                colorCode = '#eab308'; // Yellow/Orange (Req 16)
                yellowMediumCount++;
            } else {
                greenAvailableCount++;
            }

            return {
                room_id: room.id,
                room_name: room.room_name,
                room_type: room.room_type,
                utilization_pct: utilPct,
                status,
                color_code: colorCode
            };
        });

        res.json({
            total_rooms: totalRooms,
            shared_room_count: sharedRoomCount,
            independent_room_count: independentRoomCount,
            shared_resource_pct: sharedResourcePct,
            independent_resource_pct: independentResourcePct,
            inter_departmental_support: interDeptSupport,
            campus_availability_breakdown: {
                green_available_count: greenAvailableCount,
                yellow_medium_count: yellowMediumCount,
                red_full_count: redFullCount,
                available_pct: totalRooms > 0 ? Math.round((greenAvailableCount / totalRooms) * 100) : 100,
                medium_pct: totalRooms > 0 ? Math.round((yellowMediumCount / totalRooms) * 100) : 0,
                full_pct: totalRooms > 0 ? Math.round((redFullCount / totalRooms) * 100) : 0
            },
            room_status_list: roomStatusList
        });
    } catch (err) {
        console.error('Resource sharing metrics error:', err);
        res.status(500).json({ error: 'Failed to calculate campus resource sharing metrics.' });
    }
});

// GET /api/departments - List departments (LOGIN REQUIRED)
router.get('/', isAuthenticated, async(req, res) => {
    try {
        const departments = await query('SELECT * FROM departments ORDER BY name ASC');
        const rooms = await query('SELECT * FROM rooms');
        const instructors = await query('SELECT * FROM instructors');

        const result = departments.map(d => {
            const deptRooms = rooms.filter(r => Number(r.department_id) === Number(d.id));
            const deptInstructors = instructors.filter(i => Number(i.department_id) === Number(d.id));
            return {...d, rooms: deptRooms, instructors: deptInstructors };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch departments.' });
    }
});

// GET /api/departments/credentials - List all coordinator credentials (Super Admin ONLY)
router.get('/credentials', isAuthenticated, isAdmin, async(req, res) => {
    try {
        const users = await query(`
      SELECT u.id, u.username, u.full_name, u.email, u.role, u.department_id, u.created_at,
             d.name as department_name, d.code as department_code, d.color as department_color
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      ORDER BY u.role ASC, d.name ASC
    `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch coordinator credentials.' });
    }
});

// GET /api/departments/:id/rooms - Get rooms for a department (LOGIN REQUIRED)
router.get('/:id/rooms', isAuthenticated, async(req, res) => {
    try {
        const deptId = req.params.id;
        const rooms = await query('SELECT * FROM rooms WHERE department_id = ? ORDER BY room_name ASC', [deptId]);
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch rooms for department.' });
    }
});

// POST /api/departments - Add department AND coordinator credentials (Super Admin ONLY)
router.post('/', isAuthenticated, isAdmin, async(req, res) => {
    try {
        const { name, code, color, building, coordinator_username, coordinator_password, coordinator_name, coordinator_email } = req.body;

        if (!name || !code) {
            return res.status(400).json({ error: 'Department name and code are required.' });
        }

        const deptResult = await run(
            'INSERT INTO departments (name, code, color, building) VALUES (?, ?, ?, ?)', [name, code.toUpperCase(), color || '#006633', building || 'UET KSK Campus']
        );

        const newDeptId = deptResult.id;
        let userId = null;

        if (coordinator_username && coordinator_password) {
            const passHash = await bcrypt.hash(coordinator_password, 10);
            const userResult = await run(
                'INSERT INTO users (username, password_hash, full_name, email, role, department_id) VALUES (?, ?, ?, ?, ?, ?)', [coordinator_username, passHash, coordinator_name || `${code} Head`, coordinator_email || `${code.toLowerCase()}@uet.edu.pk`, 'dept_admin', newDeptId]
            );
            userId = userResult.id;
        }

        res.json({ message: 'Department and coordinator created successfully', id: newDeptId, userId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create department: ' + err.message });
    }
});

// DELETE /api/departments/:id - Delete department and ALL related data (Super Admin ONLY)
router.delete('/:id', isAuthenticated, isAdmin, async(req, res) => {
    try {
        const deptId = Number(req.params.id);

        const dept = await get('SELECT * FROM departments WHERE id = ?', [deptId]);
        if (!dept) {
            return res.status(404).json({ error: 'Department not found.' });
        }

        // Cascade delete: timetable entries for this dept's rooms, instructors, rooms,
        // the coordinator login (users), and finally the department itself.
        const deptRooms = await query('SELECT id FROM rooms WHERE department_id = ?', [deptId]);
        const deptRoomIds = deptRooms.map(r => r.id);

        for (const roomId of deptRoomIds) {
            await run('DELETE FROM timetable_entries WHERE room_id = ?', [roomId]);
        }
        await run('DELETE FROM timetable_entries WHERE department_id = ?', [deptId]);
        await run('DELETE FROM instructors WHERE department_id = ?', [deptId]);
        await run('DELETE FROM rooms WHERE department_id = ?', [deptId]);
        await run('DELETE FROM users WHERE department_id = ?', [deptId]);
        await run('DELETE FROM departments WHERE id = ?', [deptId]);

        res.json({ message: `Department "${dept.name}" (${dept.code}) and ALL associated rooms, login credentials, faculty members, and schedule slots have been deleted permanently.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete department: ' + err.message });
    }
});

module.exports = router;