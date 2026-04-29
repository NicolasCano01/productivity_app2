// ============================================
// PRODUCTIVITY HUB - CORK BOARD (Quick Notes)
// ============================================

const NOTES_STORAGE_KEY = 'productivityHub_notes';
let editingNoteId = null;
let selectedNoteColor = '#FEF08A'; // default yellow

// ============================================
// STORAGE HELPERS
// localStorage acts as a fast local cache.
// All writes are mirrored to Supabase async.
// On board open, Supabase is the source of truth.
// ============================================
function loadNotes() {
    try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveNotesLocal(notes) {
    try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
        console.warn('Failed to save notes to localStorage:', e);
    }
}

// ============================================
// SUPABASE SYNC
// ============================================

// Load all notes for the current user from Supabase.
// On success, overwrites localStorage cache and re-renders.
// Falls back silently to the existing localStorage data on error.
async function syncNotesFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('sticky_notes')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const notes = data.map(row => ({
            id:        row.id,
            content:   row.content,
            color:     row.color || '#FEF08A',
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));

        saveNotesLocal(notes);
        renderBoardNotes();
    } catch (e) {
        console.warn('Could not sync notes from Supabase (using localStorage):', e.message);
    }
}

// Upsert a single note to Supabase.
async function saveNoteToSupabase(note) {
    if (!supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
            .from('sticky_notes')
            .upsert({
                id:         note.id,
                user_id:    session.user.id,
                content:    note.content,
                color:      note.color || '#FEF08A',
                created_at: note.createdAt,
                updated_at: note.updatedAt
            }, { onConflict: 'id' });

        if (error) throw error;
    } catch (e) {
        console.warn('Could not save note to Supabase (saved locally):', e.message);
    }
}

// Delete a single note from Supabase.
async function deleteNoteFromSupabase(noteId) {
    if (!supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
            .from('sticky_notes')
            .delete()
            .eq('id', noteId)
            .eq('user_id', session.user.id);

        if (error) throw error;
    } catch (e) {
        console.warn('Could not delete note from Supabase:', e.message);
    }
}

// ============================================
// RENDER
// ============================================
function renderBoard() {
    // Sync from Supabase each time the board panel opens.
    // syncNotesFromSupabase() re-renders after the fetch completes,
    // so renderBoardNotes() below shows cached data instantly first.
    renderBoardNotes();
    renderBoardPinned();
    syncNotesFromSupabase();
}

