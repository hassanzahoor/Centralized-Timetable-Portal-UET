// ============================================================================
// CAMPUS RESOURCE UTILIZATION ENGINE & MANAGEMENT FORMS
// ============================================================================

// Consistent Visualization Color Engine (Requirements 15, 16, 17, 18)
function getUtilizationStatus(utilPct) {
    const pct = Math.min(100, Math.max(0, Math.round(utilPct)));
    if (pct >= 90) {
        return {
            label: `Full Utilization (${pct}%)`,
            badgeClass: 'status-pill-red',
            badgeColor: '#7f1d1d',
            color: '#dc2626', // Red (Req 17: Full Utilization)
            status: 'Fully Utilized'
        };
    } else if (pct >= 50) {
        return {
            label: `Moderate Utilization (${pct}%)`,
            badgeClass: 'status-pill-yellow',
            badgeColor: '#713f12',
            color: '#eab308', // Yellow (Req 16: Moderate Utilization)
            status: 'Moderate Utilization'
        };
    } else {
        return {
            label: `Full Availability (${pct}%)`,
            badgeClass: 'status-pill-green',
            badgeColor: '#14532d',
            color: '#16a34a', // Green (Req 15: 100% Available)
            status: 'Optimal Availability'
        };
    }
}

const centerTextPlugin = {
    id: 'centerTextPlugin',
    afterDraw(chart) {
        if (chart.config.type !== 'doughnut' || !chart.options.plugins.centerText) return;
        const { ctx, chartArea: { width, height, left, top } } = chart;
        const { total, label } = chart.options.plugins.centerText;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "700 28px 'Outfit', sans-serif";
        ctx.fillStyle = '#1f2937';
        ctx.fillText(total, left + width / 2, top + height / 2 - 12);
        ctx.font = "600 13px 'Inter', sans-serif";
        ctx.fillStyle = '#8a8a85';
        ctx.fillText(label, left + width / 2, top + height / 2 + 14);
        ctx.restore();
    }
};

function renderCampusResourceUtilization() {
    if (!masterDepartments || masterDepartments.length === 0) return;

    // 1. Calculate Campus Summary Metrics (Requirement 2, 11, 12, 13, 14)
    const deptCount = masterDepartments.length;
    const totalRooms = masterRooms.length;
    const totalLabs = masterRooms.filter(r => r.room_type === 'Computer Lab' || r.room_type === 'Science Lab').length;
    const totalComputers = masterRooms.reduce((acc, r) => acc + (Number(r.computers_count) || (r.room_type === 'Computer Lab' ? 40 : (r.room_type === 'Science Lab' ? 10 : 0))), 0);
    const totalProjectors = masterRooms.filter(r => r.projector === 1 || r.projector === 'Yes' || r.projector === '1').length;
    const totalFaculty = masterInstructors.length;

    if (document.getElementById('statDeptCount')) document.getElementById('statDeptCount').textContent = deptCount;
    if (document.getElementById('statTotalRoomsCount')) document.getElementById('statTotalRoomsCount').textContent = totalRooms;
    if (document.getElementById('statLabCount')) document.getElementById('statLabCount').textContent = totalLabs;
    if (document.getElementById('statComputerCount')) document.getElementById('statComputerCount').textContent = totalComputers;
    if (document.getElementById('statProjectorCount')) document.getElementById('statProjectorCount').textContent = totalProjectors;
    if (document.getElementById('statFacultyCount')) document.getElementById('statFacultyCount').textContent = totalFaculty;

    // Calculate Shared vs Independent Resources (Req 11, 12)
    let sharedCount = 0;
    let independentCount = 0;
    let interDeptSlotsCount = 0;

    masterRooms.forEach(room => {
        const entries = currentTimetableEntries.filter(e => Number(e.room_id) === Number(room.id));
        const deptsUsing = new Set(entries.map(e => Number(e.department_id)));
        if (deptsUsing.size > 1) {
            sharedCount++;
        } else {
            independentCount++;
        }
        entries.forEach(e => {
            if (Number(e.department_id) !== Number(room.department_id)) {
                interDeptSlotsCount++;
            }
        });
    });

    const sharedPct = totalRooms > 0 ? Math.round((sharedCount / totalRooms) * 100) : 0;
    const independentPct = totalRooms > 0 ? Math.round((independentCount / totalRooms) * 100) : 100;
    const interDeptSharingPct = currentTimetableEntries.length > 0 ? Math.round((interDeptSlotsCount / currentTimetableEntries.length) * 100) : 0;

    if (document.getElementById('statSharedResourcePct')) document.getElementById('statSharedResourcePct').textContent = `${sharedPct}% (${sharedCount} Rooms)`;
    if (document.getElementById('statIndependentResourcePct')) document.getElementById('statIndependentResourcePct').textContent = `${independentPct}% (${independentCount} Rooms)`;
    if (document.getElementById('statInterDeptSupportPct')) document.getElementById('statInterDeptSupportPct').textContent = `${interDeptSharingPct}% (${interDeptSlotsCount} Slots)`;

    // Show "Add Faculty" button if logged-in user has edit access
    const addFacultyBtn = document.getElementById('btnAddFacultyBtn');
    if (addFacultyBtn) {
        addFacultyBtn.style.display = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'dept_admin')) ? 'inline-flex' : 'none';
    }

    // 2. Render Graphical Charts (Requirements 4, 9, 10, 11, 12, 13, 14, 18)
    renderResourceCharts();

    // 3. Render Department Utilization Table (Requirements 3, 10, 15-18)
    renderDeptRoomsUtilizationTable();



    // 4b. Render Department Search Tab (chip list; results panel renders on selection)
    renderDeptSearchTab();
    // 5. Render Faculty Workload Module & Statistics (Requirements 19-22)
    renderFacultyStats();
    renderFacultyTable();
    renderFacultyWorkloadTable();
}

