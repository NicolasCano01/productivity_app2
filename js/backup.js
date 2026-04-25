// ============================================
// PRODUCTIVITY HUB - BACKUP MODULE
// ============================================

const BACKUP_META_KEY = 'productivityHub_backupMeta';

// Google Apps Script code that users need to deploy
const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var tasks = data.tasks || [];
    var sheetName = data.overwrite ? 'Tasks' : ('Tasks_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm'));
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    sheet.clearContents();
    sheet.appendRow(['ID','Title','Notes','Category','Goal','Due Date','Status','Completed','Completed At','Recurring','Created At']);
    tasks.forEach(function(t) {
      sheet.appendRow([t.id||'',t.title||'',t.notes||'',t.category||'',t.goal||'',t.due_date||'',t.status||'',t.is_completed?'Yes':'No',t.completed_at||'',t.is_recurring?'Yes':'No',t.created_at||'']);
    });
    return ContentService.createTextOutput(JSON.stringify({success:true,count:tasks.length,sheet:sheetName}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false,error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

// ============================================
// MODAL
// ============================================
function openBackupModal() {
    const modal = document.getElementById('backup-modal');
    if (!modal) return;

    // Populate Apps Script code block
    const codeEl = document.getElementById('apps-script-code');
    if (codeEl) codeEl.textContent = APPS_SCRIPT_CODE;

    // Load saved URL
    const savedUrl = localStorage.getItem('sheetsBackupUrl') || '';
    const urlInput = document.getElementById('sheets-url-input');
    if (urlInput) urlInput.value = savedUrl;

    updateBackupStatusBar();
    modal.classList.remove('hidden');
}

function closeBackupModal() {
    document.getElementById('backup-modal').classList.add('hidden');
}

function showAppsScriptInstructions() {
    const el = document.getElementById('apps-script-instructions');
    if (el) el.classList.toggle('hidden');
}

function updateBackupStatusBar() {
    const bar = document.getElementById('backup-last-info');
    if (!bar) return;

    const meta = getBackupMeta();
    if (!meta.lastBackupAt) {
        bar.innerHTML = '<i class="fas fa-info-circle mr-1"></i> No backup recorded yet';
        return;
    }

    const dt = new Date(meta.lastBackupAt).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' });
    bar.innerHTML = `
        <div class="flex items-center justify-between">
            <div>
                <i class="fas fa-check-circle mr-1" style="color:var(--success)"></i>
                <span style="font-weight:600">Last backup:</span> ${dt}
            </div>
            <span style="font-size:11px;color:var(--text-secondary)">${meta.lastTaskCount} tasks</span>
        </div>
    `;
}

function getBackupMeta() {
    try {
        return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || '{}');
    } catch (e) { return {}; }
}

function saveBackupMeta(meta) {
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
}

// ============================================
// CSV DOWNLOAD (always available, no setup)
// ============================================
function downloadTasksCSV() {
    const tasks = (appState.tasks || []).filter(t => t.status !== 'deleted');
    if (tasks.length === 0) {
        showToast('No tasks to export', 'error');
        return;
    }

    const headers = ['ID','Title','Notes','Category','Goal','Due Date','Status','Completed','Completed At','Recurring','Created At'];
    const rows = tasks.map(t => [
        t.id || '',
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.notes || '').replace(/"/g, '""')}"`,
        `"${(t.category?.name || '').replace(/"/g, '""')}"`,
        `"${(t.goal?.name || '').replace(/"/g, '""')}"`,
        t.due_date || '',
        t.status || '',
        t.is_completed ? 'Yes' : 'No',
        t.completed_at || '',
        t.is_recurring ? 'Yes' : 'No',
        t.created_at || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    link.href = url;
    link.download = `productivity-hub-tasks-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${tasks.length} tasks`, 'success');
}

// ============================================
// GOOGLE SHEETS BACKUP via Apps Script URL
// ============================================
async function backupToSheets(silent = false) {
    const urlInput = document.getElementById('sheets-url-input');
    const url = (urlInput ? urlInput.value.trim() : localStorage.getItem('sheetsBackupUrl') || '');

    if (!url) {
        if (!silent) showToast('Please enter your Apps Script URL first', 'error');
        return false;
    }

    // Save URL for next time
    localStorage.setItem('sheetsBackupUrl', url);

    const tasks = (appState.tasks || []).filter(t => t.status !== 'deleted');
    if (tasks.length === 0) {
        if (!silent) showToast('No tasks to backup', 'error');
        return false;
    }

    // ── Safety check ──────────────────────────────────────────────
    const meta = getBackupMeta();
    const lastCount = meta.lastTaskCount || 0;
    let overwrite = true;

    if (lastCount > 0 && tasks.length < lastCount * 0.5) {
        // Current count is less than 50% of last backup — warn user
        const confirm = window.confirm(
            `⚠️ Safety warning\n\nLast backup had ${lastCount} tasks.\nCurrent count is ${tasks.length} (${Math.round((tasks.length / lastCount) * 100)}%).\n\nThis looks unusual — creating a NEW sheet instead of overwriting to protect your data.\n\nPress OK to continue with a new sheet, or Cancel to abort.`
        );
        if (!confirm) return false;
        overwrite = false; // create a new timestamped sheet
    }
    // ──────────────────────────────────────────────────────────────

    const payload = {
        tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            notes: t.notes || '',
            category: t.category?.name || '',
            goal: t.goal?.name || '',
            due_date: t.due_date || '',
            status: t.status,
            is_completed: t.is_completed,
            completed_at: t.completed_at || '',
            is_recurring: t.is_recurring || false,
            created_at: t.created_at || ''
        })),
        overwrite,
        backupDate: new Date().toISOString()
    };

    if (!silent) showToast('Sending to Google Sheets...', 'success');

    try {
        // Apps Script requires no-cors mode — we can't read the response
        // but the data gets written. Use a fetch with mode 'no-cors'.
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Since no-cors doesn't give us a response, assume success if no error
        const newMeta = {
            lastBackupAt: new Date().toISOString(),
            lastTaskCount: tasks.length,
            sheetsUrl: url
        };
        saveBackupMeta(newMeta);
        updateBackupStatusBar();

        if (!silent) showToast(`✅ ${tasks.length} tasks backed up to Google Sheets`, 'success');
        return true;
    } catch (err) {
        console.error('Backup failed:', err);
        if (!silent) showToast('Backup failed — check your Apps Script URL', 'error');
        return false;
    }
}

// ============================================
// AUTO-BACKUP on app load (if URL is set + >24h since last backup)
// ============================================
function maybeAutoBackup() {
    const url = localStorage.getItem('sheetsBackupUrl');
    if (!url) return;

    const meta = getBackupMeta();
    if (!meta.lastBackupAt) return;

    const hoursSince = (Date.now() - new Date(meta.lastBackupAt).getTime()) / (1000 * 60 * 60);
    if (hoursSince >= 24) {
        console.log('🔄 Auto-backup triggered (>24h since last backup)');
        setTimeout(() => backupToSheets(true), 5000); // delay to let data load first
    }
}
