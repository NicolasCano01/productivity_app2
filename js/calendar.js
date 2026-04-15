// ============================================
// PRODUCTIVITY HUB - CALENDAR PANEL (Things 3 style)
// ============================================

let currentCalendarDate = null;
let selectedDate = null;
let calendarViewMode = 'upcoming'; // 'upcoming' | 'month'

// Initialize calendar when panel is shown
function initCalendar() {
    currentCalendarDate = getMelbourneDate();
    selectedDate = getMelbourneDateString();
    renderCalendar();
}

// ============================================
// MAIN RENDER — dispatches to view mode
// ============================================
function renderCalendar() {
    const calendarView = document.getElementById('calendar-view');
    if (!calendarView) return;
    if (!currentCalendarDate) currentCalendarDate = getMelbourneDate();

    calendarView.innerHTML = buildCalendarHTML();
    // After rendering, scroll the date strip to today
    scrollDateStripToSelected();

    // Load AI insights asynchronously (non-blocking)
    if (calendarViewMode === 'upcoming' && typeof loadCalendarInsights === 'function') {
        setTimeout(() => loadCalendarInsights(), 200);
    }
}

function buildCalendarHTML() {
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateForDB(today);
    if (!selectedDate) selectedDate = todayStr;

    const viewToggleLabel = calendarViewMode === 'upcoming' ? 'Month View' : 'Upcoming';
    const viewToggleIcon = calendarViewMode === 'upcoming' ? 'fas fa-calendar-alt' : 'fas fa-list';

    let html = `
        <!-- Header -->
        <div class="flex items-center justify-between mb-3">
            <h2 class="text-xl font-bold" style="color:var(--text-primary)">Upcoming</h2>
            <button onclick="toggleCalendarViewMode()" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold" style="background:var(--bg-secondary);color:var(--text-secondary)">
                <i class="${viewToggleIcon}"></i>
                <span>${viewToggleLabel}</span>
            </button>
        </div>
    `;

    if (calendarViewMode === 'month') {
        html += buildMonthView(today, todayStr);
    } else {
        html += buildUpcomingView(today, todayStr);
    }

    return html;
}

// ============================================
// UPCOMING VIEW (Things 3 style)
// ============================================
function buildUpcomingView(today, todayStr) {
    // Build horizontal date strip (current Mon-Sun week, 7 pills)
    const { start: weekMonday } = getMelbourneWeekRange();
    const stripStart = new Date(weekMonday);

    let stripHtml = '<div id="date-strip-scroll" class="overflow-x-auto pb-2 mb-4" style="-webkit-overflow-scrolling:touch;scrollbar-width:none">';
    stripHtml += '<div id="date-strip" class="flex gap-2" style="min-width:max-content;padding:4px 2px">';

    for (let i = 0; i < 7; i++) {
        const d = new Date(stripStart);
        d.setDate(d.getDate() + i);
        const dStr = formatDateForDB(d);
        const isSelected = dStr === selectedDate;
        const isToday = dStr === todayStr;
        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dayLabel = isToday ? 'Today' : dayNames[d.getDay()];

        // Check for activity on this date
        const activities = getDateActivities(dStr);
        const hasActivity = activities.habits > 0 || activities.tasks > 0 || activities.goals > 0;

        const dotHtml = hasActivity ? `<div class="flex gap-0.5 justify-center mt-1">
            ${activities.tasks > 0 ? '<div style="width:4px;height:4px;border-radius:50%;background:var(--accent)"></div>' : ''}
            ${activities.habits > 0 ? '<div style="width:4px;height:4px;border-radius:50%;background:var(--success)"></div>' : ''}
        </div>` : '<div style="height:9px"></div>';

        if (isSelected) {
            stripHtml += `
                <button id="strip-${dStr}" onclick="selectCalendarDate('${dStr}')" class="date-pill selected flex flex-col items-center" style="min-width:52px;padding:8px 10px;border-radius:14px;background:var(--accent);color:#fff;border:none;cursor:pointer">
                    <span style="font-size:10px;font-weight:600;opacity:0.85">${dayLabel}</span>
                    <span style="font-size:20px;font-weight:800;line-height:1.1">${d.getDate()}</span>
                    ${dotHtml}
                </button>`;
        } else {
            stripHtml += `
                <button id="strip-${dStr}" onclick="selectCalendarDate('${dStr}')" class="date-pill flex flex-col items-center" style="min-width:52px;padding:8px 10px;border-radius:14px;background:var(--bg-secondary);color:var(--text-primary);border:none;cursor:pointer">
                    <span style="font-size:10px;font-weight:600;color:var(--text-secondary)">${dayLabel}</span>
                    <span style="font-size:20px;font-weight:800;line-height:1.1">${d.getDate()}</span>
                    ${dotHtml}
                </button>`;
        }
    }
    stripHtml += '</div></div>';

    // AI Insights placeholder (loaded async after render)
    const aiInsightsHtml = '<div id="calendar-ai-insights"></div>';

    // Task list — grouped by date section, all upcoming tasks
    const taskListHtml = buildUpcomingTaskList(today, todayStr);

    return stripHtml + aiInsightsHtml + taskListHtml;
}

