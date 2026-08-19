const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { run, query, get } = require('../db/database');
const { isAuthenticated } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

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

const parseTimeHeader = (headerStr) => {
  if (!headerStr) return null;
  const str = String(headerStr).trim().toUpperCase();

  if (str.includes('8-9')) return { start: '08:00', end: '09:00' };
  if (str.includes('9-10')) return { start: '09:00', end: '10:00' };
  if (str.includes('10-11')) return { start: '10:00', end: '11:00' };
  if (str.includes('11-12')) return { start: '11:00', end: '12:00' };
  if (str.includes('1-2')) return { start: '13:00', end: '14:00' };
  if (str.includes('2-3')) return { start: '14:00', end: '15:00' };
  if (str.includes('3-4')) return { start: '15:00', end: '16:00' };

  return null;
};

// Helper to parse course name, section, and semester from Excel cell content (Pattern: "Course Name | Sem 1-A")
const parseCellDetails = async (cellVal, deptId, deptCode, defaultCourseId) => {
  if (cellVal === undefined || cellVal === null || cellVal === 0 || cellVal === '0') return null;

  const strVal = String(cellVal).trim();
  if (!strVal || strVal.toLowerCase() === 'no' || strVal.toLowerCase() === 'false' || strVal.toLowerCase().includes('break')) return null;

  let courseName = 'Department Academic Course';
  let section = 'A';
  let semester = 1;
  let isDetailed = false;

  if (strVal !== '1' && strVal.toLowerCase() !== 'yes' && strVal.toLowerCase() !== 'true') {
    isDetailed = true;

    // Split cell text by '|', ';', or ',' to extract Course Name
    const parts = strVal.split(/[|;,]/).map(p => p.trim());
    courseName = parts[0] || 'Academic Course';

    // Remove course code prefix if present, e.g. "CS-101 | Programming Fundamentals"
    if (courseName.match(/^[A-Z]{2,4}-\d{3}/i)) {
      const codeMatch = courseName.match(/^[A-Z]{2,4}-\d{3}/i);
      const rest = courseName.substring(codeMatch[0].length).replace(/^[\s:-]+/, '').trim();
      if (rest) courseName = rest;
    }

    // Extract Semester and Section (e.g. "Sem 1-A", "Sem: 1-A", "Sem 1A")
    const semSecMatch = strVal.match(/sem(?:ester)?[\s:-]*([1-8])\s*[-:\s]*([A-Z0-9]+)?/i);
    if (semSecMatch) {
      semester = parseInt(semSecMatch[1]);
      if (semSecMatch[2]) {
        let rawSec = semSecMatch[2].toUpperCase();
        rawSec = rawSec.replace(/^(CS|EE|ME|CE|MGT|IT|SE)-?/i, '').replace(/^[0-9]+-?/, '').trim() || rawSec;
        section = rawSec;
      }
    } else {
      const semOnly = strVal.match(/sem(?:ester)?[\s:-]*([1-8])/i);
      if (semOnly) semester = parseInt(semOnly[1]);

      const secOnly = strVal.match(/(?:sec(?:tion)?[\s:-]*|\b)([A-Z0-9]{1,4})\b/i);
      if (secOnly) {
        let rawSec = secOnly[1].toUpperCase();
        rawSec = rawSec.replace(/^(CS|EE|ME|CE|MGT|IT|SE)-?/i, '').replace(/^[0-9]+-?/, '').trim() || rawSec;
        section = rawSec;
      }
    }
  }

  // Check database for existing course under this department or create it dynamically
  let course = await get(
    'SELECT * FROM courses WHERE department_id = ? AND (LOWER(course_name) = LOWER(?) OR LOWER(course_code) = LOWER(?))',
    [deptId, courseName, courseName]
  );
  
  if (!course) {
    course = await get('SELECT * FROM courses WHERE LOWER(course_name) = LOWER(?)', [courseName]);
  }

  let finalCourseId = defaultCourseId;

  if (course) {
    finalCourseId = course.id;
  } else if (isDetailed) {
    const codeGen = `${deptCode || 'CS'}-${courseName.substring(0, 3).toUpperCase()}`;
    const newCourseRes = await run(
      'INSERT INTO courses (course_code, course_name, department_id, credit_hours, semester) VALUES (?, ?, ?, ?, ?)',
      [codeGen, courseName, deptId, 3, semester]
    );
    finalCourseId = newCourseRes.id;
  }

  return {
    courseId: finalCourseId,
    section: `${semester}-${section}`,
    semester
  };
};

