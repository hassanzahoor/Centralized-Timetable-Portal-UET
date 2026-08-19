// Timetable View Mode Toggle: 'standard' (card grid) or 'colorgrid' (color-coded matrix)
let timetableViewMode = 'standard';

function toggleTimetableViewMode() {
    timetableViewMode = (timetableViewMode === 'standard') ? 'colorgrid' : 'standard';
    const btn = document.getElementById('btnToggleTimetableView');
    if (btn) {
        btn.innerHTML = (timetableViewMode === 'standard') ?
            `<i class="fa-solid fa-table-cells"></i> Switch to Color Grid View` :
            `<i class="fa-solid fa-table-list"></i> Switch to Standard Table View`;
    }
    if (currentTimetableEntries && currentTimetableEntries.length > 0) {
        const dayFilter = document.getElementById('filterDay').value;
        renderWeeklyMatrix(currentTimetableEntries, dayFilter);
    }
}

// Color-Coded Grid Matrix Renderer (Days as rows, Time Slots as columns)
function renderColorGridMatrix(entries, selectedDay) {
    const gridWrapper = document.getElementById('gridWrapper');
    const daysToRender = selectedDay ? [selectedDay] : DAYS_OF_WEEK;

    let html = `
      <div class="colorgrid-legend no-print">
        <span class="legend-item"><span class="legend-dot legend-occupied"></span> Class (Occupied)</span>
        <span class="legend-item"><span class="legend-dot legend-vacant"></span> Vacant (No Class)</span>
        <span class="legend-item"><span class="legend-dot legend-lunch"></span> Lunch Break</span>
        <span class="legend-item"><span class="legend-dot legend-jummah"></span> Jummah Break</span>
      </div>
    `;

    html += `<div class="colorgrid-table" style="grid-template-columns: 100px repeat(${TIME_SLOTS.length}, minmax(90px, 1fr));">`;

    html += `<div class="colorgrid-header-cell colorgrid-corner"><i class="fa-solid fa-calendar-days"></i></div>`;
    TIME_SLOTS.forEach(slot => {
        html += `<div class="colorgrid-header-cell">${slot.label}</div>`;
    });

    daysToRender.forEach(day => {
        html += `<div class="colorgrid-day-label">${day}</div>`;

        TIME_SLOTS.forEach(slot => {
            const isLunchBreak = (slot.start === '12:00' && slot.end === '13:00');
            const isJummahBreak = (slot.start === '13:00' && slot.end === '14:00' && day === 'Friday');

            const matching = entries.filter(e => {
                return e.day_of_week === day && (
                    (e.start_time >= slot.start && e.start_time < slot.end) ||
                    (e.start_time <= slot.start && e.end_time > slot.start)
                );
            });

            let cellClass = 'colorgrid-cell colorgrid-vacant';
            let tooltip = 'Vacant — No Class Scheduled';

            if (isLunchBreak) {
                cellClass = 'colorgrid-cell colorgrid-lunch';
                tooltip = 'Lunch Break (12:00 PM - 01:00 PM)';
            } else if (isJummahBreak) {
                cellClass = 'colorgrid-cell colorgrid-jummah';
                tooltip = 'Jummah Break (01:00 PM - 02:00 PM)';
            } else if (matching.length > 0) {
                cellClass = 'colorgrid-cell colorgrid-occupied';
                const roomNames = [...new Set(matching.map(e => e.room_name))].join(', ');
                tooltip = `Rooms: ${roomNames}`;
            }

            html += `<div class="${cellClass}" data-tooltip="${tooltip}"></div>`;
        });
    });

    html += `</div>`;
    gridWrapper.innerHTML = html;
}

