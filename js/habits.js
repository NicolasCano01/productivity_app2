// ============================================
// PRODUCTIVITY HUB - HABITS PANEL
// ============================================

// Get habit streak from state
function getHabitStreak(habitId) {
    const streak = appState.habitStreaks.find(s => s.habit_id === habitId);
    return streak ? streak.current_streak : 0;
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
                class="habit-card" 
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
                    <div class="flex-1 min-w-0" onclick="openEditHabitModal('${habit.id}')">
                        <h3 class="font-semibold text-gray-800 text-sm ${isCompleted ? 'line-through text-gray-400' : ''} truncate">
                            ${habit.name}
                        </h3>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-xs text-gray-500">
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
