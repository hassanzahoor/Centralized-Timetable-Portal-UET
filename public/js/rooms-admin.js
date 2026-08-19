// SUPER ADMIN COORDINATOR CREDENTIALS MANAGER
let allCoordinatorCreds = [];

async function renderAdminCredsTable() {
    const container = document.getElementById('adminCredsTableContainer');
    if (!container) return;

    try {
        const res = await fetch('/api/departments/credentials');
        allCoordinatorCreds = await res.json();
        renderFilteredCredsTable(allCoordinatorCreds);
    } catch (err) {
        container.innerHTML = `<div class="form-error">Failed to load coordinator credentials.</div>`;
    }
}

async function handleCredsSearch() {
    // Self-healing: if the cache is empty/missing for any reason, refetch instead of showing a dead end.
    if (!Array.isArray(allCoordinatorCreds) || allCoordinatorCreds.length === 0) {
        try {
            const res = await fetch('/api/departments/credentials');
            allCoordinatorCreds = await res.json();
        } catch (err) {
            console.error('Failed to refresh coordinator credentials:', err);
        }
    }

    const rawQuery = document.getElementById('credsSearchInput').value.trim().toLowerCase();

    if (!rawQuery) {
        renderFilteredCredsTable(allCoordinatorCreds);
        return;
    }

    // Token-based match: every word typed must appear somewhere in the combined
    // searchable text, so "computer science" matches "Department of Computer Science"
    // regardless of extra words or order, and a single letter like "c" shortlists
    // every account containing that letter, narrowing further as more is typed.
    const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

    const filtered = allCoordinatorCreds.filter(u => {
        const searchable = [
            u.username || '',
            u.email || '',
            u.full_name || '',
            u.department_name || '',
            u.department_code || ''
        ].join(' ').toLowerCase();

        return queryTokens.every(token => searchable.includes(token));
    });

    renderFilteredCredsTable(filtered);
}

