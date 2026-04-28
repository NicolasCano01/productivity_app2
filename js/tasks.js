// ============================================
// PRODUCTIVITY HUB - TASKS PANEL (ENHANCED)
// ============================================

// Multi-category state for the task modal
let selectedCategoryIds = new Set();

// Switch task view (All/Overdue/Upcoming/Completed/Deleted)
function switchTaskView(view) {
    currentTaskView = view;
    
    // Update button states
    document.querySelectorAll('[data-view]').forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    renderTasks();
}

// Get filtered tasks based on current view and filters
function getFilteredTasks() {
    let filtered = [...appState.tasks];
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    
    // Apply view filter
    if (currentTaskView === 'deleted') {
        filtered = filtered.filter(task => task.status === 'deleted' && task.deleted_at);
    } else if (currentTaskView === 'overdue') {
        filtered = filtered.filter(task => {
            if (task.status === 'deleted') return false;
            if (task.is_completed || !task.due_date) return false;
            const dueDate = new Date(task.due_date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < today;
        });
    } else if (currentTaskView === 'upcoming') {
        // Include tasks with future dates OR no date (but not completed)
        filtered = filtered.filter(task => {
            if (task.status === 'deleted') return false;
            if (task.is_completed) return false;
            if (!task.due_date) return true; // Include tasks with no date
            const dueDate = new Date(task.due_date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate >= today;
        });
    } else if (currentTaskView === 'completed') {
        filtered = filtered.filter(task => task.status !== 'deleted' && task.is_completed);
    } else {
        // All - show only active (not completed, not deleted)
        filtered = filtered.filter(task => task.status !== 'deleted' && !task.is_completed);
    }
    
    // Apply search filter
    const searchTerm = document.getElementById('task-search')?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(task => 
            task.title.toLowerCase().includes(searchTerm) ||
            (task.notes && task.notes.toLowerCase().includes(searchTerm))
        );
    }
    
    // Apply category filter
    const categoryId = document.getElementById('filter-category')?.value;
    if (categoryId) {
        filtered = filtered.filter(task => task.category_id === categoryId);
    }
    
    // Apply goal filter
    const goalId = document.getElementById('filter-goal')?.value;
    if (goalId) {
        filtered = filtered.filter(task => task.goal_id === goalId);
    }
    
    return filtered;
}

// Get overdue severity level
function getOverdueSeverity(dueDate) {
    if (!dueDate) return null;
    
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 7) return 'high';
    if (diffDays >= 3) return 'medium';
    if (diffDays >= 1) return 'low';
    return null;
}

// Format due date with smart text
function formatDueDate(dueDate) {
    if (!dueDate) return 'No date';
    
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    
    return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get date group for a task
function getDateGroup(task) {
    if (!task.due_date) return 'someday';
    
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.due_date);
    due.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays <= 7) return 'thisWeek';
    return 'later';
}

// Get date group label
function getDateGroupLabel(group, count) {
    const labels = {
        'overdue':  `OVERDUE (${count})`,
        'today':    `TODAY (${count})`,
        'tomorrow': `TOMORROW (${count})`,
        'thisWeek': `THIS WEEK (${count})`,
        'later':    `LATER (${count})`,
        'someday':  `SOMEDAY (${count})`
    };
    return labels[group] || `OTHER (${count})`;
}

// Group tasks by date
function groupTasksByDate(tasks) {
    const groups = {
        'overdue':  [],
        'today':    [],
        'tomorrow': [],
        'thisWeek': [],
        'later':    [],
        'someday':  []
    };
    
    tasks.forEach(task => {
        const group = getDateGroup(task);
        if (groups[group]) {
            groups[group].push(task);
        }
    });
    
    return groups;
}

// ============================================
// COLLAPSIBLE TASK GROUPS
// ============================================

// Track expanded groups — undefined/absent = collapsed (default), false = expanded
const collapsedGroups = {};

function toggleTaskGroup(groupKey) {
    // Toggle: if currently collapsed (default), expand; if expanded, collapse
    collapsedGroups[groupKey] = collapsedGroups[groupKey] === false ? true : false;
    renderTasks();
}

// ============================================
// DRAG AND DROP FOR TASKS
// ============================================

let draggedTaskId = null;
let draggedTaskGroup = null;

