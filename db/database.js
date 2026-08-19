const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbFilePath = process.env.DB_PATH || path.join(__dirname, 'timetable.json');

let dbData = {
    departments: [],
    users: [],
    rooms: [],
    courses: [],
    instructors: [],
    timetable_entries: [],
    room_requests: [],
    counters: {
        departments: 0,
        users: 0,
        rooms: 0,
        courses: 0,
        instructors: 0,
        timetable_entries: 0,
        room_requests: 0
    }
};

const saveDb = () => {
    try {
        fs.writeFileSync(dbFilePath, JSON.stringify(dbData, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing database to disk:', err);
    }
};

const isBreakOrWeekendSlot = (day, start, end) => {
    if (day === 'Saturday' || day === 'Sunday') return true;
    // Lunch/Recess Break (12:00 to 13:00) on Mon-Fri
    if (start < '13:00' && end > '12:00') return true;
    // Friday Jummah Break (13:00 to 14:00)
    if (day === 'Friday' && start < '14:00' && end > '13:00') return true;
    return false;
};

const loadDb = () => {
    if (fs.existsSync(dbFilePath)) {
        try {
            const raw = fs.readFileSync(dbFilePath, 'utf8');
            dbData = JSON.parse(raw);
            if (!dbData.room_requests) dbData.room_requests = [];
            if (!dbData.counters) dbData.counters = {};
            if (!dbData.counters.room_requests) dbData.counters.room_requests = dbData.room_requests.length;

            // Purge non-compliant slots (weekend or break time overlaps)
            const initEntriesLen = dbData.timetable_entries ? dbData.timetable_entries.length : 0;
            const initReqsLen = dbData.room_requests ? dbData.room_requests.length : 0;

            if (dbData.timetable_entries) {
                dbData.timetable_entries = dbData.timetable_entries.filter(e => !isBreakOrWeekendSlot(e.day_of_week, e.start_time, e.end_time));
            }
            if (dbData.room_requests) {
                dbData.room_requests = dbData.room_requests.filter(r => !isBreakOrWeekendSlot(r.day_of_week, r.start_time, r.end_time));
            }

            if ((dbData.timetable_entries && dbData.timetable_entries.length !== initEntriesLen) ||
                (dbData.room_requests && dbData.room_requests.length !== initReqsLen)) {
                saveDb();
                console.log(`Cleaned up non-compliant timetable slots/requests from database.`);
            }
        } catch (err) {
            console.error('Error reading database file, starting fresh:', err);
        }
    }
};

const get = async(sql, params = []) => {
    const rows = await query(sql, params);
    return rows.length > 0 ? rows[0] : null;
};

const run = async(sql, params = []) => {
    loadDb();
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith('INSERT INTO DEPARTMENTS')) {
        const [name, code, color, building] = params;
        if (dbData.departments.some(d => d.name === name || d.code === code)) {
            throw new Error('UNIQUE constraint failed: Department name or code already exists.');
        }
        dbData.counters.departments++;
        const newDept = {
            id: dbData.counters.departments,
            name,
            code,
            color: color || '#006633',
            building: building || 'UET KSK Campus',
            created_at: new Date().toISOString()
        };
        dbData.departments.push(newDept);
        saveDb();
        return { id: newDept.id, changes: 1 };
    }

    if (trimmed.startsWith('DELETE FROM DEPARTMENTS')) {
        const deptId = Number(params[0]);
        dbData.rooms = dbData.rooms.filter(r => Number(r.department_id) !== deptId);
        dbData.users = dbData.users.filter(u => Number(u.department_id) !== deptId);
        dbData.courses = dbData.courses.filter(c => Number(c.department_id) !== deptId);
        dbData.instructors = dbData.instructors.filter(i => Number(i.department_id) !== deptId);
        dbData.timetable_entries = dbData.timetable_entries.filter(t => Number(t.department_id) !== deptId);

        const initialLen = dbData.departments.length;
        dbData.departments = dbData.departments.filter(d => Number(d.id) !== deptId);
        saveDb();
        return { changes: initialLen - dbData.departments.length };
    }

    if (trimmed.startsWith('INSERT INTO USERS')) {
        const [username, password_hash, full_name, email, role, department_id] = params;
        if (dbData.users.some(u => u.username === username)) {
            throw new Error('UNIQUE constraint failed: Username already exists.');
        }
        dbData.counters.users++;
        const newUser = {
            id: dbData.counters.users,
            username,
            password_hash,
            full_name,
            email,
            role,
            department_id: department_id ? Number(department_id) : null,
            created_at: new Date().toISOString()
        };
        dbData.users.push(newUser);
        saveDb();
        return { id: newUser.id, changes: 1 };
    }

    if (trimmed.startsWith('UPDATE USERS SET')) {
        const [full_name, email, username, password_hash, userId] = params;
        const user = dbData.users.find(u => u.id === Number(userId));
        if (user) {
            if (username && username !== user.username) {
                if (dbData.users.some(u => u.id !== user.id && u.username === username)) {
                    throw new Error('Username already exists. Please choose a different username.');
                }
            }
            if (full_name) user.full_name = full_name;
            if (email !== undefined) user.email = email;
            if (username) user.username = username;
            if (password_hash) user.password_hash = password_hash;
            user.updated_at = new Date().toISOString();
            saveDb();
            return { id: user.id, changes: 1 };
        }
        return { id: userId, changes: 0 };
    }

    if (trimmed.startsWith('INSERT INTO ROOMS')) {
        const [room_name, building, capacity, room_type, department_id, chairs_count, projector, computers_count] = params;
        dbData.counters.rooms++;
        const newRoom = {
            id: dbData.counters.rooms,
            room_name,
            building: building || 'Main Academic Block',
            capacity: Number(capacity) || Number(chairs_count) || 40,
            room_type: room_type || (room_name.toLowerCase().includes('lab') ? 'Computer Lab' : 'Lecture Hall'),
            department_id: department_id ? Number(department_id) : null,
            chairs_count: Number(chairs_count) || Number(capacity) || 40,
            projector: projector === 'Yes' || projector === 1 || projector === '1' ? 1 : 0,
            computers_count: Number(computers_count) || (room_type === 'Computer Lab' ? 40 : 0),
            created_at: new Date().toISOString()
        };
        dbData.rooms.push(newRoom);
        saveDb();
        return { id: newRoom.id, changes: 1 };
    }

    if (trimmed.startsWith('UPDATE ROOMS SET')) {
        const lastParam = params[params.length - 1];
        let room = dbData.rooms.find(r => r.id === Number(lastParam));
        if (!room) {
            room = dbData.rooms.find(r => r.room_name === String(lastParam));
        }
        if (room) {
            if (params.length >= 7) {
                const [deptId, capacity, chairs, roomType, proj, comps] = params;
                room.department_id = Number(deptId);
                room.capacity = Number(capacity);
                room.chairs_count = Number(chairs);
                room.room_type = roomType;
                room.projector = Number(proj);
                room.computers_count = Number(comps);
            } else if (params.length === 4) {
                const [deptId, chairs, proj] = params;
                room.department_id = Number(deptId);
                room.capacity = Number(chairs);
                room.chairs_count = Number(chairs);
                room.projector = Number(proj);
            }
            saveDb();
            return { id: room.id, changes: 1 };
        }
        return { id: 0, changes: 0 };
    }

    if (trimmed.startsWith('DELETE FROM ROOMS')) {
        const roomId = Number(params[0]);
        dbData.timetable_entries = dbData.timetable_entries.filter(t => Number(t.room_id) !== roomId);
        const initialLen = dbData.rooms.length;
        dbData.rooms = dbData.rooms.filter(r => Number(r.id) !== roomId);
        saveDb();
        return { changes: initialLen - dbData.rooms.length };
    }

    if (trimmed.startsWith('INSERT INTO COURSES')) {
        const [course_code, course_name, department_id, credit_hours, semester, program] = params;
        if (dbData.courses.some(c => c.course_code === course_code)) {
            throw new Error('UNIQUE constraint failed: Course code already exists.');
        }
        dbData.counters.courses++;
        const newCourse = {
            id: dbData.counters.courses,
            course_code,
            course_name,
            department_id: Number(department_id),
            credit_hours: Number(credit_hours) || 3,
            semester: Number(semester) || 1,
            program: program || 'BS',
            created_at: new Date().toISOString()
        };
        dbData.courses.push(newCourse);
        saveDb();
        return { id: newCourse.id, changes: 1 };
    }

    if (trimmed.startsWith('INSERT INTO INSTRUCTORS')) {
        const [name, email, designation, department_id, phone, office_room, max_credit_hours] = params;
        dbData.counters.instructors++;
        const newInst = {
            id: dbData.counters.instructors,
            name,
            email: email || '',
            designation: designation || 'Lecturer',
            department_id: Number(department_id),
            phone: phone || '+92 42 99029200',
            office_room: office_room || 'Academic Block, Faculty Office',
            max_credit_hours: Number(max_credit_hours) || 12,
            created_at: new Date().toISOString()
        };
        dbData.instructors.push(newInst);
        saveDb();
        return { id: newInst.id, changes: 1 };
    }

    if (trimmed.startsWith('UPDATE INSTRUCTORS SET')) {
        const [name, email, designation, department_id, phone, office_room, max_credit_hours, instId] = params;
        const inst = dbData.instructors.find(i => i.id === Number(instId));
        if (inst) {
            if (name) inst.name = name;
            if (email !== undefined) inst.email = email;
            if (designation) inst.designation = designation;
            if (department_id) inst.department_id = Number(department_id);
            if (phone !== undefined) inst.phone = phone;
            if (office_room !== undefined) inst.office_room = office_room;
            if (max_credit_hours !== undefined) inst.max_credit_hours = Number(max_credit_hours);
            inst.updated_at = new Date().toISOString();
            saveDb();
            return { id: inst.id, changes: 1 };
        }
        return { id: instId, changes: 0 };
    }

    if (trimmed.startsWith('DELETE FROM INSTRUCTORS')) {
        const instId = Number(params[0]);
        const initialLen = dbData.instructors.length;
        dbData.instructors = dbData.instructors.filter(i => Number(i.id) !== instId);
        // Remove references in timetable entries
        dbData.timetable_entries = dbData.timetable_entries.filter(t => Number(t.instructor_id) !== instId);
        saveDb();
        return { changes: initialLen - dbData.instructors.length };
    }

    if (trimmed.startsWith('INSERT INTO TIMETABLE_ENTRIES')) {
        const [department_id, course_id, instructor_id, room_id, day_of_week, start_time, end_time, section, semester, session_type, notes] = params;
        dbData.counters.timetable_entries++;
        const newEntry = {
            id: dbData.counters.timetable_entries,
            department_id: Number(department_id),
            course_id: Number(course_id),
            instructor_id: Number(instructor_id),
            room_id: Number(room_id),
            day_of_week,
            start_time,
            end_time,
            section: section.toUpperCase(),
            semester: Number(semester) || 1,
            session_type: session_type || 'Lecture',
            notes: notes || '',
            created_at: new Date().toISOString()
        };
        dbData.timetable_entries.push(newEntry);
        saveDb();
        return { id: newEntry.id, changes: 1 };
    }

    if (trimmed.startsWith('UPDATE TIMETABLE_ENTRIES')) {
        const [dept_id, course_id, inst_id, room_id, day, start, end, section, sem, type, notes, entryId] = params;
        const idx = dbData.timetable_entries.findIndex(e => e.id === Number(entryId));
        if (idx !== -1) {
            dbData.timetable_entries[idx] = {
                ...dbData.timetable_entries[idx],
                department_id: Number(dept_id),
                course_id: Number(course_id),
                instructor_id: Number(inst_id),
                room_id: Number(room_id),
                day_of_week: day,
                start_time: start,
                end_time: end,
                section: section.toUpperCase(),
                semester: Number(sem),
                session_type: type,
                notes: notes !== undefined ? notes : dbData.timetable_entries[idx].notes
            };
            saveDb();
            return { id: entryId, changes: 1 };
        }
        return { id: entryId, changes: 0 };
    }

    if (trimmed.startsWith('DELETE FROM TIMETABLE_ENTRIES WHERE DEPARTMENT_ID')) {
        const deptId = Number(params[0]);
        const initialLen = dbData.timetable_entries.length;
        dbData.timetable_entries = dbData.timetable_entries.filter(e => Number(e.department_id) !== deptId);
        saveDb();
        return { changes: initialLen - dbData.timetable_entries.length };
    }

    if (trimmed.startsWith('DELETE FROM TIMETABLE_ENTRIES')) {
        const entryId = Number(params[0]);
        const initialLen = dbData.timetable_entries.length;
        dbData.timetable_entries = dbData.timetable_entries.filter(e => e.id !== entryId);
        saveDb();
        return { changes: initialLen - dbData.timetable_entries.length };
    }

    if (trimmed.startsWith('INSERT INTO ROOM_REQUESTS')) {
        const [requesting_dept_id, owning_dept_id, room_id, day_of_week, start_time, end_time, course_code, course_name, section, semester, notes] = params;
        dbData.counters.room_requests++;
        const newReq = {
            id: dbData.counters.room_requests,
            requesting_department_id: Number(requesting_dept_id),
            owning_department_id: Number(owning_dept_id),
            room_id: Number(room_id),
            day_of_week,
            start_time,
            end_time,
            course_code: course_code ? course_code.toUpperCase() : 'REQ-101',
            course_name: course_name || 'Requested Lecture',
            section: section ? section.toUpperCase() : 'SEC-1',
            semester: Number(semester) || 1,
            notes: notes || '',
            status: 'pending',
            created_at: new Date().toISOString()
        };
        dbData.room_requests.push(newReq);
        saveDb();
        return { id: newReq.id, changes: 1 };
    }

    if (trimmed.startsWith('UPDATE ROOM_REQUESTS SET STATUS = ?')) {
        const [status, reqId] = params;
        const reqItem = dbData.room_requests.find(r => r.id === Number(reqId));
        if (reqItem) {
            reqItem.status = status;
            reqItem.updated_at = new Date().toISOString();
            saveDb();
            return { id: reqId, changes: 1 };
        }
        return { id: reqId, changes: 0 };
    }

    if (trimmed.startsWith('DELETE FROM ROOM_REQUESTS')) {
        const reqId = Number(params[0]);
        const initialLen = dbData.room_requests.length;
        dbData.room_requests = dbData.room_requests.filter(r => Number(r.id) !== reqId);
        saveDb();
        return { changes: initialLen - dbData.room_requests.length };
    }

    if (trimmed.startsWith('DELETE FROM USERS')) {
        const deptId = Number(params[0]);
        const initialLen = dbData.users.length;
        dbData.users = dbData.users.filter(u => Number(u.department_id) !== deptId);
        saveDb();
        return { changes: initialLen - dbData.users.length };
    }

    return { id: 0, changes: 0 };
};

const query = async(sql, params = []) => {
    loadDb();
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.includes('FROM ROOM_REQUESTS')) {
        let list = dbData.room_requests.map(req => {
            const rDept = dbData.departments.find(d => Number(d.id) === Number(req.requesting_department_id)) || {};
            const oDept = dbData.departments.find(d => Number(d.id) === Number(req.owning_department_id)) || {};
            const room = dbData.rooms.find(r => Number(r.id) === Number(req.room_id)) || {};
            return {
                ...req,
                requesting_department_name: rDept.name || '',
                requesting_department_code: rDept.code || '',
                requesting_department_color: rDept.color || '#006633',
                owning_department_name: oDept.name || '',
                owning_department_code: oDept.code || '',
                room_name: room.room_name || '',
                room_type: room.room_type || 'Lecture Hall'
            };
        });

        if (sql.toLowerCase().includes('where id =')) {
            const reqId = Number(params[0]);
            return list.filter(r => r.id === reqId);
        }

        if (sql.toLowerCase().includes('where owning_department_id =')) {
            const deptId = Number(params[0]);
            return list.filter(r => Number(r.owning_department_id) === deptId);
        }

        if (sql.toLowerCase().includes('where requesting_department_id =')) {
            const deptId = Number(params[0]);
            return list.filter(r => Number(r.requesting_department_id) === deptId);
        }

        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return list;
    }

    if (trimmed.includes('FROM DEPARTMENTS')) {
        let result = dbData.departments.map(d => {
            const user_count = dbData.users.filter(u => Number(u.department_id) === Number(d.id)).length;
            return {...d, user_count };
        });
        result.sort((a, b) => a.name.localeCompare(b.name));
        return result;
    }

    if (trimmed.includes('FROM USERS')) {
        let result = dbData.users.map(u => {
            const dept = dbData.departments.find(d => Number(d.id) === Number(u.department_id));
            return {
                ...u,
                department_name: dept ? dept.name : null,
                department_code: dept ? dept.code : null,
                department_color: dept ? dept.color : null
            };
        });

        if (params.length > 0) {
            const sqlLower = sql.toLowerCase();

            if (sqlLower.includes('where username =') && sqlLower.includes('and id !=')) {
                const username = String(params[0]).trim();
                const excludeId = Number(params[1]);
                return result.filter(u => u.username === username && u.id !== excludeId);
            }

            if (sqlLower.includes('where id =') || sqlLower.includes('where u.id =')) {
                const userId = Number(params[0]);
                return result.filter(u => u.id === userId);
            }

            if (sqlLower.includes('where username =') || sqlLower.includes('where u.username =')) {
                const username = String(params[0]).trim();
                return result.filter(u => u.username === username);
            }

            // Fallback check parameter type
            const paramVal = params[0];
            if (typeof paramVal === 'number' || !isNaN(Number(paramVal))) {
                const userId = Number(paramVal);
                return result.filter(u => u.id === userId);
            } else {
                const username = String(paramVal).trim();
                return result.filter(u => u.username === username);
            }
        }

        return result;
    }

    if (trimmed.includes('FROM ROOMS')) {
        if (trimmed.includes('WHERE R.ID NOT IN')) {
            const occupiedIds = params.map(Number);
            let avail = dbData.rooms.filter(r => !occupiedIds.includes(r.id));
            return avail.map(r => {
                const d = dbData.departments.find(dept => Number(dept.id) === Number(r.department_id));
                return {...r, department_name: d ? d.name : 'General' };
            });
        }

        let result = dbData.rooms.map(r => {
            const d = dbData.departments.find(dept => Number(dept.id) === Number(r.department_id));
            return {
                ...r,
                department_name: d ? d.name : 'General',
                department_code: d ? d.code : null
            };
        });

        if (sql.toLowerCase().includes('where room_name =') || sql.toLowerCase().includes('where r.room_name =')) {
            const name = params[0];
            return result.filter(r => r.room_name === name);
        }

        if (sql.toLowerCase().includes('where id =') || sql.toLowerCase().includes('where r.id =')) {
            const id = Number(params[0]);
            return result.filter(r => r.id === id);
        }

        if (sql.toLowerCase().includes('where department_id =') || sql.toLowerCase().includes('where r.department_id =')) {
            const deptId = Number(params[0]);
            return result.filter(r => Number(r.department_id) === deptId);
        }

        return result;
    }

    if (trimmed.includes('FROM COURSES')) {
        let filtered = [...dbData.courses];
        if (params.length > 0 && params[0]) {
            filtered = filtered.filter(c => Number(c.department_id) === Number(params[0]));
        }
        return filtered.map(c => {
            const d = dbData.departments.find(dept => Number(dept.id) === Number(c.department_id));
            return {
                ...c,
                department_name: d ? d.name : '',
                department_code: d ? d.code : '',
                department_color: d ? d.color : '#006633'
            };
        });
    }

    if (trimmed.includes('FROM INSTRUCTORS')) {
        let filtered = [...dbData.instructors];
        if (params.length > 0 && params[0]) {
            filtered = filtered.filter(i => Number(i.department_id) === Number(params[0]));
        }
        return filtered.map(i => {
            const d = dbData.departments.find(dept => Number(dept.id) === Number(i.department_id));
            return {
                ...i,
                department_name: d ? d.name : '',
                department_code: d ? d.code : ''
            };
        });
    }

    if (trimmed.includes('FROM TIMETABLE_ENTRIES')) {
        let list = dbData.timetable_entries.map(t => {
            const c = dbData.courses.find(x => Number(x.id) === Number(t.course_id)) || {};
            const i = dbData.instructors.find(x => Number(x.id) === Number(t.instructor_id)) || {};
            const r = dbData.rooms.find(x => Number(x.id) === Number(t.room_id)) || {};
            const d = dbData.departments.find(x => Number(x.id) === Number(t.department_id)) || {};
            return {
                ...t,
                course_code: c.course_code || '',
                course_name: c.course_name || '',
                credit_hours: c.credit_hours || 3,
                program: c.program || 'BS',
                instructor_name: i.name || '',
                instructor_email: i.email || '',
                instructor_designation: i.designation || '',
                room_name: r.room_name || '',
                room_building: r.building || '',
                room_capacity: r.capacity || r.chairs_count || 40,
                room_type: r.room_type || 'Lecture Hall',
                room_projector: r.projector ? 1 : 0,
                room_computers: r.computers_count || (r.room_type === 'Computer Lab' ? 40 : 0),
                department_name: d.name || '',
                department_code: d.code || '',
                department_color: d.color || '#006633'
            };
        });

        if (sql.toLowerCase().includes('where id =') || sql.toLowerCase().includes('where t.id =')) {
            const targetId = Number(params[0]);
            return list.filter(e => Number(e.id) === targetId);
        }

        if (trimmed.includes('T.DAY_OF_WEEK = ? AND T.ROOM_ID = ?')) {
            const day = params[0];
            const roomId = Number(params[1]);
            const endTime = params[2];
            const startTime = params[3];
            const excludeId = params[4] ? Number(params[4]) : null;

            list = list.filter(e =>
                e.day_of_week === day &&
                Number(e.room_id) === Number(roomId) &&
                (e.start_time < endTime && e.end_time > startTime) &&
                (excludeId === null || Number(e.id) !== Number(excludeId))
            );
            return list;
        }

        if (trimmed.includes('T.DAY_OF_WEEK = ? AND T.INSTRUCTOR_ID = ?')) {
            const day = params[0];
            const instId = Number(params[1]);
            const endTime = params[2];
            const startTime = params[3];
            const excludeId = params[4] ? Number(params[4]) : null;

            list = list.filter(e =>
                e.day_of_week === day &&
                Number(e.instructor_id) === Number(instId) &&
                (e.start_time < endTime && e.end_time > startTime) &&
                (excludeId === null || Number(e.id) !== Number(excludeId))
            );
            return list;
        }

        if (trimmed.includes('T.DAY_OF_WEEK = ? AND T.SECTION = ?')) {
            const day = params[0];
            const section = params[1];
            const endTime = params[2];
            const startTime = params[3];
            const excludeId = params[4] ? Number(params[4]) : null;

            list = list.filter(e =>
                e.day_of_week === day &&
                e.section.toUpperCase() === section.toUpperCase() &&
                (e.start_time < endTime && e.end_time > startTime) &&
                (excludeId === null || Number(e.id) !== Number(excludeId))
            );
            return list;
        }

        if (sql.includes('WHERE 1=1')) {
            let result = [...list];
            let pIdx = 0;

            if (sql.includes('t.department_id = ?')) {
                const val = Number(params[pIdx++]);
                result = result.filter(e => Number(e.department_id) === val);
            }
            if (sql.includes('t.semester = ?')) {
                const val = Number(params[pIdx++]);
                result = result.filter(e => Number(e.semester) === val);
            }
            if (sql.includes('t.day_of_week = ?')) {
                const val = params[pIdx++];
                result = result.filter(e => e.day_of_week === val);
            }
            if (sql.includes('t.room_id = ?')) {
                const val = Number(params[pIdx++]);
                result = result.filter(e => Number(e.room_id) === val);
            }
            if (sql.includes('t.instructor_id = ?')) {
                const val = Number(params[pIdx++]);
                result = result.filter(e => Number(e.instructor_id) === val);
            }
            if (sql.includes('t.section LIKE ?')) {
                const val = params[pIdx++].replace(/%/g, '').toUpperCase();
                result = result.filter(e => e.section.includes(val));
            }
            if (sql.includes('c.course_code LIKE ?')) {
                const q = params[pIdx].replace(/%/g, '').toLowerCase();
                pIdx += 4;
                result = result.filter(e =>
                    e.course_code.toLowerCase().includes(q) ||
                    e.course_name.toLowerCase().includes(q) ||
                    e.instructor_name.toLowerCase().includes(q) ||
                    e.room_name.toLowerCase().includes(q)
                );
            }

            const dayOrder = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
            result.sort((a, b) => {
                if (dayOrder[a.day_of_week] !== dayOrder[b.day_of_week]) {
                    return dayOrder[a.day_of_week] - dayOrder[b.day_of_week];
                }
                return a.start_time.localeCompare(b.start_time);
            });

            return result;
        }

        return list;
    }

    return [];
};

