// ============================================
// PRODUCTIVITY HUB - GOOGLE TASKS INTEGRATION
// ============================================

const GT_SCOPE = 'https://www.googleapis.com/auth/tasks';
const GT_API = 'https://tasks.googleapis.com/tasks/v1';
const GT_TOKEN_KEY = 'googleTasksToken';
const GT_EXPIRY_KEY = 'googleTasksTokenExpiry';

// ============================================
// TOKEN MANAGEMENT
// ============================================
function gtGetToken() {
    return localStorage.getItem(GT_TOKEN_KEY);
}

function gtIsConnected() {
    const token = gtGetToken();
    const expiry = parseInt(localStorage.getItem(GT_EXPIRY_KEY) || '0');
    return !!(token && Date.now() < expiry);
}

function gtStoreToken(token, expiresIn) {
    localStorage.setItem(GT_TOKEN_KEY, token);
    localStorage.setItem(GT_EXPIRY_KEY, (Date.now() + parseInt(expiresIn) * 1000).toString());
}

function gtClearToken() {
    localStorage.removeItem(GT_TOKEN_KEY);
    localStorage.removeItem(GT_EXPIRY_KEY);
}

// ============================================
// OAUTH CONNECT / DISCONNECT
// ============================================
function googleTasksConnect() {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
        showToast('Set GOOGLE_CLIENT_ID in config.js first', 'error');
        showGoogleTasksSetup();
        return;
    }

    const redirectUri = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/oauth-callback.html`;

    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: GT_SCOPE,
        include_granted_scopes: 'true'
    });

    const popup = window.open(
        `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        'google-tasks-auth',
        'width=520,height=620,left=200,top=100'
    );

    if (!popup) {
        showToast('Popup blocked — please allow popups and try again', 'error');
        return;
    }

    const handler = (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.googleAccessToken) {
            gtStoreToken(event.data.googleAccessToken, event.data.expiresIn || '3600');
            window.removeEventListener('message', handler);
            updateGoogleTasksUI();
            showToast('Google Tasks connected!', 'success');
        } else if (event.data?.googleTasksError) {
            window.removeEventListener('message', handler);
            showToast(`Google auth failed: ${event.data.googleTasksError}`, 'error');
        }
    };
    window.addEventListener('message', handler);
}

function googleTasksDisconnect() {
    gtClearToken();
    updateGoogleTasksUI();
    showToast('Google Tasks disconnected', 'success');
}

// ============================================
// SYNC: push tasks with due dates to Google Tasks
// ============================================
async function syncToGoogleTasks() {
    if (!gtIsConnected()) {
        showToast('Connect Google Tasks first', 'error');
        return;
    }

    showToast('Syncing to Google Tasks...', 'success');

    try {
        // Get or create the "Productivity Hub" tasklist
        const tasklistId = await gtGetOrCreateTasklist('Productivity Hub');

        // Fetch existing tasks in the list to avoid duplicates
        const existing = await gtGet(`${GT_API}/lists/${tasklistId}/tasks?showCompleted=false&maxResults=100`);
        const existingTitles = new Set((existing.items || []).map(t => t.title));

        // Push active, incomplete tasks that have a due date
        const toSync = (appState.tasks || []).filter(t =>
            t.status !== 'deleted' && !t.is_completed && t.due_date
        );

        let pushed = 0;
        let skipped = 0;
        for (const task of toSync) {
            if (existingTitles.has(task.title)) {
                skipped++;
                continue;
            }
            await gtPost(`${GT_API}/lists/${tasklistId}/tasks`, {
                title: task.title,
                notes: task.notes || '',
                // Google Tasks API requires RFC 3339 timestamp for due
                due: task.due_date + 'T00:00:00.000Z',
                status: 'needsAction'
            });
            pushed++;
        }

        const msg = pushed > 0
            ? `${pushed} task${pushed !== 1 ? 's' : ''} synced${skipped ? ` (${skipped} already existed)` : ''}`
            : `No new tasks to sync (${skipped} already in Google Tasks)`;
        showToast(`✅ ${msg}`, 'success');

    } catch (err) {
        console.error('Google Tasks sync error:', err);
        if (err.status === 401) {
            gtClearToken();
            updateGoogleTasksUI();
            showToast('Session expired — please reconnect Google Tasks', 'error');
        } else {
            showToast('Sync failed — see console for details', 'error');
        }
    }
}

async function gtGetOrCreateTasklist(title) {
    const lists = await gtGet(`${GT_API}/users/@me/lists`);
    const existing = (lists.items || []).find(l => l.title === title);
    if (existing) return existing.id;
    const created = await gtPost(`${GT_API}/users/@me/lists`, { title });
    return created.id;
}

// ============================================
// HTTP HELPERS
// ============================================
async function gtGet(url) {
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${gtGetToken()}` }
    });
    if (!res.ok) {
        const e = new Error(`Google API ${res.status}`);
        e.status = res.status;
        throw e;
    }
    return res.json();
}

async function gtPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${gtGetToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const e = new Error(`Google API ${res.status}`);
        e.status = res.status;
        throw e;
    }
    return res.json();
}

// ============================================
// UI HELPERS
// ============================================
function updateGoogleTasksUI() {
    const connected = gtIsConnected();
    const connectBtn = document.getElementById('gt-connect-btn');
    const syncBtns = document.getElementById('gt-sync-btns');
    const statusEl = document.getElementById('gt-status');

    if (connectBtn) connectBtn.classList.toggle('hidden', connected);
    if (syncBtns) syncBtns.classList.toggle('hidden', !connected);
    if (statusEl) {
        statusEl.innerHTML = connected
            ? '<i class="fas fa-check-circle mr-1" style="color:var(--success)"></i> Connected'
            : '<i class="fas fa-circle mr-1" style="opacity:0.4"></i> Not connected';
    }
}

function showGoogleTasksSetup() {
    const el = document.getElementById('gt-setup-instructions');
    if (el) el.classList.toggle('hidden');
}

// Initialize UI state when backup modal opens
function initGoogleTasksUI() {
    updateGoogleTasksUI();
}
