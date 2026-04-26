// ============================================
// PRODUCTIVITY HUB - HABITS PANEL
// ============================================

// Detail panel state
let selectedHabitId = null;
const habitInsightCache = {};

// Get habit streak count (backwards-compat helper)
function getHabitStreak(habitId) {
    const streak = appState.habitStreaks.find(s => s.habit_id === habitId);
    return streak ? streak.current_streak : 0;
}

// Get full streak info object {current_streak, longest_streak}
function getHabitStreakInfo(habitId) {
    return appState.habitStreaks.find(s => s.habit_id === habitId) || { current_streak: 0, longest_streak: 0 };
}

// Check if habit is completed on a specific date (defaults to habitLogDate)
function isHabitCompletedOnDate(habitId, dateStr) {
    return appState.habitCompletions.some(c => c.habit_id === habitId && c.completion_date === dateStr);
}

// Kept for backward compat
function isHabitCompletedToday(habitId) {
    return isHabitCompletedOnDate(habitId, getMelbourneDateString());
}

// Render the date selector bar above habits list
function renderHabitDateBar() {
    const bar = document.getElementById('habit-date-bar');
    if (!bar) return;

    const todayStr = getMelbourneDateString();
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);

    // Build 7-day row: 6 past days + today
    let pillsHtml = '';
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dStr = formatDateString(d);
        const isSelected = dStr === habitLogDate;
        const isToday = dStr === todayStr;
        const dayNames = ['S','M','T','W','T','F','S'];
        const dayLabel = isToday ? 'Today' : dayNames[d.getDay()];
        const dateNum = d.getDate();

        if (isSelected) {
            pillsHtml += `<button onclick="setHabitLogDate('${dStr}')" style="min-width:44px;padding:6px 8px;border-radius:12px;background:var(--accent);color:#fff;border:none;cursor:pointer;flex-shrink:0;text-align:center">
                <div style="font-size:9px;font-weight:600;opacity:0.85">${dayLabel}</div>
                <div style="font-size:17px;font-weight:800;line-height:1.2">${dateNum}</div>
            </button>`;
        } else {
            pillsHtml += `<button onclick="setHabitLogDate('${dStr}')" style="min-width:44px;padding:6px 8px;border-radius:12px;background:var(--bg-secondary);color:var(--text-primary);border:none;cursor:pointer;flex-shrink:0;text-align:center">
                <div style="font-size:9px;font-weight:600;color:var(--text-secondary)">${dayLabel}</div>
                <div style="font-size:17px;font-weight:800;line-height:1.2">${dateNum}</div>
            </button>`;
        }
    }

    // Past-date banner
    const isPastDate = habitLogDate !== todayStr;
    const bannerHtml = isPastDate ? `
        <div class="flex items-center justify-between mt-2 px-1" style="font-size:12px;color:var(--warning)">
            <span><i class="fas fa-history mr-1"></i>Logging for past date — tap habits to record</span>
            <button onclick="setHabitLogDate('${todayStr}')" style="font-size:11px;font-weight:600;color:var(--accent);background:none;border:none;cursor:pointer">Back to Today</button>
        </div>` : '';

    bar.innerHTML = `
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 0">
            <div style="display:flex;gap:6px;min-width:max-content">${pillsHtml}</div>
        </div>
        ${bannerHtml}
    `;
}