function buildUpcomingTaskList(today, todayStr) {
    // Gather non-deleted, non-completed tasks WITH a due date only
    const activeTasks = appState.tasks.filter(t =>
        t.status !== 'deleted' && !t.is_completed && t.due_date
    );

    // Group: overdue, byDate (future + today)
    const overdue = [];
    const byDate = {}; // dateStr -> []

    activeTasks.forEach(t => {
        const due = new Date(t.due_date + 'T00:00:00');
        due.setHours(0, 0, 0, 0);
        if (due < today) {
            overdue.push(t);
        } else {
            if (!byDate[t.due_date]) byDate[t.due_date] = [];
            byDate[t.due_date].push(t);
        }
    });

    let html = '<div class="upcoming-task-list" style="overflow-y:auto">';

    // Overdue section — collapsed by default
    if (overdue.length > 0) {
        html += buildDateSection('overdue', overdue, 'OVERDUE', true, false, true);
    }

    // Sort future date keys chronologically
    const futureDates = Object.keys(byDate).sort();
    futureDates.forEach(dStr => {
        const tasks = byDate[dStr];
        const label = getUpcomingDateLabel(dStr, todayStr, today);
        // Selected date expanded, all others expanded too (user can collapse)
        html += buildDateSection(dStr, tasks, label, false, false, false);
    });

    if (overdue.length === 0 && futureDates.length === 0) {
        html += `<div class="text-center py-12" style="color:var(--text-secondary)">
            <i class="fas fa-check-circle text-4xl mb-3" style="color:var(--success)"></i>
            <p class="font-semibold">All clear!</p>
            <p class="text-sm mt-1">No upcoming tasks</p>
        </div>`;
    }

    html += '</div>';
    return html;
}

function buildDateSection(sectionId, tasks, label, isOverdue, isSomeday = false, collapsed = false) {
    const headerColor = isOverdue ? 'var(--danger)' : 'var(--text-secondary)';
    const isScrollTarget = sectionId === selectedDate;
    const chevronIcon = collapsed ? 'fa-chevron-right' : 'fa-chevron-down';

    let html = `
        <div id="section-${sectionId}" class="mb-5 ${isScrollTarget ? 'scroll-target' : ''}">
            <div class="flex items-center gap-2 mb-2" style="padding:0 2px;cursor:pointer" onclick="toggleCalendarSection('${sectionId}')">
                <i id="section-icon-${sectionId}" class="fas ${chevronIcon} text-xs" style="color:var(--text-secondary);transition:transform 0.2s"></i>
                ${isOverdue ? '<i class="fas fa-exclamation-circle text-xs" style="color:var(--danger)"></i>' : ''}
                <span style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:${headerColor};text-transform:uppercase">${label}</span>
                <span style="font-size:11px;color:var(--text-secondary);opacity:0.6">(${tasks.length})</span>
            </div>
            <div id="section-body-${sectionId}" class="space-y-2 ${collapsed ? 'hidden' : ''}">
    `;

    tasks.forEach(task => {
        html += renderUpcomingTaskCard(task, isOverdue);
    });

    html += '</div></div>';
    return html;
}

// Toggle collapse/expand of a calendar date section
function toggleCalendarSection(sectionId) {
    const body = document.getElementById(`section-body-${sectionId}`);
    const icon = document.getElementById(`section-icon-${sectionId}`);
    if (!body) return;
    const isNowHidden = body.classList.toggle('hidden');
    if (icon) {
        icon.className = `fas fa-chevron-${isNowHidden ? 'right' : 'down'} text-xs`;
        icon.style.color = 'var(--text-secondary)';
        icon.style.transition = 'transform 0.2s';
    }
}

