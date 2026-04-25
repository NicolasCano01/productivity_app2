// ============================================
// PRODUCTIVITY HUB - CORK BOARD (Quick Notes)
// ============================================

const NOTES_STORAGE_KEY = 'productivityHub_notes';
let editingNoteId = null;
let selectedNoteColor = '#FEF08A'; // default yellow

// ============================================
// STORAGE HELPERS
// ============================================
function loadNotes() {
    try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveNotes(notes) {
    try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
        console.warn('Failed to save notes:', e);
    }
}

// ============================================
// RENDER
// ============================================
function renderBoard() {
    renderBoardNotes();
    renderBoardPinned();
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
    const isDark = document.body.classList.contains('dark');
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
            <div class="note-card pinned-note" style="background:var(--bg-secondary);border:1px solid var(--border)"
                onclick="openTaskModal('${task.id}')">
                <div class="note-card-body">
                    <div class="flex items-center gap-1.5 mb-1">
                        <div style="width:7px;height:7px;border-radius:50%;background:${catColor};flex-shrink:0"></div>
                        <span style="font-size:10px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.3px">${cat ? escapeHtml(cat.name) : 'Task'}</span>
                    </div>
                    <p class="note-card-text" style="color:var(--text-primary)">${escapeHtml(task.title)}</p>
                </div>
                <div class="note-card-footer" style="color:var(--text-secondary)">
                    ${due ? `<span style="font-size:10px;color:${isOverdue ? 'var(--danger)' : 'var(--text-secondary)'}">${due}</span>` : '<span></span>'}
                    <button onclick="event.stopPropagation();toggleTaskCompletion('${task.id}')"
                        style="background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--success);font-size:11px"
                        title="Mark complete">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    section.innerHTML = `
        <div class="flex items-center gap-2 mb-3 mt-5" style="padding:0 2px">
            <i class="fas fa-thumbtack" style="font-size:11px;color:var(--accent)"></i>
            <span style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:var(--text-secondary);text-transform:uppercase">Pinned Tasks</span>
            <span style="font-size:11px;color:var(--text-secondary);opacity:0.6">(${pinned.length})</span>
        </div>
        <div class="board-notes-grid">${cards}</div>
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

    if (editingNoteId) {
        const idx = notes.findIndex(n => n.id === editingNoteId);
        if (idx !== -1) {
            notes[idx].content = content;
            notes[idx].color = selectedNoteColor;
            notes[idx].updatedAt = new Date().toISOString();
        }
    } else {
        notes.unshift({
            id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            content,
            color: selectedNoteColor,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    saveNotes(notes);
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
    saveNotes(notes);
    renderBoardNotes();
    showToast('Note deleted', 'success');
}