// Format a Date object to YYYY-MM-DD
function formatDateString(d) {
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// Switch the habit log date and re-render
function setHabitLogDate(dateStr) {
    habitLogDate = dateStr;
    renderHabitDateBar();
    renderHabits();
}

// Get streak badge CSS class based on streak count
function getStreakBadgeClass(streak) {
    if (streak >= 7) return 'hot';
    if (streak >= 3) return 'warm';
    return 'cold';
}

// Render habits list
function renderHabits() {
    // Init habitLogDate on first render
    if (!habitLogDate) habitLogDate = getMelbourneDateString();
    renderHabitDateBar();

    const habitsList = document.getElementById('habits-list');

    if (appState.habits.length === 0) {
        habitsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-list-check text-4xl mb-2"></i>
                <p>No habits yet. Tap + to create your first habit!</p>
            </div>
        `;
        return;
    }

    habitsList.innerHTML = appState.habits.map(habit => {
        const streak = getHabitStreak(habit.id);
        const isCompleted = isHabitCompletedOnDate(habit.id, habitLogDate);
        const streakClass = getStreakBadgeClass(streak);
        const emoji = habit.emoji || '';
        const isSelected = selectedHabitId === habit.id;

        let frequencyText = '';
        if (habit.frequency === 'daily') {
            frequencyText = 'Daily';
        } else if (habit.frequency === 'weekly') {
            frequencyText = `${habit.weekly_target_days || 3}x/week`;
        }

        if (habit.exempt_weekends) {
            frequencyText += ' • No weekends';
        }

        return `
            <div
                class="habit-card${isSelected ? ' selected' : ''}"
                draggable="true"
                data-habit-id="${habit.id}"
                ondragstart="handleDragStart(event, '${habit.id}')"
                ondragend="handleDragEnd(event)"
                ondragover="handleDragOver(event)"
                ondrop="handleDrop(event, '${habit.id}')"
                ondragleave="handleDragLeave(event)"
            >
                <div class="flex items-center gap-3">
                    <i class="fas fa-grip-vertical text-gray-400 text-sm cursor-move"></i>
                    ${emoji ? `<div class="text-2xl">${emoji}</div>` : ''}
                    <div
                        class="habit-checkbox ${isCompleted ? 'checked' : ''}"
                        onclick="toggleHabitCompletion('${habit.id}', '${habitLogDate}')"
                    ></div>
                    <div class="flex-1 min-w-0" onclick="selectHabit('${habit.id}')">
                        <h3 class="font-semibold text-sm ${isCompleted ? 'line-through text-gray-400' : ''} truncate" style="color:var(--text-primary)">
                            ${habit.name}
                        </h3>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-xs" style="color:var(--text-secondary)">
                                ${frequencyText}
                            </span>
                        </div>
                    </div>
                    ${streak > 0 ? `
                        <div class="streak-badge ${streakClass}">
                            <i class="fas fa-fire"></i>
                            <span>${streak}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Toggle habit completion for a specific date (defaults to today)
async function toggleHabitCompletion(habitId, dateStr) {
    if (!dateStr) dateStr = getMelbourneDateString();
    const isCompleted = isHabitCompletedOnDate(habitId, dateStr);

    // OPTIMISTIC UPDATE — update UI immediately
    if (isCompleted) {
        appState.habitCompletions = appState.habitCompletions.filter(
            c => !(c.habit_id === habitId && c.completion_date === dateStr)
        );
    } else {
        appState.habitCompletions.push({
            habit_id: habitId,
            completion_date: dateStr,
            logged_at: new Date().toISOString()
        });
    }

    renderHabits();

    // Invalidate AI insights so calendar reflects updated habit data
    if (typeof invalidateAIInsightsCache === 'function') invalidateAIInsightsCache();

    // Persist to database
    try {
        if (isCompleted) {
            const { error } = await supabaseClient
                .from('habit_completions')
                .delete()
                .eq('habit_id', habitId)
                .eq('completion_date', dateStr);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('habit_completions')
                .insert({ habit_id: habitId, completion_date: dateStr });
            if (error) throw error;
            const todayStr = getMelbourneDateString();
            if (dateStr === todayStr) {
                showToast('✨ Habit completed!', 'success');
            } else {
                showToast(`✅ Logged for ${formatDateForDisplay(dateStr)}`, 'success');
            }
        }

        await refreshHabitStreaks();
        renderHabits();
        // Refresh detail panel stats if this habit is currently selected
        if (selectedHabitId === habitId) {
            delete habitInsightCache[habitId]; // completions changed — invalidate insight cache
            renderHabitDetailPanel(habitId);
        }

    } catch (error) {
        console.error('Error toggling habit completion:', error);
        // Revert optimistic update
        if (isCompleted) {
            appState.habitCompletions.push({
                habit_id: habitId,
                completion_date: dateStr,
                logged_at: new Date().toISOString()
            });
        } else {
            appState.habitCompletions = appState.habitCompletions.filter(
                c => !(c.habit_id === habitId && c.completion_date === dateStr)
            );
        }
        renderHabits();
        showToast('Failed to update habit', 'error');
    }
}

// Refresh habit streaks from database
async function refreshHabitStreaks() {
    try {
        const { data: streaks, error } = await supabaseClient
            .from('habit_streaks')
            .select('*');
        
        if (error) throw error;
        appState.habitStreaks = streaks;
    } catch (error) {
        console.error('Error refreshing streaks:', error);
    }
}

// ============================================
// DRAG AND DROP FUNCTIONS
// ============================================

function handleDragStart(event, habitId) {
    draggedHabitId = habitId;
    event.currentTarget.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.habit-card').forEach(card => {
        card.classList.remove('drag-over');
    });
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const draggedCard = document.querySelector('.dragging');
    const currentCard = event.currentTarget;
    
    if (draggedCard && currentCard !== draggedCard) {
        currentCard.classList.add('drag-over');
    }
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function handleDrop(event, targetHabitId) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedHabitId || draggedHabitId === targetHabitId) {
        return;
    }
    
    const draggedIndex = appState.habits.findIndex(h => h.id === draggedHabitId);
    const targetIndex = appState.habits.findIndex(h => h.id === targetHabitId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Optimistic update
    const draggedHabit = appState.habits[draggedIndex];
    appState.habits.splice(draggedIndex, 1);
    appState.habits.splice(targetIndex, 0, draggedHabit);
    
    renderHabits();
    showToast('Reordering...', 'success');
    
    // Background database update
    try {
        const updates = appState.habits.map((habit, index) => ({
            id: habit.id,
            user_order: index + 1
        }));
        
        for (const update of updates) {
            await supabaseClient
                .from('habits')
                .update({ user_order: update.user_order })
                .eq('id', update.id);
        }
        
        console.log('✅ Order saved to database');
        
    } catch (error) {
        console.error('Error reordering habits:', error);
        showToast('Failed to save order', 'error');
        await fetchInitialData();
        renderHabits();
    }
    
    draggedHabitId = null;
}

// ============================================
// EMOJI PICKER FUNCTIONS
// ============================================

function populateEmojiPicker() {
    const emojiContainer = document.getElementById('emoji-categories');
    
    let html = '';
    for (const [category, emojis] of Object.entries(EMOJI_CATEGORIES)) {
        html += `
            <div class="emoji-category">
                <div class="emoji-category-title">${category}</div>
                <div class="emoji-grid">
                    ${emojis.map(emoji => `
                        <div class="emoji-option" onclick="selectEmoji('${emoji}')" title="${emoji}">
                            ${emoji}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    emojiContainer.innerHTML = html;
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('hidden');
}

function selectEmoji(emoji) {
    const selectedEl = document.getElementById('selected-emoji');
    selectedEl.textContent = emoji;
    selectedEl.classList.remove('no-emoji');
    document.getElementById('habit-emoji').value = emoji;
    document.getElementById('emoji-picker').classList.add('hidden');
}

function clearEmoji() {
    const selectedEl = document.getElementById('selected-emoji');
    selectedEl.textContent = '';
    selectedEl.classList.add('no-emoji');
    document.getElementById('habit-emoji').value = '';
    document.getElementById('emoji-picker').classList.add('hidden');
}

// ============================================
// HABIT MODAL FUNCTIONS
// ============================================

function openHabitModal() {
    editingHabitId = null;
    document.getElementById('habit-modal-title').textContent = 'Add Habit';
    document.getElementById('habit-form').reset();
    document.getElementById('delete-habit-btn').classList.add('hidden');
    document.getElementById('weekly-target-container').style.display = 'none';
    document.getElementById('emoji-picker').classList.add('hidden');
    clearEmoji();
    populateEmojiPicker();
    document.getElementById('habit-modal').classList.remove('hidden');
}

function openEditHabitModal(habitId) {
    editingHabitId = habitId;
    const habit = appState.habits.find(h => h.id === habitId);
    
    if (!habit) return;
    
    document.getElementById('habit-modal-title').textContent = 'Edit Habit';
    document.getElementById('habit-name').value = habit.name;
    document.getElementById('habit-frequency').value = habit.frequency;
    document.getElementById('habit-exempt-weekends').checked = habit.exempt_weekends;
    
    const emoji = habit.emoji || '';
    const selectedEl = document.getElementById('selected-emoji');
    if (emoji) {
        selectedEl.textContent = emoji;
        selectedEl.classList.remove('no-emoji');
    } else {
        selectedEl.textContent = '';
        selectedEl.classList.add('no-emoji');
    }
    document.getElementById('habit-emoji').value = emoji;
    
    if (habit.frequency === 'weekly') {
        document.getElementById('weekly-target-container').style.display = 'block';
        document.getElementById('habit-weekly-target').value = habit.weekly_target_days || 3;
    } else {
        document.getElementById('weekly-target-container').style.display = 'none';
    }
    
    document.getElementById('delete-habit-btn').classList.remove('hidden');
    document.getElementById('emoji-picker').classList.add('hidden');
    populateEmojiPicker();
    document.getElementById('habit-modal').classList.remove('hidden');
}

function closeHabitModal() {
    document.getElementById('habit-modal').classList.add('hidden');
    document.getElementById('emoji-picker').classList.add('hidden');
    editingHabitId = null;
}

async function saveHabit(event) {
    event.preventDefault();
    
    // Prevent double-submission
    const submitBtn = event.submitter;
    if (submitBtn && submitBtn.disabled) return;
    if (submitBtn) submitBtn.disabled = true;
    
    const name = document.getElementById('habit-name').value.trim();
    const frequency = document.getElementById('habit-frequency').value;
    const exemptWeekends = document.getElementById('habit-exempt-weekends').checked;
    const weeklyTarget = frequency === 'weekly' ? 
        parseInt(document.getElementById('habit-weekly-target').value) : null;
    const emoji = document.getElementById('habit-emoji').value || null;
    
    try {
        if (editingHabitId) {
            const { error } = await supabaseClient
                .from('habits')
                .update({
                    name,
                    frequency,
                    exempt_weekends: exemptWeekends,
                    weekly_target_days: weeklyTarget,
                    emoji
                })
                .eq('id', editingHabitId);
            
            if (error) throw error;
            
            const habitIndex = appState.habits.findIndex(h => h.id === editingHabitId);
            if (habitIndex !== -1) {
                appState.habits[habitIndex] = {
                    ...appState.habits[habitIndex],
                    name,
                    frequency,
                    exempt_weekends: exemptWeekends,
                    weekly_target_days: weeklyTarget,
                    emoji
                };
            }
            
            showToast('Habit updated!', 'success');
        } else {
            const maxOrder = Math.max(0, ...appState.habits.map(h => h.user_order || 0));
            
            const { data, error } = await supabaseClient
                .from('habits')
                .insert({
                    name,
                    frequency,
                    exempt_weekends: exemptWeekends,
                    weekly_target_days: weeklyTarget,
                    emoji,
                    current_streak: 0,
                    user_order: maxOrder + 1,
                    archived: false
                })
                .select()
                .single();
            
            if (error) throw error;
            
            appState.habits.push(data);
            
            showToast('Habit created!', 'success');
        }
        
        renderHabits();
        closeHabitModal();
        if (submitBtn) submitBtn.disabled = false;
    } catch (error) {
        console.error('Error saving habit:', error);
        showToast('Failed to save habit', 'error');
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function deleteHabit() {
    if (!editingHabitId) return;

    const habitToDelete = appState.habits.find(h => h.id === editingHabitId);
    if (!habitToDelete) return;

    const deletedHabit = { ...habitToDelete };
    const deletedHabitId = editingHabitId;

    // Optimistic removal
    appState.habits = appState.habits.filter(h => h.id !== deletedHabitId);
    renderHabits();
    closeHabitModal();

    let deleteTimer = null;

    showUndoToast('Habit deleted', () => {
        // Cancel pending soft-delete — habit still active in DB
        if (deleteTimer) clearTimeout(deleteTimer);

        appState.habits.push(deletedHabit);
        appState.habits.sort((a, b) => (a.user_order || 0) - (b.user_order || 0));
        renderHabits();
    });

    // Soft-delete after undo window
    deleteTimer = setTimeout(async () => {
        try {
            const { error } = await supabaseClient
                .from('habits')
                .update({ archived: true, deleted_at: new Date().toISOString() })
                .eq('id', deletedHabitId);
            if (error) throw error;
            console.log('✅ Habit soft-deleted (will purge in 30 days)');
        } catch (error) {
            console.error('Error soft-deleting habit:', error);
        }
    }, 5000);
}

// ============================================
// HABIT DETAIL PANEL (desktop)
// ============================================

/**
 * selectHabit — called when the habit name/row is clicked.
 * On desktop (≥1024px) shows the detail panel.
 * On mobile opens the edit modal (unchanged behaviour).
 */
function selectHabit(habitId) {
    if (window.innerWidth < 1024) {
        openEditHabitModal(habitId);
        return;
    }

    selectedHabitId = habitId;

    // Update selected highlight in the list without a full re-render
    document.querySelectorAll('.habit-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.habitId === habitId);
    });

    renderHabitDetailPanel(habitId);
}

/**
 * Renders the full detail view for a habit into #habit-detail-content.
 */
function renderHabitDetailPanel(habitId) {
    const placeholder = document.getElementById('habit-detail-placeholder');
    const content = document.getElementById('habit-detail-content');
    if (!placeholder || !content) return;

    const habit = appState.habits.find(h => h.id === habitId);
    if (!habit) return;

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    const streakInfo = getHabitStreakInfo(habitId);
    const todayStr = getMelbourneDateString();
    const allCompletions = appState.habitCompletions.filter(c => c.habit_id === habitId);

    // Build 28-day window (4 weeks) aligned to Mon–Sun weeks
    const today = getMelbourneDate();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=Sun … 6=Sat
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysSinceMonday);
    const startDate = new Date(thisMonday);
    startDate.setDate(thisMonday.getDate() - 21); // 3 weeks back → 4 weeks total

    const days28 = [];
    for (let i = 0; i < 28; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = formatDateString(d);
        days28.push({
            dateStr,
            future: dateStr > todayStr,
            done: !( dateStr > todayStr ) && isHabitCompletedOnDate(habitId, dateStr)
        });
    }

    const doneDays = days28.filter(d => !d.future && d.done).length;
    const possibleDays = days28.filter(d => !d.future).length;
    const rate = possibleDays > 0 ? Math.round((doneDays / possibleDays) * 100) : 0;

    content.innerHTML = `
        <div class="habit-detail-header">
            <div class="habit-detail-emoji">${habit.emoji || '📋'}</div>
            <div style="flex:1;min-width:0">
                <h2 class="habit-detail-name">${escapeHtml(habit.name)}</h2>
                <span class="habit-detail-freq">${habit.frequency || 'daily'}${habit.exempt_weekends ? ' · No weekends' : ''}</span>
            </div>
            <button onclick="openEditHabitModal('${habitId}')" class="habit-detail-edit-btn" title="Edit habit">
                <i class="fas fa-pen"></i>
            </button>
        </div>

        <div class="habit-stats-grid">
            <div class="habit-stat-card">
                <div class="habit-stat-value">${streakInfo.current_streak || 0}${(streakInfo.current_streak || 0) > 0 ? ' 🔥' : ''}</div>
                <div class="habit-stat-label">Current Streak</div>
            </div>
            <div class="habit-stat-card">
                <div class="habit-stat-value">${streakInfo.longest_streak || 0}</div>
                <div class="habit-stat-label">Best Streak</div>
            </div>
            <div class="habit-stat-card">
                <div class="habit-stat-value">${rate}%</div>
                <div class="habit-stat-label">28-Day Rate</div>
            </div>
            <div class="habit-stat-card">
                <div class="habit-stat-value">${allCompletions.length}</div>
                <div class="habit-stat-label">All Time</div>
            </div>
        </div>

        <div class="habit-heatmap-section">
            <p class="habit-section-title">Last 4 Weeks</p>
            ${renderHabitHeatmap(days28)}
        </div>

        <div class="habit-insight-section">
            <div class="habit-insight-section-header">
                <p class="habit-section-title" style="margin:0">AI Insight</p>
                <button onclick="reloadHabitInsight('${habitId}')" class="habit-insight-refresh" title="Refresh insight">
                    <i class="fas fa-rotate-right"></i>
                </button>
            </div>
            <div id="habit-insight-${habitId}" class="habit-insight-container">
                <div class="flex items-center gap-2" style="color:var(--text-secondary)">
                    <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
                    <span style="font-size:13px">Analyzing your habit...</span>
                </div>
            </div>
        </div>
    `;

    // Load AI insight (uses cache if available)
    loadHabitInsight(habitId, habit, rate, streakInfo, days28);
}

/**
 * Renders the 4-week heatmap grid (Mon–Sun columns, 4 rows).
 */
function renderHabitHeatmap(days28) {
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const labelsHtml = dayLabels.map(l =>
        `<div class="heatmap-day-label">${l}</div>`
    ).join('');

    const cellsHtml = days28.map(day => {
        let cls = 'heatmap-cell';
        if (day.future) cls += ' heatmap-future';
        else if (day.done) cls += ' heatmap-done';
        else cls += ' heatmap-missed';
        return `<div class="${cls}" title="${day.dateStr}${day.done ? ' ✓' : day.future ? '' : ' ✗'}"></div>`;
    }).join('');

    return `
        <div>
            <div class="heatmap-day-labels">${labelsHtml}</div>
            <div class="heatmap-grid">${cellsHtml}</div>
            <div class="heatmap-legend">
                <span><span class="heatmap-legend-dot" style="background:var(--accent)"></span>Done</span>
                <span><span class="heatmap-legend-dot" style="background:var(--bg-tertiary);border:1px solid var(--border)"></span>Missed</span>
            </div>
        </div>
    `;
}

/**
 * Fetches (or returns cached) AI insight for a habit and renders it.
 */
async function loadHabitInsight(habitId, habit, rate, streakInfo, days28) {
    const container = document.getElementById(`habit-insight-${habitId}`);
    if (!container) return;

    // Return cached result instantly
    if (habitInsightCache[habitId]) {
        renderHabitInsightResult(container, habitInsightCache[habitId]);
        return;
    }

    // Build the 28-day pattern string (oldest→newest)
    const recentDays = days28.map(d => d.future ? 'f' : (d.done ? '1' : '0')).join('');

    const result = await callAI('habit_insight', {
        habitName: habit.name,
        completionRate: rate,
        currentStreak: streakInfo.current_streak || 0,
        longestStreak: streakInfo.longest_streak || 0,
        recentDays
    });

    if (!container.isConnected) return; // panel may have changed while waiting

    if (result && result.insight) {
        habitInsightCache[habitId] = result;
        renderHabitInsightResult(container, result);
    } else {
        container.innerHTML = `
            <div style="color:var(--text-secondary);font-size:13px">
                <i class="fas fa-circle-exclamation mr-2"></i>
                AI insight unavailable — set the <code>XAI_API_KEY</code> secret in Supabase.
            </div>`;
    }
}

/**
 * Renders the AI result object into the insight container.
 */
function renderHabitInsightResult(container, data) {
    const trendMeta = {
        improving:   { color: 'var(--success)', label: '↑ Improving' },
        consistent:  { color: 'var(--accent)',  label: '● Consistent' },
        declining:   { color: 'var(--error)',   label: '↓ Needs work' },
        just_started:{ color: 'var(--warning)', label: '★ Just started' },
    };
    const meta = trendMeta[data.trend] || trendMeta.consistent;

    container.innerHTML = `
        <div class="habit-insight-card" style="width:100%">
            <div class="flex items-center gap-2 mb-1">
                <i class="fas fa-sparkles" style="color:${meta.color};font-size:12px"></i>
                <span class="habit-insight-trend" style="color:${meta.color}">${meta.label}</span>
            </div>
            <p class="habit-insight-text">${escapeHtml(data.insight || '')}</p>
            ${data.tip ? `
                <div class="habit-insight-tip">
                    <i class="fas fa-lightbulb" style="color:var(--warning);margin-top:1px;flex-shrink:0"></i>
                    <span>${escapeHtml(data.tip)}</span>
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * Clears the insight cache for a habit and re-renders the detail panel.
 */
function reloadHabitInsight(habitId) {
    delete habitInsightCache[habitId];
    if (selectedHabitId === habitId) {
        renderHabitDetailPanel(habitId);
    }
}
