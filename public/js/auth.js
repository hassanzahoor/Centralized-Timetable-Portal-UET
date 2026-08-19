// UET KSK Authentication & Persistent Session Manager

let currentUser = null;

async function checkAuthSession() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.user) {
            currentUser = data.user;
            localStorage.setItem('uet_saved_user', JSON.stringify(currentUser));
        } else {
            const savedStr = localStorage.getItem('uet_saved_user');
            let savedUser = null;
            if (savedStr) {
                try { savedUser = JSON.parse(savedStr); } catch (e) { savedUser = null; }
            }

            if (savedUser && savedUser.username) {
                try {
                    const restoreRes = await fetch('/api/auth/restore', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: savedUser.username })
                    });
                    const restoreData = await restoreRes.json();
                    if (restoreRes.ok && restoreData.user) {
                        currentUser = restoreData.user;
                        localStorage.setItem('uet_saved_user', JSON.stringify(currentUser));
                    } else {
                        currentUser = null;
                        localStorage.removeItem('uet_saved_user');
                    }
                } catch (e) {
                    currentUser = null;
                    localStorage.removeItem('uet_saved_user');
                }
            } else {
                currentUser = null;
                localStorage.removeItem('uet_saved_user');
            }
        }
        updateAuthUI();
    } catch (err) {
        currentUser = null;
        localStorage.removeItem('uet_saved_user');
        updateAuthUI();
    }
}

function updateAuthUI() {
    const landingSection = document.getElementById('viewLanding');
    const authenticatedLayout = document.getElementById('authenticatedLayout');

    const userProfileContainer = document.getElementById('userProfileContainer');
    const btnDashboardAddSlot = document.getElementById('btnDashboardAddSlot');
    const btnAddSlot = document.getElementById('btnAddSlot');
    const btnTreeAddDept = document.getElementById('btnTreeAddDept');
    const btnAddRoom = document.getElementById('btnAddRoom');
    const navAdminCreds = document.getElementById('navAdminCreds');
    const navImport = document.getElementById('navImport');
    const navRequests = document.getElementById('navRequests');
    const btnClearDeptTimetable = document.getElementById('btnClearDeptTimetable');
    const btnDashboardExcelImport = document.getElementById('btnDashboardExcelImport');

    if (currentUser) {
        // Show Authenticated Dashboard & Hide Public Landing Page
        if (landingSection) landingSection.style.display = 'none';
        if (authenticatedLayout) authenticatedLayout.style.display = 'flex';

        let deptBadgeHtml = '';
        if (currentUser.department_code) {
            deptBadgeHtml = `<span class="dept-pill" style="background:${currentUser.department_color || '#006633'}; color:#fff; margin-left:6px;">${currentUser.department_code}</span>`;
        }

        if (userProfileContainer) {
            const initials = (currentUser.full_name || 'U')
                .split(' ')
                .map(w => w[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();

            userProfileContainer.innerHTML = `
        <div class="profile-menu-wrap">
          <button class="profile-avatar-btn" onclick="toggleProfileDropdown(event)" title="${currentUser.full_name}">
            <span class="profile-avatar-circle">${initials}</span>
          </button>
          <div class="profile-dropdown" id="profileDropdown">
            <div class="profile-dropdown-header">
              <span class="profile-dropdown-name">${currentUser.full_name}</span>
              ${deptBadgeHtml}
            </div>
            <button class="profile-dropdown-item" onclick="switchMainView('viewSettings', document.getElementById('navSettings')); toggleProfileDropdown();">
              <i class="fa-solid fa-gear"></i> Settings
            </button>
            <button class="profile-dropdown-item" onclick="handleLogout()">
              <i class="fa-solid fa-right-from-bracket"></i> Logout
            </button>
          </div>
        </div>
      `;
        }

        if (currentUser.role === 'admin') {
            if (btnTreeAddDept) btnTreeAddDept.style.display = 'inline-flex';
            if (navAdminCreds) navAdminCreds.style.display = 'block';
            if (btnAddRoom) btnAddRoom.style.display = 'inline-flex';

            if (navRequests) navRequests.style.display = 'none';
            if (navImport) navImport.style.display = 'none';
            if (btnDashboardExcelImport) btnDashboardExcelImport.style.display = 'none';
            if (btnDashboardAddSlot) btnDashboardAddSlot.style.display = 'none';
            if (btnAddSlot) btnAddSlot.style.display = 'none';
            if (btnClearDeptTimetable) btnClearDeptTimetable.style.display = 'none';

        } else if (currentUser.role === 'dept_admin') {
            if (btnDashboardAddSlot) btnDashboardAddSlot.style.display = 'inline-flex';
            if (btnAddSlot) btnAddSlot.style.display = 'inline-flex';
            if (btnTreeAddDept) btnTreeAddDept.style.display = 'none';
            if (btnAddRoom) btnAddRoom.style.display = 'inline-flex';
            if (navAdminCreds) navAdminCreds.style.display = 'none';
            if (navRequests) navRequests.style.display = 'block';
            if (navImport) navImport.style.display = 'block';
            if (btnDashboardExcelImport) btnDashboardExcelImport.style.display = 'inline-flex';
            if (btnClearDeptTimetable) btnClearDeptTimetable.style.display = 'inline-flex';
        }

        // Populate Settings view inputs
        populateSettingsForm();
    } else {
        // Show Public Landing Page & Lock Authenticated Dashboard
        if (landingSection) landingSection.style.display = 'block';
        if (authenticatedLayout) authenticatedLayout.style.display = 'none';
    }
}

// Profile Dropdown Toggle & Outside-Click Close
function toggleProfileDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('active');
}

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('profileDropdown');
    if (!dropdown) return;
    const wrap = dropdown.closest('.profile-menu-wrap');
    if (wrap && !wrap.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// RBAC Check Helper: Returns true ONLY if user can edit slots for deptId
function canUserEditDept(deptId) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return false; // Super Admin is read-only
    if (currentUser.role === 'dept_admin' && Number(currentUser.department_id) === Number(deptId)) return true;
    return false;
}

// RBAC Check Helper: Returns true if user can delete a specific slot (Super Admin, Occupant Dept, or Room Owner Dept)
function canUserDeleteSlot(entry) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'dept_admin') {
        const userDeptId = Number(currentUser.department_id);
        if (userDeptId === Number(entry.department_id)) return true;
        const room = typeof masterRooms !== 'undefined' ? masterRooms.find(r => Number(r.id) === Number(entry.room_id)) : null;
        if (room && Number(room.department_id) === userDeptId) return true;
    }
    return false;
}

