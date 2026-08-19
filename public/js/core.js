// UET KSK Centralized Timetable Web Application Engine

let masterDepartments = [];
let masterRooms = [];
let masterCourses = [];
let masterInstructors = [];
let currentTimetableEntries = [];

// Chart.js handles
let chartDeptResourcesInstance = null;
let chartDeptUtilizationInstance = null;
let chartFacultyRanksInstance = null;
let chartRoomTypesInstance = null;
let chartSharedVsIndependentInstance = null;
let chartInterDeptSupportInstance = null;

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TIME_SLOTS = [
    { start: '08:00', end: '09:00', label: '08:00 - 09:00 AM' },
    { start: '09:00', end: '10:00', label: '09:00 - 10:00 AM' },
    { start: '10:00', end: '11:00', label: '10:00 - 11:00 AM' },
    { start: '11:00', end: '12:00', label: '11:00 - 12:00 PM' },
    { start: '12:00', end: '13:00', label: '12:00 - 01:00 PM' },
    { start: '13:00', end: '14:00', label: '01:00 - 02:00 PM' },
    { start: '14:00', end: '15:00', label: '02:00 - 03:00 PM' },
    { start: '15:00', end: '16:00', label: '03:00 - 04:00 PM' }
];

document.addEventListener('DOMContentLoaded', async() => {
    await checkAuthSession();
    if (currentUser) {
        await loadMasterData();
        setupDropzone();
        await renderTimetable();
    }
});

// GLOBAL POPUP & MODAL CONTROLLER (With Background Body Scroll Lock)
function openModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

function closeModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
        modal.classList.remove('active');
    }
    if (!document.querySelector('.modal.active')) {
        document.body.classList.remove('modal-open');
    }
}

function closeAllActiveModals() {
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        closeAllActiveModals();
    }
});

document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal') && e.target.classList.contains('active')) {
        closeAllActiveModals();
    }
});

// View Navigation Switcher (Requirement 1: Rename Dashboard to Campus Resource Utilization)
async function switchMainView(viewId, navElem) {
    document.querySelectorAll('.main-view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';

    if (navElem) navElem.classList.add('active');

    const pageHeader = document.getElementById('pageHeaderTitle');
    if (pageHeader) {
        if (viewId === 'viewDashboard') pageHeader.textContent = 'Campus Resource Utilization';
        else if (viewId === 'viewDeptsTree') pageHeader.textContent = 'Departments & Room Allocation';
        else if (viewId === 'viewTimetable') pageHeader.textContent = 'Centralized Timetable Matrix';
        else if (viewId === 'viewExcelImport') pageHeader.textContent = 'Update Room View (Excel Parser)';
        else if (viewId === 'viewRoomsManager') pageHeader.textContent = 'Rooms & Equipment Manager';
        else if (viewId === 'viewRoomRequests') pageHeader.textContent = 'Cross-Department Room Requests';
        else if (viewId === 'viewAdminCreds') pageHeader.textContent = 'Coordinator Passwords';
        else if (viewId === 'viewSettings') pageHeader.textContent = 'System Settings & Profile';
    }

    if (viewId === 'viewDashboard') renderCampusResourceUtilization();
    if (viewId === 'viewDeptsTree') renderDeptTree();
    if (viewId === 'viewRoomsManager') renderRoomsManager();
    if (viewId === 'viewAdminCreds') renderAdminCredsTable();
    if (viewId === 'viewSettings' && typeof populateSettingsForm === 'function') populateSettingsForm();
    if (viewId === 'viewRoomRequests') {
        await fetchRoomRequests();
        renderRoomRequestsView();
    }

    closeSidebarMobile();
}

function toggleSidebar() {
    const sidebar = document.getElementById('uetSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
}

function closeSidebarMobile() {
    const sidebar = document.getElementById('uetSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
}

// Load Master Data
async function loadMasterData() {
    try {
        const [deptRes, roomRes, courseRes, instRes, ttRes] = await Promise.all([
            fetch('/api/departments'),
            fetch('/api/rooms'),
            fetch('/api/courses'),
            fetch('/api/instructors'),
            fetch('/api/timetable')
        ]);

        masterDepartments = await deptRes.json();
        masterRooms = await roomRes.json();
        masterCourses = await courseRes.json();
        masterInstructors = await instRes.json();
        currentTimetableEntries = await ttRes.json();

        populateFilterDropdowns();
        renderDeptTree();
        await fetchRoomRequests();
        renderCampusResourceUtilization();
    } catch (err) {
        console.error('Error loading master data:', err);
    }
}

// Populate Filter Dropdowns
function populateFilterDropdowns() {
    const filterDept = document.getElementById('filterDept');
    if (filterDept) {
        filterDept.innerHTML = `<option value="">🏛️ All Departments (Central View)</option>` +
            masterDepartments.map(d => {
                const dRooms = masterRooms.filter(r => Number(r.department_id) === Number(d.id));
                const cCount = dRooms.filter(r => r.room_type !== 'Computer Lab').length;
                const lCount = dRooms.filter(r => r.room_type === 'Computer Lab').length;
                const pCount = dRooms.filter(r => r.projector === 1 || r.projector === 'Yes' || r.projector === '1').length;
                return `<option value="${d.id}">${d.name} (${d.code}) — Classrooms: ${cCount} | Labs: ${lCount} | Projectors: ${pCount}</option>`;
            }).join('');
    }

    const filterRoom = document.getElementById('filterRoom');
    if (filterRoom) {
        filterRoom.innerHTML = `<option value="">All Rooms</option>` +
            masterRooms.map(r => `<option value="${r.id}">${r.room_name} (${r.room_type})</option>`).join('');
    }
}