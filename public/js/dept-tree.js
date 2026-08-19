// DEPARTMENT & ROOM TREE VIEW
function renderDeptTree() {
    const dashTree = document.getElementById('dashboardDeptTree');
    const mainTree = document.getElementById('mainDeptTreeContainer');
    const isSuperAdmin = currentUser && currentUser.role === 'admin';

    if (masterDepartments.length === 0) return;

    if (dashTree) {
        let dashHtml = `
    <div class="dept-tree-search-placeholder" id="dashTreeSearchPlaceholder">
      <i class="fa-solid fa-magnifying-glass"></i>
      <h3>Search to See the Result</h3>
      <p>Type a department name or code above to find it here.</p>
    </div>
    <div class="dept-tree-no-match" id="dashTreeNoMatch" style="display:none;">No matching departments found.</div>
    <div class="dept-tree-container" id="dashTreeContainerInner" style="display:none;">`;
        masterDepartments.forEach((d, idx) => {
                    const isFirstOpen = false;
                    const roomList = d.rooms && d.rooms.length > 0 ? d.rooms : masterRooms.filter(r => Number(r.department_id) === Number(d.id));
                    const canEditDept = canUserEditDept(d.id);

                    const cCount = roomList.filter(r => r.room_type !== 'Computer Lab').length;
                    const lCount = roomList.filter(r => r.room_type === 'Computer Lab').length;
                    const pCount = roomList.filter(r => r.projector === 1 || r.projector === 'Yes' || r.projector === '1').length;

                    dashHtml += `
        <div class="dept-tree-node" id="dash-dept-node-${d.id}" data-search="${(d.name + ' ' + d.code).toLowerCase()}">
          <div class="dept-tree-header" onclick="toggleTreeNode('dash-node-${d.id}', this)">
            <i class="fa-solid fa-chevron-down tree-chevron" id="dash-btn-toggle-${d.id}" style="transform: rotate(${isFirstOpen ? '0deg' : '-90deg'});"></i>
            <span class="dept-icon-badge" style="background:${d.color ? d.color + '22' : '#eef0ea'}; color:${d.color || '#006633'};"><i class="fa-solid fa-building-columns"></i></span>
            <div class="dept-title">${d.name} (${d.code})</div>
            <div class="dept-pill-group">
              <span class="dept-pill pill-blue"><i class="fa-solid fa-chalkboard"></i> Classrooms: ${cCount}</span>
              <span class="dept-pill pill-purple"><i class="fa-solid fa-flask"></i> Labs: ${lCount}</span>
              <span class="dept-pill pill-green"><i class="fa-solid fa-video"></i> Projectors: ${pCount}</span>
            </div>
          </div>

          <div class="dept-tree-children" id="dash-node-${d.id}" style="display: ${isFirstOpen ? 'flex' : 'none'};">

          ${roomList.length > 0 ? `
            <div class="room-tree-search-wrap">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" placeholder="Search rooms by number or type (e.g. lab, G-10)..." autocomplete="off" oninput="handleRoomTreeSearch(${d.id}, 'dash')">
            </div>
          ` : ''}
      `;

                    if (roomList.length === 0) {
                        dashHtml += `<div class="text-muted text-sm p-2">No rooms assigned directly to this department.</div>`;
                    } else {
                        roomList.forEach(r => {
                                    const isLab = r.room_type === 'Computer Lab';
                                    const roomSearchData = `${r.room_name} ${isLab ? 'computer lab' : 'lecture room'}`.toLowerCase();

                                    dashHtml += `
            <div class="room-tree-item" data-room-search="${roomSearchData}" onclick="inspectRoomTimetable(${r.id}, '${r.room_name}')">
              <span class="room-badge"><i class="fa-solid ${isLab ? 'fa-laptop-code' : 'fa-chalkboard-user'}"></i> ${r.room_name}</span>
              <span class="badge ${isLab ? 'bg-purple' : 'bg-green'}">${isLab ? 'Computer Lab' : 'Lecture Room'}</span>
              <div class="room-specs">
                <span class="room-spec-col">🪑 ${r.capacity || r.chairs_count || 50} Chairs</span>
                <span class="room-spec-col">${r.projector ? '📹 Projector: Yes' : 'No Projector'}</span>
                <span class="room-spec-col">${isLab ? `💻 ${r.computers_count || 40} Computers` : ''}</span>
              </div>
              ${canEditDept ? `
                <button class="btn-icon btn-icon-primary ml-2" title="Edit Room Details" onclick="event.stopPropagation(); openEditRoomModal(${r.id})">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-icon btn-icon-danger ml-1" title="Delete Room" onclick="event.stopPropagation(); handleDeleteRoom(${r.id}, '${r.room_name}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
              ` : ''}
            </div>
          `;
      });
      dashHtml += `<div class="room-tree-no-match" style="display:none;">No rooms match your search.</div>`;
    }
    dashHtml += `</div></div>`;
  });
  dashHtml += `</div>`;
  dashTree.innerHTML = dashHtml;
}

if (mainTree) {
  let mainHtml = `
    <div class="dept-tree-search-placeholder" id="mainTreeSearchPlaceholder" style="display:none;">
      <i class="fa-solid fa-magnifying-glass"></i>
      <h3>Search to See the Result</h3>
      <p>Type a department name or code above to find it here.</p>
    </div>
    <div class="dept-tree-no-match" id="mainTreeNoMatch" style="display:none;">No matching departments found.</div>
    <div class="dept-tree-container" id="mainTreeContainerInner" style="display:flex; flex-direction:column; gap:14px;">`;
  masterDepartments.forEach((d, idx) => {
    const isFirstOpen = false;
    const roomList = d.rooms && d.rooms.length > 0 ? d.rooms : masterRooms.filter(r => Number(r.department_id) === Number(d.id));
    const canEditDept = canUserEditDept(d.id);

    const cCount = roomList.filter(r => r.room_type !== 'Computer Lab').length;
    const lCount = roomList.filter(r => r.room_type === 'Computer Lab').length;
    const pCount = roomList.filter(r => r.projector === 1 || r.projector === 'Yes' || r.projector === '1').length;

    mainHtml += `
      <div class="dept-tree-node" id="main-dept-node-${d.id}" data-search="${(d.name + ' ' + d.code).toLowerCase()}">
        <div class="dept-tree-header" onclick="toggleTreeNode('main-node-${d.id}', this)">
          <i class="fa-solid fa-chevron-down tree-chevron" id="main-btn-toggle-${d.id}" style="transform: rotate(${isFirstOpen ? '0deg' : '-90deg'});"></i>
          <span class="dept-icon-badge" style="background:${d.color ? d.color + '22' : '#eef0ea'}; color:${d.color || '#006633'};"><i class="fa-solid fa-building-columns"></i></span>
          <div class="dept-title">${d.name} (${d.code})</div>
          <div class="dept-pill-group">
            <span class="dept-pill pill-blue"><i class="fa-solid fa-chalkboard"></i> Classrooms: ${cCount}</span>
            <span class="dept-pill pill-purple"><i class="fa-solid fa-flask"></i> Labs: ${lCount}</span>
            <span class="dept-pill pill-green"><i class="fa-solid fa-video"></i> Projectors: ${pCount}</span>
          </div>
          
          ${isSuperAdmin ? `
            <button class="btn-icon btn-icon-danger" title="Delete Department" onclick="event.stopPropagation(); handleDeleteDept(${d.id}, '${d.name}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>

        <div class="dept-tree-children" id="main-node-${d.id}" style="display: ${isFirstOpen ? 'flex' : 'none'};">

          ${roomList.length > 0 ? `
            <div class="room-tree-search-wrap">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" placeholder="Search rooms by number or type (e.g. lab, G-10)..." autocomplete="off" oninput="handleRoomTreeSearch(${d.id})">
            </div>
          ` : ''}
    `;

    if (roomList.length === 0) {
      mainHtml += `<div class="text-muted text-sm p-2">No rooms assigned directly to this department.</div>`;
    } else {
      roomList.forEach(r => {
        const isLab = r.room_type === 'Computer Lab';
        const roomSearchData = `${r.room_name} ${isLab ? 'computer lab' : 'lecture room'}`.toLowerCase();

        mainHtml += `
          <div class="room-tree-item" data-room-search="${roomSearchData}" onclick="inspectRoomTimetable(${r.id}, '${r.room_name}')">
            <span class="room-badge"><i class="fa-solid ${isLab ? 'fa-laptop-code' : 'fa-chalkboard-user'}"></i> ${r.room_name}</span>
            <span class="badge ${isLab ? 'bg-purple' : 'bg-green'}">${isLab ? 'Computer Lab' : 'Lecture Room'}</span>
            <div class="room-specs">
              <span class="room-spec-col">🪑 ${r.capacity || r.chairs_count || 50} Chairs</span>
              <span class="room-spec-col">${r.projector ? '📹 Projector: Yes' : 'No Projector'}</span>
              <span class="room-spec-col">${isLab ? `💻 ${r.computers_count || 40} Computers` : ''}</span>
            </div>
            ${canEditDept ? `
              <button class="btn-icon btn-icon-primary ml-2" title="Edit Room Details" onclick="event.stopPropagation(); openEditRoomModal(${r.id})">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn-icon btn-icon-danger ml-1" title="Delete Room" onclick="event.stopPropagation(); handleDeleteRoom(${r.id}, '${r.room_name}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        `;
      });
      mainHtml += `<div class="room-tree-no-match" style="display:none;">No rooms match your search.</div>`;
    }
    mainHtml += `</div></div>`;
  });
  mainHtml += `</div>`;
  mainTree.innerHTML = mainHtml;
}
}

