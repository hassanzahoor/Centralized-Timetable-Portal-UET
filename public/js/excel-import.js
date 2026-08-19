// DRAG & DROP EXCEL FILE IMPORTER
function setupDropzone() {
    const dropzone = document.getElementById('excelDropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', handleDrop, false);
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        processExcelFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processExcelFile(files[0]);
    }
}

async function processExcelFile(file) {
    const statusDiv = document.getElementById('importResultStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `<div class="p-3 bg-blue text-white rounded"><i class="fa-solid fa-spinner fa-spin"></i> Reading Excel file "${file.name}"...</div>`;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const base64Str = btoa(String.fromCharCode.apply(null, data));

        try {
            const res = await fetch('/api/upload/excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileData: base64Str })
            });

            const resData = await res.json();
            if (!res.ok) {
                statusDiv.innerHTML = `<div class="form-error">${resData.error}</div>`;
                return;
            }

            let conflictNotice = '';
            if (resData.conflictsSkipped > 0) {
                conflictNotice = `<div class="mt-2 text-warning font-semibold">⚠️ ${resData.conflictsSkipped} occupied slots were skipped to prevent overwriting existing schedules!</div>`;
            }

            statusDiv.innerHTML = `
        <div class="p-3 bg-green text-white rounded">
          <i class="fa-solid fa-circle-check"></i> Success! Imported ${resData.importedSlots} timetable slots and registered ${resData.newRooms} rooms!
          ${conflictNotice}
        </div>
      `;

            await loadMasterData();
            renderTimetable();
        } catch (err) {
            statusDiv.innerHTML = `<div class="form-error">Error processing Excel upload.</div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

async function importPresetDashboardXlsx() {
    const statusDiv = document.getElementById('importResultStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `<div class="p-3 bg-blue text-white rounded"><i class="fa-solid fa-spinner fa-spin"></i> Importing preset campus dataset \`dashboard.xlsx\`...</div>`;

    try {
        const res = await fetch('/api/upload/excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileData: 'preset' })
        });
        const resData = await res.json();

        let conflictNotice = '';
        if (resData.conflictsSkipped > 0) {
            conflictNotice = `<div class="mt-2 text-warning font-semibold">⚠️ ${resData.conflictsSkipped} occupied slots were skipped to prevent overwriting existing schedules!</div>`;
        }

        statusDiv.innerHTML = `
      <div class="p-3 bg-green text-white rounded">
        <i class="fa-solid fa-circle-check"></i> Dataset \`dashboard.xlsx\` parsed successfully! Imported ${resData.importedSlots} slots.
        ${conflictNotice}
      </div>
    `;

        await loadMasterData();
        renderTimetable();
    } catch (err) {
        statusDiv.innerHTML = `<div class="form-error">Error importing dashboard.xlsx</div>`;
    }
}

// DOWNLOAD SAMPLE EXCEL TIMETABLE PATTERN TEMPLATE (.xlsx)
function downloadExcelTemplate() {
    window.location.href = '/api/upload/template';
}