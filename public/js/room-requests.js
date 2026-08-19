// CROSS-DEPARTMENT ROOM REQUEST MANAGER
let roomRequests = [];
let activeRequestTab = 'incoming';

async function fetchRoomRequests() {
    try {
        const res = await fetch('/api/requests');
        if (res.ok) {
            roomRequests = await res.json();
        } else {
            roomRequests = [];
        }
    } catch (err) {
        roomRequests = [];
    }
    updateRequestBadgeCounters();
}

function updateRequestBadgeCounters() {
    if (!currentUser) return;
    const myDeptId = Number(currentUser.department_id);
    const isSuperAdmin = currentUser.role === 'admin';

    const incomingPending = roomRequests.filter(r =>
        (isSuperAdmin || Number(r.owning_department_id) === myDeptId) && r.status === 'pending'
    ).length;

    const outgoingCount = roomRequests.filter(r =>
        Number(r.requesting_department_id) === myDeptId
    ).length;

    const totalCount = roomRequests.length;

    const badgeEl = document.getElementById('pendingRequestsBadge');
    if (badgeEl) {
        if (incomingPending > 0) {
            badgeEl.style.display = 'inline-block';
            badgeEl.textContent = incomingPending;
        } else {
            badgeEl.style.display = 'none';
        }
    }

    const tabInBadge = document.getElementById('tabIncomingBadge');
    if (tabInBadge) tabInBadge.textContent = incomingPending;

    const tabOutBadge = document.getElementById('tabOutgoingBadge');
    if (tabOutBadge) tabOutBadge.textContent = outgoingCount;

    const tabAllBadge = document.getElementById('tabAllBadge');
    if (tabAllBadge) tabAllBadge.textContent = totalCount;
}

function switchRequestTab(tabName) {
    activeRequestTab = tabName;
    const btnIn = document.getElementById('tabIncomingReqs');
    const btnOut = document.getElementById('tabOutgoingReqs');
    const btnAll = document.getElementById('tabAllReqs');

    [btnIn, btnOut, btnAll].forEach(b => {
        if (b) b.classList.remove('active');
    });

    if (tabName === 'incoming' && btnIn) btnIn.classList.add('active');
    else if (tabName === 'outgoing' && btnOut) btnOut.classList.add('active');
    else if (tabName === 'all' && btnAll) btnAll.classList.add('active');

    renderRoomRequestsView();
}