function renderResourceCharts() {
    if (typeof Chart === 'undefined') return;

    const deptCodes = masterDepartments.map(d => d.code);
    const roomCounts = masterDepartments.map(d => masterRooms.filter(r => Number(r.department_id) === Number(d.id)).length);
    const labCounts = masterDepartments.map(d => masterRooms.filter(r => Number(r.department_id) === Number(d.id) && (r.room_type === 'Computer Lab' || r.room_type === 'Science Lab')).length);
    const compCounts = masterDepartments.map(d => masterRooms.filter(r => Number(r.department_id) === Number(d.id)).reduce((acc, r) => acc + (Number(r.computers_count) || (r.room_type === 'Computer Lab' ? 40 : (r.room_type === 'Science Lab' ? 10 : 0))), 0));
    const projCounts = masterDepartments.map(d => masterRooms.filter(r => Number(r.department_id) === Number(d.id) && (r.projector === 1 || r.projector === 'Yes' || r.projector === '1')).length);

    // Utilization rates %
    const utilRates = masterDepartments.map(d => {
        const dRooms = masterRooms.filter(r => Number(r.department_id) === Number(d.id));
        if (dRooms.length === 0) return 0;
        const activeSlots = currentTimetableEntries.filter(e => Number(e.department_id) === Number(d.id)).length;
        const capacitySlots = dRooms.length * 40; // 8 slots/day * 5 days = 40 max slots per room per week
        const pct = Math.min(100, Math.round((activeSlots / Math.max(1, capacitySlots)) * 100 * 10) / 10);
        return pct;
    });

    const avgOccupancy = utilRates.length > 0 ? (utilRates.reduce((a, b) => a + b, 0) / utilRates.length).toFixed(1) : 0;
    if (document.getElementById('badgeAvgOccupancy')) {
        document.getElementById('badgeAvgOccupancy').textContent = `${avgOccupancy}% Avg Occupancy`;
    }

    // Chart 1: Department Resources Bar Chart
    const ctxResources = document.getElementById('chartDeptResources');
    if (ctxResources) {
        if (chartDeptResourcesInstance) chartDeptResourcesInstance.destroy();
        chartDeptResourcesInstance = new Chart(ctxResources, {
            type: 'bar',
            data: {
                labels: deptCodes,
                datasets: [
                    { label: 'Total Rooms', data: roomCounts, backgroundColor: '#006633' },
                    { label: 'Laboratories', data: labCounts, backgroundColor: '#ea580c' },
                    { label: 'Projectors', data: projCounts, backgroundColor: '#16a34a' },
                    { label: 'Computers (x10)', data: compCounts.map(c => Math.round(c / 10)), backgroundColor: '#7c3aed' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Chart 2: Department Utilization Rate Line Chart with Color Coding (Req 15-18)
    const ctxUtil = document.getElementById('chartDeptUtilization');
    if (ctxUtil) {
        if (chartDeptUtilizationInstance) chartDeptUtilizationInstance.destroy();

        // Consistent point colors: Green (<50%), Yellow (50-89%), Red (>=90%)
        const pointColors = utilRates.map(r => r >= 90 ? '#dc2626' : (r >= 50 ? '#eab308' : '#16a34a'));

        chartDeptUtilizationInstance = new Chart(ctxUtil, {
            type: 'line',
            data: {
                labels: deptCodes,
                datasets: [{
                    label: 'Room Utilization Rate (%)',
                    data: utilRates,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: pointColors,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });
    }

    // Chart 3: Shared vs Independent Resource Allocation Doughnut Chart (Requirements 11 & 12)
    let sharedCount = 0;
    let independentCount = 0;
    masterRooms.forEach(room => {
        const entries = currentTimetableEntries.filter(e => Number(e.room_id) === Number(room.id));
        const deptsUsing = new Set(entries.map(e => Number(e.department_id)));
        if (deptsUsing.size > 1) sharedCount++;
        else independentCount++;
    });

    const ctxShared = document.getElementById('chartSharedVsIndependent');
    if (ctxShared) {
        if (chartSharedVsIndependentInstance) chartSharedVsIndependentInstance.destroy();
        const sharedTotal = sharedCount + independentCount;
        chartSharedVsIndependentInstance = new Chart(ctxShared, {
            type: 'doughnut',
            data: {
                labels: ['Shared Resources', 'Independent Resources'],
                datasets: [{
                    data: [sharedCount, independentCount],
                    backgroundColor: ['#7c3aed', '#2563eb'],
                    borderWidth: 0
                }]
            },
            plugins: [ChartDataLabels, centerTextPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            generateLabels: (chart) => {
                                const data = chart.data.datasets[0].data;
                                return chart.data.labels.map((lbl, i) => {
                                    const pct = sharedTotal > 0 ? ((data[i] / sharedTotal) * 100).toFixed(1) : 0;
                                    return {
                                        text: `${lbl}  ${data[i]} (${pct}%)`,
                                        fillStyle: chart.data.datasets[0].backgroundColor[i],
                                        strokeStyle: chart.data.datasets[0].backgroundColor[i],
                                        index: i
                                    };
                                });
                            }
                        }
                    },
                    centerText: { total: sharedTotal, label: 'Total Rooms' },
                    datalabels: {
                        color: '#ffffff',
                        font: { weight: '700', size: 14 },
                        formatter: (value) => value
                    }
                }
            }
        });
    }

    // Chart 4: Inter-Departmental Support Matrix Bar Chart (Requirements 13 & 14)
    const crossDeptSupportPerDept = masterDepartments.map(d => {
        const dRooms = masterRooms.filter(r => Number(r.department_id) === Number(d.id));
        const dRoomIds = new Set(dRooms.map(r => r.id));
        let crossCount = 0;
        currentTimetableEntries.forEach(e => {
            if (dRoomIds.has(Number(e.room_id)) && Number(e.department_id) !== Number(d.id)) {
                crossCount++;
            }
        });
        return crossCount;
    });

    const ctxInterDept = document.getElementById('chartInterDeptSupport');
    if (ctxInterDept) {
        if (chartInterDeptSupportInstance) chartInterDeptSupportInstance.destroy();
        chartInterDeptSupportInstance = new Chart(ctxInterDept, {
            type: 'bar',
            data: {
                labels: deptCodes,
                datasets: [{
                    label: 'Cross-Department Support Slots Provided',
                    data: crossDeptSupportPerDept,
                    backgroundColor: '#0891b2',
                    borderRadius: 6,
                    maxBarThickness: 60
                }]
            },
            plugins: [ChartDataLabels],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: '#334155',
                        font: { weight: '700', size: 13 },
                        formatter: (value) => value
                    }
                },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // Chart 5: Faculty Designation Ranks Chart
    const desigRanks = [
        'Professor',
        'Associate Professor',
        'Assistant Professor',
        'Lecturer',
        'Teaching Fellow',
        'Graduate Assistant',
        'Teaching Assistant'
    ];
    const rankCounts = desigRanks.map(rank => masterInstructors.filter(i => (i.designation || '').toLowerCase() === rank.toLowerCase()).length);

    const ctxFaculty = document.getElementById('chartFacultyRanks');
    if (ctxFaculty) {
        if (chartFacultyRanksInstance) chartFacultyRanksInstance.destroy();
        chartFacultyRanksInstance = new Chart(ctxFaculty, {
            type: 'bar',
            data: {
                labels: desigRanks,
                datasets: [{
                    label: 'Faculty Members',
                    data: rankCounts,
                    backgroundColor: ['#006633', '#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#dc2626']
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });
    }

    // Chart 6: Room Categories Breakdown Doughnut Chart (Support Science Lab!)
    const classroomsCount = masterRooms.filter(r => r.room_type === 'Lecture Hall' || r.room_type === 'Lecture Room').length;
    const compLabCount = masterRooms.filter(r => r.room_type === 'Computer Lab').length;
    const sciLabCount = masterRooms.filter(r => r.room_type === 'Science Lab').length;
    const otherRoomCount = masterRooms.filter(r => r.room_type !== 'Lecture Hall' && r.room_type !== 'Lecture Room' && r.room_type !== 'Computer Lab' && r.room_type !== 'Science Lab').length;

    const ctxRoomTypes = document.getElementById('chartRoomTypes');
    if (ctxRoomTypes) {
        if (chartRoomTypesInstance) chartRoomTypesInstance.destroy();
        chartRoomTypesInstance = new Chart(ctxRoomTypes, {
            type: 'doughnut',
            data: {
                labels: ['Lecture Rooms', 'Computer Labs', 'Science Labs', 'Seminars/Other'],
                datasets: [{
                    data: [classroomsCount, compLabCount, sciLabCount, otherRoomCount],
                    backgroundColor: ['#006633', '#7c3aed', '#ea580c', '#2563eb']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

function renderDeptRoomsUtilizationTable() {
    const tbody = document.getElementById('tbodyDeptRoomsUtilization');
    if (!tbody) return;

    if (masterDepartments.length === 0) {
        tbody.innerHTML = `<p class="text-muted text-center p-3">No department data available.</p>`;
        return;
    }

    let html = '';
    masterDepartments.forEach(d => {
        const dRooms = masterRooms.filter(r => Number(r.department_id) === Number(d.id));
        const classrooms = dRooms.filter(r => r.room_type === 'Lecture Hall' || r.room_type === 'Lecture Room').length;
        const compLabs = dRooms.filter(r => r.room_type === 'Computer Lab').length;
        const sciLabs = dRooms.filter(r => r.room_type === 'Science Lab').length;

        const computers = dRooms.reduce((acc, r) => acc + (Number(r.computers_count) || (r.room_type === 'Computer Lab' ? 40 : (r.room_type === 'Science Lab' ? 10 : 0))), 0);
        const projectors = dRooms.filter(r => r.projector === 1 || r.projector === 'Yes' || r.projector === '1').length;
        const activeSlots = currentTimetableEntries.filter(e => Number(e.department_id) === Number(d.id)).length;

        const maxWeeklySlots = Math.max(1, dRooms.length * 40);
        const utilPct = Math.min(100, Math.round((activeSlots / maxWeeklySlots) * 100 * 10) / 10);
        const statusObj = getUtilizationStatus(utilPct);
        const ringDeg = Math.round((utilPct / 100) * 360);

        html += `
      <div class="dept-util-row" data-search="${(d.name + ' ' + d.code).toLowerCase()}" data-dept-id="${d.id}" style="border-left-color:${d.color || '#006633'};" onclick="selectDeptInRoomsTab(${d.id})">
        <div class="dept-util-identity">
          <span class="dept-icon-badge" style="background:${d.color ? d.color + '22' : '#eef0ea'}; color:${d.color || '#006633'};"><i class="fa-solid fa-building-columns"></i></span>
          <div>
            <strong class="dept-util-name">${d.name}</strong>
            <div class="dept-util-sub">Code: ${d.code} | ${d.building || 'KSK Block'}</div>
          </div>
        </div>

        <div class="dept-util-stats">
          <div class="dept-util-stat">
            <i class="fa-solid fa-door-closed"></i>
            <div><strong>${dRooms.length}</strong><span>Rooms</span></div>
          </div>
          <div class="dept-util-divider"></div>
          <div class="dept-util-stat">
            <i class="fa-solid fa-chalkboard"></i>
            <div><strong>${classrooms}</strong><span>Classrooms</span></div>
          </div>
          <div class="dept-util-divider"></div>
          <div class="dept-util-stat">
            <i class="fa-solid fa-flask"></i>
            <div><strong>${compLabs} / ${sciLabs}</strong><span>Comp / Sci Labs</span></div>
          </div>
          <div class="dept-util-divider"></div>
          <div class="dept-util-stat">
            <i class="fa-solid fa-desktop"></i>
            <div><strong>${computers}</strong><span>Computers</span></div>
          </div>
          <div class="dept-util-divider"></div>
          <div class="dept-util-stat">
            <i class="fa-solid fa-video"></i>
            <div><strong>${projectors}</strong><span>Projectors</span></div>
          </div>
          <div class="dept-util-divider"></div>
          <div class="dept-util-stat">
            <i class="fa-solid fa-calendar-check"></i>
            <div><strong>${activeSlots}</strong><span>Active Slots</span></div>
          </div>
        </div>

        <div class="dept-util-ring-wrap">
          <div class="dept-util-ring" style="background: conic-gradient(${statusObj.color} ${ringDeg}deg, #e2e8f0 0deg);">
            <div class="dept-util-ring-inner">${utilPct}%</div>
          </div>
          <span class="dept-util-ring-label" style="color:${statusObj.color};">${statusObj.status}</span>
        </div>

        <button class="btn btn-sm btn-outline dept-util-manage-btn" onclick="event.stopPropagation(); openDeptResourceModal(${d.id})">
          <i class="fa-solid fa-sliders"></i> Manage
        </button>
      </div>
    `;
    });

    tbody.innerHTML = html;
}

// Click a Department Row — jumps to the Department Statistics tab and
// shows that department's Room Utilization + Department Statistics there.
function selectDeptInRoomsTab(deptId) {
    switchDashSubTab('deptsearch');
    selectDeptSearchDept(deptId);
}

// Live filter for the Rooms & Utilization tab's search bar (token-match on .dept-util-row)
function handleDeptUtilInlineSearch() {
    const inputEl = document.getElementById('deptUtilSearchInput');
    const rawQuery = (inputEl ? inputEl.value : '').trim().toLowerCase();
    const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

    const rows = document.querySelectorAll('#tbodyDeptRoomsUtilization .dept-util-row');
    let visibleCount = 0;

    rows.forEach(rowEl => {
        const searchable = rowEl.getAttribute('data-search') || '';
        const matches = queryTokens.length === 0 || queryTokens.every(token => searchable.includes(token));
        rowEl.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
    });

    const noMatchEl = document.getElementById('deptUtilNoMatch');
    if (noMatchEl) {
        noMatchEl.style.display = (rows.length > 0 && visibleCount === 0) ? 'block' : 'none';
    }
}

// ============================================================================
// DEPARTMENT SEARCH TAB — Unified Search + Clickable Chips + Room Utilization / Department Statistics Split View
// ============================================================================

let deptSearchTabSelectedId = null;
let chartDeptSearchDistributionInstance = null;

function renderDeptSearchTab() {
    const chipsRow = document.getElementById('deptSearchChipsRow');
    if (!chipsRow) return;

    chipsRow.innerHTML = masterDepartments.map(d => `
    <button type="button" class="dstab-chip ${Number(deptSearchTabSelectedId) === Number(d.id) ? 'active' : ''}" data-search="${(d.name + ' ' + d.code).toLowerCase()}" data-dept-id="${d.id}" onclick="selectDeptSearchDept(${d.id})">
      <span class="dstab-chip-accent" style="background:${d.color || '#006633'};"></span>
      <strong>${d.code}</strong>
      <span class="dstab-chip-name">${d.name}</span>
    </button>
  `).join('');

    // Re-select the previously selected department (if any) so results survive a re-render
    if (deptSearchTabSelectedId) {
        selectDeptSearchDept(deptSearchTabSelectedId);
    }
}

// Live Chip Filter (Token Match) — filters the chip row only, results panel unaffected
function handleDeptSearchTabFilter() {
    const rawQuery = document.getElementById('deptSearchTabInput').value.trim().toLowerCase();
    const queryTokens = rawQuery.split(/\s+/).filter(Boolean);
    const chips = document.querySelectorAll('#deptSearchChipsRow .dstab-chip');

    chips.forEach(chipEl => {
        const searchable = chipEl.getAttribute('data-search') || '';
        const matches = queryTokens.length === 0 || queryTokens.every(token => searchable.includes(token));
        chipEl.style.display = matches ? '' : 'none';
    });
}

// Renders Room Utilization + Department Statistics side-by-side for the selected department
function selectDeptSearchDept(deptId) {
    const d = masterDepartments.find(x => Number(x.id) === Number(deptId));
    if (!d) return;

    deptSearchTabSelectedId = d.id;

    document.querySelectorAll('#deptSearchChipsRow .dstab-chip').forEach(chipEl => {
        chipEl.classList.toggle('active', Number(chipEl.getAttribute('data-dept-id')) === Number(d.id));
    });

    const emptyState = document.getElementById('deptSearchEmptyState');
    const resultsContent = document.getElementById('deptSearchResultsContent');
    if (!resultsContent) return;

    const dRooms = masterRooms.filter(r => Number(r.department_id) === Number(d.id));
    const classrooms = dRooms.filter(r => r.room_type === 'Lecture Hall' || r.room_type === 'Lecture Room').length;
    const compLabs = dRooms.filter(r => r.room_type === 'Computer Lab').length;
    const sciLabs = dRooms.filter(r => r.room_type === 'Science Lab').length;
    const computers = dRooms.reduce((acc, r) => acc + (Number(r.computers_count) || (r.room_type === 'Computer Lab' ? 40 : (r.room_type === 'Science Lab' ? 10 : 0))), 0);
    const projectors = dRooms.filter(r => r.projector === 1 || r.projector === 'Yes' || r.projector === '1').length;
    const activeSlots = currentTimetableEntries.filter(e => Number(e.department_id) === Number(d.id)).length;
    const dInstructors = masterInstructors.filter(i => Number(i.department_id) === Number(d.id));

    const maxWeeklySlots = Math.max(1, dRooms.length * 40);
    const utilPct = Math.min(100, Math.round((activeSlots / maxWeeklySlots) * 100 * 10) / 10);
    const statusObj = getUtilizationStatus(utilPct);
    const ringDeg = Math.round((utilPct / 100) * 360);

    resultsContent.innerHTML = `
    <div class="card glass-card dstab-card">
      <div class="dstab-card-header">
        <span class="dept-icon-badge" style="background:${d.color ? d.color + '22' : '#eef0ea'}; color:${d.color || '#006633'};"><i class="fa-solid fa-building-columns"></i></span>
        <div>
          <h3>Room Utilization</h3>
          <span class="text-muted text-sm">${d.building || 'KSK Block'}</span>
        </div>
      </div>
      <div class="dstab-room-body">
        <div class="resource-metrics-grid dstab-room-stats">
          <div class="metric-box">
            <span class="metric-icon"><i class="fa-solid fa-door-closed"></i></span>
            <span class="metric-val">${dRooms.length}</span>
            <span class="metric-lbl">Total Rooms</span>
          </div>
          <div class="metric-box">
            <span class="metric-icon"><i class="fa-solid fa-chalkboard"></i></span>
            <span class="metric-val">${classrooms}</span>
            <span class="metric-lbl">Classrooms</span>
          </div>
          <div class="metric-box">
            <span class="metric-icon"><i class="fa-solid fa-flask"></i></span>
            <span class="metric-val">${compLabs + sciLabs}</span>
            <span class="metric-lbl">Comp/Sci Labs</span>
          </div>
          <div class="metric-box">
            <span class="metric-icon"><i class="fa-solid fa-desktop"></i></span>
            <span class="metric-val">${computers}</span>
            <span class="metric-lbl">Computers</span>
          </div>
          <div class="metric-box">
            <span class="metric-icon"><i class="fa-solid fa-video"></i></span>
            <span class="metric-val">${projectors}</span>
            <span class="metric-lbl">Projectors</span>
          </div>
          <div class="metric-box">
            <span class="metric-icon"><i class="fa-solid fa-calendar-check"></i></span>
            <span class="metric-val">${activeSlots}</span>
            <span class="metric-lbl">Active Slots</span>
          </div>
        </div>
        <div class="dept-util-ring-wrap">
          <div class="dept-util-ring" style="background: conic-gradient(${statusObj.color} ${ringDeg}deg, #e2e8f0 0deg);">
            <div class="dept-util-ring-inner">${utilPct}%</div>
          </div>
          <span class="dept-util-ring-label" style="color:${statusObj.color};">${statusObj.status}</span>
        </div>
      </div>
    </div>

    <div class="card glass-card dstab-card">
      <div class="dstab-card-header dstab-card-header-between">
        <div class="dstab-card-header-left">
          <span class="dept-icon-badge" style="background:${d.color ? d.color + '22' : '#eef0ea'}; color:${d.color || '#006633'};"><i class="fa-solid fa-chart-simple"></i></span>
          <div>
            <h3>Department Statistics</h3>
            <span class="text-muted text-sm">${d.name} (${d.code}) — ${d.building || 'KSK Block'}</span>
          </div>
        </div>
        <button class="btn btn-sm btn-accent" onclick="openDeptResourceModal(${d.id})">
          <i class="fa-solid fa-gear"></i> Manage Form
        </button>
      </div>
      <div class="resource-metrics-grid mt-3">
        <div class="metric-box">
          <span class="metric-icon"><i class="fa-solid fa-door-closed"></i></span>
          <span class="metric-val">${dRooms.length}</span>
          <span class="metric-lbl">Total Rooms</span>
        </div>
        <div class="metric-box">
          <span class="metric-icon"><i class="fa-solid fa-chalkboard"></i></span>
          <span class="metric-val">${classrooms}</span>
          <span class="metric-lbl">Classrooms</span>
        </div>
        <div class="metric-box">
          <span class="metric-icon"><i class="fa-solid fa-flask"></i></span>
          <span class="metric-val">${compLabs + sciLabs}</span>
          <span class="metric-lbl">Laboratories</span>
        </div>
        <div class="metric-box">
          <span class="metric-icon"><i class="fa-solid fa-desktop"></i></span>
          <span class="metric-val">${computers}</span>
          <span class="metric-lbl">Computers</span>
        </div>
        <div class="metric-box">
          <span class="metric-icon"><i class="fa-solid fa-video"></i></span>
          <span class="metric-val">${projectors}</span>
          <span class="metric-lbl">Projectors</span>
        </div>
        <div class="metric-box">
          <span class="metric-icon"><i class="fa-solid fa-user-graduate"></i></span>
          <span class="metric-val">${dInstructors.length}</span>
          <span class="metric-lbl">Faculty</span>
        </div>
      </div>

      <div class="util-progress-wrap mt-3">
        <div class="flex-between text-xs mb-1">
          <span>Overall Resource Utilization Rate</span>
          <strong>${utilPct}%</strong>
        </div>
        <div class="progress-bar-bg" style="height: 10px; background: #e2e8f0; border-radius: 6px; overflow: hidden;">
          <div style="width: ${utilPct}%; height: 100%; background: linear-gradient(90deg, ${d.color || '#006633'}, #2563eb); border-radius: 6px;"></div>
        </div>
      </div>
    </div>
  `;

    if (emptyState) emptyState.style.display = 'none';
    resultsContent.style.display = 'grid';

    renderDeptSearchDistributionChart(d, dRooms.length, classrooms, compLabs + sciLabs, computers, projectors);
}

// Renders the Resource Distribution bar chart for the currently selected department only.
// Destroyed and rebuilt on every department selection so it never mixes data across departments.
function renderDeptSearchDistributionChart(dept, totalRooms, classrooms, labs, computers, projectors) {
    const chartCard = document.getElementById('deptSearchChartCard');
    const ctx = document.getElementById('chartDeptSearchDistribution');
    if (!chartCard || !ctx || typeof Chart === 'undefined') return;

    const iconBadge = document.getElementById('deptSearchChartIconBadge');
    if (iconBadge) {
        iconBadge.style.background = dept.color ? dept.color + '22' : '#eef0ea';
        iconBadge.style.color = dept.color || '#006633';
    }
    const subtitle = document.getElementById('deptSearchChartSubtitle');
    if (subtitle) subtitle.textContent = `${dept.name} (${dept.code}) — ${dept.building || 'KSK Block'}`;

    if (chartDeptSearchDistributionInstance) chartDeptSearchDistributionInstance.destroy();

    chartDeptSearchDistributionInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Rooms', 'Classrooms', 'Labs', 'Computers (scaled)', 'Projectors'],
            datasets: [{
                data: [totalRooms, classrooms, labs, Math.round(computers / 10), projectors],
                backgroundColor: ['#8a9a7f', '#4a7fd6', '#a855c9', '#f0913a', '#3fb6a8'],
                borderRadius: 6,
                barThickness: 26
            }]
        },
        plugins: [ChartDataLabels],
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { right: 28 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            if (item.label === 'Computers (scaled)') return `Computers: ${computers}`;
                            return `${item.label}: ${item.raw}`;
                        }
                    }
                },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    color: '#334155',
                    font: { weight: '600', size: 12 },
                    formatter: (value, ctx) => {
                        const lbl = ctx.chart.data.labels[ctx.dataIndex];
                        if (lbl === 'Computers (scaled)') return computers;
                        return value;
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: '#e2e8f0' } },
                y: { grid: { display: false } }
            }
        }
    });

    chartCard.style.display = 'block';
}

function renderFacultyStats() {
    const getCount = rank => masterInstructors.filter(i => (i.designation || '').toLowerCase() === rank.toLowerCase()).length;

    if (document.getElementById('statProfessorsCount')) document.getElementById('statProfessorsCount').textContent = getCount('Professor');
    if (document.getElementById('statAssocProfCount')) document.getElementById('statAssocProfCount').textContent = getCount('Associate Professor');
    if (document.getElementById('statAsstProfCount')) document.getElementById('statAsstProfCount').textContent = getCount('Assistant Professor');
    if (document.getElementById('statLecturersCount')) document.getElementById('statLecturersCount').textContent = getCount('Lecturer');
    if (document.getElementById('statTeachingFellowsCount')) document.getElementById('statTeachingFellowsCount').textContent = getCount('Teaching Fellow');
    if (document.getElementById('statGradAsstCount')) document.getElementById('statGradAsstCount').textContent = getCount('Graduate Assistant');
    if (document.getElementById('statTeachAsstCount')) document.getElementById('statTeachAsstCount').textContent = getCount('Teaching Assistant');

    // Highlight Computer Science Faculty count (Requirement 7)
    const csDept = masterDepartments.find(d => d.code === 'CS');
    if (csDept) {
        const csFaculty = masterInstructors.filter(i => Number(i.department_id) === Number(csDept.id));
        if (document.getElementById('statCsFacultyTotal')) {
            document.getElementById('statCsFacultyTotal').textContent = csFaculty.length;
        }
    }

    // Populate faculty filter dropdowns
    const facultyDeptFilter = document.getElementById('facultyDeptFilter');
    if (facultyDeptFilter && facultyDeptFilter.options.length <= 1) {
        facultyDeptFilter.innerHTML = `<option value="">Select Department</option>` +
            `<option value="all">All Departments</option>` +
            masterDepartments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
    }

    const workloadDeptFilter = document.getElementById('workloadDeptFilter');
    if (workloadDeptFilter && workloadDeptFilter.options.length <= 1) {
        workloadDeptFilter.innerHTML = `<option value="">Select Department</option>` +
            `<option value="all">All Departments</option>` +
            masterDepartments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
    }
}

function renderFacultyTable() {
    const tbody = document.getElementById('tbodyFacultyList');
    if (!tbody) return;

    const facultySearchEl = document.getElementById('facultySearchInput');
    const searchQuery = ((facultySearchEl ? facultySearchEl.value : '') || '').toLowerCase();

    const facultyDeptEl = document.getElementById('facultyDeptFilter');
    const deptFilter = (facultyDeptEl ? facultyDeptEl.value : '') || '';

    const facultyDesigEl = document.getElementById('facultyDesigFilter');
    const desigFilter = (facultyDesigEl ? facultyDesigEl.value : '') || '';

    let filtered = [...masterInstructors];

    if (deptFilter && deptFilter !== 'all') {
        filtered = filtered.filter(i => Number(i.department_id) === Number(deptFilter));
    }
    if (desigFilter) {
        filtered = filtered.filter(i => (i.designation || '').toLowerCase() === desigFilter.toLowerCase());
    }
    if (searchQuery) {
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(searchQuery) ||
            (i.email || '').toLowerCase().includes(searchQuery) ||
            (i.designation || '').toLowerCase().includes(searchQuery)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<div class="faculty-row-empty"><i class="fa-solid fa-user-group"></i><span>No matching faculty members found.</span></div>`;
        renderFacultyDeptDesignationChart(deptFilter);
        return;
    }

    const desigPillClass = (designation) => {
        const d = (designation || '').toLowerCase();
        if (d === 'professor') return 'pill-desig-prof';
        if (d === 'associate professor') return 'pill-desig-assoc';
        if (d === 'assistant professor') return 'pill-desig-asst';
        if (d === 'lecturer') return 'pill-desig-lecturer';
        if (d === 'teaching fellow') return 'pill-desig-tf';
        if (d === 'graduate assistant') return 'pill-desig-ga';
        if (d === 'teaching assistant') return 'pill-desig-ta';
        return 'pill-desig-lecturer';
    };

    renderFacultyDeptDesignationChart(deptFilter);

    let html = '';
    filtered.forEach((f, idx) => {
                const dept = masterDepartments.find(d => Number(d.id) === Number(f.department_id)) || {};
                const canEdit = canUserEditDept(f.department_id);

                html += `
      <div class="faculty-row">
        <div class="faculty-row-top">
          <span class="faculty-row-index">${idx + 1}</span>
          <span class="dept-manage-avatar"><i class="fa-solid fa-user"></i></span>
          <strong class="faculty-row-name">${f.name}</strong>
          ${f.email ? `<a href="mailto:${f.email}" class="faculty-row-email">${f.email}</a>` : '<span class="text-muted text-xs">N/A</span>'}
          <span class="dept-pill ${desigPillClass(f.designation)}">${f.designation || 'Lecturer'}</span>
          <div class="faculty-row-dept">
            <span class="badge" style="background:${dept.color || '#006633'}; color:#fff;">${dept.code || 'Dept'}</span>
            <span class="text-xs ml-1">${dept.name || ''}</span>
          </div>
          <div class="faculty-row-actions">
            ${canEdit ? `
              <button class="btn-icon btn-icon-primary" title="Edit Faculty" onclick="openFacultyModal(${f.id})">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn-icon btn-icon-danger" title="Delete Faculty" onclick="deleteFacultyMember(${f.id}, '${f.name.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : '<span class="text-muted text-xs">Read-Only</span>'}
          </div>
        </div>
      </div>
    `;
  });

  tbody.innerHTML = html;
}

// Faculty Directory — Designation Breakdown Chart for the currently selected department only.
// Hidden entirely unless a single specific department is chosen (not empty, not "all").
let chartFacultyDeptDesigInstance = null;

function renderFacultyDeptDesignationChart(deptFilterVal) {
    const chartCard = document.getElementById('facultyDeptDesigChartCard');
    const ctx = document.getElementById('chartFacultyDeptDesig');
    if (!chartCard || !ctx) return;

    if (!deptFilterVal || deptFilterVal === 'all' || typeof Chart === 'undefined') {
        chartCard.style.display = 'none';
        return;
    }

    const dept = masterDepartments.find(d => Number(d.id) === Number(deptFilterVal));
    if (!dept) {
        chartCard.style.display = 'none';
        return;
    }

    const deptInstructors = masterInstructors.filter(i => Number(i.department_id) === Number(dept.id));

    const desigRanks = [
        'Professor',
        'Associate Professor',
        'Assistant Professor',
        'Lecturer',
        'Teaching Fellow',
        'Graduate Assistant',
        'Teaching Assistant'
    ];
    const rankCounts = desigRanks.map(rank => deptInstructors.filter(i => (i.designation || '').toLowerCase() === rank.toLowerCase()).length);

    const titleEl = document.getElementById('facultyDeptDesigChartTitle');
    if (titleEl) titleEl.textContent = `${dept.name} (${dept.code}) — Designation Breakdown`;

    const badgeEl = document.getElementById('badgeFacultyDeptDesigTotal');
    if (badgeEl) badgeEl.textContent = `${deptInstructors.length} Faculty`;

    if (chartFacultyDeptDesigInstance) chartFacultyDeptDesigInstance.destroy();
    chartFacultyDeptDesigInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: desigRanks,
            datasets: [{
                label: 'Faculty Members',
                data: rankCounts,
                backgroundColor: ['#006633', '#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#dc2626']
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    chartCard.style.display = 'block';
}

async function renderAdminCredsTable() {
  const container = document.getElementById('adminCredsTableContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/departments/credentials', { cache: 'no-store' });
    const users = await res.json();
    if (!res.ok) throw new Error(users.error || 'Failed to fetch credentials');

    let html = '<div class="creds-row-list">';

    users.forEach((u, idx) => {
      const isAdmin = u.role === 'admin';
      const defaultPass = isAdmin ? 'admin123' : `${(u.department_code || 'dept').toLowerCase()}123`;
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
            <code class="creds-row-password">${defaultPass}</code>
          </div>
          <div class="creds-row-actions">
            ${!isAdmin ? `
              <button class="btn-icon btn-icon-danger creds-delete-btn" title="Delete Department & Coordinator" data-dept-id="${u.department_id}" data-dept-name="${(u.department_name || '').replace(/"/g, '&quot;')}">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="form-error">Error loading coordinator credentials: ${err.message}</div>`;
  }
}

let isDeletingDept = false;

function setCredsDeleteButtonsDisabled(disabled) {
  document.querySelectorAll('.creds-delete-btn').forEach(btn => {
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.4' : '1';
    btn.style.pointerEvents = disabled ? 'none' : 'auto';
  });
}

if (!window.__credsDeleteListenerAttached) {
  window.__credsDeleteListenerAttached = true;
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.creds-delete-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const deptId = btn.getAttribute('data-dept-id');
    const deptName = btn.getAttribute('data-dept-name');
    handleDeleteDepartment(deptId, deptName);
  });
}

async function handleDeleteDepartment(deptId, deptName) {
  if (isDeletingDept) {
    alert('A delete is already in progress. Please wait for it to finish.');
    return;
  }

  if (!confirm(`Delete "${deptName}" permanently? This will remove the department, its coordinator login, ALL its rooms, faculty members, and timetable schedule slots. This cannot be undone.`)) {
    return;
  }

  isDeletingDept = true;
  setCredsDeleteButtonsDisabled(true);

  try {
    const res = await fetch(`/api/departments/${deptId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to delete department.');
      return;
    }

    alert(data.message || 'Department deleted successfully.');
    await loadMasterData();
    await renderAdminCredsTable();
    renderDeptTree();
    renderRoomsManager();
  } catch (err) {
    alert('Server error deleting department.');
  } finally {
    isDeletingDept = false;
  }
}

function openDeptResourceModal(deptId) {
  const dept = masterDepartments.find(d => Number(d.id) === Number(deptId));
  if (!dept) return;

  const modalTitle = document.getElementById('modalDeptResourceTitle');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-sliders"></i> ${dept.name} (${dept.code}) Resource Management`;
  }

  const container = document.getElementById('modalDeptResourceContent');
  if (!container) return;

  const dRooms = masterRooms.filter(r => Number(r.department_id) === Number(dept.id));
  const dFaculty = masterInstructors.filter(i => Number(i.department_id) === Number(dept.id));
  const canEdit = canUserEditDept(dept.id);

  let html = `
    <div class="dept-manage-summary" style="border-left-color: ${dept.color || '#006633'};">
      <div class="dept-manage-summary-left">
        <span class="dept-icon-badge" style="background:${dept.color ? dept.color + '22' : '#eef0ea'}; color:${dept.color || '#006633'};"><i class="fa-solid fa-building-columns"></i></span>
        <div>
          <h4 class="m-0">${dept.name} Resource Control Panel</h4>
          <p class="text-xs text-muted m-0"><i class="fa-solid fa-location-dot"></i> Location: ${dept.building || 'UET KSK Academic Block'}</p>
        </div>
      </div>
      <div>
        ${canEdit ? `
          <button class="btn btn-sm btn-outline" onclick="openFacultyModalForDept(${dept.id})">
            <i class="fa-solid fa-user-plus"></i> Add Faculty
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Section 1: Department Rooms & Labs -->
    <div class="dept-manage-section-header">
      <i class="fa-solid fa-door-open"></i> Allocated Rooms & Laboratories (${dRooms.length})
    </div>

    ${dRooms.length === 0 ? `
      <div class="dept-manage-empty">
        <i class="fa-solid fa-chalkboard"></i>
        <span>No rooms assigned.</span>
      </div>
    ` : `
      <div class="dept-manage-row-list mb-4">
        ${dRooms.map(r => `
          <div class="dept-manage-row">
            <div class="dept-manage-row-main">
              <strong>${r.room_name}</strong>
              <span class="dept-pill ${r.room_type === 'Computer Lab' ? 'pill-purple' : 'pill-green'}">${r.room_type}</span>
            </div>
            <div class="dept-manage-row-stats">
              <span><i class="fa-solid fa-chair"></i> ${r.capacity || 50}</span>
              <span><i class="fa-solid fa-video"></i> ${r.projector ? 'Yes' : 'No'}</span>
              <span><i class="fa-solid fa-desktop"></i> ${r.computers_count || 0} PCs</span>
            </div>
            ${canEdit ? `
              <div class="dept-manage-row-actions">
                <button class="btn-icon btn-icon-primary" title="Edit Room" onclick="openEditRoomModal(${r.id}); closeModal('modalDeptResourceManage');">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-icon btn-icon-danger" title="Delete Room" onclick="handleDeleteRoom(${r.id}, '${r.room_name}'); closeModal('modalDeptResourceManage');">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `}

    <!-- Section 2: Department Faculty Members -->
    <div class="dept-manage-section-header">
      <i class="fa-solid fa-user-graduate"></i> Department Faculty Members (${dFaculty.length})
    </div>

    ${dFaculty.length === 0 ? `
      <div class="dept-manage-empty">
        <i class="fa-solid fa-user-group"></i>
        <span>No faculty members assigned.</span>
      </div>
    ` : `
      <div class="dept-manage-row-list">
        ${dFaculty.map(f => `
          <div class="dept-manage-row">
            <div class="dept-manage-row-main">
              <span class="dept-manage-avatar"><i class="fa-solid fa-user"></i></span>
              <strong>${f.name}</strong>
              <span class="dept-pill pill-purple">${f.designation}</span>
            </div>
            <div class="dept-manage-row-stats">
              <span><i class="fa-solid fa-envelope"></i> ${f.email || 'N/A'}</span>
            </div>
            ${canEdit ? `
              <div class="dept-manage-row-actions">
                <button class="btn-icon btn-icon-primary" title="Edit Faculty" onclick="openFacultyModal(${f.id})">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-icon btn-icon-danger" title="Delete Faculty" onclick="deleteFacultyMember(${f.id}, '${f.name.replace(/'/g, "\\'")}')">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `}
  `;

  container.innerHTML = html;
  openModal('modalDeptResourceManage');
}

// Teacher / Faculty Utilization & Workload Calculation Module (Requirements 19, 20, 21, 22)
function renderFacultyWorkloadTable() {
  const tbody = document.getElementById('tbodyFacultyWorkload');
  if (!tbody) return;

  if (masterInstructors.length === 0) {
    tbody.innerHTML = `<div class="faculty-row-empty"><i class="fa-solid fa-user-group"></i><span>No faculty data available.</span></div>`;
    return;
  }

  const workloadDeptEl = document.getElementById('workloadDeptFilter');
  const workloadDeptFilterVal = (workloadDeptEl ? workloadDeptEl.value : '') || '';

  const workloadDesigEl = document.getElementById('workloadDesigFilter');
  const workloadDesigFilterVal = (workloadDesigEl ? workloadDesigEl.value : '') || '';

  const workloadSearchEl = document.getElementById('workloadSearchInput');
  const workloadSearchVal = ((workloadSearchEl ? workloadSearchEl.value : '') || '').toLowerCase();

  let workloadFiltered = [...masterInstructors];

  if (workloadDeptFilterVal && workloadDeptFilterVal !== 'all') {
    workloadFiltered = workloadFiltered.filter(i => Number(i.department_id) === Number(workloadDeptFilterVal));
  }
  if (workloadDesigFilterVal) {
    workloadFiltered = workloadFiltered.filter(i => (i.designation || '').toLowerCase() === workloadDesigFilterVal.toLowerCase());
  }
  if (workloadSearchVal) {
    workloadFiltered = workloadFiltered.filter(i =>
      (i.name || '').toLowerCase().includes(workloadSearchVal) ||
      (i.email || '').toLowerCase().includes(workloadSearchVal)
    );
  }

  if (workloadFiltered.length === 0) {
    tbody.innerHTML = `<div class="faculty-row-empty"><i class="fa-solid fa-user-group"></i><span>No matching faculty members found.</span></div>`;
    if (document.getElementById('badgeAvgFacultyUtilization')) {
      document.getElementById('badgeAvgFacultyUtilization').textContent = `0% Avg Faculty Load`;
    }
    return;
  }

  const desigPillClass = (designation) => {
    const d = (designation || '').toLowerCase();
    if (d === 'professor') return 'pill-desig-prof';
    if (d === 'associate professor') return 'pill-desig-assoc';
    if (d === 'assistant professor') return 'pill-desig-asst';
    if (d === 'lecturer') return 'pill-desig-lecturer';
    if (d === 'teaching fellow') return 'pill-desig-tf';
    if (d === 'graduate assistant') return 'pill-desig-ga';
    if (d === 'teaching assistant') return 'pill-desig-ta';
    return 'pill-desig-lecturer';
  };

  let totalUtilSum = 0;
  let html = `
    <div class="workload-header-row">
      <span><i class="fa-solid fa-user"></i>Faculty Member Name</span>
      <span><i class="fa-solid fa-id-badge"></i>Designation</span>
      <span><i class="fa-solid fa-building-columns"></i>Dept</span>
      <span><i class="fa-solid fa-book"></i>Assigned Courses</span>
      <span><i class="fa-solid fa-clock"></i>Credit Hours</span>
      <span><i class="fa-solid fa-bullseye"></i>Target Load</span>
      <span><i class="fa-solid fa-gauge"></i>Utilization %</span>
      <span><i class="fa-solid fa-circle-check"></i>Status</span>
      <span><i class="fa-solid fa-id-card"></i>Contact</span>
    </div>
  `;

  workloadFiltered.forEach((inst) => {
    const dept = masterDepartments.find(d => Number(d.id) === Number(inst.department_id)) || {};
    const assignedSlots = currentTimetableEntries.filter(e => Number(e.instructor_id) === Number(inst.id));

    const courseMap = {};
    let totalCreditHours = 0;

    assignedSlots.forEach(slot => {
      const course = masterCourses.find(c => Number(c.id) === Number(slot.course_id));
      const credit = course ? (Number(course.credit_hours) || 3) : 3;
      if (!courseMap[slot.course_id]) {
        courseMap[slot.course_id] = course ? `${course.course_code} (${course.course_name})` : `Course #${slot.course_id}`;
        totalCreditHours += credit;
      }
    });

    const coursesListStr = Object.values(courseMap).join(', ') || '<span class="text-muted text-xs" style="font-style:italic;">No active courses assigned</span>';
    const targetCreditHours = Number(inst.max_credit_hours) || 12;
    const workloadPct = Math.min(100, Math.round((totalCreditHours / targetCreditHours) * 100));
    totalUtilSum += workloadPct;

    const statusObj = getUtilizationStatus(workloadPct);

    html += `
      <div class="workload-row">
        <div class="workload-row-identity">
          <span class="dept-manage-avatar"><i class="fa-solid fa-user"></i></span>
          <div>
            <strong class="faculty-row-name">${inst.name}</strong>
            <div class="text-xs text-muted">${inst.email || 'No official email'}</div>
          </div>
        </div>

        <span class="dept-pill ${desigPillClass(inst.designation)}">${inst.designation || 'Lecturer'}</span>
        <span class="badge" style="background:${dept.color || '#006633'}; color:#fff;">${dept.code || 'Dept'}</span>

        <div class="workload-row-courses">${coursesListStr}</div>

        <div class="workload-row-hours">
          <i class="fa-solid fa-clock"></i> ${totalCreditHours} hrs
        </div>

        <div class="workload-row-hours">
          <i class="fa-solid fa-bullseye"></i> ${targetCreditHours} hrs
        </div>

        <div class="workload-row-progress">
          <div class="workload-progress-track">
            <div class="workload-progress-fill" style="width:${workloadPct}%; background:${statusObj.color};"></div>
          </div>
          <strong class="text-sm">${workloadPct}%</strong>
        </div>

        <span class="badge ${statusObj.badgeClass}">${statusObj.label}</span>

        <button class="btn btn-sm btn-outline workload-row-btn" onclick="openFacultyProfileModal(${inst.id})">
          <i class="fa-solid fa-address-card"></i> View Profile
        </button>
      </div>
    `;
  });

  const avgFacultyUtil = workloadFiltered.length > 0 ? Math.round(totalUtilSum / workloadFiltered.length) : 0;
  if (document.getElementById('badgeAvgFacultyUtilization')) {
    document.getElementById('badgeAvgFacultyUtilization').textContent = `${avgFacultyUtil}% Avg Faculty Workload`;
  }

  tbody.innerHTML = html;
}

function openFacultyProfileModal(instId) {
  const inst = masterInstructors.find(i => Number(i.id) === Number(instId));
  if (!inst) return;

  const dept = masterDepartments.find(d => Number(d.id) === Number(inst.department_id)) || {};
  const assignedSlots = currentTimetableEntries.filter(e => Number(e.instructor_id) === Number(inst.id));

  const courseMap = {};
  let totalCreditHours = 0;
  assignedSlots.forEach(slot => {
    const course = masterCourses.find(c => Number(c.id) === Number(slot.course_id));
    const credit = course ? (Number(course.credit_hours) || 3) : 3;
    if (!courseMap[slot.course_id]) {
      courseMap[slot.course_id] = {
        code: course ? course.course_code : 'CRS',
        name: course ? course.course_name : 'Course',
        credit,
        sem: course ? course.semester : 1
      };
      totalCreditHours += credit;
    }
  });

  const targetHours = Number(inst.max_credit_hours) || 12;
  const workloadPct = Math.min(100, Math.round((totalCreditHours / targetHours) * 100));
  const statusObj = getUtilizationStatus(workloadPct);

  const container = document.getElementById('modalFacultyProfileBody');
  if (!container) return;

  container.innerHTML = `
    <div class="faculty-profile-card">
      <span class="dept-manage-avatar faculty-profile-avatar"><i class="fa-solid fa-user"></i></span>
      <div class="faculty-profile-info">
        <h3 class="m-0">${inst.name}</h3>
        <div class="faculty-profile-badges">
          <span class="dept-pill ${(() => {
            const d = (inst.designation || '').toLowerCase();
            if (d === 'professor') return 'pill-desig-prof';
            if (d === 'associate professor') return 'pill-desig-assoc';
            if (d === 'assistant professor') return 'pill-desig-asst';
            if (d === 'lecturer') return 'pill-desig-lecturer';
            if (d === 'teaching fellow') return 'pill-desig-tf';
            if (d === 'graduate assistant') return 'pill-desig-ga';
            if (d === 'teaching assistant') return 'pill-desig-ta';
            return 'pill-desig-lecturer';
          })()}">${inst.designation || 'Lecturer'}</span>
          <span class="badge" style="background:${dept.color || '#006633'}; color:#fff;">${dept.name} (${dept.code})</span>
          <span class="badge ${statusObj.badgeClass}">${statusObj.label}</span>
        </div>
      </div>
    </div>

    <!-- Contact Info Grid (Requirement 21) -->
    <div class="dept-manage-section-header mt-4"><i class="fa-solid fa-address-book"></i> Official Contact Information & Office Details</div>
    <div class="faculty-profile-contact-grid mb-4">
      <div class="faculty-profile-contact-card">
        <span class="dept-icon-badge" style="background:#e9eef1; color:#3f5568;"><i class="fa-solid fa-envelope"></i></span>
        <div>
          <span class="text-xs text-muted">Official Email</span>
          <div class="faculty-profile-contact-value">${inst.email ? `<a href="mailto:${inst.email}">${inst.email}</a>` : 'Not Specified'}</div>
        </div>
      </div>

      <div class="faculty-profile-contact-card">
        <span class="dept-icon-badge" style="background:#eef0ea; color:#4a5c40;"><i class="fa-solid fa-phone"></i></span>
        <div>
          <span class="text-xs text-muted">Office Contact Phone / Ext</span>
          <div class="faculty-profile-contact-value">${inst.phone || '+92 42 99029200 (Ext 104)'}</div>
        </div>
      </div>

      <div class="faculty-profile-contact-card">
        <span class="dept-icon-badge" style="background:#f3ede4; color:#8a6f4f;"><i class="fa-solid fa-building-user"></i></span>
        <div>
          <span class="text-xs text-muted">Office Room Location</span>
          <div class="faculty-profile-contact-value">${inst.office_room || 'Academic Block, Faculty Office 102'}</div>
        </div>
      </div>
    </div>

    <!-- Teaching Workload Meter (Requirement 20) -->
    <div class="dept-manage-section-header"><i class="fa-solid fa-chart-line"></i> Teaching Workload & Credit Hours Meter</div>
    <div class="faculty-profile-meter mb-4">
      <div class="flex-between text-sm mb-2">
        <span>Assigned Credit Hours: <strong>${totalCreditHours} / ${targetHours} Hours</strong></span>
        <strong style="color:${statusObj.color};">${workloadPct}%</strong>
      </div>
      <div class="workload-progress-track" style="height:10px;">
        <div class="workload-progress-fill" style="width:${workloadPct}%; background:${statusObj.color};"></div>
      </div>
    </div>

    <!-- Assigned Courses Matrix -->
    <div class="dept-manage-section-header"><i class="fa-solid fa-book-bookmark"></i> Assigned Academic Courses (${Object.keys(courseMap).length})</div>
    ${Object.keys(courseMap).length === 0 ? `
      <div class="dept-manage-empty"><i class="fa-solid fa-book"></i><span>No courses currently assigned in timetable.</span></div>
    ` : `
      <div class="faculty-courses-table">
        <div class="faculty-courses-header-row">
          <span>Course Code</span>
          <span>Course Name</span>
          <span>Credit Hours</span>
          <span>Semester</span>
        </div>
        ${Object.values(courseMap).map(c => `
          <div class="faculty-courses-row">
            <strong>${c.code}</strong>
            <span>${c.name}</span>
            <span class="dept-pill pill-green">${c.credit} Credits</span>
            <span>Semester ${c.sem}</span>
          </div>
        `).join('')}
      </div>
    `}
  `;

  openModal('modalFacultyProfile');
}

function openFacultyModalForDept(deptId) {
  closeModal('modalDeptResourceManage');
  openFacultyModal(null, deptId);
}

function openFacultyModal(editId = null, preSelectDeptId = null) {
  const form = document.getElementById('facultyMemberForm');
  if (form) form.reset();

  const editIdInput = document.getElementById('editFacultyId');
  if (editIdInput) editIdInput.value = editId || '';

  const title = document.getElementById('modalFacultyTitle');
  const btn = document.getElementById('btnFacultySubmit');

  const deptSelect = document.getElementById('facultyDeptId');
  if (deptSelect) {
    deptSelect.innerHTML = masterDepartments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join('');
    if (preSelectDeptId) deptSelect.value = preSelectDeptId;
    else if (currentUser && currentUser.role === 'dept_admin' && currentUser.department_id) {
      deptSelect.value = currentUser.department_id;
    }
  }

  if (editId) {
    const inst = masterInstructors.find(i => Number(i.id) === Number(editId));
    if (inst) {
      if (title) title.innerHTML = `<i class="fa-solid fa-user-pen"></i> Edit Faculty Member`;
      if (btn) btn.textContent = 'Update Faculty Member';
      if (document.getElementById('facultyName')) document.getElementById('facultyName').value = inst.name;
      if (document.getElementById('facultyEmail')) document.getElementById('facultyEmail').value = inst.email || '';
      if (document.getElementById('facultyPhone')) document.getElementById('facultyPhone').value = inst.phone || '';
      if (document.getElementById('facultyOffice')) document.getElementById('facultyOffice').value = inst.office_room || '';
      if (document.getElementById('facultyMaxCredit')) document.getElementById('facultyMaxCredit').value = inst.max_credit_hours || 12;
      if (document.getElementById('facultyDesignation')) document.getElementById('facultyDesignation').value = inst.designation || 'Lecturer';
      if (deptSelect) deptSelect.value = inst.department_id;
    }
  } else {
    if (title) title.innerHTML = `<i class="fa-solid fa-user-plus"></i> Add Faculty Member`;
    if (btn) btn.textContent = 'Save Faculty Member';
  }

  openModal('modalFacultyForm');
}

async function handleSaveFacultyMember(event) {
  event.preventDefault();
  const editId = document.getElementById('editFacultyId').value;
  const name = document.getElementById('facultyName').value.trim();
  const email = document.getElementById('facultyEmail').value.trim();
  const phone = document.getElementById('facultyPhone') ? document.getElementById('facultyPhone').value.trim() : '';
  const office_room = document.getElementById('facultyOffice') ? document.getElementById('facultyOffice').value.trim() : '';
  const max_credit_hours = document.getElementById('facultyMaxCredit') ? document.getElementById('facultyMaxCredit').value : 12;
  const designation = document.getElementById('facultyDesignation').value;
  const department_id = document.getElementById('facultyDeptId').value;

  if (!name || !department_id) {
    alert('Faculty name and department are required!');
    return;
  }

  try {
    const url = editId ? `/api/instructors/${editId}` : '/api/instructors';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, designation, department_id, phone, office_room, max_credit_hours })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save faculty member');

    closeModal('modalFacultyForm');
    await loadMasterData();
    alert(data.message || 'Faculty member saved successfully!');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteFacultyMember(id, name) {
  if (!confirm(`Are you sure you want to delete faculty member "${name}"?`)) return;

  try {
    const res = await fetch(`/api/instructors/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete faculty member');

    closeModal('modalDeptResourceManage');
    await loadMasterData();
    alert(data.message || 'Faculty member deleted successfully!');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================================
// CAMPUS RESOURCE UTILIZATION — SUB-TAB SWITCHER (Phase 1, pure UI, no data logic)
// ============================================================================
const DASH_SUBTAB_PANEL_MAP = {
  overview: 'panelOverview',
  deptsearch: 'panelDeptSearch',
  analytics: 'panelAnalytics',
  rooms: 'panelRooms',
  faculty: 'panelFaculty',
  workload: 'panelWorkload',
  resourcesharing: 'panelResourceSharing'
};

function switchDashSubTab(tabId) {
  Object.values(DASH_SUBTAB_PANEL_MAP).forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.remove('active');
  });
  Object.keys(DASH_SUBTAB_PANEL_MAP).forEach(id => {
    const btn = document.getElementById(`dashSubtabBtn-${id}`);
    if (btn) btn.classList.remove('active');
  });

  const targetPanel = document.getElementById(DASH_SUBTAB_PANEL_MAP[tabId]);
  const targetBtn = document.getElementById(`dashSubtabBtn-${tabId}`);
  if (targetPanel) targetPanel.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');

  // Chart.js quirk: canvases render at 0-width while parent is display:none.
  // Force a resize pass once Analytics tab becomes visible (added ahead of Phase 3
  // so the mechanism is ready when charts move into panelAnalytics).
  if (tabId === 'analytics') {
    [chartDeptResourcesInstance, chartDeptUtilizationInstance, chartFacultyRanksInstance,
     chartRoomTypesInstance, chartSharedVsIndependentInstance, chartInterDeptSupportInstance]
      .forEach(inst => { if (inst) inst.resize(); });
  }

  if (tabId === 'resourcesharing') {
    [chartSharedVsIndependentInstance, chartInterDeptSupportInstance]
      .forEach(inst => { if (inst) inst.resize(); });
  }
}