function renderUpcomingTaskCard(task, isOverdue = false) {
    const categoryColor = task.category?.color_hex || '#6B7280';
    const dueDateText = formatDueDate(task.due_date);
    const severity = isOverdue ? getOverdueSeverity(task.due_date) : null;

    return `
        <div class="task-card" style="cursor:pointer" onclick="openTaskModal('${task.id}')">
            <div class="flex items-center gap-3">
                <div class="task-checkbox ${task.is_completed ? 'checked' : ''}"
                     onclick="event.stopPropagation();toggleTaskCompletion('${task.id}')"></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        ${task.category ? `<div class="category-dot" style="background-color:${categoryColor};flex-shrink:0"></div>` : ''}
                        <span class="font-semibold flex-1 truncate" style="font-size:15px;color:var(--text-primary);${task.is_completed ? 'text-decoration:line-through;opacity:0.5' : ''}">${escapeHtml(task.title)}</span>
                        ${severity ? `<span class="overdue-badge overdue-${severity}">OVERDUE</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap" style="font-size:11px;color:var(--text-secondary)">
                        ${task.category ? `<span>${task.category.name}</span>` : ''}
                        ${task.category && task.due_date ? '<span style="opacity:0.4">·</span>' : ''}
                        ${task.due_date ? `<span style="color:${isOverdue ? 'var(--danger)' : 'var(--text-secondary)'};${severity ? 'font-weight:600' : ''}">${dueDateText}</span>` : ''}
                    </div>
                </div>
                <!-- Quick-delete button (same pattern as tasks panel) -->
                <button onclick="event.stopPropagation();deleteTaskFromCalendar('${task.id}')"
                    style="width:28px;height:28px;border-radius:50%;border:none;background:none;color:var(--text-secondary);opacity:0.4;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:opacity 0.15s,color 0.15s"
                    onmouseover="this.style.opacity='1';this.style.color='var(--danger)'"
                    onmouseout="this.style.opacity='0.4';this.style.color='var(--text-secondary)'"
                    title="Delete task">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `;
}

function deleteTaskFromCalendar(taskId) {
    if (typeof deleteTask === 'function') {
        deleteTask(taskId);
    }
}

function getUpcomingDateLabel(dStr, todayStr, today) {
    const d = new Date(dStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));

    if (dStr === todayStr) return 'TODAY';
    if (diffDays === 1) return 'TOMORROW';

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (diffDays <= 6) return dayNames[d.getDay()].toUpperCase();
    return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`.toUpperCase();
}