function renderBoardNotes() {
    const grid = document.getElementById('board-notes-grid');
    if (!grid) return;

    const notes = loadNotes();

    if (notes.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-8" style="color:var(--text-secondary)">
                <i class="fas fa-thumbtack text-3xl mb-3" style="opacity:0.3"></i>
                <p style="font-size:14px">No notes yet</p>
                <p style="font-size:12px;margin-top:4px;opacity:0.7">Tap + to add your first sticky note</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = notes.map(note => renderNoteCard(note)).join('');
}

function renderNoteCard(note) {
    const textColor = '#1D1D1F'; // notes always use dark text regardless of app theme
    const created = new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
        <div class="note-card" style="background:${note.color || '#FEF08A'}" onclick="openNoteModal('${note.id}')">
            <div class="note-card-body">
                <p class="note-card-text" style="color:${textColor}">${escapeHtml(note.content)}</p>
            </div>
            <div class="note-card-footer" style="color:${textColor};opacity:0.55">
                <span style="font-size:10px">${created}</span>
                <button onclick="event.stopPropagation();deleteNoteById('${note.id}')"
                    style="background:none;border:none;cursor:pointer;padding:2px 4px;color:${textColor};opacity:0.55;font-size:11px"
                    title="Delete note">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
}

function renderBoardPinned() {
    const section = document.getElementById('board-pinned-section');
    if (!section) return;

    const pinned = (appState.tasks || []).filter(t =>
        t.is_pinned && t.status !== 'deleted' && !t.is_completed
    );

    if (pinned.length === 0) {
        section.innerHTML = '';
        return;
    }

    const cards = pinned.map(task => {
        const cat = task.category;
        const catColor = cat?.color_hex || '#6B7280';
        const due = task.due_date ? formatDueDate(task.due_date) : null;
        const isOverdue = task.due_date
            ? new Date(task.due_date + 'T00:00:00') < new Date(getMelbourneDateString() + 'T00:00:00')
            : false;

        return `
        <div class="pinned-task-card"
            draggable="true"
            ondragstart="handlePinnedDragStart(event, '${task.id}')"
            ondragend="handlePinnedDragEnd(event)"
            ondragover="handlePinnedDragOver(event)"
            ondragleave="handlePinnedDragLeave(event)"
            ondrop="handlePinnedDrop(event, '${task.id}')"
            onclick="openTaskModal('${task.id}')">
            <div class="pinned-task-card-top">
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                    <button onclick="event.stopPropagation();toggleTaskCompletion('${task.id}')"
                        class="pinned-task-checkbox"
                        title="Mark complete">
                    </button>
                    <div style="width:7px;height:7px;border-radius:50%;background:${catColor};flex-shrink:0"></div>
                    <span style="font-size:10px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat ? escapeHtml(cat.name) : 'No category'}</span>
                </div>
                <div class="flex items-center gap-0.5">
                    <i class="fas fa-grip-vertical pinned-drag-handle"></i>
                    <button onclick="event.stopPropagation();togglePinTask('${task.id}')"
                        style="flex-shrink:0;width:24px;height:24px;border-radius:50%;border:none;background:none;color:var(--accent);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px"
                        title="Unpin">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                </div>
            </div>
            <p class="pinned-task-card-title">${escapeHtml(task.title)}</p>
            ${due ? `<p style="font-size:10px;margin-top:auto;padding-top:6px;color:${isOverdue ? 'var(--danger)' : 'var(--text-secondary)'}">
                <i class="fas fa-clock" style="margin-right:3px;opacity:0.7"></i>${due}
            </p>` : ''}
        </div>`;
    }).join('');

    section.innerHTML = `
        <div class="flex items-center gap-2 mb-3 mt-5" style="padding:0 2px">
            <i class="fas fa-thumbtack" style="font-size:11px;color:var(--accent)"></i>
            <span style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:var(--text-secondary);text-transform:uppercase">Pinned Tasks</span>
            <span style="font-size:11px;color:var(--text-secondary);opacity:0.6">(${pinned.length})</span>
        </div>
        <div class="pinned-tasks-grid">${cards}</div>
    `;
}

// ============================================
// MODAL
// ============================================
function openNoteModal(noteId = null) {
    editingNoteId = noteId || null;
    const modal = document.getElementById('note-modal');
    const title = document.getElementById('note-modal-title');
    const content = document.getElementById('note-content');
    const deleteBtn = document.getElementById('delete-note-btn');

    if (noteId) {
        const notes = loadNotes();
        const note = notes.find(n => n.id === noteId);
        if (!note) return;
        title.textContent = 'Edit Note';
        content.value = note.content;
        selectedNoteColor = note.color || '#FEF08A';
        deleteBtn.classList.remove('hidden');
    } else {
        title.textContent = 'Add Note';
        content.value = '';
        selectedNoteColor = '#FEF08A';
        deleteBtn.classList.add('hidden');
    }

    updateColorPicker(selectedNoteColor);
    modal.classList.remove('hidden');
    setTimeout(() => content.focus(), 100);
}

function closeNoteModal() {
    document.getElementById('note-modal').classList.add('hidden');
    editingNoteId = null;
}

function selectNoteColor(color) {
    selectedNoteColor = color;
    updateColorPicker(color);
}

function updateColorPicker(activeColor) {
    document.querySelectorAll('.note-color-btn').forEach(btn => {
        const isActive = btn.dataset.color === activeColor;
        btn.style.outline = isActive ? '3px solid var(--accent)' : '2px solid transparent';
        btn.style.outlineOffset = '2px';
        btn.style.transform = isActive ? 'scale(1.2)' : 'scale(1)';
    });
}

function saveNote() {
    const content = document.getElementById('note-content').value.trim();
    if (!content) {
        showToast('Please write something first', 'error');
        return;
    }

    const notes = loadNotes();
    let savedNote;

    if (editingNoteId) {
        const idx = notes.findIndex(n => n.id === editingNoteId);
        if (idx !== -1) {
            notes[idx].content = content;
            notes[idx].color = selectedNoteColor;
            notes[idx].updatedAt = new Date().toISOString();
            savedNote = notes[idx];
        }
    } else {
        savedNote = {
            id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            content,
            color: selectedNoteColor,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        notes.unshift(savedNote);
    }

    // Save locally first (instant), then mirror to Supabase
    saveNotesLocal(notes);
    if (savedNote) saveNoteToSupabase(savedNote);

    closeNoteModal();
    renderBoardNotes();
    showToast(editingNoteId ? 'Note updated' : 'Note added', 'success');
}

function deleteNote() {
    if (!editingNoteId) return;
    deleteNoteById(editingNoteId);
    closeNoteModal();
}

function deleteNoteById(noteId) {
    const notes = loadNotes().filter(n => n.id !== noteId);
    // Save locally first (instant), then mirror to Supabase
    saveNotesLocal(notes);
    deleteNoteFromSupabase(noteId);
    renderBoardNotes();
    showToast('Note deleted', 'success');
}