function handleTaskDragStart(event, taskId, dateGroup) {
    draggedTaskId = taskId;
    draggedTaskGroup = dateGroup;
    event.currentTarget.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function handleTaskDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-over');
    });
    draggedTaskId = null;
    draggedTaskGroup = null;
}

function handleTaskDragOver(event, dateGroup) {
    event.preventDefault();
    
    // Only allow drop if in the same date group
    if (draggedTaskGroup !== dateGroup) {
        event.dataTransfer.dropEffect = 'none';
        return;
    }
    
    event.dataTransfer.dropEffect = 'move';
    
    const draggedCard = document.querySelector('.dragging');
    const currentCard = event.currentTarget;
    
    if (draggedCard && currentCard !== draggedCard) {
        currentCard.classList.add('drag-over');
    }
}

function handleTaskDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function handleTaskDrop(event, targetTaskId, dateGroup) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedTaskId || draggedTaskId === targetTaskId || draggedTaskGroup !== dateGroup) {
        return;
    }
    
    const draggedIndex = appState.tasks.findIndex(t => t.id === draggedTaskId);
    const targetIndex = appState.tasks.findIndex(t => t.id === targetTaskId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Optimistic update
    const draggedTask = appState.tasks[draggedIndex];
    appState.tasks.splice(draggedIndex, 1);
    appState.tasks.splice(targetIndex, 0, draggedTask);
    
    renderTasks();
    showToast('Reordering...', 'success');
    
    // Background database update
    try {
        const updates = appState.tasks.map((task, index) => ({
            id: task.id,
            user_order: index + 1
        }));
        
        for (const update of updates) {
            await supabaseClient
                .from('tasks')
                .update({ user_order: update.user_order })
                .eq('id', update.id);
        }
        
        console.log('✅ Task order saved to database');
        
    } catch (error) {
        console.error('Error reordering tasks:', error);
        showToast('Failed to save order', 'error');
        await fetchInitialData();
        renderTasks();
    }
}