// Modal Trigger Functions
function openLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'flex';
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'none';
}

function fillLogin(username, password) {
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
}

async function handleLogin(e) {
    if (e) e.preventDefault();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errDiv = document.getElementById('loginError');

    errDiv.style.display = 'none';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) {
            errDiv.textContent = data.error || 'Login failed.';
            errDiv.style.display = 'block';
            return;
        }

        currentUser = data.user;
        localStorage.setItem('uet_saved_user', JSON.stringify(currentUser));

        closeLoginModal();
        updateAuthUI();
        await loadMasterData();
        await renderTimetable();
    } catch (err) {
        errDiv.textContent = 'Server connection error.';
        errDiv.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        localStorage.removeItem('uet_saved_user');
        updateAuthUI();
    } catch (err) {
        console.error('Logout error:', err);
    }
}

// Populate Account Settings Form
function populateSettingsForm() {
    if (!currentUser) return;
    const nameInput = document.getElementById('settingFullName');
    const emailInput = document.getElementById('settingEmail');
    const userInput = document.getElementById('settingUsername');
    const roleDeptInput = document.getElementById('settingRoleDept');
    const currPassInput = document.getElementById('settingCurrentPassword');
    const newPassInput = document.getElementById('settingNewPassword');

    if (nameInput) nameInput.value = currentUser.full_name || '';
    if (emailInput) emailInput.value = currentUser.email || '';
    if (userInput) userInput.value = currentUser.username || '';
    if (currPassInput) currPassInput.value = '';
    if (newPassInput) newPassInput.value = '';

    if (roleDeptInput) {
        const roleTitle = currentUser.role === 'admin' ? 'Super Admin' : 'Department Coordinator';
        const deptInfo = currentUser.department_name ? ` (${currentUser.department_name})` : '';
        roleDeptInput.value = `${roleTitle}${deptInfo}`;
    }

    const errDiv = document.getElementById('settingsError');
    const succDiv = document.getElementById('settingsSuccess');
    if (errDiv) errDiv.style.display = 'none';
    if (succDiv) succDiv.style.display = 'none';
}

// Form Submit Handler for Settings Update
async function handleUpdateSettings(e) {
    if (e) e.preventDefault();

    const fullName = document.getElementById('settingFullName').value.trim();
    const email = document.getElementById('settingEmail').value.trim();
    const username = document.getElementById('settingUsername').value.trim();
    const currentPassword = document.getElementById('settingCurrentPassword').value;
    const newPassword = document.getElementById('settingNewPassword').value;

    const errDiv = document.getElementById('settingsError');
    const succDiv = document.getElementById('settingsSuccess');
    if (errDiv) errDiv.style.display = 'none';
    if (succDiv) succDiv.style.display = 'none';

    if (!fullName || !username || !currentPassword) {
        if (errDiv) {
            errDiv.textContent = 'Full name, username, and current password are required.';
            errDiv.style.display = 'block';
        }
        return;
    }

    try {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: fullName,
                email,
                username,
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await res.json();
        if (!res.ok) {
            if (errDiv) {
                errDiv.textContent = data.error || 'Failed to update settings.';
                errDiv.style.display = 'block';
            }
            return;
        }

        currentUser = data.user;
        localStorage.setItem('uet_saved_user', JSON.stringify(currentUser));
        updateAuthUI();

        if (succDiv) {
            succDiv.textContent = data.message || 'Settings saved successfully!';
            succDiv.style.display = 'block';
        }

        document.getElementById('settingCurrentPassword').value = '';
        document.getElementById('settingNewPassword').value = '';

    } catch (err) {
        if (errDiv) {
            errDiv.textContent = 'Server communication error: ' + err.message;
            errDiv.style.display = 'block';
        }
    }
}