// GET /api/upload/template - Download sample pattern Excel template (.xlsx)
router.get('/template', (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Room Specs
    const roomSpecsData = [
      ["Room No.", "No. of Chairs", "Projector (Yes or No)", "No. of Computers / Equipment", "Room Category"],
      ["Lecture Rooms / Halls", "", "", "", ""],
      ["G-10", 50, "Yes", 0, "Lecture Hall"],
      ["G-11", 50, "No", 0, "Lecture Hall"],
      ["F-04", 60, "Yes", 0, "Lecture Hall"],
      ["Computer Labs", "", "", "", ""],
      ["G-05", 40, "Yes", 40, "Computer Lab"],
      ["G-16", 40, "Yes", 40, "Computer Lab"],
      ["Science Labs", "", "", "", ""],
      ["SL-01", 35, "Yes", 10, "Science Lab"],
      ["SL-02", 35, "Yes", 12, "Science Lab"],
      ["Seminar Halls", "", "", "", ""],
      ["SH-01", 120, "Yes", 0, "Seminar Hall"],
      ["Auditoriums", "", "", "", ""],
      ["AUD-01", 300, "Yes", 0, "Auditorium"]
    ];
    const roomSpecsSheet = XLSX.utils.aoa_to_sheet(roomSpecsData);
    XLSX.utils.book_append_sheet(wb, roomSpecsSheet, "Room Specs");

    // Sheet 2: Matrix for G-10 (Lecture Hall)
    const g10Data = [
      ["Day / Time", "8-9 AM", "9-10 AM", "10-11 AM", "11-12 AM", "12-1 PM (Break)", "1-2 PM", "2-3 PM", "3-4 PM"],
      ["Monday", "Programming Fundamentals | Sem 1-A", 0, "Digital Logic Design | Sem 1-A", 0, "Lunch Break", "Linear Algebra | Sem 1-A", 0, 0],
      ["Tuesday", 0, "Data Structures | Sem 3-A", 0, "Object Oriented Prog | Sem 3-A", 0, "Circuit Analysis | Sem 3-A", 0, 0],
      ["Wednesday", "Database Systems | Sem 5-A", 0, "Operating Systems | Sem 5-A", 0, "Lunch Break", "Computer Networks | Sem 5-A", 0, 0],
      ["Thursday", 0, "Software Engineering | Sem 7-A", 0, "Artificial Intelligence | Sem 7-A", 0, "Compiler Construction | Sem 7-A", 0, 0],
      ["Friday", "Programming Fundamentals | Sem 1-B", 0, 0, 0, "Programming Fundamentals | Sem 1-B", "Jummah Break", 0, 0]
    ];
    const g10Sheet = XLSX.utils.aoa_to_sheet(g10Data);
    XLSX.utils.book_append_sheet(wb, g10Sheet, "G-10");

    // Sheet 3: Matrix for G-05 (Computer Lab)
    const g05Data = [
      ["Day / Time", "8-9 AM", "9-10 AM", "10-11 AM", "11-12 AM", "12-1 PM (Break)", "1-2 PM", "2-3 PM", "3-4 PM"],
      ["Monday", "Programming Fundamentals Lab | Sem 1-A", "Programming Fundamentals Lab | Sem 1-A", 0, 0, "Lunch Break", "Data Structures Lab | Sem 3-A", "Data Structures Lab | Sem 3-A", 0],
      ["Tuesday", 0, 0, "Database Systems Lab | Sem 5-A", "Database Systems Lab | Sem 5-A", 0, 0, 0, 0],
      ["Wednesday", "Programming Fundamentals Lab | Sem 1-B", "Programming Fundamentals Lab | Sem 1-B", 0, 0, "Lunch Break", 0, 0, 0],
      ["Thursday", 0, 0, "Artificial Intelligence Lab | Sem 7-A", "Artificial Intelligence Lab | Sem 7-A", 0, 0, 0, 0],
      ["Friday", 0, 0, 0, 0, 0, "Jummah Break", 0, 0]
    ];
    const g05Sheet = XLSX.utils.aoa_to_sheet(g05Data);
    XLSX.utils.book_append_sheet(wb, g05Sheet, "G-05");

    // Sheet 4: Matrix for SL-01 (Science Lab)
    const sl01Data = [
      ["Day / Time", "8-9 AM", "9-10 AM", "10-11 AM", "11-12 AM", "12-1 PM (Break)", "1-2 PM", "2-3 PM", "3-4 PM"],
      ["Monday", "Physics Lab | Sem 1-A", "Physics Lab | Sem 1-A", 0, 0, "Lunch Break", "Chemistry Lab | Sem 1-A", "Chemistry Lab | Sem 1-A", 0],
      ["Tuesday", 0, 0, "Circuit Analysis Lab | Sem 3-A", "Circuit Analysis Lab | Sem 3-A", 0, 0, 0, 0],
      ["Wednesday", "Applied Physics Lab | Sem 1-B", "Applied Physics Lab | Sem 1-B", 0, 0, "Lunch Break", 0, 0, 0],
      ["Thursday", 0, 0, "Environmental Eng Lab | Sem 5-A", "Environmental Eng Lab | Sem 5-A", 0, 0, 0, 0],
      ["Friday", 0, 0, 0, 0, 0, "Jummah Break", 0, 0]
    ];
    const sl01Sheet = XLSX.utils.aoa_to_sheet(sl01Data);
    XLSX.utils.book_append_sheet(wb, sl01Sheet, "SL-01");

    // Sheet 5: Matrix for SH-01 (Seminar Hall)
    const sh01Data = [
      ["Day / Time", "8-9 AM", "9-10 AM", "10-11 AM", "11-12 AM", "12-1 PM (Break)", "1-2 PM", "2-3 PM", "3-4 PM"],
      ["Monday", 0, 0, "Department Orientation Seminar | Sem 1-A", "Department Orientation Seminar | Sem 1-A", "Lunch Break", 0, 0, 0],
      ["Tuesday", 0, 0, 0, 0, 0, "Guest Speaker Lecture | Sem 5-A", "Guest Speaker Lecture | Sem 5-A", 0],
      ["Wednesday", 0, 0, "FYP Progress Workshop | Sem 7-A", "FYP Progress Workshop | Sem 7-A", "Lunch Break", 0, 0, 0],
      ["Thursday", 0, 0, 0, 0, 0, "Industry Tech Talk | Sem 3-A", "Industry Tech Talk | Sem 3-A", 0],
      ["Friday", 0, 0, 0, 0, 0, "Jummah Break", 0, 0]
    ];
    const sh01Sheet = XLSX.utils.aoa_to_sheet(sh01Data);
    XLSX.utils.book_append_sheet(wb, sh01Sheet, "SH-01");

    // Sheet 6: Matrix for AUD-01 (Auditorium)
    const aud01Data = [
      ["Day / Time", "8-9 AM", "9-10 AM", "10-11 AM", "11-12 AM", "12-1 PM (Break)", "1-2 PM", "2-3 PM", "3-4 PM"],
      ["Monday", 0, 0, 0, 0, "Lunch Break", 0, 0, 0],
      ["Tuesday", "Campus Welcome Ceremony | Sem 1-A", "Campus Welcome Ceremony | Sem 1-A", "Campus Welcome Ceremony | Sem 1-A", 0, 0, 0, 0, 0],
      ["Wednesday", 0, 0, 0, 0, "Lunch Break", 0, 0, 0],
      ["Thursday", 0, 0, "Annual Research Symposium | Sem 7-A", "Annual Research Symposium | Sem 7-A", 0, 0, 0, 0],
      ["Friday", 0, 0, 0, 0, 0, "Jummah Break", 0, 0]
    ];
    const aud01Sheet = XLSX.utils.aoa_to_sheet(aud01Data);
    XLSX.utils.book_append_sheet(wb, aud01Sheet, "AUD-01");

    // Sheet 7: Pattern Guide
    const guideData = [
      ["UET KSK Timetable Excel Pattern Guide (All 5 Room Categories)"],
      [""],
      ["Sheet 1: Room Specifications (First Sheet)"],
      ["- Column A (Room No.): Enter Room Code (e.g. G-10, G-05, SL-01, SH-01, AUD-01)"],
      ["- Column B (No. of Chairs): Seating capacity (e.g. 50 for Lecture Hall, 40 for Computer Lab, 35 for Science Lab, 120 for Seminar Hall, 300 for Auditorium)"],
      ["- Column C (Projector): Enter 'Yes' or 'No'"],
      ["- Column D (No. of Computers / Equipment): Enter count of computers or lab equipment stations (e.g. 40 for Computer Lab, 10 for Science Lab, 0 for Lecture Hall/Hall)"],
      ["- Column E (Room Category): MUST specify room category: 'Lecture Hall', 'Computer Lab', 'Science Lab', 'Seminar Hall', or 'Auditorium'"],
      ["- Section Headers: You can also use section header rows in Column A like 'Lecture Rooms / Halls', 'Computer Labs', 'Science Labs', 'Seminar Halls', 'Auditoriums' to automatically assign categories!"],
      [""],
      ["Sheets 2+: Room Timetable Matrices (One matrix sheet per room, e.g. 'G-10', 'G-05', 'SL-01', 'SH-01', 'AUD-01')"],
      ["- Header Row (Row 1): 'Day / Time', '8-9 AM', '9-10 AM', '10-11 AM', '11-12 AM', '12-1 PM (Break)', '1-2 PM', '2-3 PM', '3-4 PM'"],
      ["- Column 1 (Days): Monday, Tuesday, Wednesday, Thursday, Friday"],
      ["- Cell Format: Enter lecture details in exact format: Course Name | Sem [Semester]-[Section]"],
      ["  Example 1 (Lecture Hall G-10): Programming Fundamentals | Sem 1-A"],
      ["  Example 2 (Computer Lab G-05): Data Structures Lab | Sem 3-A"],
      ["  Example 3 (Science Lab SL-01): Physics Lab | Sem 1-A"],
      ["  Example 4 (Seminar Hall SH-01): Department Orientation Seminar | Sem 1-A"],
      ["  Example 5 (Auditorium AUD-01): Campus Welcome Ceremony | Sem 1-A"],
      [""],
      ["Upload this spreadsheet in the UET KSK Timetable Portal to update room specifications and timetable schedule slots!"]
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideData);
    XLSX.utils.book_append_sheet(wb, guideSheet, "Pattern Guide");

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="UET_KSK_Timetable_Pattern_Template.xlsx"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating template:', err);
    res.status(500).json({ error: 'Failed to generate Excel template: ' + err.message });
  }
});

