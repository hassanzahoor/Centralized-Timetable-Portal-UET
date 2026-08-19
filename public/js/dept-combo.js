// ============================================================================
// SHARED DEPARTMENT SEARCH + DROPDOWN COMBO COMPONENT
// Reusable across all department search fields. Approved reference: mockup
// showing default/closed, open/no-query, and open/filtered states.
// ============================================================================

function initDeptCombo(inputId, listId, chevronId, onChange) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const chevron = chevronId ? document.getElementById(chevronId) : null;
    if (!input || !list) return;

    function renderList(query) {
        const rawQuery = (query || '').trim().toLowerCase();
        const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

        const items = (typeof masterDepartments !== 'undefined' ? masterDepartments : []).filter(d => {
            const searchable = (d.name + ' ' + d.code).toLowerCase();
            return queryTokens.length === 0 || queryTokens.every(token => searchable.includes(token));
        });

        if (items.length === 0) {
            list.innerHTML = `<div class="dept-combo-empty">No matching departments found.</div>`;
            return;
        }

        list.innerHTML = items.map(d => `
      <div class="dept-combo-item" data-dept-id="${d.id}" data-dept-name="${d.name}" style="border-left-color:${d.color || '#006633'};">
        <span class="dept-combo-item-name">${d.name}</span>
        <span class="dept-combo-item-code">${d.code}</span>
      </div>
    `).join('');
    }

    function openList() {
        renderList(input.value);
        list.style.display = 'block';
        if (chevron) chevron.classList.add('open');
    }

    function closeList() {
        list.style.display = 'none';
        if (chevron) chevron.classList.remove('open');
    }

    input.addEventListener('focus', openList);
    input.addEventListener('input', () => {
        renderList(input.value);
        if (typeof onChange === 'function') onChange();
    });

    if (chevron) {
        chevron.addEventListener('click', () => {
            if (list.style.display === 'none' || !list.style.display) {
                input.focus();
                openList();
            } else {
                closeList();
            }
        });
    }

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.dept-combo-item');
        if (!item) return;
        input.value = item.getAttribute('data-dept-name');
        closeList();
        if (typeof onChange === 'function') onChange();
    });

    document.addEventListener('click', (e) => {
        const clickedInsideInput = input.contains(e.target);
        const clickedInsideList = list.contains(e.target);
        const clickedChevron = chevron && chevron.contains(e.target);
        if (!clickedInsideInput && !clickedInsideList && !clickedChevron) {
            closeList();
        }
    });
}

// Pilot wiring: Find Room by Department (Rooms Manager view)
document.addEventListener('DOMContentLoaded', function() {
    initDeptCombo('findRoomDept', 'findRoomDeptList', 'findRoomDeptChevron', function() {
        if (typeof onFindRoomDeptChange === 'function') onFindRoomDeptChange();
    });
});