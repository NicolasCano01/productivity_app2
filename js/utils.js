// ============================================
// PRODUCTIVITY HUB - UTILITY FUNCTIONS
// ============================================

// Get current date/time in Melbourne timezone
function getMelbourneDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
}

// Get today's date in Melbourne timezone (YYYY-MM-DD format)
function getMelbourneDateString() {
    const d = getMelbourneDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Update connection status indicator
function updateConnectionStatus(connected, errorMsg = '') {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (connected) {
        statusDot.className = 'w-2 h-2 rounded-full bg-success';
        statusText.textContent = 'Connected';
    } else {
        statusDot.className = 'w-2 h-2 rounded-full bg-danger';
        statusText.textContent = errorMsg ? 'Error' : 'Disconnected';
        if (errorMsg) {
            console.error('Connection error:', errorMsg);
        }
    }
}

// Switch between panels
function switchPanel(panelName) {
    // Hide all panels
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => panel.classList.add('hidden'));
    
    // Show selected panel
    const targetPanel = document.getElementById(`${panelName}-panel`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
    }
    
    // Update navigation buttons
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        if (btn.dataset.panel === panelName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update current panel
    currentPanel = panelName;
    
    // Render panel content if needed
    if (panelName === 'tasks') {
        renderTasks();
    } else if (panelName === 'analytics') {
        renderAnalytics();
    } else if (panelName === 'calendar') {
        renderCalendar();
    } else if (panelName === 'board') {
        if (typeof renderBoard === 'function') renderBoard();
    }

    // Show/hide AI chat FAB on Calendar & Analytics panels only
    const fab = document.getElementById('ai-chat-fab');
    if (fab) {
        if (panelName === 'calendar' || panelName === 'analytics') {
            fab.classList.remove('hidden');
        } else {
            fab.classList.add('hidden');
        }
    }
    
    console.log(`Switched to ${panelName} panel`);
}

// Show toast notification
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Show toast with undo option
function showUndoToast(message, onUndo, duration = 4500) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let undoClicked = false;
    
    toast.className = 'toast success';
    toast.innerHTML = `
        <div class="flex items-center justify-between gap-3 w-full">
            <div class="flex items-center gap-2">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
            <button class="undo-btn" style="
                background: rgba(255,255,255,0.3);
                border: none;
                padding: 4px 12px;
                border-radius: 6px;
                color: white;
                font-weight: 600;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.2s;
            ">UNDO</button>
        </div>
    `;
    
    const undoBtn = toast.querySelector('.undo-btn');
    undoBtn.addEventListener('mouseenter', () => {
        undoBtn.style.background = 'rgba(255,255,255,0.4)';
    });
    undoBtn.addEventListener('mouseleave', () => {
        undoBtn.style.background = 'rgba(255,255,255,0.3)';
    });
    
    undoBtn.addEventListener('click', () => {
        undoClicked = true;
        clearTimeout(autoRemoveTimeout);
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => {
            toast.remove();
            onUndo();
            showToast('Action undone', 'success');
        }, 300);
    });
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after duration
    const autoRemoveTimeout = setTimeout(() => {
        if (!undoClicked) {
            toast.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// Hide loading screen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.style.display = 'none';
    
    // Show the first panel (calendar)
    switchPanel('calendar');
    
    // Update current date display
    updateCurrentDate();
}

// Update current date display
function updateCurrentDate() {
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const today = getMelbourneDate();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = today.toLocaleDateString('en-US', options);
    }
}

// Close modal on backdrop click
function closeModalOnBackdrop(event, modalId) {
    if (event.target.id === modalId) {
        if (modalId === 'habit-modal') {
            closeHabitModal();
        } else if (modalId === 'task-modal') {
            closeTaskModal();
        } else if (modalId === 'goal-modal') {
            closeGoalModal();
        } else if (modalId === 'note-modal') {
            closeNoteModal();
        } else if (modalId === 'backup-modal') {
            closeBackupModal();
        }
    }
}

// Populate filter dropdowns with categories and goals
function populateFilterDropdowns() {
    // Populate category filter
    const categoryFilter = document.getElementById('filter-category');
    const taskCategory = document.getElementById('task-category');
    
    if (categoryFilter && taskCategory) {
        // Sort by user_order to match panel display
        const sortedCategories = [...appState.categories].sort((a, b) => 
            (a.user_order || 0) - (b.user_order || 0)
        );
        
        const categoryOptions = sortedCategories.map(cat => 
            `<option value="${cat.id}">${cat.name}</option>`
        ).join('');
        
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + categoryOptions;
        taskCategory.innerHTML = '<option value="">No category</option>' + categoryOptions;
    }
    
    // Populate goal filter
    const goalFilter = document.getElementById('filter-goal');
    const taskGoal = document.getElementById('task-goal');
    
    if (goalFilter && taskGoal) {
        // Sort by user_order to match panel display, only show active goals
        const sortedGoals = [...appState.goals]
            .filter(g => g.status === 'active')
            .sort((a, b) => (a.user_order || 0) - (b.user_order || 0));
        
        const goalOptions = sortedGoals.map(goal => 
            `<option value="${goal.id}">${goal.name}</option>`
        ).join('');
        
        goalFilter.innerHTML = '<option value="">All Goals</option>' + goalOptions;
        taskGoal.innerHTML = '<option value="">No goal</option>' + goalOptions;
    }
}

// Dark mode toggle (persisted to localStorage)
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    const icon = document.getElementById('dark-mode-icon');
    if (icon) icon.className = isDark ? 'fas fa-sun text-xl' : 'fas fa-moon text-xl';
}

// Restore dark mode on load
function initDarkMode() {
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark');
        const icon = document.getElementById('dark-mode-icon');
        if (icon) icon.className = 'fas fa-sun text-xl';
    }
}

// Get current Mon-Sun week range in Melbourne timezone
// Returns {start: Date (Monday 00:00:00), end: Date (Sunday 23:59:59)}
function getMelbourneWeekRange() {
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // Days since Monday: Sun(0)->6, Mon(1)->0, Tue(2)->1, ..., Sat(6)->5
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    const start = new Date(today);
    start.setDate(today.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