// Render tasks list with date grouping
function renderTasks() {
    const tasksList = document.getElementById('tasks-list');
    const filtered = getFilteredTasks();
    
    // Update counts
    const nonDeletedTasks = appState.tasks.filter(t => t.status !== 'deleted');
    const activeTasks = nonDeletedTasks.filter(t => !t.is_completed);
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);

    const overdueTasks = activeTasks.filter(t => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
    });
    const upcomingTasks = activeTasks.filter(t => {
        if (!t.due_date) return true; // Include no-date tasks
        const dueDate = new Date(t.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today;
    });
    const completedTasks = nonDeletedTasks.filter(t => t.is_completed);
    const deletedTasks = appState.tasks.filter(t => t.status === 'deleted' && t.deleted_at);

    document.getElementById('count-all').textContent = activeTasks.length;
    document.getElementById('count-overdue').textContent = overdueTasks.length;
    document.getElementById('count-upcoming').textContent = upcomingTasks.length;
    document.getElementById('count-completed').textContent = completedTasks.length;
    document.getElementById('count-deleted').textContent = deletedTasks.length;
    
    if (filtered.length === 0) {
        const emptyIcon = currentTaskView === 'deleted' ? 'fa-trash-alt' : 'fa-tasks';
        const emptyMsg = currentTaskView === 'all' ? 'No tasks yet. Tap + to add one!' :
                         currentTaskView === 'deleted' ? 'No deleted tasks' :
                         `No ${currentTaskView} tasks`;
        tasksList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas ${emptyIcon} text-4xl mb-2"></i>
                <p>${emptyMsg}</p>
            </div>
        `;
        return;
    }
    
    // Render with date grouping for All, Upcoming and Overdue views
    if (currentTaskView === 'all' || currentTaskView === 'upcoming' || currentTaskView === 'overdue') {
        const grouped = groupTasksByDate(filtered);
        let html = '';
        
        // Order of groups based on view
        let groupOrder;
        if (currentTaskView === 'overdue') {
            groupOrder = ['overdue'];
        } else if (currentTaskView === 'all') {
            groupOrder = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'someday'];
        } else {
            groupOrder = ['today', 'tomorrow', 'thisWeek', 'later', 'someday'];
        }
        
        groupOrder.forEach(groupKey => {
            const groupTasks = grouped[groupKey];
            if (groupTasks && groupTasks.length > 0) {
                // Default collapsed: unless explicitly set to false (expanded)
                const isCollapsed = collapsedGroups[groupKey] !== false;
                html += `
                    <div
                        class="date-group-header ${groupKey === 'someday' ? 'someday' : ''} task-group-toggle"
                        onclick="toggleTaskGroup('${groupKey}')"
                    >
                        <span>${getDateGroupLabel(groupKey, groupTasks.length)}</span>
                        <i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'} task-group-chevron"></i>
                    </div>
                    ${!isCollapsed ? `
                    <div class="space-y-2 mb-4">
                        ${groupTasks.map(task => renderTaskCard(task, groupKey)).join('')}
                    </div>` : '<div class="mb-1"></div>'}
                `;
            }
        });
        
        tasksList.innerHTML = html;
    } else if (currentTaskView === 'deleted') {
        // Sort deleted tasks by deleted_at desc (newest first)
        filtered.sort((a, b) => {
            const dateA = new Date(a.deleted_at || 0);
            const dateB = new Date(b.deleted_at || 0);
            return dateB - dateA;
        });

        // No grouping for Deleted view — flat list
        tasksList.innerHTML = `<div class="space-y-2">${filtered.map(task => renderTaskCard(task)).join('')}</div>`;
    } else {
        // Sort completed tasks by completion date (most recent first)
        if (currentTaskView === 'completed') {
            filtered.sort((a, b) => {
                const dateA = new Date(a.completed_at || 0);
                const dateB = new Date(b.completed_at || 0);
                return dateB - dateA; // Descending order (newest first)
            });
        }

        // No grouping for Completed view
        tasksList.innerHTML = `<div class="space-y-2">${filtered.map(task => renderTaskCard(task)).join('')}</div>`;
    }
}

// Render individual task card
function renderTaskCard(task, dateGroup = null) {
    const isDeleted = task.status === 'deleted';
    // Use multi-categories if available, fall back to single category
    const allCategories = (task.extraCategories && task.extraCategories.length > 0)
        ? task.extraCategories
        : (task.category ? [task.category] : []);
    const categoryColor = allCategories[0]?.color_hex || task.category?.color_hex || '#6B7280';
    const severity = isDeleted ? null : getOverdueSeverity(task.due_date);
    const dueDateText = formatDueDate(task.due_date);

    // Add drag handlers only when in grouped view (upcoming/overdue)
    const dragHandlers = dateGroup ? `
        draggable="true"
        ondragstart="handleTaskDragStart(event, '${task.id}', '${dateGroup}')"
        ondragend="handleTaskDragEnd(event)"
        ondragover="handleTaskDragOver(event, '${dateGroup}')"
        ondrop="handleTaskDrop(event, '${task.id}', '${dateGroup}')"
        ondragleave="handleTaskDragLeave(event)"
    ` : '';

    const metaParts = [];
    // Show up to 2 category names if multi-categories loaded, else just one
    if (allCategories.length > 0) {
        const catNames = allCategories.slice(0, 2).map(c => escapeHtml(c.name)).join(', ');
        const extra = allCategories.length > 2 ? ` +${allCategories.length - 2}` : '';
        metaParts.push(`<span>${catNames}${extra}</span>`);
    }
    if (task.goal) metaParts.push(`<span class="goal-link"><i class="fas fa-bullseye" style="font-size:9px"></i> ${escapeHtml(task.goal.name)}</span>`);
    if (task.due_date) {
        metaParts.push(`<span class="${severity ? 'font-semibold' : ''}" style="color:${severity ? 'var(--danger)' : 'var(--text-secondary)'}">${dueDateText}</span>`);
    }
    if (task.is_recurring) metaParts.push(`<span style="color:var(--accent)"><i class="fas fa-repeat" style="font-size:9px"></i> Recurring</span>`);
    if (isDeleted && task.deleted_at) {
        const deletedDate = new Date(task.deleted_at);
        const deletedText = deletedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        metaParts.push(`<span style="color:var(--danger)"><i class="fas fa-trash-alt" style="font-size:9px"></i> Deleted ${deletedText}</span>`);
    }
    const metaHtml = metaParts.length ? `<div class="flex items-center gap-1.5 mt-0.5 flex-wrap" style="font-size:11px;color:var(--text-secondary)">${metaParts.join('<span style="opacity:0.4">·</span>')}</div>` : '';

    // Deleted tasks: show restore button, no checkbox
    if (isDeleted) {
        return `
            <div class="task-card deleted-task">
                <div class="flex items-start gap-3">
                    <button
                        class="touch-target flex items-center justify-center rounded-full hover:bg-green-100 transition"
                        style="width:28px;height:28px;min-width:28px;color:var(--success);margin-top:2px"
                        onclick="restoreTask('${task.id}')"
                        title="Restore task"
                    >
                        <i class="fas fa-undo" style="font-size:14px"></i>
                    </button>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            ${allCategories.slice(0, 3).map(c => `<div class="category-dot" style="background-color:${c.color_hex || '#6B7280'}"></div>`).join('')}
                            <h3 class="font-semibold flex-1 truncate" style="font-size:15px;color:var(--text-secondary);text-decoration:line-through">
                                ${escapeHtml(task.title)}
                            </h3>
                        </div>
                        ${metaHtml}
                        ${task.notes ? `<p class="line-clamp-2 mt-1" style="font-size:12px;color:var(--text-secondary)">${escapeHtml(task.notes)}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    const pinIcon = task.is_pinned ? 'fas fa-thumbtack' : 'far fa-thumbtack';
    const pinColor = task.is_pinned ? 'var(--accent)' : 'var(--text-secondary)';
    const pinOpacity = task.is_pinned ? '1' : '0.35';

    return `
        <div class="task-card ${task.is_completed ? 'completed' : ''}" ${dragHandlers}>
            <div class="flex items-start gap-3">
                ${dateGroup ? '<i class="fas fa-grip-vertical text-gray-400 text-sm cursor-move mt-1" style="opacity:0.35"></i>' : ''}
                <div
                    class="task-checkbox ${task.is_completed ? 'checked' : ''}"
                    onclick="toggleTaskCompletion('${task.id}')"
                ></div>

                <div class="flex-1 min-w-0" onclick="openTaskModal('${task.id}')">
                    <div class="flex items-center gap-2">
                        ${allCategories.slice(0, 3).map(c => `<div class="category-dot" style="background-color:${c.color_hex || '#6B7280'}"></div>`).join('')}
                        <h3 class="font-semibold flex-1 truncate" style="font-size:15px;color:${task.is_completed ? 'var(--text-secondary)' : 'var(--text-primary)'};${task.is_completed ? 'text-decoration:line-through' : ''}">
                            ${escapeHtml(task.title)}
                        </h3>
                        ${severity ? `<span class="overdue-badge overdue-${severity}">OVERDUE</span>` : ''}
                    </div>
                    ${metaHtml}
                    ${task.notes ? `<p class="line-clamp-2 mt-1" style="font-size:12px;color:var(--text-secondary)">${escapeHtml(task.notes)}</p>` : ''}
                </div>

                <!-- Pin button -->
                <button onclick="event.stopPropagation();togglePinTask('${task.id}')"
                    style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:${pinColor};opacity:${pinOpacity};transition:opacity 0.15s,color 0.15s;transform:rotate(${task.is_pinned ? '0' : '-45'}deg)"
                    title="${task.is_pinned ? 'Unpin task' : 'Pin task'}">
                    <i class="fas fa-thumbtack"></i>
                </button>
            </div>
        </div>
    `;
}

async function togglePinTask(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newPinned = !task.is_pinned;
    task.is_pinned = newPinned;

    // Re-render both panels if visible
    renderTasks();
    if (typeof renderCalendar === 'function' && currentPanel === 'calendar') {
        renderCalendar();
    }

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ is_pinned: newPinned })
            .eq('id', taskId);
        if (error) throw error;
    } catch (err) {
        console.error('Error toggling pin:', err);
        task.is_pinned = !newPinned; // revert
        renderTasks();
    }
}

// Filter tasks (called from search/filter inputs)
function filterTasks() {
    renderTasks();
}

// Toggle task completion with undo option
async function toggleTaskCompletion(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const wasCompleted = task.is_completed;
    const previousCompletedAt = task.completed_at;
    
    // Optimistic update
    task.is_completed = !task.is_completed;
    task.completed_at = task.is_completed ? new Date().toISOString() : null;
    renderTasks();

    // Invalidate AI insights cache so next calendar load shows fresh data
    if (typeof invalidateAIInsightsCache === 'function') invalidateAIInsightsCache();

    if (task.is_completed) {
        // For recurring tasks: create the next occurrence
        if (task.is_recurring) {
            setTimeout(() => createNextRecurrence(task), 600);
        }

        // Check if linked goal just reached 100%
        if (task.goal_id) {
            const linkedGoal = appState.goals.find(g => g.id === task.goal_id && g.status === 'active');
            if (linkedGoal && typeof calculateGoalProgress === 'function') {
                const progress = calculateGoalProgress(linkedGoal.id);
                if (progress >= 100) {
                    // silent=false → user-triggered, show undo toast for goal completion
                    setTimeout(() => markGoalComplete(linkedGoal.id, false), 800);
                }
            }
        }

        // Show undo toast for completion
        showUndoToast('Task completed', async () => {
            // Undo function
            task.is_completed = wasCompleted;
            task.completed_at = previousCompletedAt;
            renderTasks();
            
            try {
                const { error } = await supabaseClient
                    .from('tasks')
                    .update({
                        is_completed: wasCompleted,
                        completed_at: previousCompletedAt
                    })
                    .eq('id', taskId);
                
                if (error) throw error;
            } catch (error) {
                console.error('Error undoing task completion:', error);
                showToast('Failed to undo', 'error');
            }
        });
    }
    
    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({
                is_completed: task.is_completed,
                completed_at: task.completed_at
            })
            .eq('id', taskId);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('Error toggling task:', error);
        task.is_completed = !task.is_completed;
        task.completed_at = previousCompletedAt;
        renderTasks();
        showToast('Failed to update task', 'error');
    }
}

// ============================================
// TASK MODAL FUNCTIONS
// ============================================

function toggleRecurringOptions() {
    const isRecurring = document.getElementById('task-is-recurring').checked;
    const recurringOptions = document.getElementById('recurring-options');
    
    if (isRecurring) {
        recurringOptions.classList.remove('hidden');
        updateRecurringFields();
    } else {
        recurringOptions.classList.add('hidden');
    }
}

function updateRecurringFields() {
    const recurrenceType = document.getElementById('task-recurrence-type').value;
    const intervalLabel = document.getElementById('interval-label');
    const dayOfWeekContainer = document.getElementById('day-of-week-container');
    
    if (recurrenceType === 'daily') {
        intervalLabel.textContent = 'day(s)';
        dayOfWeekContainer.classList.add('hidden');
    } else if (recurrenceType === 'weekly') {
        intervalLabel.textContent = 'week(s)';
        dayOfWeekContainer.classList.remove('hidden');
    } else if (recurrenceType === 'monthly') {
        intervalLabel.textContent = 'month(s)';
        dayOfWeekContainer.classList.add('hidden');
    }
}

// Open task modal (create or edit)
function openTaskModal(taskId = null) {
    console.log('🎯 openTaskModal called with taskId:', taskId);
    console.log('📋 appState.tasks length:', appState.tasks.length);
    
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('task-modal-title');
    const deleteBtn = document.getElementById('delete-task-btn');
    const form = document.getElementById('task-form');
    
    editingTaskId = taskId;
    
    if (taskId) {
        // Edit existing task
        const task = appState.tasks.find(t => t.id === taskId);
        console.log('🔍 Found task:', task);
        
        if (!task) {
            console.error('❌ Task not found:', taskId);
            console.log('Available task IDs:', appState.tasks.map(t => t.id));
            return;
        }
        
        console.log('✏️ Filling form with task data:', task.title);

        modalTitle.textContent = 'Edit Task';
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-notes').value = task.notes || '';
        document.getElementById('task-goal').value = task.goal_id || '';
        document.getElementById('task-due-date').value = task.due_date || '';
        document.getElementById('task-is-recurring').checked = task.is_recurring || false;

        // Populate multi-category picker
        const cats = (task.extraCategories && task.extraCategories.length > 0)
            ? task.extraCategories.map(c => c.id)
            : (task.category_id ? [task.category_id] : []);
        selectedCategoryIds = new Set(cats);

        if (task.is_recurring) {
            document.getElementById('recurring-options').classList.remove('hidden');
            document.getElementById('task-recurrence-type').value = task.recurrence_type || 'daily';
            document.getElementById('task-recurrence-interval').value = task.recurrence_interval || 1;
            document.getElementById('task-recurrence-day').value = task.recurrence_day_of_week || 1;
            document.getElementById('task-recurrence-ends').value = task.recurrence_ends_on || '';
            updateRecurringFields();
        } else {
            document.getElementById('recurring-options').classList.add('hidden');
        }

        deleteBtn.classList.remove('hidden');
    } else {
        // Create new task
        modalTitle.textContent = 'Add Task';
        form.reset();
        document.getElementById('recurring-options').classList.add('hidden');
        deleteBtn.classList.add('hidden');
        selectedCategoryIds = new Set();
    }

    renderCategoryPicker();
    modal.classList.remove('hidden');
}


function closeTaskModal() {
    document.getElementById('task-modal').classList.add('hidden');
    editingTaskId = null;
}

async function saveTask(event) {
    event.preventDefault();
    
    // Prevent double-submission
    const submitBtn = event.submitter;
    if (submitBtn && submitBtn.disabled) return;
    if (submitBtn) submitBtn.disabled = true;
    
    const title = document.getElementById('task-title').value.trim();
    const notes = document.getElementById('task-notes').value.trim() || null;
    // primary category_id = first selected category (backwards compat)
    const catIds = [...selectedCategoryIds];
    const categoryId = catIds[0] || null;
    const goalId = document.getElementById('task-goal').value || null;
    const dueDate = document.getElementById('task-due-date').value || null;
    const isRecurring = document.getElementById('task-is-recurring').checked;
    
    let recurrenceData = {};
    if (isRecurring) {
        recurrenceData = {
            is_recurring: true,
            recurrence_type: document.getElementById('task-recurrence-type').value,
            recurrence_interval: parseInt(document.getElementById('task-recurrence-interval').value),
            recurrence_day_of_week: document.getElementById('task-recurrence-type').value === 'weekly' ? 
                parseInt(document.getElementById('task-recurrence-day').value) : null,
            recurrence_ends_on: document.getElementById('task-recurrence-ends').value || null
        };
    } else {
        recurrenceData = {
            is_recurring: false,
            recurrence_type: null,
            recurrence_interval: null,
            recurrence_day_of_week: null,
            recurrence_ends_on: null
        };
    }
    
    try {
        let savedTaskId = editingTaskId;

        if (editingTaskId) {
            const { error } = await supabaseClient
                .from('tasks')
                .update({
                    title,
                    notes,
                    category_id: categoryId,
                    goal_id: goalId,
                    due_date: dueDate,
                    ...recurrenceData
                })
                .eq('id', editingTaskId);

            if (error) throw error;

            // Refetch task to get updated relations
            const { data: updatedTask } = await supabaseClient
                .from('tasks')
                .select('*, category:categories(id, name, color_hex), goal:goals(id, name)')
                .eq('id', editingTaskId)
                .single();

            const taskIndex = appState.tasks.findIndex(t => t.id === editingTaskId);
            if (taskIndex !== -1 && updatedTask) {
                appState.tasks[taskIndex] = updatedTask;
            }

            showToast('Task updated!', 'success');
        } else {
            const maxOrder = Math.max(0, ...appState.tasks.map(t => t.user_order || 0));

            const { data, error } = await supabaseClient
                .from('tasks')
                .insert({
                    title,
                    notes,
                    category_id: categoryId,
                    goal_id: goalId,
                    due_date: dueDate,
                    is_completed: false,
                    user_order: maxOrder + 1,
                    status: 'active',
                    ...recurrenceData
                })
                .select('*, category:categories(id, name, color_hex), goal:goals(id, name)')
                .single();

            if (error) throw error;

            savedTaskId = data.id;
            appState.tasks.push(data);
            showToast('Task created!', 'success');
        }

        // Sync multi-categories — always attempt regardless of hasMultiCategories flag
        if (savedTaskId) {
            try {
                const { error: delErr } = await supabaseClient
                    .from('task_categories')
                    .delete()
                    .eq('task_id', savedTaskId);
                if (delErr) throw delErr;

                if (catIds.length > 0) {
                    const { error: insErr } = await supabaseClient
                        .from('task_categories')
                        .insert(catIds.map(cid => ({ task_id: savedTaskId, category_id: cid })));
                    if (insErr) throw insErr;
                }
                appState.hasMultiCategories = true;
            } catch (catErr) {
                console.warn('Multi-category save error (run migrations.sql if table missing):', catErr);
            }
        }

        // Reload relations for this task so appState reflects saved state
        if (savedTaskId && appState.hasMultiCategories) {
            await loadTaskRelations([savedTaskId]);
        }

        renderTasks();
        closeTaskModal();
        if (submitBtn) submitBtn.disabled = false;
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Failed to save task', 'error');
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function deleteTask() {
    if (!editingTaskId) return;

    const taskToDelete = appState.tasks.find(t => t.id === editingTaskId);
    if (!taskToDelete) return;

    const deletedTask = { ...taskToDelete };
    const deletedTaskId = editingTaskId;

    // Optimistic removal
    appState.tasks = appState.tasks.filter(t => t.id !== deletedTaskId);
    renderTasks();
    closeTaskModal();

    let deleteTimer = null;

    showUndoToast('Task deleted', () => {
        // Cancel pending soft-delete — task still active in DB
        if (deleteTimer) clearTimeout(deleteTimer);

        appState.tasks.push(deletedTask);
        appState.tasks.sort((a, b) => (a.user_order || 0) - (b.user_order || 0));
        renderTasks();
    });

    // Soft-delete after undo window
    deleteTimer = setTimeout(async () => {
        try {
            const deletedAt = new Date().toISOString();
            const { error } = await supabaseClient
                .from('tasks')
                .update({ status: 'deleted', deleted_at: deletedAt })
                .eq('id', deletedTaskId);
            if (error) throw error;
            console.log('✅ Task soft-deleted (will purge in 30 days)');

            // Add the deleted task back into appState so it shows in Deleted view
            deletedTask.status = 'deleted';
            deletedTask.deleted_at = deletedAt;
            appState.tasks.push(deletedTask);
            renderTasks();
        } catch (error) {
            console.error('Error soft-deleting task:', error);
        }
    }, 5000);
}

// Restore a soft-deleted task
async function restoreTask(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Optimistic update
    const previousStatus = task.status;
    const previousDeletedAt = task.deleted_at;
    task.status = 'active';
    task.deleted_at = null;
    renderTasks();
    showToast('Task restored!', 'success');

    try {
        // Use RPC or raw update — set status and clear deleted_at separately
        // to avoid potential constraint issues with null handling
        const { error: statusError } = await supabaseClient
            .from('tasks')
            .update({ status: 'active' })
            .eq('id', taskId);

        if (statusError) throw statusError;

        const { error: clearError } = await supabaseClient
            .from('tasks')
            .update({ deleted_at: null })
            .eq('id', taskId);

        if (clearError) throw clearError;

        // Refetch the restored task to get correct server state
        const { data: updatedTask, error: fetchError } = await supabaseClient
            .from('tasks')
            .select(`
                *,
                category:categories(id, name, color_hex),
                goal:goals(id, name)
            `)
            .eq('id', taskId)
            .single();

        if (!fetchError && updatedTask) {
            const taskIndex = appState.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                appState.tasks[taskIndex] = updatedTask;
            }
            renderTasks();
        }

        console.log('✅ Task restored successfully');
    } catch (error) {
        console.error('Error restoring task:', error);
        // Revert optimistic update
        task.status = previousStatus;
        task.deleted_at = previousDeletedAt;
        renderTasks();
        showToast('Failed to restore task', 'error');
    }
}

// ============================================
// MULTI-CATEGORY PICKER HELPERS
// ============================================
function renderCategoryPicker() {
    const container = document.getElementById('task-categories-picker');
    if (!container) return;

    const countEl = document.getElementById('categories-selected-count');
    if (countEl) countEl.textContent = selectedCategoryIds.size > 0 ? `${selectedCategoryIds.size} selected` : '';

    const sorted = [...appState.categories].sort((a, b) => (a.user_order || 0) - (b.user_order || 0));

    if (sorted.length === 0) {
        container.innerHTML = '<span style="font-size:12px;color:var(--text-secondary);padding:4px">No categories yet</span>';
        return;
    }

    container.innerHTML = sorted.map(cat => {
        const isSelected = selectedCategoryIds.has(cat.id);
        const bg = isSelected ? (cat.color_hex || 'var(--accent)') : 'var(--bg-primary)';
        const textColor = isSelected ? '#fff' : 'var(--text-primary)';
        const border = isSelected ? 'transparent' : 'var(--border)';
        return `
            <button type="button" onclick="toggleCategorySelection('${cat.id}')"
                style="background:${bg};color:${textColor};border:1.5px solid ${border};border-radius:20px;
                       padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;
                       transition:all 0.15s;display:inline-flex;align-items:center;gap:5px">
                ${isSelected ? '<i class="fas fa-check" style="font-size:9px"></i>' : ''}
                ${escapeHtml(cat.name)}
            </button>
        `;
    }).join('');
}

function toggleCategorySelection(catId) {
    if (selectedCategoryIds.has(catId)) {
        selectedCategoryIds.delete(catId);
    } else {
        selectedCategoryIds.add(catId);
    }
    renderCategoryPicker();
}

// ============================================
// RECURRING TASK — create next occurrence
// ============================================
async function createNextRecurrence(completedTask) {
    if (!completedTask.is_recurring) return;

    const {
        recurrence_type,
        recurrence_interval = 1,
        recurrence_day_of_week,
        recurrence_ends_on,
        due_date
    } = completedTask;

    // Calculate next due date
    let nextDate = null;
    const base = due_date ? new Date(due_date + 'T00:00:00') : getMelbourneDate();
    base.setHours(0, 0, 0, 0);

    if (recurrence_type === 'daily') {
        nextDate = new Date(base);
        nextDate.setDate(base.getDate() + (recurrence_interval || 1));
    } else if (recurrence_type === 'weekly') {
        nextDate = new Date(base);
        if (recurrence_day_of_week != null) {
            // Find next occurrence of that weekday
            const targetDay = recurrence_day_of_week; // 0=Sun...6=Sat
            nextDate.setDate(base.getDate() + 1); // start from next day
            while (nextDate.getDay() !== targetDay) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
        } else {
            nextDate.setDate(base.getDate() + 7 * (recurrence_interval || 1));
        }
    } else if (recurrence_type === 'monthly') {
        nextDate = new Date(base);
        nextDate.setMonth(base.getMonth() + (recurrence_interval || 1));
    }

    if (!nextDate) return;

    const nextDateStr = nextDate.getFullYear() + '-' +
        String(nextDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(nextDate.getDate()).padStart(2, '0');

    // Check recurrence end date
    if (recurrence_ends_on && nextDateStr > recurrence_ends_on) {
        console.log('🔁 Recurrence ended — no new task created');
        return;
    }

    // Check no duplicate already exists for that date
    const duplicate = appState.tasks.find(t =>
        t.title === completedTask.title &&
        t.due_date === nextDateStr &&
        !t.is_completed &&
        t.status !== 'deleted'
    );
    if (duplicate) return;

    const maxOrder = Math.max(0, ...appState.tasks.map(t => t.user_order || 0));

    try {
        const { data, error } = await supabaseClient
            .from('tasks')
            .insert({
                title: completedTask.title,
                notes: completedTask.notes,
                category_id: completedTask.category_id,
                goal_id: completedTask.goal_id,
                due_date: nextDateStr,
                is_completed: false,
                is_recurring: true,
                recurrence_type,
                recurrence_interval,
                recurrence_day_of_week,
                recurrence_ends_on,
                user_order: maxOrder + 1,
                status: 'active'
            })
            .select(`*, category:categories(id,name,color_hex), goal:goals(id,name)`)
            .single();

        if (error) throw error;

        appState.tasks.push(data);
        renderTasks();
        showToast(`🔁 Next "${completedTask.title}" scheduled for ${nextDateStr}`, 'success');
        console.log('✅ Recurring task next instance created:', nextDateStr);
    } catch (err) {
        console.error('Error creating next recurrence:', err);
    }
}