// 1-Click Clear Department Timetable Slots (Dept Coordinator ONLY)
async function handleClearDeptTimetable() {
    if (!currentUser || currentUser.role !== 'dept_admin') {
        alert('Super Admin is forbidden from clearing department timetables. Only department coordinators can clear their timetable.');
        return;
    }

    const targetDeptId = currentUser.department_id;
    const targetDeptName = currentUser.department_name;

    if (!confirm(`⚠️ 1-CLICK PURGE TIMETABLE CONFIRMATION:\n\nAre you sure you want to clear ALL scheduled timetable slots for "${targetDeptName}"?\n\nThis will remove all lectures/labs in 1 click.\nRooms, credentials, and courses will remain 100% SAFE!`)) {
        return;
    }

    try {
        const res = await fetch(`/api/timetable/clear-department/${targetDeptId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Failed to clear department timetable.');
            return;
        }
        alert(data.message);
        renderTimetable();
    } catch (err) {
        alert('Error clearing department timetable.');
    }
}

// Render Master Timetable Matrix
async function renderTimetable() {
    const gridWrapper = document.getElementById('gridWrapper');
    const countNum = document.getElementById('slotCountNumber');
    const statSlotCount = document.getElementById('statSlotCount');
    const activeBadge = document.getElementById('activeFilterBadge');
    const clearBtn = document.getElementById('btnClearDeptTimetable');

    // HIDE Clear Dept Timetable button for Super Admin! Show ONLY for Dept Coordinator!
    if (clearBtn) {
        if (currentUser && currentUser.role === 'dept_admin') {
            clearBtn.style.display = 'inline-flex';
        } else {
            clearBtn.style.display = 'none';
        }
    }

    if (!gridWrapper) return;

    gridWrapper.innerHTML = `<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading schedule...</div>`;

    const deptFilter = document.getElementById('filterDept').value;
    const semFilter = document.getElementById('filterSemester').value;
    const dayFilter = document.getElementById('filterDay').value;
    const roomFilter = document.getElementById('filterRoom').value;
    const searchVal = document.getElementById('globalSearchInput').value.trim();

    const params = new URLSearchParams();
    if (deptFilter) params.append('department_id', deptFilter);
    if (semFilter) params.append('semester', semFilter);
    if (dayFilter) params.append('day', dayFilter);
    if (roomFilter) params.append('room_id', roomFilter);
    if (searchVal) params.append('search', searchVal);

    try {
        const res = await fetch(`/api/timetable?${params.toString()}`);
        currentTimetableEntries = await res.json();

        if (countNum) countNum.textContent = currentTimetableEntries.length;
        if (statSlotCount) statSlotCount.textContent = currentTimetableEntries.length;

        let badges = [];
        if (deptFilter) {
            const d = masterDepartments.find(x => x.id == deptFilter);
            if (d) badges.push(`<span class="badge" style="background:${d.color}; color:#fff;">Dept: ${d.name}</span>`);
        }
        if (roomFilter) {
            const r = masterRooms.find(x => x.id == roomFilter);
            if (r) badges.push(`<span class="badge badge-default">Room: ${r.room_name}</span>`);
        }
        if (semFilter) badges.push(`<span class="badge badge-default">Sem ${semFilter}</span>`);
        if (dayFilter) badges.push(`<span class="badge badge-default">Day: ${dayFilter}</span>`);
        if (searchVal) badges.push(`<span class="badge badge-default">Search: "${searchVal}"</span>`);

        if (badges.length === 0) {
            activeBadge.innerHTML = `<span class="badge badge-default">Showing Centralized Schedule</span>`;
        } else {
            activeBadge.innerHTML = badges.join('');
        }

        if (currentTimetableEntries.length === 0) {
            gridWrapper.innerHTML = `
        <div class="no-slots-placeholder" style="text-align:center; padding:40px;">
          <i class="fa-solid fa-calendar-xmark" style="font-size:2.5rem; color:var(--uet-green);"></i>
          <h3>No Scheduled Lectures Found</h3>
          <p>No timetable slots match your current criteria.</p>
        </div>
      `;
            return;
        }

        renderWeeklyMatrix(currentTimetableEntries, dayFilter);
    } catch (err) {
        gridWrapper.innerHTML = `<div class="form-error">Failed to load timetable data.</div>`;
    }
}

// Weekly Matrix Renderer
function renderWeeklyMatrix(entries, selectedDay) {
    if (timetableViewMode === 'colorgrid') {
        renderColorGridMatrix(entries, selectedDay);
        return;
    }

    const gridWrapper = document.getElementById('gridWrapper');
    const daysToRender = selectedDay ? [selectedDay] : DAYS_OF_WEEK;

    let html = `<div class="weekly-grid" style="grid-template-columns: 110px repeat(${daysToRender.length}, minmax(190px, 1fr));">`;

    html += `<div class="grid-header-cell"><i class="fa-solid fa-clock"></i> Time Slot</div>`;
    daysToRender.forEach(day => {
        html += `<div class="grid-header-cell">${day}</div>`;
    });

    TIME_SLOTS.forEach(slot => {
                html += `<div class="time-slot-label">${slot.label}</div>`;

                daysToRender.forEach(day => {
                            const matching = entries.filter(e => {
                                return e.day_of_week === day && (
                                    (e.start_time >= slot.start && e.start_time < slot.end) ||
                                    (e.start_time <= slot.start && e.end_time > slot.start)
                                );
                            });

                            html += `<div class="day-column">`;

                            const isLunchBreak = (slot.start === '12:00' && slot.end === '13:00');
                            const isJummahBreak = (slot.start === '13:00' && slot.end === '14:00' && day === 'Friday');

                            if (isLunchBreak) {
                                html += `
          <div class="break-card lunch-break">
            <i class="fa-solid fa-utensils"></i>
            <span class="break-title">Lunch Break</span>
            <span class="break-time">12:00 - 01:00 PM</span>
          </div>
        `;
                            } else if (isJummahBreak) {
                                html += `
          <div class="break-card jummah-break">
            <i class="fa-solid fa-mosque"></i>
            <span class="break-title">Jummah Break</span>
            <span class="break-time">01:00 - 02:00 PM</span>
          </div>
        `;
                            } else if (matching.length > 0) {
                                matching.forEach(entry => {
                                            const canEdit = canUserEditDept(entry.department_id);
                                            const canDelete = canUserDeleteSlot(entry);
                                            const isLab = entry.room_type === 'Computer Lab';
                                            const projBadge = entry.room_projector ? '📹 Proj: Yes' : 'No Proj';
                                            const compBadge = isLab ? ` | 💻 ${entry.room_computers || 40} PCs` : '';

                                            html += `
            <div class="slot-card" style="border-left-color: ${entry.department_color || '#006633'};">
              <div class="slot-card-header">
                <span class="dept-pill" style="background: ${entry.department_color || '#006633'}">${entry.department_code}</span>
                <span class="sem-badge">Sem ${formatSemSec(entry.semester, entry.section)}</span>
              </div>
              <div class="course-title">${entry.course_name}</div>
              
              <div class="slot-meta">
                <span><i class="fa-solid fa-door-closed"></i> <strong>${entry.room_name}</strong> (${isLab ? 'Lab' : 'Lecture'})</span>
                <span class="room-spec-pill">🪑 ${entry.room_capacity || 50} Seats | ${projBadge}${compBadge}</span>
              </div>

              ${(canEdit || canDelete) ? `
                <div class="slot-actions no-print">
                  ${canEdit ? `
                    <button class="btn-icon" title="Edit Slot" onclick="openEditSlotModal(${entry.id})">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                  ` : ''}
                  ${canDelete ? `
                    <button class="btn-icon btn-icon-danger" title="Delete Slot" onclick="handleDeleteSlot(${entry.id})">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          `;
        });
      } else {
        html += `
          <div class="vacant-slot-box">
            <span class="vacant-text">Available</span>
          </div>
        `;
      }

      html += `</div>`;
    });
  });

  html += `</div>`;
  gridWrapper.innerHTML = html;
}

// Live Search Input Debounce
let searchTimeout;
function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderTimetable();
  }, 300);
}

// Add/Edit Timetable Slot Modal Handlers
function openAddSlotModal() {
  document.getElementById('slotModalTitle').innerHTML = `<i class="fa-solid fa-calendar-plus"></i> Add Timetable Schedule Slot`;
  document.getElementById('slotId').value = '';
  document.getElementById('slotForm').reset();
  document.getElementById('slotCourse').value = '';
  document.getElementById('slotError').style.display = 'none';

  populateSlotDeptDropdown();
  openModal('slotModal');
}

function openEditSlotModal(entryId) {
  const entry = currentTimetableEntries.find(e => e.id === entryId);
  if (!entry) return;

  document.getElementById('slotModalTitle').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Timetable Schedule Slot`;
  document.getElementById('slotId').value = entry.id;
  document.getElementById('slotError').style.display = 'none';

  populateSlotDeptDropdown(entry.department_id);

  document.getElementById('slotCourse').value = entry.course_name || '';
  document.getElementById('slotDay').value = entry.day_of_week;
  document.getElementById('slotStart').value = entry.start_time;
  document.getElementById('slotEnd').value = entry.end_time;
  document.getElementById('slotSection').value = entry.section || 'A';
  document.getElementById('slotSemester').value = entry.semester;

  onSlotDeptChange(entry.course_id, entry.room_id);

  openModal('slotModal');
}

function closeSlotModal() {
  closeModal('slotModal');
}

function populateSlotDeptDropdown(selectedDeptId = null) {
  const slotDept = document.getElementById('slotDept');
  if (!slotDept) return;

  let allowedDepts = [];
  if (currentUser && currentUser.role === 'admin') {
    allowedDepts = masterDepartments;
  } else if (currentUser) {
    allowedDepts = masterDepartments.filter(d => Number(d.id) === Number(currentUser.department_id));
  } else {
    allowedDepts = masterDepartments;
  }

  slotDept.innerHTML = allowedDepts.map(d => 
    `<option value="${d.id}" ${selectedDeptId == d.id ? 'selected' : ''}>${d.name} (${d.code})</option>`
  ).join('');

  onSlotDeptChange();
}

function formatSemSec(semester, section) {
  if (!section) return `${semester || 1}-A`;
  let cleanSec = String(section).trim();

  if (cleanSec.toLowerCase().startsWith('sem')) {
    return cleanSec.replace(/^sem\s*/i, '');
  }

  cleanSec = cleanSec.replace(/^(CS|EE|ME|CE|MGT|IT|SE)-?/i, '').trim();

  if (cleanSec.startsWith(`${semester}-`)) {
    return cleanSec;
  }
  if (cleanSec.startsWith(`${semester}`)) {
    const rest = cleanSec.substring(String(semester).length).replace(/^-/, '').trim();
    return `${semester}-${rest || 'A'}`;
  }

  return `${semester}-${cleanSec}`;
}

function onSlotDeptChange(selectedCourseId = null, selectedRoomId = null) {
  const deptId = document.getElementById('slotDept').value;
  const courseDatalist = document.getElementById('slotCourseDatalist');
  const roomSel = document.getElementById('slotRoom');

  const filteredCourses = masterCourses.filter(c => Number(c.department_id) === Number(deptId));
  
  if (courseDatalist) {
    courseDatalist.innerHTML = filteredCourses.map(c => 
      `<option value="${c.course_name}">Semester ${c.semester}</option>`
    ).join('');
  }

  if (selectedCourseId) {
    const matched = filteredCourses.find(c => Number(c.id) === Number(selectedCourseId));
    if (matched) {
      document.getElementById('slotCourse').value = matched.course_name;
    }
  }

  roomSel.innerHTML = masterRooms.map(r => {
    const isMine = currentUser && (currentUser.role === 'admin' || Number(r.department_id) === Number(currentUser.department_id));
    const labelSuffix = isMine ? '' : ` [Owned by ${r.department_name}]`;
    return `<option value="${r.id}" ${selectedRoomId == r.id ? 'selected' : ''}>${r.room_name} (Cap: ${r.capacity})${labelSuffix}</option>`;
  }).join('');

  onSlotRoomChange();
}

function onSlotRoomChange() {
  const roomId = Number(document.getElementById('slotRoom').value);
  const noticeEl = document.getElementById('slotRoomNotice');
  if (!noticeEl || !roomId) return;

  const room = masterRooms.find(r => Number(r.id) === roomId);
  const isMine = currentUser && (currentUser.role === 'admin' || (room && Number(room.department_id) === Number(currentUser.department_id)));

  if (room && !isMine) {
    noticeEl.style.display = 'block';
    noticeEl.className = 'p-2 bg-purple text-white rounded text-sm mt-1';
    noticeEl.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <strong>Cross-Dept Request:</strong> This room belongs to <strong>${room.department_name}</strong>. Submitting will send a Room Allocation Request to them for approval.`;
  } else {
    noticeEl.style.display = 'none';
  }
}

// Save Schedule Slot
async function handleSaveSlot(e) {
  e.preventDefault();

  const slotId = document.getElementById('slotId').value;
  const department_id = document.getElementById('slotDept').value;
  const course_input = document.getElementById('slotCourse').value.trim();
  const instructor_id = 1;
  const room_id = document.getElementById('slotRoom').value;
  const day_of_week = document.getElementById('slotDay').value;
  const start_time = document.getElementById('slotStart').value;
  const end_time = document.getElementById('slotEnd').value;
  const section = document.getElementById('slotSection').value.trim();
  const semester = document.getElementById('slotSemester').value;

  const errDiv = document.getElementById('slotError');
  errDiv.style.display = 'none';

  if (!course_input) {
    errDiv.innerHTML = `<strong>⚠️ Missing Course:</strong> Please select or type a course code/name.`;
    errDiv.style.display = 'block';
    return;
  }

  // Mandatory Time Constraints Validation (University hours: 07:30 AM to 04:00 PM)
  if (start_time < "07:30") {
    errDiv.innerHTML = `<strong>⚠️ Time Constraint Violation:</strong> Classes cannot start earlier than 07:30 AM (University Opening Time).`;
    errDiv.style.display = 'block';
    return;
  }

  if (end_time > "16:00") {
    errDiv.innerHTML = `<strong>⚠️ Time Constraint Violation:</strong> Classes cannot end later than 04:00 PM / 16:00 (University Closing Time).`;
    errDiv.style.display = 'block';
    return;
  }

  if (end_time <= start_time) {
    errDiv.innerHTML = `<strong>⚠️ Time Constraint Violation:</strong> End time (${end_time}) must be higher than Start time (${start_time}).`;
    errDiv.style.display = 'block';
    return;
  }

  // Weekend constraint check
  if (day_of_week === 'Saturday' || day_of_week === 'Sunday') {
    errDiv.innerHTML = `<strong>⚠️ Holiday Constraint Violation:</strong> Saturday and Sunday are university holidays. Classes can only be scheduled Monday through Friday.`;
    errDiv.style.display = 'block';
    return;
  }

  // Lunch Break check (12:00 to 13:00 on Mon-Fri)
  if (start_time < '13:00' && end_time > '12:00') {
    errDiv.innerHTML = `<strong>⚠️ Break Time Conflict:</strong> 12:00 PM to 01:00 PM is Lunch / Recess Break. Classes cannot be scheduled during this break.`;
    errDiv.style.display = 'block';
    return;
  }

  // Friday Jummah Break check (13:00 to 14:00)
  if (day_of_week === 'Friday' && start_time < '14:00' && end_time > '13:00') {
    errDiv.innerHTML = `<strong>⚠️ Break Time Conflict:</strong> 01:00 PM to 02:00 PM is Jummah Prayer Break on Friday. Classes cannot be scheduled during this break.`;
    errDiv.style.display = 'block';
    return;
  }

  const payload = {
    department_id,
    course_input,
    instructor_id,
    room_id,
    day_of_week,
    start_time,
    end_time,
    section,
    semester
  };

  const isEdit = !!slotId;
  const url = isEdit ? `/api/timetable/${slotId}` : '/api/timetable';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      errDiv.innerHTML = `<strong>⚠️ Schedule Conflict / Validation Error:</strong> ${data.error}<br><small>Modification rejected to prevent overwriting existing schedule or breaking time rules.</small>`;
      errDiv.style.display = 'block';
      return;
    }

    if (res.status === 202 || data.isRequest) {
      alert(`📩 ROOM REQUEST SUBMITTED:\n\n${data.message}`);
      closeSlotModal();
      switchRequestTab('outgoing');
      await switchMainView('viewRoomRequests', document.getElementById('navRequests'));
      await loadMasterData();
      return;
    }

    closeSlotModal();
    await loadMasterData();
    renderTimetable();
  } catch (err) {
    errDiv.textContent = 'Failed to save slot.';
    errDiv.style.display = 'block';
  }
}

// Delete Slot Handler
async function handleDeleteSlot(id) {
  if (!confirm('Are you sure you want to delete this schedule slot?')) return;
  try {
    const res = await fetch(`/api/timetable/${id}`, { method: 'DELETE' });
    if (!res.ok) return alert('Failed to delete slot.');
    renderTimetable();
  } catch (err) {
    alert('Error deleting slot.');
  }
}

// Room Availability Lookup Modal
function openRoomFinderModal() {
  const deptField = document.getElementById('rfDept');
  const summaryBox = document.getElementById('roomFinderDeptSummary');
  const resultsBox = document.getElementById('roomFinderResults');
  if (deptField) deptField.value = '';
  if (summaryBox) summaryBox.style.display = 'none';
  if (resultsBox) resultsBox.innerHTML = `<p class="placeholder-text">Select a department, day and time range above to query vacant classrooms.</p>`;
  populateRoomFinderDeptDropdown();
  openModal('roomFinderModal');
}
function closeRoomFinderModal() {
  closeModal('roomFinderModal');
}

// Find Room by Department Dropdown Populator (Room Finder Modal)
function populateRoomFinderDeptDropdown() {
  const deptDatalist = document.getElementById('rfDeptDatalist');
  if (!deptDatalist || deptDatalist.dataset.loaded === '1') return;

  deptDatalist.innerHTML = masterDepartments.map(d => `<option value="${d.name}"></option>`).join('');
  deptDatalist.dataset.loaded = '1';
}

function onRoomFinderDeptChange() {
  const summaryBox = document.getElementById('roomFinderDeptSummary');
  if (summaryBox) summaryBox.style.display = 'none';
}

async function checkRoomAvailability(e) {
  e.preventDefault();
  const deptName = document.getElementById('rfDept').value.trim();
  const day = document.getElementById('rfDay').value;
  const start_time = document.getElementById('rfStart').value;
  const end_time = document.getElementById('rfEnd').value;

  const container = document.getElementById('roomFinderResults');
  const summaryBox = document.getElementById('roomFinderDeptSummary');

  const matchedDept = masterDepartments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
  if (!matchedDept) {
    if (summaryBox) summaryBox.style.display = 'none';
    container.innerHTML = `<div class="form-error">Department "${deptName}" was not found. Please select a valid department from the list.</div>`;
    return;
  }

  container.innerHTML = `<p class="placeholder-text"><i class="fa-solid fa-spin fa-circle-notch"></i> Searching free classrooms...</p>`;

  try {
    const res = await fetch(`/api/rooms/availability?day=${day}&start_time=${start_time}&end_time=${end_time}`);
    const data = await res.json();

    const deptRoomNames = masterRooms
      .filter(r => Number(r.department_id) === Number(matchedDept.id))
      .map(r => r.room_name.toLowerCase());

    const deptAvailable = data.available.filter(r => deptRoomNames.includes(r.room_name.toLowerCase()));

    const totalRooms = deptRoomNames.length;
    const availableCount = deptAvailable.length;
    const occupiedCount = totalRooms - availableCount;

    if (summaryBox) {
      summaryBox.style.display = 'flex';
      document.getElementById('rfSummaryTotal').textContent = totalRooms;
      document.getElementById('rfSummaryOccupied').textContent = occupiedCount;
      document.getElementById('rfSummaryAvailable').textContent = availableCount;
    }

    if (deptAvailable.length === 0) {
      container.innerHTML = `<div class="form-error">No rooms available in "${matchedDept.name}" at this time slot (${day} ${start_time} - ${end_time}). All department rooms occupied!</div>`;
      return;
    }

    let html = `
      <div style="margin-bottom: 12px; font-weight: 600; color: var(--uet-green);">
        <i class="fa-solid fa-circle-check"></i> Found ${deptAvailable.length} Free Rooms in ${matchedDept.name} for ${day} (${start_time} - ${end_time}):
      </div>
      <div class="form-grid">
    `;

    deptAvailable.forEach(r => {
      const isLab = r.room_type === 'Computer Lab';
      html += `
        <div class="slot-card" style="border-left-color: var(--uet-green);">
          <div class="course-code">${r.room_name}</div>
          <div class="course-title">${isLab ? 'Computer Lab' : 'Lecture Hall'}</div>
          <div class="slot-meta">
            <span>🪑 Seats: <strong>${r.capacity}</strong> | ${r.projector ? '📹 Proj: Yes' : 'No Proj'}</span>
            ${isLab ? `<span>💻 Computers: <strong>${r.computers_count || 40}</strong></span>` : ''}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="form-error">Failed to check room availability.</div>`;
  }
}


// Find Room by Department Card (Rooms Manager View)
function populateFindRoomDeptDropdown() {
  const deptDatalist = document.getElementById('findRoomDeptDatalist');
  if (!deptDatalist || deptDatalist.dataset.loaded === '1') return;

  deptDatalist.innerHTML = masterDepartments.map(d => `<option value="${d.name}"></option>`).join('');
  deptDatalist.dataset.loaded = '1';
}

function onFindRoomDeptChange() {
  const deptName = document.getElementById('findRoomDept').value.trim();
  const datalist = document.getElementById('findRoomDatalist');
  const roomInput = document.getElementById('findRoomInput');
  if (!datalist || !roomInput) return;

  const matchedDept = masterDepartments.find(d => d.name.toLowerCase() === deptName.toLowerCase());

  const filteredRooms = matchedDept
    ? masterRooms.filter(r => Number(r.department_id) === Number(matchedDept.id))
    : [];

  datalist.innerHTML = filteredRooms.map(r => `<option value="${r.room_name}"></option>`).join('');
  roomInput.value = '';
  roomInput.placeholder = matchedDept ? 'Select or type room name...' : 'Select department first...';

  roomsManagerDeptFilterId = matchedDept ? matchedDept.id : null;
  roomsManagerRoomFilterId = null;
  if (typeof renderRoomsManager === 'function') {
    renderRoomsManager();
  }
}

function onFindRoomInputChange() {
  const deptName = document.getElementById('findRoomDept').value.trim();
  const roomName = document.getElementById('findRoomInput').value.trim();

  const matchedDept = masterDepartments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
  const matchedRoom = matchedDept
    ? masterRooms.find(r =>
        Number(r.department_id) === Number(matchedDept.id) &&
        r.room_name.toLowerCase() === roomName.toLowerCase()
      )
    : null;

  roomsManagerRoomFilterId = matchedRoom ? matchedRoom.id : null;
  if (typeof renderRoomsManager === 'function') {
    renderRoomsManager();
  }
}

async function handleFindRoomSchedule() {
  const deptName = document.getElementById('findRoomDept').value.trim();
  const roomName = document.getElementById('findRoomInput').value.trim();

  if (!deptName) {
    alert('Please select or type a department first.');
    return;
  }

  const matchedDept = masterDepartments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
  if (!matchedDept) {
    alert(`Department "${deptName}" was not found. Please select a valid department from the list.`);
    return;
  }

  if (!roomName) {
    alert('Please select or type a room name.');
    return;
  }

  const matched = masterRooms.find(r =>
    Number(r.department_id) === Number(matchedDept.id) &&
    r.room_name.toLowerCase() === roomName.toLowerCase()
  );

  if (!matched) {
    alert(`Room "${roomName}" was not found in this department. Please check the spelling, or add it first from Rooms Manager.`);
    return;
  }

  await switchMainView('viewTimetable', document.getElementById('navTimetable'));
  document.getElementById('filterDept').value = matchedDept.id;
  document.getElementById('filterRoom').value = matched.id;
  renderTimetable();
}