// POST /api/upload/excel - Parse and import Excel timetable sheet (Dept Coordinator ONLY)
router.post('/excel', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (req.session.user.role === 'admin') {
      return res.status(403).json({ error: 'Forbidden. Super Admin cannot upload department timetable sheets. Only department coordinators can upload schedules!' });
    }

    const deptId = Number(req.body.department_id || req.session.user.department_id || 1);

    const deptObj = await get('SELECT * FROM departments WHERE id = ?', [deptId]);
    const deptCode = deptObj ? deptObj.code : 'CS';

    let workbook;

    if (req.body.fileData === 'preset' || (!req.file && !req.body.fileData)) {
      const excelFilePath = path.join(__dirname, '..', 'dashboard.xlsx');
      workbook = XLSX.readFile(excelFilePath);
    } else if (req.file) {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } else if (req.body.fileData) {
      const base64Str = req.body.fileData.split(',')[1] || req.body.fileData;
      const buffer = Buffer.from(base64Str, 'base64');
      workbook = XLSX.read(buffer, { type: 'buffer' });
    }

    if (!workbook || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Invalid Excel file format.' });
    }

    let importedCount = 0;
    let conflictCount = 0;
    let roomCreatedCount = 0;
    let conflictMessages = [];

    // Step 1: Parse Room Specs Sheet (First Sheet)
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const rows1 = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

    if (rows1 && rows1.length > 0) {
      let currentSectionCategory = 'Lecture Hall';

      for (let i = 0; i < rows1.length; i++) {
        const row = rows1[i];
        if (!row || row.length === 0) continue;

        const firstCol = String(row[0] || '').trim();
        const fifthCol = String(row[4] || '').trim();

        const lowerFirst = firstCol.toLowerCase();
        if (lowerFirst.includes('science lab')) {
          currentSectionCategory = 'Science Lab';
          continue;
        } else if (lowerFirst.includes('computer lab') || lowerFirst === 'labs' || lowerFirst === 'computer labs') {
          currentSectionCategory = 'Computer Lab';
          continue;
        } else if (lowerFirst.includes('seminar')) {
          currentSectionCategory = 'Seminar Hall';
          continue;
        } else if (lowerFirst.includes('auditorium')) {
          currentSectionCategory = 'Auditorium';
          continue;
        } else if (lowerFirst.includes('lecture')) {
          currentSectionCategory = 'Lecture Hall';
          continue;
        }

        if (lowerFirst.includes('room no') || lowerFirst.includes('no. of chairs') || lowerFirst === 'labs' || lowerFirst === 'science labs') {
          continue;
        }

        if (firstCol.length > 0 && (firstCol.startsWith('G-') || firstCol.startsWith('F-') || firstCol.startsWith('S-') || firstCol.startsWith('SL-') || firstCol.startsWith('SH-') || firstCol.startsWith('AUD-') || firstCol.length >= 2)) {
          const roomName = firstCol;
          let roomType = currentSectionCategory || 'Lecture Hall';
          
          if (fifthCol) {
            const lowerFifth = fifthCol.toLowerCase();
            if (lowerFifth.includes('science')) roomType = 'Science Lab';
            else if (lowerFifth.includes('computer')) roomType = 'Computer Lab';
            else if (lowerFifth.includes('seminar')) roomType = 'Seminar Hall';
            else if (lowerFifth.includes('auditorium')) roomType = 'Auditorium';
            else if (lowerFifth.includes('lecture') || lowerFifth.includes('hall')) roomType = 'Lecture Hall';
          }

          const isLab = roomType === 'Computer Lab' || roomType === 'Science Lab';
          const chairs = parseInt(row[1]) || (isLab ? 40 : 50);
          const projStr = String(row[2] || '').trim().toLowerCase();
          const hasProj = projStr === 'yes' || projStr === '1' ? 1 : 0;
          const comps = isLab ? (parseInt(row[3]) || (roomType === 'Computer Lab' ? 40 : 10)) : 0;

          let existingRoom = await get('SELECT * FROM rooms WHERE room_name = ?', [roomName]);
          if (!existingRoom) {
            await run(
              'INSERT INTO rooms (room_name, building, capacity, room_type, department_id, chairs_count, projector, computers_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [roomName, 'Main Academic Block', chairs, roomType, deptId, chairs, hasProj, comps]
            );
            roomCreatedCount++;
          } else {
            await run(
              'UPDATE rooms SET department_id = ?, capacity = ?, chairs_count = ?, room_type = ?, projector = ?, computers_count = ? WHERE room_name = ?',
              [deptId, chairs, chairs, roomType, hasProj, comps, roomName]
            );
          }
        }
      }
    }

    // Step 2: Ensure course & instructor stubs exist for department
    const allCourses = await query('SELECT * FROM courses WHERE department_id = ?', [deptId]);
    const allInst = await query('SELECT * FROM instructors WHERE department_id = ?', [deptId]);

    let defaultCourseId = allCourses[0] ? allCourses[0].id : 1;
    let defaultInstId = allInst[0] ? allInst[0].id : 1;

    // Step 3: Parse Timetable Matrix Sheets (Sheets named after room, e.g. "G-10", "G-05", "SL-01")
    for (let sIdx = 1; sIdx < workbook.SheetNames.length; sIdx++) {
      const sheetName = workbook.SheetNames[sIdx].trim();
      const lowerName = sheetName.toLowerCase();
      
      // Skip guide or spec sheets
      if (lowerName.includes('guide') || lowerName.includes('pattern') || lowerName.includes('specs') || lowerName.includes('instruction') || lowerName.includes('help')) {
        continue;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows || rows.length < 2) continue;

      let targetRoom = await get('SELECT * FROM rooms WHERE room_name = ? AND department_id = ?', [sheetName, deptId]);
      if (!targetRoom) {
        targetRoom = await get('SELECT * FROM rooms WHERE room_name = ?', [sheetName]);
      }

      if (!targetRoom) {
        const resRoom = await run(
          'INSERT INTO rooms (room_name, building, capacity, room_type, department_id, chairs_count, projector, computers_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [sheetName, 'Main Academic Block', 50, 'Lecture Hall', deptId, 50, 1, 0]
        );
        targetRoom = { id: resRoom.id, room_name: sheetName, room_type: 'Lecture Hall' };
        roomCreatedCount++;
      }

      const headerRow = rows[0];
      const slotMap = [];

      for (let col = 1; col < headerRow.length; col++) {
        const slotTime = parseTimeHeader(headerRow[col]);
        if (slotTime) {
          slotMap.push({ colIndex: col, start: slotTime.start, end: slotTime.end, label: headerRow[col] });
        }
      }

      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row[0]) continue;

        const dayName = String(row[0]).trim();
        if (!validDays.includes(dayName)) continue;

        for (const slotInfo of slotMap) {
          const cellVal = row[slotInfo.colIndex];
          if (!cellVal || cellVal === 0 || cellVal === '0') continue;

          // Skip slots overlapping designated breaks
          const isLunchBreak = (slotInfo.start < '13:00' && slotInfo.end > '12:00');
          const isJummahBreak = (dayName === 'Friday' && slotInfo.start < '14:00' && slotInfo.end > '13:00');

          if (isLunchBreak || isJummahBreak) {
            conflictCount++;
            conflictMessages.push(`Skipped slot on ${dayName} (${slotInfo.start}-${slotInfo.end}) as it overlaps with university break time.`);
            continue;
          }

          const parsedDetails = await parseCellDetails(cellVal, deptId, deptCode, defaultCourseId);
          if (!parsedDetails) continue;

          const conflict = await isRoomOccupied(targetRoom.id, dayName, slotInfo.start, slotInfo.end);
          if (conflict) {
            conflictCount++;
            conflictMessages.push(`Room "${targetRoom.room_name}" is ALREADY occupied on ${dayName} (${slotInfo.start}-${slotInfo.end}). Skipped duplicate slot.`);
            continue;
          }

          await run(
            `INSERT INTO timetable_entries 
             (department_id, course_id, instructor_id, room_id, day_of_week, start_time, end_time, section, semester, session_type, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              deptId,
              parsedDetails.courseId,
              defaultInstId,
              targetRoom.id,
              dayName,
              slotInfo.start,
              slotInfo.end,
              parsedDetails.section,
              parsedDetails.semester,
              targetRoom.room_type === 'Computer Lab' ? 'Lab' : 'Lecture',
              `Imported from sheet ${sheetName}`
            ]
          );
          importedCount++;
        }
      }
    }

    res.json({
      message: 'Excel timetable processing complete!',
      importedSlots: importedCount,
      conflictsSkipped: conflictCount,
      newRooms: roomCreatedCount,
      conflictMessages
    });

  } catch (err) {
    console.error('Excel upload error:', err);
    res.status(500).json({ error: 'Failed to process Excel file: ' + err.message });
  }
});

module.exports = router;
