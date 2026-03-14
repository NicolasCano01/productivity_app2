// ============================================
// PRODUCTIVITY HUB - TASKS PANEL (ENHANCED)
// ============================================

// Switch task view (All/Overdue/Upcoming/Completed)
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
    if (currentTaskView === 'overdue') {
        filtered = filtered.filter(task => {
            if (task.is_completed || !task.due_date) return false;
            const dueDate = new Date(task.due_date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < today;
        });
    } else if (currentTaskView === 'upcoming') {
        // Include tasks with future dates OR no date (but not completed)
        filtered = filtered.filter(task => {
            if (task.is_completed) return false;
            if (!task.due_date) return true; // Include tasks with no date
            const dueDate = new Date(task.due_date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate >= today;
        });
    } else if (currentTaskView === 'completed') {
        filtered = filtered.filter(task => task.is_completed);
    } else {
        // All - show only active (not completed)
        filtered = filtered.filter(task => !task.is_completed);
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
    const activeTasks = appState.tasks.filter(t => !t.is_completed);
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
    const completedTasks = appState.tasks.filter(t => t.is_completed);
    
    document.getElementById('count-all').textContent = activeTasks.length;
    document.getElementById('count-overdue').textContent = overdueTasks.length;
    document.getElementById('count-upcoming').textContent = upcomingTasks.length;
    document.getElementById('count-completed').textContent = completedTasks.length;
    
    if (filtered.length === 0) {
        tasksList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-tasks text-4xl mb-2"></i>
                <p>${currentTaskView === 'all' ? 'No tasks yet. Tap + to add one!' : `No ${currentTaskView} tasks`}</p>
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
    const categoryColor = task.category?.color_hex || '#6B7280';
    const severity = getOverdueSeverity(task.due_date);
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
    if (task.category) metaParts.push(`<span>${task.category.name}</span>`);
    if (task.goal) metaParts.push(`<span class="goal-link"><i class="fas fa-bullseye" style="font-size:9px"></i> ${task.goal.name}</span>`);
    if (task.due_date) {
        metaParts.push(`<span class="${severity ? 'font-semibold' : ''}" style="color:${severity ? 'var(--danger)' : 'var(--text-secondary)'}">${dueDateText}</span>`);
    }
    if (task.is_recurring) metaParts.push(`<span style="color:var(--accent)"><i class="fas fa-repeat" style="font-size:9px"></i> Recurring</span>`);
    const metaHtml = metaParts.length ? `<div class="flex items-center gap-1.5 mt-0.5 flex-wrap" style="font-size:11px;color:var(--text-secondary)">${metaParts.join('<span style="opacity:0.4">·</span>')}</div>` : '';

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
                        ${task.category ? `<div class="category-dot" style="background-color:${categoryColor}"></div>` : ''}
                        <h3 class="font-semibold flex-1 truncate" style="font-size:15px;color:${task.is_completed ? 'var(--text-secondary)' : 'var(--text-primary)'};${task.is_completed ? 'text-decoration:line-through' : ''}">
                            ${escapeHtml(task.title)}
                        </h3>
                        ${severity ? `<span class="overdue-badge overdue-${severity}">OVERDUE</span>` : ''}
                    </div>
                    ${metaHtml}
                    ${task.notes ? `<p class="line-clamp-2 mt-1" style="font-size:12px;color:var(--text-secondary)">${escapeHtml(task.notes)}</p>` : ''}
                </div>
            </div>
        </div>
    `;
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
    
    if (task.is_completed) {
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
        document.getElementById('task-category').value = task.category_id || '';
        document.getElementById('task-goal').value = task.goal_id || '';
        document.getElementById('task-due-date').value = task.due_date || '';
        document.getElementById('task-is-recurring').checked = task.is_recurring || false;
        
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
    }
    
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
    const categoryId = document.getElementById('task-category').value || null;
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
            
            // Refetch tasks to get updated relations
            const { data: updatedTask } = await supabaseClient
                .from('tasks')
                .select(`
                    *,
                    category:categories(id, name, color_hex),
                    goal:goals(id, name)
                `)
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
                .select(`
                    *,
                    category:categories(id, name, color_hex),
                    goal:goals(id, name)
                `)
                .single();
            
            if (error) throw error;
            
            appState.tasks.push(data);
            
            showToast('Task created!', 'success');
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
            const { error } = await supabaseClient
                .from('tasks')
                .update({ status: 'deleted', deleted_at: new Date().toISOString() })
                .eq('id', deletedTaskId);
            if (error) throw error;
            console.log('✅ Task soft-deleted (will purge in 30 days)');
        } catch (error) {
            console.error('Error soft-deleting task:', error);
        }
    }, 5000);
}