function renderRoomRequestsView() {
    const container = document.getElementById('roomRequestsListContainer');
    if (!container) return;

    if (!currentUser) {
        container.innerHTML = `<div class="form-error">Please login to view room requests.</div>`;
        return;
    }

    const myDeptId = Number(currentUser.department_id);
    const isSuperAdmin = currentUser.role === 'admin';

    const incomingReqs = roomRequests.filter(r => isSuperAdmin || Number(r.owning_department_id) === myDeptId);
    const outgoingReqs = roomRequests.filter(r => Number(r.requesting_department_id) === myDeptId);

    let filtered = [];
    if (activeRequestTab === 'incoming') {
        filtered = incomingReqs;
    } else if (activeRequestTab === 'outgoing') {
        filtered = outgoingReqs;
    } else {
        filtered = roomRequests;
    }

    if (filtered.length === 0) {
        let emptyTitle = 'No Incoming Room Requests';
        let emptyMsg = 'There are currently no room allocation requests for your department\'s rooms.';
        if (activeRequestTab === 'outgoing') {
            emptyTitle = 'No Sent Room Requests';
            emptyMsg = 'You have not submitted any room allocation requests to other departments.';
        } else if (activeRequestTab === 'all') {
            emptyTitle = 'No Room Requests Found';
            emptyMsg = 'There are no active or past room requests in the system.';
        }

        container.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 40px;">
        <i class="fa-solid fa-inbox" style="font-size: 2.5rem; color: var(--uet-green);"></i>
        <h3 class="mt-2">${emptyTitle}</h3>
        <p class="text-muted">${emptyMsg}</p>
      </div>
    `;
        return;
    }

    let html = `<div class="form-grid">`;

    filtered.forEach(req => {
                const isIncoming = Number(req.owning_department_id) === myDeptId || isSuperAdmin;
                let statusBadge = '';
                if (req.status === 'pending') {
                    statusBadge = `<span class="badge bg-purple"><i class="fa-solid fa-clock"></i> Pending Approval</span>`;
                } else if (req.status === 'approved') {
                    statusBadge = `<span class="badge bg-green"><i class="fa-solid fa-circle-check"></i> Approved & Allocated</span>`;
                } else {
                    statusBadge = `<span class="badge bg-red"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`;
                }

                html += `
      <div class="card glass-card p-4" style="border-left: 4px solid ${req.requesting_department_color || '#006633'};">
        <div class="d-flex justify-between items-center mb-2">
          <span class="badge" style="background:${req.requesting_department_color || '#006633'}; color:#fff;">
            Request from ${req.requesting_department_code || 'DEPT'}
          </span>
          ${statusBadge}
        </div>

        <h4 style="margin: 4px 0; color: var(--uet-gold);">
          <i class="fa-solid fa-door-open"></i> ${req.room_name} (${req.owning_department_name || 'Owner Dept'})
        </h4>

        <div style="font-size: 0.9rem; color: #fff; font-weight: 600; margin-bottom: 6px;">
          📚 ${req.course_code} - ${req.course_name}
        </div>

        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">
          📅 <strong>${req.day_of_week}</strong> (${req.start_time} - ${req.end_time}) | Section: <strong>${req.section}</strong> | Sem: <strong>${req.semester}</strong>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
          🏛️ Requesting Dept: <strong>${req.requesting_department_name}</strong>
          <br>🏛️ Owning Dept: <strong>${req.owning_department_name}</strong>
          ${req.notes ? `<br>💬 Notes: <em>"${req.notes}"</em>` : ''}
        </div>

        <div class="d-flex gap-2 border-t pt-3 align-items-center">
          ${(isIncoming && req.status === 'pending') ? `
            <button class="btn btn-success btn-sm flex-1" onclick="handleApproveRequest(${req.id})">
              <i class="fa-solid fa-check"></i> Approve & Allocate
            </button>
            <button class="btn btn-danger btn-sm" onclick="handleRejectRequest(${req.id})">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>
          ` : ''}
          <button class="btn btn-outline btn-sm text-danger" title="Delete Request Record" onclick="handleDeleteRequest(${req.id})">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function openRoomRequestModal(preselectRoomId = null) {
  if (!currentUser) {
    alert('Please login to request a room.');
    return;
  }

  const myDeptId = Number(currentUser.department_id);
  const roomSelect = document.getElementById('reqRoom');
  roomSelect.innerHTML = '';

  const otherRooms = masterRooms.filter(r => Number(r.department_id) !== myDeptId);

  if (otherRooms.length === 0) {
    alert('No rooms belonging to other departments are available to request.');
    return;
  }

  otherRooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.room_name} - ${r.department_name} (${r.room_type}, ${r.capacity} seats)`;
    if (preselectRoomId && Number(r.id) === Number(preselectRoomId)) {
      opt.selected = true;
    }
    roomSelect.appendChild(opt);
  });

  document.getElementById('reqCourseCode').value = `${currentUser.department_code || 'CS'}-101`;
  document.getElementById('reqCourseName').value = 'Guest Department Lecture';
  document.getElementById('reqSection').value = `${currentUser.department_code || 'CS'}-1A`;
  document.getElementById('reqSemester').value = '1';
  document.getElementById('reqNotes').value = '';
  document.getElementById('reqError').style.display = 'none';

  checkRequestRoomVacancy();

  openModal('roomRequestModal');
}

function closeRoomRequestModal() {
  closeModal('roomRequestModal');
}

function checkRequestRoomVacancy() {
  const roomId = Number(document.getElementById('reqRoom').value);
  const day = document.getElementById('reqDay').value;
  const start = document.getElementById('reqStart').value;
  const end = document.getElementById('reqEnd').value;
  const statusDiv = document.getElementById('reqVacancyStatus');
  const btnSubmit = document.getElementById('btnSubmitReq');

  if (!roomId || !day || !start || !end) return;

  const targetRoom = masterRooms.find(r => r.id === roomId);
  const roomName = targetRoom ? targetRoom.room_name : 'Room';

  const conflict = timetableEntries.find(e => 
    Number(e.room_id) === roomId &&
    e.day_of_week === day &&
    (e.start_time < end && e.end_time > start)
  );

  if (conflict) {
    statusDiv.innerHTML = `
      <div class="form-error" style="display:block;">
        ❌ <strong>Room Busy:</strong> "${roomName}" is ALREADY OCCUPIED on ${day} (${start} - ${end}) by ${conflict.course_code} (${conflict.section}). Requests can only be submitted for vacant time slots.
      </div>
    `;
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.5';
  } else {
    statusDiv.innerHTML = `
      <div class="p-2 bg-green text-white rounded" style="font-size: 0.85rem;">
        ✓ <strong>Room Free:</strong> "${roomName}" is 100% VACANT on ${day} (${start} - ${end}). You can submit your request!
      </div>
    `;
    btnSubmit.disabled = false;
    btnSubmit.style.opacity = '1';
  }
}

async function handleCreateRoomRequest(e) {
  e.preventDefault();
  const errorDiv = document.getElementById('reqError');
  errorDiv.style.display = 'none';

  const room_id = document.getElementById('reqRoom').value;
  const day_of_week = document.getElementById('reqDay').value;
  const start_time = document.getElementById('reqStart').value;
  const end_time = document.getElementById('reqEnd').value;
  const course_code = document.getElementById('reqCourseCode').value;
  const course_name = document.getElementById('reqCourseName').value;
  const section = document.getElementById('reqSection').value;
  const semester = document.getElementById('reqSemester').value;
  const notes = document.getElementById('reqNotes').value;

  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id,
        day_of_week,
        start_time,
        end_time,
        course_code,
        course_name,
        section,
        semester,
        notes
      })
    });

    const data = await res.json();

    if (!res.ok) {
      errorDiv.textContent = data.error || 'Failed to submit room request.';
      errorDiv.style.display = 'block';
      return;
    }

    alert(data.message);
    closeRoomRequestModal();

    switchRequestTab('outgoing');
    await switchMainView('viewRoomRequests', document.getElementById('navRequests'));
  } catch (err) {
    errorDiv.textContent = 'Server error submitting room request.';
    errorDiv.style.display = 'block';
  }
}

async function handleApproveRequest(requestId) {
  if (!confirm('Approve this request and allocate this room for the specified time slot?')) return;

  try {
    const res = await fetch(`/api/requests/${requestId}/approve`, {
      method: 'POST'
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to approve request.');
      return;
    }

    alert(data.message);
    await loadMasterData();
    await fetchRoomRequests();
    renderRoomRequestsView();
    renderTimetable();
  } catch (err) {
    alert('Server error approving request.');
  }
}

async function handleRejectRequest(requestId) {
  if (!confirm('Are you sure you want to reject this room request?')) return;

  try {
    const res = await fetch(`/api/requests/${requestId}/reject`, {
      method: 'POST'
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to reject request.');
      return;
    }

    alert(data.message);
    await fetchRoomRequests();
    renderRoomRequestsView();
  } catch (err) {
    alert('Server error rejecting request.');
  }
}

async function handleDeleteRequest(requestId) {
  if (!confirm('Are you sure you want to delete/cancel this room request?')) return;

  try {
    const res = await fetch(`/api/requests/${requestId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to delete request.');
      return;
    }
    alert(data.message);
    await loadMasterData();
    await fetchRoomRequests();
    renderRoomRequestsView();
    renderTimetable();
  } catch (err) {
    alert('Server error deleting request.');
  }
}