// Database Initialization & Automatic Seeding from dashboard.xlsx Dataset
const initDatabase = async() => {
    loadDb();
    if (dbData.departments.length > 0 && dbData.instructors && dbData.instructors.length >= 20) {
        console.log('Database loaded with existing data.');
        return;
    }

    // Reset dbData to perform fresh seed with official CS faculty data
    dbData = {
        departments: [],
        users: [],
        rooms: [],
        courses: [],
        instructors: [],
        timetable_entries: [],
        room_requests: [],
        counters: { departments: 0, users: 0, rooms: 0, courses: 0, instructors: 0, timetable_entries: 0, room_requests: 0 }
    };

    console.log('Seeding initial UET KSK database with dashboard.xlsx dataset...');

    // 1. Departments
    const depts = [
        { name: 'Department of Computer Science', code: 'CS', color: '#006633', building: 'Tech Block A' },
        { name: 'Department of Electrical Engineering', code: 'EE', color: '#dc2626', building: 'Engineering Complex' },
        { name: 'Department of Mechanical Engineering', code: 'ME', color: '#ea580c', building: 'Mechanical Block' },
        { name: 'Department of Civil Engineering', code: 'CIV', color: '#16a34a', building: 'Civil Block' },
        { name: 'Department of Environmental Engineering', code: 'ENV', color: '#0891b2', building: 'Environmental Wing' }
    ];

    const deptIds = {};
    for (const d of depts) {
        dbData.counters.departments++;
        const newDept = { id: dbData.counters.departments, name: d.name, code: d.code, color: d.color, building: d.building, created_at: new Date().toISOString() };
        dbData.departments.push(newDept);
        deptIds[d.code] = newDept.id;
    }

    // 2. Users (Super Admin + 5 Department Coordinators)
    const adminPass = await bcrypt.hash('admin123', 10);
    dbData.counters.users++;
    dbData.users.push({ id: dbData.counters.users, username: 'admin', password_hash: adminPass, full_name: 'UET Super Admin', email: 'admin@uet.edu.pk', role: 'admin', department_id: null, created_at: new Date().toISOString() });

    const csPass = await bcrypt.hash('cs123', 10);
    dbData.counters.users++;
    dbData.users.push({ id: dbData.counters.users, username: 'cs_admin', password_hash: csPass, full_name: 'Dr. Junaid Arshad (CS Head)', email: 'cs@uet.edu.pk', role: 'dept_admin', department_id: deptIds['CS'], created_at: new Date().toISOString() });

    const eePass = await bcrypt.hash('ee123', 10);
    dbData.counters.users++;
    dbData.users.push({ id: dbData.counters.users, username: 'ee_admin', password_hash: eePass, full_name: 'Dr. Muhammad Asghar (EE Head)', email: 'ee@uet.edu.pk', role: 'dept_admin', department_id: deptIds['EE'], created_at: new Date().toISOString() });

    const mePass = await bcrypt.hash('me123', 10);
    dbData.counters.users++;
    dbData.users.push({ id: dbData.counters.users, username: 'me_admin', password_hash: mePass, full_name: 'Dr. Tariq Mahmood (ME Head)', email: 'me@uet.edu.pk', role: 'dept_admin', department_id: deptIds['ME'], created_at: new Date().toISOString() });

    const civPass = await bcrypt.hash('civ123', 10);
    dbData.counters.users++;
    dbData.users.push({ id: dbData.counters.users, username: 'civ_admin', password_hash: civPass, full_name: 'Dr. Khalid Mehmood (CIV Head)', email: 'civ@uet.edu.pk', role: 'dept_admin', department_id: deptIds['CIV'], created_at: new Date().toISOString() });

    const envPass = await bcrypt.hash('env123', 10);
    dbData.counters.users++;
    dbData.users.push({ id: dbData.counters.users, username: 'env_admin', password_hash: envPass, full_name: 'Dr. Sajjad H. Sumra (ENV Head)', email: 'env@uet.edu.pk', role: 'dept_admin', department_id: deptIds['ENV'], created_at: new Date().toISOString() });

    // 3. Rooms strictly matching dashboard.xlsx!
    const csRooms = [
        { name: 'G-10', capacity: 50, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['CS'] },
        { name: 'G-11', capacity: 50, type: 'Lecture Hall', proj: 0, comp: 0, dept: deptIds['CS'] },
        { name: 'G-16', capacity: 50, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['CS'] },
        { name: 'F-04', capacity: 50, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['CS'] },
        { name: 'F-05', capacity: 50, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['CS'] },
        { name: 'F-08', capacity: 50, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['CS'] },
        { name: 'F-09', capacity: 50, type: 'Lecture Hall', proj: 0, comp: 0, dept: deptIds['CS'] },
        { name: 'F-13', capacity: 50, type: 'Lecture Hall', proj: 0, comp: 0, dept: deptIds['CS'] },
        { name: 'F-14', capacity: 50, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['CS'] },
        { name: 'F-15', capacity: 50, type: 'Lecture Hall', proj: 0, comp: 0, dept: deptIds['CS'] },
        { name: 'F-16', capacity: 50, type: 'Lecture Hall', proj: 0, comp: 0, dept: deptIds['CS'] },
        { name: 'G-05', capacity: 40, type: 'Computer Lab', proj: 1, comp: 40, dept: deptIds['CS'] },
        { name: 'G-06', capacity: 40, type: 'Computer Lab', proj: 1, comp: 40, dept: deptIds['CS'] },
        { name: 'G-18', capacity: 40, type: 'Computer Lab', proj: 1, comp: 40, dept: deptIds['CS'] },
        { name: 'G-19', capacity: 40, type: 'Computer Lab', proj: 1, comp: 40, dept: deptIds['CS'] },
        { name: 'G-20', capacity: 40, type: 'Computer Lab', proj: 1, comp: 40, dept: deptIds['CS'] },
        { name: 'EE Hall 202', capacity: 80, type: 'Lecture Hall', proj: 1, comp: 0, dept: deptIds['EE'] },
        { name: 'EE Circuit Lab', capacity: 35, type: 'Science Lab', proj: 1, comp: 0, dept: deptIds['EE'] }
    ];

    const roomIds = {};
    for (const r of csRooms) {
        dbData.counters.rooms++;
        const newRoom = {
            id: dbData.counters.rooms,
            room_name: r.name,
            building: 'UET Campus Block',
            capacity: r.capacity,
            room_type: r.type,
            department_id: r.dept,
            chairs_count: r.capacity,
            projector: r.proj,
            computers_count: r.comp,
            created_at: new Date().toISOString()
        };
        dbData.rooms.push(newRoom);
        roomIds[r.name] = newRoom.id;
    }

    // 4. Courses
    const courses = [
        { code: 'CS-101', name: 'Programming Fundamentals', dept: deptIds['CS'], credit: 4, sem: 1 },
        { code: 'CS-201', name: 'Data Structures & Algorithms', dept: deptIds['CS'], credit: 4, sem: 3 },
        { code: 'CS-301', name: 'Database Management Systems', dept: deptIds['CS'], credit: 3, sem: 5 },
        { code: 'CS-401', name: 'Artificial Intelligence', dept: deptIds['CS'], credit: 3, sem: 7 },
        { code: 'EE-101', name: 'Circuit Analysis', dept: deptIds['EE'], credit: 4, sem: 1 }
    ];

    const courseIds = {};
    for (const c of courses) {
        dbData.counters.courses++;
        const newCourse = { id: dbData.counters.courses, course_code: c.code, course_name: c.name, department_id: c.dept, credit_hours: c.credit, semester: c.sem, program: 'BS', created_at: new Date().toISOString() };
        dbData.courses.push(newCourse);
        courseIds[c.code] = newCourse.id;
    }

    // 5. Instructors (Official CS Faculty List from https://csksk.uet.edu.pk/faculty/ + Departmental Faculty)
    const instructors = [
        // Department of Computer Science (Official 27 Faculty Members from https://csksk.uet.edu.pk/faculty/)
        // Professors & Dean / Chairman (4)
        { name: 'Prof. Dr. Muhammad Shoaib', email: 'shoaib@uet.edu.pk', desig: 'Professor', phone: '+92 42 99029200', office: 'Dean Office, CS Block', dept: deptIds['CS'] },
        { name: 'Dr. Junaid Arshad', email: 'junaid.arshad@uet.edu.pk', desig: 'Associate Professor', phone: '+92 42 99029260', office: 'Chairman Office, CS Block', dept: deptIds['CS'] },
        { name: 'Dr. Umar Qasim', email: 'umar.qasim@uet.edu.pk', desig: 'Professor', phone: '+92 42 99029200', office: 'CS Block Office 101', dept: deptIds['CS'] },
        { name: 'Prof. Dr. Hafiz Muhammad Shahzad Asif', email: 'shahzad.asif@uet.edu.pk', desig: 'Professor', phone: '+92 42 99029200', office: 'CS Block Office 102', dept: deptIds['CS'] },

        // Assistant Professors (4)
        { name: 'Dr. Farah Adeeba', email: 'farah.adeeba@uet.edu.pk', desig: 'Assistant Professor', phone: '+92 42 99029200', office: 'CS Block Office 103', dept: deptIds['CS'] },
        { name: 'Dr. Irfan Yousuf', email: 'irfan.yousuf@uet.edu.pk', desig: 'Assistant Professor', phone: '+92 42 99029200', office: 'CS Block Office 104', dept: deptIds['CS'] },
        { name: 'Dr. Qurat-ul-Ain', email: 'quratulain@uet.edu.pk', desig: 'Assistant Professor', phone: '+92 42 99029200', office: 'CS Block Office 105', dept: deptIds['CS'] },
        { name: 'Dr. Zeeshan Ramzan', email: 'zeeshan.ramzan@uet.edu.pk', desig: 'Assistant Professor', phone: '+92 42 99029200', office: 'CS Block Office 106', dept: deptIds['CS'] },

        // Lecturers (12)
        { name: 'Ms. Alina Munir', email: 'alina.munir@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 201', dept: deptIds['CS'] },
        { name: 'Hafiz Muhammad Danish', email: 'danish@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 202', dept: deptIds['CS'] },
        { name: 'Ms. Anam Iftikhar', email: 'anam.iftikhar@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 203', dept: deptIds['CS'] },
        { name: 'Ms. Drakhshan Bokhat', email: 'drakhshan@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 204', dept: deptIds['CS'] },
        { name: 'Ms. Rimsha Noreen', email: 'rimsha.noreen@uet.edu.pk', desig: 'Lecturer', phone: '+92 331 418835', office: 'CS Block Office 205', dept: deptIds['CS'] },
        { name: 'Ms. Sana Afzal', email: 'sana.afzal@uet.edu.pk', desig: 'Lecturer', phone: '+92 312 6604971', office: 'CS Block Office 206', dept: deptIds['CS'] },
        { name: 'Mr. Nadeem Iqbal', email: 'nadeem.iqbal@uet.edu.pk', desig: 'Lecturer', phone: '+92 301 3098587', office: 'CS Block Office 207', dept: deptIds['CS'] },
        { name: 'Mr. Muzamil Dilawar', email: 'muzamil.dilawar@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 208', dept: deptIds['CS'] },
        { name: 'Mr. Aizaz Akmal', email: 'aizaz.akmal@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 209', dept: deptIds['CS'] },
        { name: 'Ms. Namra Sheikh', email: 'namra.sheikh@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 210', dept: deptIds['CS'] },
        { name: 'Mr. Usman Ghani', email: 'usman.ghani@uet.edu.pk', desig: 'Lecturer', phone: '+92 340 3026556', office: 'CS Block Office 211', dept: deptIds['CS'] },
        { name: 'Ms. Zoha', email: 'zoha@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029200', office: 'CS Block Office 212', dept: deptIds['CS'] },

        // Teaching Fellows / Assistants (7)
        { name: 'Mr. Ali Raza', email: 'ali.raza@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 312 6446637', office: 'CS Block Lab Wing', dept: deptIds['CS'] },
        { name: 'Mr. Noman Munir', email: 'noman.munir@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 308 8656673', office: 'CS Block Lab Wing', dept: deptIds['CS'] },
        { name: 'Mr. Hassan Arif', email: 'hassan.arif@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 42 99029200', office: 'CS Block Lab Wing', dept: deptIds['CS'] },
        { name: 'Ms. Sonia Asghar', email: 'sonia.asghar@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 42 99029200', office: 'CS Block Lab Wing', dept: deptIds['CS'] },
        { name: 'Ms. Rida', email: 'rida@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 42 99029200', office: 'CS Block Lab Wing', dept: deptIds['CS'] },
        { name: 'Ghazala Shabbir', email: 'ghazala.shabbir@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 42 99029200', office: 'CS Block Lab Wing', dept: deptIds['CS'] },
        { name: 'Ms. Shanfa Irum', email: 'shanfa.irum@uet.edu.pk', desig: 'Teaching Fellow', phone: '+92 42 99029200', office: 'CS Block Lab Wing', dept: deptIds['CS'] },

        // Official Electrical Engineering Faculty Members (UET KSK)
        { name: 'Dr. Muhammad Asghar', email: 'asghar.ee@uet.edu.pk', desig: 'Associate Professor', phone: '+92 42 99029210', office: 'EE Complex 101', dept: deptIds['EE'] },
        { name: 'Dr. Syed Abdul Rahman', email: 'rahman.ee@uet.edu.pk', desig: 'Assistant Professor', phone: '+92 42 99029211', office: 'EE Complex 102', dept: deptIds['EE'] },
        { name: 'Engr. Muhammad Hamza', email: 'hamza.ee@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029212', office: 'EE Complex 201', dept: deptIds['EE'] },

        // Official Mechanical Engineering Faculty Members (UET KSK)
        { name: 'Dr. Tariq Mahmood', email: 'tariq.me@uet.edu.pk', desig: 'Associate Professor', phone: '+92 42 99029220', office: 'ME Block 101', dept: deptIds['ME'] },
        { name: 'Engr. Shahbaz Ahmed', email: 'shahbaz.me@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029221', office: 'ME Block 201', dept: deptIds['ME'] },

        // Official Civil Engineering Faculty Members (UET KSK)
        { name: 'Dr. Khalid Mehmood', email: 'khalid.civ@uet.edu.pk', desig: 'Associate Professor', phone: '+92 42 99029230', office: 'CIV Block 101', dept: deptIds['CIV'] },
        { name: 'Engr. Usman Khalid', email: 'usman.civ@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029231', office: 'CIV Block 201', dept: deptIds['CIV'] },

        // Official Environmental Engineering Faculty Members (UET KSK)
        { name: 'Dr. Sajjad H. Sumra', email: 'sajjad.env@uet.edu.pk', desig: 'Associate Professor', phone: '+92 42 99029240', office: 'ENV Wing 101', dept: deptIds['ENV'] },
        { name: 'Engr. Maria Bilal', email: 'maria.env@uet.edu.pk', desig: 'Lecturer', phone: '+92 42 99029241', office: 'ENV Wing 201', dept: deptIds['ENV'] }
    ];

    const instructorIds = {};
    for (const inst of instructors) {
        dbData.counters.instructors++;
        const newInst = {
            id: dbData.counters.instructors,
            name: inst.name,
            email: inst.email,
            designation: inst.desig,
            phone: inst.phone || '+92 42 99029200',
            office_room: inst.office || 'Academic Block',
            max_credit_hours: inst.desig.includes('Professor') ? 9 : 12,
            department_id: inst.dept,
            created_at: new Date().toISOString()
        };
        dbData.instructors.push(newInst);
        instructorIds[inst.name] = newInst.id;
    }

    // 6. Timetable Entries
    const sampleEntries = [
        { dept: deptIds['CS'], course: courseIds['CS-101'], inst: instructorIds['Dr. Farah Adeeba'], room: roomIds['G-10'], day: 'Monday', start: '08:00', end: '09:00', sec: 'CS-1A', sem: 1, type: 'Lecture' },
        { dept: deptIds['CS'], course: courseIds['CS-201'], inst: instructorIds['Ms. Alina Munir'], room: roomIds['G-05'], day: 'Monday', start: '09:00', end: '11:00', sec: 'CS-3A', sem: 3, type: 'Lab' },
        { dept: deptIds['CS'], course: courseIds['CS-301'], inst: instructorIds['Dr. Irfan Yousuf'], room: roomIds['G-11'], day: 'Tuesday', start: '10:00', end: '11:00', sec: 'CS-5A', sem: 5, type: 'Lecture' },
        { dept: deptIds['CS'], course: courseIds['CS-401'], inst: instructorIds['Dr. Qurat-ul-Ain'], room: roomIds['F-04'], day: 'Wednesday', start: '11:00', end: '12:00', sec: 'CS-7A', sem: 7, type: 'Lecture' },
        { dept: deptIds['EE'], course: courseIds['EE-101'], inst: instructorIds['Prof. Dr. Claude Shannon'], room: roomIds['EE Hall 202'], day: 'Thursday', start: '08:00', end: '09:00', sec: 'EE-1A', sem: 1, type: 'Lecture' }
    ];

    for (const entry of sampleEntries) {
        dbData.counters.timetable_entries++;
        dbData.timetable_entries.push({
            id: dbData.counters.timetable_entries,
            department_id: entry.dept,
            course_id: entry.course,
            instructor_id: entry.inst,
            room_id: entry.room,
            day_of_week: entry.day,
            start_time: entry.start,
            end_time: entry.end,
            section: entry.sec,
            semester: entry.sem,
            session_type: entry.type,
            notes: '',
            created_at: new Date().toISOString()
        });
    }

    saveDb();
    console.log('UET KSK initial database seeding completed successfully!');
};

module.exports = {
    query,
    get,
    run,
    initDatabase
};