function renderFilteredCredsTable(users) {
    const container = document.getElementById('adminCredsTableContainer');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `
      <div class="no-slots-placeholder" style="text-align:center; padding:40px;">
        <i class="fa-solid fa-magnifying-glass" style="font-size:2.5rem; color:var(--uet-green);"></i>
        <h3>No Matching Accounts Found</h3>
        <p>Try a different username, email, or department name.</p>
      </div>
    `;
        return;
    }

    try {
        let html = '<div class="creds-row-list">';

        users.forEach((u, idx) => {
                    const isAdmin = u.role === 'admin';
                    const initials = isAdmin ? '' : (u.department_code || u.full_name || '??').substring(0, 2).toUpperCase();
                    const deptColor = u.department_color || '#7c8c72';

                    html += `
        <div class="creds-row ${isAdmin ? 'creds-row-admin' : ''}">
          <div class="creds-row-num">${idx + 1}</div>
          <div class="creds-row-avatar" style="${isAdmin ? '' : `background:${deptColor}22; color:${deptColor};`}">
            ${isAdmin ? '<i class="fa-solid fa-user-shield"></i>' : initials}
          </div>
          <div class="creds-row-identity">
            <span class="creds-row-label">Username</span>
            <code class="creds-row-username">${u.username}</code>
            <span class="creds-row-fullname">${u.full_name}</span>
          </div>
          <div class="creds-row-email-block">
            <span class="creds-row-label"><i class="fa-solid fa-envelope"></i> Email</span>
            <a href="mailto:${u.email || ''}" class="creds-row-email">${u.email || '-'}</a>
          </div>
          <div class="creds-row-role-block">
            <span class="creds-row-label">Role</span>
            <span class="creds-pill ${isAdmin ? 'creds-pill-admin' : 'creds-pill-coordinator'}">${isAdmin ? 'Super Admin' : 'Dept Coordinator'}</span>
          </div>
          <div class="creds-row-dept-block">
            <span class="creds-row-label">Department</span>
            <div class="creds-row-dept-value">
              <span class="creds-dept-badge" style="background:${deptColor};">${isAdmin ? 'ALL' : (u.department_code || '-')}</span>
              <span>${u.department_name || 'All Campus (Global)'}</span>
            </div>
          </div>
          <div class="creds-row-pass-block">
            <span class="creds-row-label">Default Password</span>
            <code class="creds-row-password">${u.default_password || u.password || '-'}</code>
          </div>
        </div>
      `;
        });

        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="form-error">Failed to render coordinator credentials.</div>`;
    }
}

// ROOMS MANAGER DASHBOARD PER DEPARTMENT
const ROOM_TYPE_STYLE_MAP = {
    'Lecture Hall': { cls: 'room-type-lecture', icon: 'fa-door-closed', badge: 'Lecture Room' },
    'Computer Lab': { cls: 'room-type-complab', icon: 'fa-laptop-code', badge: 'Computer Lab' },
    'Science Lab': { cls: 'room-type-scilab', icon: 'fa-flask', badge: 'Science Lab' },
    'Seminar Hall': { cls: 'room-type-seminar', icon: 'fa-chalkboard', badge: 'Seminar Hall' },
    'Auditorium': { cls: 'room-type-auditorium', icon: 'fa-landmark', badge: 'Auditorium' }
};

let roomsManagerDeptFilterId = null;
let roomsManagerRoomFilterId = null;

function renderRoomsManager() {
    const grid = document.getElementById('roomsListGrid');
    if (!grid) return;

    let roomsToRender = [...masterRooms];

    if (roomsManagerDeptFilterId) {
        roomsToRender = roomsToRender.filter(r => Number(r.department_id) === Number(roomsManagerDeptFilterId));
    }

    if (roomsManagerRoomFilterId) {
        roomsToRender = roomsToRender.filter(r => Number(r.id) === Number(roomsManagerRoomFilterId));
    }

    if (roomsToRender.length === 0) {
        grid.innerHTML = `
      <div class="no-slots-placeholder" style="text-align:center; padding:40px;">
        <i class="fa-solid fa-door-closed" style="font-size:2.5rem; color:var(--uet-green);"></i>
        <h3>No Rooms Found</h3>
        <p>This department has no rooms yet.</p>
      </div>
    `;
        return;
    }

    let html = '<div class="room-row-list">';
    roomsToRender.forEach(r => {
                const typeInfo = ROOM_TYPE_STYLE_MAP[r.room_type] || ROOM_TYPE_STYLE_MAP['Lecture Hall'];
                const isLab = r.room_type === 'Computer Lab' || r.room_type === 'Science Lab';
                const canEditRoom = canUserEditDept(r.department_id);

                html += `
      <div class="room-row ${typeInfo.cls}">
        <div class="room-row-identity">
          <div class="room-row-icon-badge"><i class="fa-solid ${typeInfo.icon}"></i></div>
          <div>
            <span class="room-row-name">${r.room_name}</span>
            <span class="room-row-type-pill">${typeInfo.badge}</span>
          </div>
        </div>
        <div class="room-row-dept">Department: <strong>${r.department_name}</strong></div>
        <div class="room-row-stats-group">
          <div class="room-row-stat-slot"><i class="fa-solid fa-chair"></i><div><span>Chairs</span><strong>${r.capacity || r.chairs_count || 50} Seats</strong></div></div>
          <div class="room-row-stat-slot"><i class="fa-solid fa-video"></i><div><span>Projector</span><strong>${r.projector ? 'Yes' : 'No'}</strong></div></div>
          <div class="room-row-stat-slot">${isLab ? `<i class="fa-solid fa-desktop"></i><div><span>Computers</span><strong>${r.computers_count || 40} PCs</strong></div>` : ''}</div>
        </div>
        ${canEditRoom ? `
          <div class="room-row-actions">
            <button class="btn-icon" onclick="openEditRoomModal(${r.id})" title="Edit Room">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-icon btn-icon-danger" onclick="handleDeleteRoom(${r.id}, '${r.room_name}')" title="Delete Room">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        ` : '<div class="room-row-actions"></div>'}
      </div>
    `;
  });
  html += '</div>';

  grid.innerHTML = html;
}

// Combined Dept & Coordinator Account Creation (Super Admin)
async function handleCreateDeptWithCredentials(e) {
  e.preventDefault();
  const name = document.getElementById('newDeptName').value;
  const code = document.getElementById('newDeptCode').value;
  const color = document.getElementById('newDeptColor').value;

  const coordinator_username = document.getElementById('newCoordUsername').value;
  const coordinator_password = document.getElementById('newCoordPassword').value;
  const coordinator_name = document.getElementById('newCoordName').value;
  const coordinator_email = document.getElementById('newCoordEmail').value;

  try {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, code, color, building: 'Main Academic Block',
        coordinator_username, coordinator_password, coordinator_name, coordinator_email
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to create department.');
      return;
    }

    alert(`Department "${name}" and Coordinator account "${coordinator_username}" created successfully!`);
    closeDeptManagementModal();
    await loadMasterData();
    if (typeof renderAdminCredsTable === 'function') {
      renderAdminCredsTable();
    }
  } catch (err) {
    alert('Error creating department and coordinator.');
  }
}

function openDeptManagementModal() {
  openModal('deptMgmtModal');
}
function closeDeptManagementModal() {
  closeModal('deptMgmtModal');
}

// Conditional Computers Field Toggle based on Room Type
function onRoomTypeChange() {
  const roomType = document.getElementById('roomType').value;
  const compGroup = document.getElementById('computersGroup');
  const compInput = document.getElementById('roomComputers');

  if (roomType === 'Computer Lab') {
    compGroup.style.display = 'block';
    compInput.required = true;
  } else {
    compGroup.style.display = 'none';
    compInput.required = false;
  }
}

// Add Room Modal (LOCKED to Coordinator's Department)
function openAddRoomModal() {
  const modalTitle = document.getElementById('addRoomModalTitle');
  const submitBtn = document.getElementById('addRoomSubmitBtn');
  const editIdInput = document.getElementById('editRoomId');

  if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-door-plus"></i> Add New Room / Lab`;
  if (submitBtn) submitBtn.textContent = 'Add Room';
  if (editIdInput) editIdInput.value = '';

  const form = document.getElementById('addRoomForm');
  if (form) form.reset();

  const deptSel = document.getElementById('roomDept');
  if (deptSel) {
    if (currentUser && currentUser.role === 'dept_admin') {
      deptSel.innerHTML = `<option value="${currentUser.department_id}">${currentUser.department_name} (${currentUser.department_code})</option>`;
      deptSel.disabled = true;
    } else {
      deptSel.disabled = false;
      deptSel.innerHTML = masterDepartments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
    }
  }

  onRoomTypeChange();
  openModal('addRoomModal');
}