// ============================================
// MONTH VIEW (compact grid)
// ============================================
function buildMonthView(today, todayStr) {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const adjustedStartDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

    let html = `
        <div class="flex items-center justify-between mb-3">
            <button onclick="previousMonth()" style="width:32px;height:32px;border-radius:50%;border:none;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:14px">
                <i class="fas fa-chevron-left"></i>
            </button>
            <span class="font-bold" style="color:var(--text-primary)">${monthNames[month]} ${year}</span>
            <button onclick="nextMonth()" style="width:32px;height:32px;border-radius:50%;border:none;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:14px">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>

        <div class="rounded-xl overflow-hidden mb-4" style="background:var(--bg-secondary)">
            <div class="grid grid-cols-7 text-center" style="padding:8px 0 4px">
                ${['M','T','W','T','F','S','S'].map(d =>
                    `<div style="font-size:11px;font-weight:600;color:var(--text-secondary)">${d}</div>`
                ).join('')}
            </div>
            <div class="grid grid-cols-7">
    `;

    for (let i = 0; i < adjustedStartDay; i++) {
        html += `<div style="height:36px"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dStr = formatDateForDB(d);
        const isToday = dStr === todayStr;
        const isSelected = dStr === selectedDate;
        const isPast = d < today;

        // Dot rule:
        //  - Past days  → only show dot if a task was completed on that day
        //  - Today/future → show dot if any non-deleted task is due that day
        const hasDot = isPast
            ? wasTaskCompletedOn(dStr)
            : appState.tasks.some(t =>
                t.status !== 'deleted' && t.due_date === dStr && !t.is_completed
              );

        let cellStyle = 'height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;';
        let numStyle = 'font-size:13px;font-weight:600;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;';

        if (isToday) numStyle += 'background:var(--accent);color:#fff;';
        else if (isSelected) numStyle += 'background:var(--bg-tertiary);color:var(--text-primary);';
        else if (isPast) numStyle += 'color:var(--text-secondary);opacity:0.5;';
        else numStyle += 'color:var(--text-primary);';

        html += `<div style="${cellStyle}" onclick="selectCalendarDate('${dStr}')">
            <div style="${numStyle}">${day}</div>
            ${hasDot ? `<div style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent)"></div>` : ''}
        </div>`;
    }

    const totalCells = adjustedStartDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remaining; i++) {
        html += `<div style="height:36px"></div>`;
    }

    html += `</div></div>`;

    // Detail panel for selected date
    html += `<div id="calendar-task-list" style="margin-top:8px">`;
    if (selectedDate) {
        const dateDisplay = formatDateForDisplay(selectedDate);
        const contentHtml = buildDateDetailsContent(selectedDate);
        html += `<div style="border-top:1px solid var(--border);padding-top:12px">
            <h4 style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${dateDisplay}</h4>
            ${contentHtml}
        </div>`;
    } else {
        html += `<div class="text-center py-6" style="color:var(--text-secondary);font-size:13px">Tap a date to see details</div>`;
    }
    html += `</div>`;

    return html;
}

// ============================================
// USER INTERACTIONS
// ============================================

function toggleCalendarViewMode() {
    calendarViewMode = calendarViewMode === 'upcoming' ? 'month' : 'upcoming';
    renderCalendar();
}

function selectCalendarDate(dateStr) {
    selectedDate = dateStr;

    if (calendarViewMode === 'upcoming') {
        renderCalendar();
        setTimeout(() => {
            // Ensure the selected section is expanded, then scroll to it
            const body = document.getElementById(`section-body-${dateStr}`);
            const icon = document.getElementById(`section-icon-${dateStr}`);
            if (body && body.classList.contains('hidden')) {
                body.classList.remove('hidden');
                if (icon) icon.className = 'fas fa-chevron-down text-xs';
            }
            scrollToDateSection(dateStr);
            scrollDateStripToSelected();
        }, 50);
    } else {
        renderCalendar();
    }
}

function scrollToDateSection(dateStr) {
    // Try exact date section first, fall back to overdue/someday
    const section = document.getElementById(`section-${dateStr}`);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function scrollDateStripToSelected() {
    if (!selectedDate) return;
    const pill = document.getElementById(`strip-${selectedDate}`);
    if (pill) {
        pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

// Navigation functions (used in month view)
function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

function jumpToToday() {
    currentCalendarDate = getMelbourneDate();
    selectedDate = getMelbourneDateString();
    renderCalendar();
}

// ============================================
// DATE DETAIL HELPERS
// ============================================

function getDateActivities(dateStr) {
    const activities = { habits: 0, tasks: 0, goals: 0 };
    activities.habits = appState.habitCompletions.filter(c => c.completion_date === dateStr).length;
    activities.tasks = appState.tasks.filter(t =>
        t.status !== 'deleted' && t.due_date === dateStr && !t.is_completed
    ).length;
    activities.goals = appState.goals.filter(g => g.due_date === dateStr && g.status === 'active').length;
    return activities;
}

// Returns true if any task was *completed* on the given dateStr (Melbourne TZ)
function wasTaskCompletedOn(dateStr) {
    return appState.tasks.some(t => {
        if (t.status === 'deleted' || !t.is_completed || !t.completed_at) return false;
        const completedDate = new Date(t.completed_at)
            .toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
        return completedDate === dateStr;
    });
}

function formatDateForDB(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildDateDetailsContent(dateStr) {
    const habitCompletions = appState.habitCompletions.filter(c => c.completion_date === dateStr);
    const tasksOnDate = appState.tasks.filter(t =>
        t.status !== 'deleted' && t.due_date === dateStr
    );
    const goalsOnDate = appState.goals.filter(g => g.due_date === dateStr && g.status === 'active');

    let habitsHtml = '';
    if (habitCompletions.length > 0) {
        const items = habitCompletions.map(c => {
            const habit = appState.habits.find(h => h.id === c.habit_id);
            return habit ? `<div class="flex items-center gap-2 py-1.5">
                <i class="fas fa-check-circle text-sm" style="color:var(--success)"></i>
                ${habit.emoji ? `<span class="text-lg">${habit.emoji}</span>` : ''}
                <span style="font-size:13px;color:var(--text-primary)">${escapeHtml(habit.name)}</span>
            </div>` : '';
        }).filter(Boolean).join('');
        habitsHtml = `<div class="mb-3">
            <h4 class="flex items-center gap-1.5 mb-2" style="font-size:12px;font-weight:700;color:var(--text-secondary)">
                <div style="width:8px;height:8px;border-radius:50%;background:var(--success)"></div>
                HABITS COMPLETED (${habitCompletions.length})
            </h4>${items}</div>`;
    }

    let tasksHtml = '';
    if (tasksOnDate.length > 0) {
        const items = tasksOnDate.map(task => {
            const cat = appState.categories.find(c => c.id === task.category_id);
            const catColor = cat ? cat.color_hex : '#6B7280';
            return `<div class="flex items-center gap-2 py-1.5 rounded-lg px-2 -mx-2" style="cursor:pointer" onclick="event.stopPropagation();openTaskFromCalendar('${task.id}')">
                <i class="fas fa-${task.is_completed ? 'check-circle' : 'circle'} text-sm" style="color:${task.is_completed ? 'var(--success)' : 'var(--border)'}"></i>
                <span class="flex-1 text-sm ${task.is_completed ? 'line-through' : ''}" style="color:${task.is_completed ? 'var(--text-secondary)' : 'var(--text-primary)'}">${escapeHtml(task.title)}</span>
                ${cat ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${catColor}20;color:${catColor}">${cat.name}</span>` : ''}
            </div>`;
        }).join('');
        tasksHtml = `<div class="mb-3">
            <h4 class="flex items-center gap-1.5 mb-2" style="font-size:12px;font-weight:700;color:var(--text-secondary)">
                <div style="width:8px;height:8px;border-radius:50%;background:#A855F7"></div>
                TASKS (${tasksOnDate.filter(t=>!t.is_completed).length}/${tasksOnDate.length})
            </h4>${items}</div>`;
    }

    let goalsHtml = '';
    if (goalsOnDate.length > 0) {
        const items = goalsOnDate.map(goal => `
            <div class="flex items-center gap-2 py-1.5 rounded-lg px-2 -mx-2" style="cursor:pointer" onclick="event.stopPropagation();openGoalFromCalendar('${goal.id}')">
                ${goal.emoji ? `<span class="text-lg">${goal.emoji}</span>` : `<i class="fas fa-bullseye text-sm" style="color:var(--accent)"></i>`}
                <span class="flex-1 text-sm font-medium" style="color:var(--text-primary)">${escapeHtml(goal.name)}</span>
            </div>`).join('');
        goalsHtml = `<div class="mb-3">
            <h4 class="flex items-center gap-1.5 mb-2" style="font-size:12px;font-weight:700;color:var(--text-secondary)">
                <div style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></div>
                GOAL DEADLINES (${goalsOnDate.length})
            </h4>${items}</div>`;
    }

    const hasAny = habitCompletions.length > 0 || tasksOnDate.length > 0 || goalsOnDate.length > 0;
    return hasAny ? (habitsHtml + tasksHtml + goalsHtml) : `
        <div class="text-center py-6" style="color:var(--text-secondary)">
            <i class="fas fa-calendar-day text-3xl mb-2"></i>
            <p style="font-size:13px">No activity on this date</p>
        </div>`;
}

// ============================================
// CROSS-PANEL NAVIGATION (calendar → task/goal)
// ============================================

function openDateDetailsModal(dateStr) {
    selectedDate = dateStr;
    const modal = document.getElementById('calendar-detail-modal');
    if (!modal) return;
    document.getElementById('calendar-detail-date').textContent = formatDateForDisplay(dateStr);
    document.getElementById('calendar-detail-content').innerHTML = buildDateDetailsContent(dateStr);
    modal.classList.remove('hidden');
}

function closeCalendarDetailModal() {
    const modal = document.getElementById('calendar-detail-modal');
    if (modal) modal.classList.add('hidden');
    selectedDate = null;
}

function openTaskFromCalendar(taskId) {
    closeCalendarDetailModal();
    window.pendingTaskId = taskId;
    switchPanel('tasks');
    let attempts = 0;
    const check = setInterval(() => {
        attempts++;
        if (typeof openTaskModal === 'function' && document.getElementById('tasks-panel') && !document.getElementById('tasks-panel').classList.contains('hidden')) {
            clearInterval(check);
            openTaskModal(window.pendingTaskId);
            window.pendingTaskId = null;
        } else if (attempts > 10) clearInterval(check);
    }, 100);
}

function openGoalFromCalendar(goalId) {
    closeCalendarDetailModal();
    window.pendingGoalId = goalId;
    switchPanel('goals');
    let attempts = 0;
    const check = setInterval(() => {
        attempts++;
        if (typeof openGoalModal === 'function' && document.getElementById('goals-panel') && !document.getElementById('goals-panel').classList.contains('hidden')) {
            clearInterval(check);
            openGoalModal(window.pendingGoalId);
            window.pendingGoalId = null;
        } else if (attempts > 10) clearInterval(check);
    }, 100);
}