// Top Search Card — Live Inline Department Filter (Token Match, No Re-render)
function handleDeptTreeInlineSearch() {
  const rawQuery = document.getElementById('deptTreeSearchInput').value.trim().toLowerCase();
  const placeholder = document.getElementById('mainTreeSearchPlaceholder');
  const noMatch = document.getElementById('mainTreeNoMatch');
  const listContainer = document.getElementById('mainTreeContainerInner');
  if (!placeholder || !noMatch || !listContainer) return;

  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);
  const nodes = listContainer.querySelectorAll('.dept-tree-node');
  let visibleCount = 0;

  nodes.forEach(nodeEl => {
    const searchable = nodeEl.getAttribute('data-search') || '';
    const matches = queryTokens.length === 0 || queryTokens.every(token => searchable.includes(token));
    nodeEl.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  placeholder.style.display = 'none';
  listContainer.style.display = 'flex';
  listContainer.style.flexDirection = 'column';
  listContainer.style.gap = '14px';
  noMatch.style.display = visibleCount === 0 ? 'block' : 'none';
}

// Dashboard Tab — Live Inline Department Filter (Token Match, No Re-render)
function handleDashDeptTreeInlineSearch() {
  const rawQuery = document.getElementById('dashTreeSearchInput').value.trim().toLowerCase();
  const placeholder = document.getElementById('dashTreeSearchPlaceholder');
  const noMatch = document.getElementById('dashTreeNoMatch');
  const listContainer = document.getElementById('dashTreeContainerInner');
  if (!placeholder || !noMatch || !listContainer) return;

  if (!rawQuery) {
    placeholder.style.display = 'block';
    noMatch.style.display = 'none';
    listContainer.style.display = 'none';
    return;
  }

  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);
  const nodes = listContainer.querySelectorAll('.dept-tree-node');
  let visibleCount = 0;

  nodes.forEach(nodeEl => {
    const searchable = nodeEl.getAttribute('data-search') || '';
    const matches = queryTokens.every(token => searchable.includes(token));
    nodeEl.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  placeholder.style.display = 'none';
  listContainer.style.display = 'flex';
  listContainer.style.flexDirection = 'column';
  listContainer.style.gap = '14px';
  noMatch.style.display = visibleCount === 0 ? 'block' : 'none';
}

// Per-Department Room Search — Live DOM Filter (No Re-render, Preserves Expand State)
function handleRoomTreeSearch(deptId, treePrefix = 'main') {
  const container = document.getElementById(`${treePrefix}-node-${deptId}`);
  if (!container) return;

  const input = container.querySelector('.room-tree-search-wrap input');
  const rawQuery = input ? input.value.trim().toLowerCase() : '';
  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

  const rooms = container.querySelectorAll('.room-tree-item');
  const noMatchMsg = container.querySelector('.room-tree-no-match');
  let visibleCount = 0;

  rooms.forEach(roomEl => {
    const searchable = roomEl.getAttribute('data-room-search') || '';
    const matches = queryTokens.length === 0 || queryTokens.every(token => searchable.includes(token));
    roomEl.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  if (noMatchMsg) {
    noMatchMsg.style.display = visibleCount === 0 ? 'block' : 'none';
  }
}

function toggleTreeNode(nodeId, headerElem) {
  const node = document.getElementById(nodeId);
  const toggleBtn = headerElem.querySelector('.tree-chevron');
  if (node) {
    if (node.style.display === 'none' || !node.style.display) {
      node.style.display = 'flex';
      if (toggleBtn) toggleBtn.style.transform = 'rotate(0deg)';
    } else {
      node.style.display = 'none';
      if (toggleBtn) toggleBtn.style.transform = 'rotate(-90deg)';
    }
  }
}

// Delete Department Action (Super Admin)
async function handleDeleteDept(deptId, deptName) {
  if (!confirm(`⚠️ DELETE DEPARTMENT WARNING:\n\nAre you sure you want to delete "${deptName}"?\n\nThis action will PERMANENTLY delete ALL rooms, login credentials, courses, and timetable schedule entries for this department!`)) {
    return;
  }

  try {
    const res = await fetch(`/api/departments/${deptId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to delete department.');
      return;
    }
    alert(data.message);
    await loadMasterData();
    renderTimetable();
  } catch (err) {
    alert('Error deleting department.');
  }
}

// Delete Room Action (Isolated by Department Permission)
async function handleDeleteRoom(roomId, roomName) {
  if (!confirm(`⚠️ DELETE ROOM CONFIRMATION:\n\nAre you sure you want to delete room "${roomName}"?\n\nThis will permanently remove the room and any schedule slots assigned to it!`)) {
    return;
  }

  try {
    const res = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to delete room.');
      return;
    }
    alert(data.message);
    await loadMasterData();
    renderRoomsManager();
    renderTimetable();
  } catch (err) {
    alert('Error deleting room.');
  }
}

// Inspect specific room's timetable
function inspectRoomTimetable(roomId, roomName) {
  document.getElementById('filterRoom').value = roomId;
  document.getElementById('filterDept').value = '';
  switchMainView('viewTimetable', document.getElementById('navTimetable'));
  renderTimetable();
}