function openEditRoomModal(roomId) {
  const room = masterRooms.find(r => Number(r.id) === Number(roomId));
  if (!room) return;

  const modalTitle = document.getElementById('addRoomModalTitle');
  const submitBtn = document.getElementById('addRoomSubmitBtn');
  const editIdInput = document.getElementById('editRoomId');

  if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Room / Lab Details`;
  if (submitBtn) submitBtn.textContent = 'Update Room Details';
  if (editIdInput) editIdInput.value = room.id;

  const deptSel = document.getElementById('roomDept');
  if (deptSel) {
    if (currentUser && currentUser.role === 'dept_admin') {
      deptSel.innerHTML = `<option value="${currentUser.department_id}">${currentUser.department_name} (${currentUser.department_code})</option>`;
      deptSel.disabled = true;
    } else {
      deptSel.disabled = false;
      deptSel.innerHTML = masterDepartments.map(d => `<option value="${d.id}" ${d.id == room.department_id ? 'selected' : ''}>${d.name} (${d.code})</option>`).join('');
    }
  }

  document.getElementById('roomName').value = room.room_name;
  document.getElementById('roomCapacity').value = room.capacity || room.chairs_count || 50;
  document.getElementById('roomType').value = room.room_type || 'Lecture Hall';
  document.getElementById('roomProjector').value = room.projector ? '1' : '0';
  document.getElementById('roomComputers').value = room.computers_count || 40;

  onRoomTypeChange();
  openModal('addRoomModal');
}

function onRoomTypeChange() {
  const roomTypeSelect = document.getElementById('roomType');
  if (!roomTypeSelect) return;
  const room_type = roomTypeSelect.value;
  const computersGroup = document.getElementById('computersGroup');
  const label = document.getElementById('computersGroupLabel');

  if (room_type === 'Computer Lab' || room_type === 'Science Lab') {
    if (computersGroup) computersGroup.style.display = 'block';
    if (label) {
      label.textContent = room_type === 'Computer Lab' 
        ? 'Number of Computers *' 
        : 'Number of Computers / Lab Equipment Stations *';
    }
  } else {
    if (computersGroup) computersGroup.style.display = 'none';
  }
}

function closeAddRoomModal() {
  closeModal('addRoomModal');
}

async function handleCreateRoom(e) {
  e.preventDefault();
  const roomId = document.getElementById('editRoomId').value;
  const room_name = document.getElementById('roomName').value.trim();
  const capacity = document.getElementById('roomCapacity').value;
  const room_type = document.getElementById('roomType').value;
  const projector = document.getElementById('roomProjector').value;
  
  let computers_count = 0;
  if (room_type === 'Computer Lab' || room_type === 'Science Lab') {
    computers_count = document.getElementById('roomComputers').value || 0;
  }
  
  const department_id = document.getElementById('roomDept').value || (currentUser ? currentUser.department_id : null);

  const url = roomId ? `/api/rooms/${roomId}` : '/api/rooms';
  const method = roomId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_name, building: 'Main Academic Block', capacity, room_type, projector, computers_count, department_id })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to save room.');
      return;
    }

    closeAddRoomModal();
    await loadMasterData();
    renderRoomsManager();
    renderDeptTree();
  } catch (err) {
    alert('Error saving room.');
  }
}