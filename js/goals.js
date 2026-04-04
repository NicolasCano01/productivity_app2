// ============================================
// PRODUCTIVITY HUB - GOALS PANEL (COMPACT V2)
// ============================================

let draggedGoalId = null;

function calculateGoalProgress(goalId) {
    const linkedTasks = appState.tasks.filter(t => t.goal_id === goalId);
    const totalTasks = linkedTasks.length;
    if (totalTasks === 0) return 0;
    const completedTasks = linkedTasks.filter(t => t.is_completed).length;
    return Math.round((completedTasks / totalTasks) * 100);
}

function getGoalTaskCounts(goalId) {
    const linkedTasks = appState.tasks.filter(t => t.goal_id === goalId);
    const completed = linkedTasks.filter(t => t.is_completed).length;
    return { total: linkedTasks.length, completed: completed };
}

async function renderGoals() {
    const goalsList = document.getElementById('goals-list');
    if (!goalsList) return;

    // Auto-complete any active goals that have reached 100% (handles pre-existing data)
    // Only trigger if they haven't already been queued (status still 'active')
    const alreadyComplete = appState.goals.filter(g =>
        g.status === 'active' && calculateGoalProgress(g.id) >= 100
    );
    if (alreadyComplete.length > 0) {
        // Optimistically mark them completed before calling markGoalComplete
        // to prevent re-triggering on recursive renderGoals calls
        alreadyComplete.forEach(g => { g.status = 'archived'; });
        // silent=true: persist immediately, no undo toast for auto-completions
        alreadyComplete.forEach(g => markGoalComplete(g.id, true));
        return; // markGoalComplete will call renderGoals again
    }

    let activeGoals = appState.goals
        .filter(g => g.status === 'active')
        .sort((a, b) => (a.user_order || 0) - (b.user_order || 0));
    
    if (activeGoals.length === 0) {
        goalsList.innerHTML = '<div class="text-center text-gray-500 py-8"><i class="fas fa-bullseye text-4xl mb-2"></i><p>No active goals yet</p><p class="text-sm mt-1">Tap + to create your first goal</p></div>';
        return;
    }
    
    goalsList.innerHTML = activeGoals.map(goal => {
        const category = appState.categories.find(c => c.id === goal.category_id);
        const dotColor  = category ? category.color_hex : '#6B7280';
        const categoryName = category ? category.name : 'Uncategorized';

        const taskCounts = getGoalTaskCounts(goal.id);
        const progress   = calculateGoalProgress(goal.id);
        const dueDate    = formatGoalDueDate(goal.due_date);
        const hasDeadline = goal.due_date !== null;
        const emoji = goal.emoji || '';

        // Progress bar color: green when done, accent otherwise
        const barColor = progress >= 100 ? 'var(--success)' : 'var(--accent)';

        return `
        <div class="goal-card rounded-xl cursor-pointer transition-shadow"
             style="background:var(--bg-secondary);border:1px solid var(--border)"
             data-goal-id="${goal.id}"
             draggable="true"
             ondragstart="handleGoalDragStart(event,'${goal.id}')"
             ondragover="handleGoalDragOver(event)"
             ondrop="handleGoalDrop(event,'${goal.id}')"
             ondragend="handleGoalDragEnd(event)"
             onclick="openGoalModal('${goal.id}')">

            <div class="p-3">
                <!-- Title row -->
                <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            ${emoji ? `<span style="font-size:16px;line-height:1">${emoji}</span>` : ''}
                            <h3 class="font-semibold text-sm leading-tight" style="color:var(--text-primary)">${escapeHtml(goal.name)}</h3>
                        </div>
                        <!-- Category dot + name -->
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block"></span>
                            <span style="font-size:11px;color:var(--text-secondary)">${escapeHtml(categoryName)}</span>
                        </div>
                        ${goal.description ? `<p style="font-size:11px;color:var(--text-secondary);margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical">${escapeHtml(goal.description)}</p>` : ''}
                    </div>
                    <!-- Progress % -->
                    <span style="font-size:13px;font-weight:700;color:${progress >= 100 ? 'var(--success)' : 'var(--text-secondary)'};flex-shrink:0">${progress}%</span>
                </div>

                <!-- Progress bar -->
                <div style="width:100%;height:5px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:10px">
                    <div style="height:100%;width:${progress}%;background:${barColor};border-radius:99px;transition:width 0.3s ease"></div>
                </div>

                <!-- Footer row -->
                <div class="flex items-center justify-between">
                    <!-- Task count -->
                    <span style="font-size:11px;color:var(--text-secondary)">
                        ${taskCounts.total > 0
                            ? `<i class="fas fa-check-square" style="margin-right:4px;opacity:0.6"></i>${taskCounts.completed}/${taskCounts.total} tasks`
                            : `<span style="opacity:0.5">No tasks</span>`}
                    </span>
                    <!-- Due date + complete btn -->
                    <div class="flex items-center gap-2">
                        ${hasDeadline
                            ? `<span style="font-size:11px;color:${dueDate.isOverdue ? 'var(--danger)' : 'var(--text-secondary)'};font-weight:${dueDate.isOverdue ? '600' : '400'}">
                                <i class="fas fa-clock" style="margin-right:3px;opacity:0.7"></i>${dueDate.text}
                               </span>`
                            : `<span style="font-size:11px;color:var(--text-secondary);opacity:0.4"><i class="fas fa-infinity"></i></span>`}
                        ${progress >= 100
                            ? `<button onclick="event.stopPropagation();markGoalComplete('${goal.id}');"
                                 style="background:none;border:none;cursor:pointer;color:var(--success);font-size:15px;padding:0"
                                 title="Mark as complete"><i class="fas fa-check-circle"></i></button>`
                            : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function formatGoalDueDate(dueDate) {
    if (!dueDate) return { text: 'No date', isOverdue: false };
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    const isOverdue = diffDays < 0;
    let text;
    if (diffDays === 0) text = 'Today';
    else if (diffDays === 1) text = 'Tomorrow';
    else if (diffDays === -1) text = 'Yesterday';
    else if (diffDays > 0 && diffDays <= 30) text = diffDays + 'd';
    else if (diffDays < 0) text = Math.abs(diffDays) + 'd ago';
    else text = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { text: text, isOverdue: isOverdue };
}

async function markGoalComplete(goalId, silent = false) {
    const goalToComplete = appState.goals.find(g => g.id === goalId);
    if (!goalToComplete) return;

    const previousStatus = goalToComplete.status;

    // Optimistic UI update (state may already be set by renderGoals auto-complete)
    goalToComplete.status = 'archived';
    renderGoals();

    if (silent) {
        // Auto-triggered (all tasks just completed) — persist immediately, no undo toast
        try {
            await supabaseClient.from('goals').update({ status: 'archived' }).eq('id', goalId);
            console.log('✅ Goal auto-archived in DB');
        } catch (error) {
            console.error('Error auto-archiving goal:', error);
        }
        return;
    }

    let completeTimer = null;

    showUndoToast('🎉 Goal completed!', () => {
        if (completeTimer) clearTimeout(completeTimer);
        goalToComplete.status = previousStatus;
        renderGoals();
    });

    completeTimer = setTimeout(async () => {
        try {
            const { error } = await supabaseClient
                .from('goals')
                .update({ status: 'archived' })
                .eq('id', goalId);
            if (error) throw error;
            console.log('✅ Goal archived in DB');
        } catch (error) {
            console.error('Error archiving goal:', error);
        }
    }, 5000);
}

function openGoalModal(goalId) {
    goalId = goalId || null;
    const modal = document.getElementById('goal-modal');
    const modalTitle = document.getElementById('goal-modal-title');
    const deleteBtn = document.getElementById('delete-goal-btn');
    const form = document.getElementById('goal-form');
    
    editingGoalId = goalId;
    
    if (goalId) {
        const goal = appState.goals.find(g => g.id === goalId);
        if (!goal) return;
        
        modalTitle.textContent = 'Edit Goal';
        deleteBtn.classList.remove('hidden');
        
        document.getElementById('goal-name').value = goal.name || '';
        document.getElementById('goal-description').value = goal.description || '';
        document.getElementById('goal-category').value = goal.category_id || '';
        document.getElementById('goal-due-date').value = goal.due_date || '';
        document.getElementById('goal-emoji').value = goal.emoji || '';
        
        const emojiDisplay = document.getElementById('selected-goal-emoji');
        if (goal.emoji) {
            emojiDisplay.textContent = goal.emoji;
            emojiDisplay.classList.remove('no-emoji');
        } else {
            emojiDisplay.textContent = '';
            emojiDisplay.classList.add('no-emoji');
        }
        
        const linkedTasks = appState.tasks.filter(t => t.goal_id === goal.id);
        const taskInfo = document.getElementById('goal-task-info');
        if (taskInfo) {
            if (linkedTasks.length > 0) {
                const tasksList = linkedTasks.map(task => {
                    const isCompleted = task.is_completed;
                    return '<div class="flex items-center gap-2 py-1.5 ' + (isCompleted ? 'opacity-60' : '') + '"><i class="fas fa-' + (isCompleted ? 'check-circle text-success' : 'circle text-gray-300') + ' text-sm"></i><span class="flex-1 text-sm ' + (isCompleted ? 'line-through text-gray-500' : 'text-gray-700') + '">' + escapeHtml(task.title) + '</span></div>';
                }).join('');
                taskInfo.innerHTML = '<div class="p-2 bg-blue-50 border border-blue-200 rounded-lg"><div class="flex items-center gap-1.5 mb-2"><i class="fas fa-tasks text-primary text-sm"></i><span class="font-semibold text-sm">Linked Tasks (' + linkedTasks.filter(t => t.is_completed).length + '/' + linkedTasks.length + ')</span></div><div class="max-h-32 overflow-y-auto custom-scrollbar">' + tasksList + '</div></div>';
            } else {
                taskInfo.innerHTML = '<div class="p-2 bg-gray-50 border border-gray-200 rounded-lg"><div class="flex items-center gap-1.5 text-sm text-gray-600"><i class="fas fa-link text-gray-400"></i><span>No tasks linked yet</span></div></div>';
            }
        }
    } else {
        modalTitle.textContent = 'Add Goal';
        deleteBtn.classList.add('hidden');
        form.reset();
        const emojiDisplay = document.getElementById('selected-goal-emoji');
        emojiDisplay.textContent = '';
        emojiDisplay.classList.add('no-emoji');
        const taskInfo = document.getElementById('goal-task-info');
        if (taskInfo) taskInfo.innerHTML = '';
    }
    
   // Populate category dropdown
    populateGoalCategories();
    
    modal.classList.remove('hidden');
}

function toggleGoalEmojiPicker() {
    const picker = document.getElementById('goal-emoji-picker');
    if (!picker) return;
    
    if (picker.classList.contains('hidden')) {
        picker.classList.remove('hidden');
        // Check if the categories container is empty instead
        const container = document.getElementById('goal-emoji-categories');
        if (container && container.innerHTML.trim() === '') {
            loadGoalEmojiPicker();
        }
    } else {
        picker.classList.add('hidden');
    }
}

function loadGoalEmojiPicker() {
    const container = document.getElementById('goal-emoji-categories');
    const categories = {
        'Targets': ['🎯', '🏆', '⭐', '🎖️', '🥇', '🥈', '🥉', '👑'],
        'Activities': ['💼', '📚', '🏋️', '🧘', '✈️', '🏠', '💰', '🎨', '🎵', '🎮'],
        'Symbols': ['✨', '🔥', '💪', '🚀', '💡', '🎉', '⚡', '🌟', '💯', '🎪']
    };
    
    let html = '';
    for (const cat in categories) {
        html += '<div class="mb-2"><div class="text-xs font-semibold text-gray-600 mb-1">' + cat + '</div><div class="grid grid-cols-8 gap-1">';
        categories[cat].forEach(emoji => {
            html += '<button type="button" class="text-2xl hover:bg-gray-200 rounded p-1 transition" onclick="selectGoalEmoji(\'' + emoji + '\')">' + emoji + '</button>';
        });
        html += '</div></div>';
    }
    container.innerHTML = html;
}

function selectGoalEmoji(emoji) {
    document.getElementById('goal-emoji').value = emoji;
    const display = document.getElementById('selected-goal-emoji');
    display.textContent = emoji;
    display.classList.remove('no-emoji');
    document.getElementById('goal-emoji-picker').classList.add('hidden');
}

function clearGoalEmoji() {
    document.getElementById('goal-emoji').value = '';
    const display = document.getElementById('selected-goal-emoji');
    display.textContent = '';
    display.classList.add('no-emoji');
}

function closeGoalModal() {
    document.getElementById('goal-modal').classList.add('hidden');
    document.getElementById('goal-form').reset();
    editingGoalId = null;
}

// Populate category dropdown
function populateGoalCategories() {
    const select = document.getElementById('goal-category');
    if (!select) return;
    
    // Keep "No category" option
    select.innerHTML = '<option value="">No category</option>';
    
    // Add all categories
    appState.categories
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
}

async function saveGoal(event) {
    event.preventDefault();
    
    // Prevent double-submission
    const submitBtn = event.submitter;
    if (submitBtn && submitBtn.disabled) return;
    if (submitBtn) submitBtn.disabled = true;
    
    const goalData = {
        name: document.getElementById('goal-name').value.trim(),
        description: document.getElementById('goal-description').value.trim() || null,
        category_id: document.getElementById('goal-category').value || null,
        due_date: document.getElementById('goal-due-date').value || null,
        emoji: document.getElementById('goal-emoji').value || null
    };
    
    try {
        if (editingGoalId) {
            const { error } = await supabaseClient.from('goals').update(goalData).eq('id', editingGoalId);
            if (error) throw error;
            const goalIndex = appState.goals.findIndex(g => g.id === editingGoalId);
            if (goalIndex !== -1) {
                appState.goals[goalIndex] = Object.assign({}, appState.goals[goalIndex], goalData);
            }
            showToast('Goal updated successfully', 'success');
        } else {
            const maxOrder = Math.max(0, ...appState.goals.map(g => g.user_order || 0));
            const { data, error } = await supabaseClient.from('goals').insert([Object.assign({}, goalData, {
                status: 'active',
                user_order: maxOrder + 1,
                created_at: new Date().toISOString()
            })]).select().single();
            if (error) throw error;
            appState.goals.push(data);
            showToast('Goal created successfully', 'success');
        }
        renderGoals();
        populateFilterDropdowns(); // Refresh dropdowns so new goal appears immediately
        closeGoalModal();
        if (submitBtn) submitBtn.disabled = false;
    } catch (error) {
        console.error('Error saving goal:', error);
        showToast('Failed to save goal', 'error');
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function deleteGoal() {
    if (!editingGoalId) return;

    const goalToDelete = appState.goals.find(g => g.id === editingGoalId);
    if (!goalToDelete) return;

    const taskCounts = getGoalTaskCounts(editingGoalId);

    // Snapshot for undo
    const deletedGoal = { ...goalToDelete };
    const deletedGoalId = editingGoalId;
    const affectedTasks = appState.tasks.filter(t => t.goal_id === deletedGoalId);
    const affectedTaskIds = affectedTasks.map(t => ({ id: t.id, goal_id: t.goal_id }));

    // Optimistic UI removal
    appState.goals = appState.goals.filter(g => g.id !== deletedGoalId);
    appState.tasks.forEach(task => {
        if (task.goal_id === deletedGoalId) task.goal_id = null;
    });
    renderGoals();
    closeGoalModal();

    let deleteTimer = null;

    const message = taskCounts.total > 0
        ? `Goal deleted (${taskCounts.total} task${taskCounts.total > 1 ? 's' : ''} unlinked)`
        : 'Goal deleted';

    showUndoToast(message, () => {
        // Cancel pending DB soft-delete — goal still exists in DB
        if (deleteTimer) clearTimeout(deleteTimer);

        // Restore state only (no DB insert needed)
        appState.goals.push(deletedGoal);
        appState.goals.sort((a, b) => (a.user_order || 0) - (b.user_order || 0));
        appState.tasks.forEach(task => {
            const original = affectedTaskIds.find(t => t.id === task.id);
            if (original) task.goal_id = original.goal_id;
        });
        renderGoals();
    });

    // Soft-delete after undo window
    deleteTimer = setTimeout(async () => {
        try {
            // Unlink tasks from this goal in DB
            await supabaseClient
                .from('tasks')
                .update({ goal_id: null })
                .eq('goal_id', deletedGoalId);

            const { error } = await supabaseClient
                .from('goals')
                .update({ status: 'deleted', deleted_at: new Date().toISOString() })
                .eq('id', deletedGoalId);

            if (error) throw error;
            console.log('✅ Goal soft-deleted (will purge in 30 days)');
        } catch (error) {
            console.error('Error soft-deleting goal:', error);
        }
    }, 5000);
}

function handleGoalDragStart(event, goalId) {
    draggedGoalId = goalId;
    event.target.style.opacity = '0.5';
}

function handleGoalDragOver(event) {
    event.preventDefault();
    if (draggedGoalId) {
        const target = event.currentTarget;
        if (target.dataset.goalId !== draggedGoalId) {
            target.style.borderTop = '2px solid #3B82F6';
        }
    }
}

function handleGoalDrop(event, targetGoalId) {
    event.preventDefault();
    event.currentTarget.style.borderTop = '';
    if (draggedGoalId && draggedGoalId !== targetGoalId) {
        reorderGoals(draggedGoalId, targetGoalId);
    }
}

function handleGoalDragEnd(event) {
    event.target.style.opacity = '1';
    document.querySelectorAll('.goal-card').forEach(card => {
        card.style.borderTop = '';
    });
    draggedGoalId = null;
}

async function reorderGoals(draggedId, targetId) {
    const activeGoals = appState.goals.filter(g => g.status === 'active').sort((a, b) => (a.user_order || 0) - (b.user_order || 0));
    const draggedIndex = activeGoals.findIndex(g => g.id === draggedId);
    const targetIndex = activeGoals.findIndex(g => g.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const draggedGoal = activeGoals.splice(draggedIndex, 1)[0];
    activeGoals.splice(targetIndex, 0, draggedGoal);
    activeGoals.forEach((goal, index) => {
        goal.user_order = index + 1;
    });
    renderGoals();
    try {
        for (let i = 0; i < activeGoals.length; i++) {
            const goal = activeGoals[i];
            const { error } = await supabaseClient.from('goals').update({ user_order: goal.user_order }).eq('id', goal.id);
            if (error) throw error;
        }
    } catch (error) {
        console.error('Error reordering goals:', error);
        showToast('Failed to save new order', 'error');
    }
}
