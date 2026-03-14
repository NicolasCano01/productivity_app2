// ============================================
// PRODUCTIVITY HUB - MAIN APP INITIALIZATION
// ============================================

// Midnight watcher — detects date change in Melbourne time and resets habit completions
function startMidnightWatcher() {
    setInterval(async () => {
        const today = getMelbourneDateString();
        if (today !== lastCheckedDate) {
            lastCheckedDate = today;
            try {
                const { data: completions, error } = await supabaseClient
                    .from('habit_completions')
                    .select('*')
                    .eq('completion_date', today);
                if (!error && completions) {
                    // Merge: keep historical completions, replace today's entries
                    appState.habitCompletions = [
                        ...appState.habitCompletions.filter(c => c.completion_date !== today),
                        ...completions
                    ];
                    renderHabits();
                    updateCurrentDate();
                    showToast('Good morning! Habits reset for today.', 'success');
                }
            } catch (err) {
                console.error('Midnight refresh failed:', err);
            }
        }
    }, 60000); // check every minute
}

// Main app initialization function (called after auth is confirmed)
async function initApp() {
    console.log('🚀 Initializing Productivity Hub...');

    // Step 1: Connect Supabase (client already created in boot, this tests the connection)
    const supabaseReady = await initializeSupabase();
    if (!supabaseReady) {
        hideLoadingScreen();
        document.getElementById('habits-panel').innerHTML = `
            <div class="text-center text-danger py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
                <p class="font-bold">Failed to connect to database</p>
                <p class="text-sm mt-2">Please check your internet connection</p>
                <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-primary text-white rounded-lg">
                    Retry
                </button>
            </div>
        `;
        return;
    }
    
    // Step 2: Fetch initial data
    const dataLoaded = await fetchInitialData();
    if (!dataLoaded) {
        hideLoadingScreen();
        document.getElementById('habits-panel').innerHTML = `
            <div class="text-center text-danger py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
                <p class="font-bold">Failed to load data</p>
                <p class="text-sm mt-2">${appState.error || 'Unknown error'}</p>
                <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-primary text-white rounded-lg">
                    Retry
                </button>
            </div>
        `;
        return;
    }
    
    // Step 3: Render initial views
    habitLogDate = getMelbourneDateString(); // init habit log date to today
    renderHabits();
    renderTasks();
    renderGoals();

    // Step 4: Hide loading screen and show first panel
    hideLoadingScreen();

    // Step 5: Start midnight watcher (set baseline date after data is loaded)
    lastCheckedDate = getMelbourneDateString();
    startMidnightWatcher();

    // Step 6: Purge records older than 30 days (non-blocking, non-critical)
    purgeSoftDeleted();

    // Step 7: Show success message
    showToast('✨ All data loaded successfully!', 'success');

    console.log('✅ App initialization complete!');
    console.log('📊 App State:', appState);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Habit frequency change listener
    const frequencySelect = document.getElementById('habit-frequency');
    if (frequencySelect) {
        frequencySelect.addEventListener('change', (e) => {
            const weeklyTargetContainer = document.getElementById('weekly-target-container');
            if (e.target.value === 'weekly') {
                weeklyTargetContainer.style.display = 'block';
            } else {
                weeklyTargetContainer.style.display = 'none';
            }
        });
    }
});

// ============================================
// BOOT: check auth session before loading data
// ============================================
async function boot() {
    // Build the Supabase client first (no DB query yet)
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    initDarkMode();

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        // Not logged in — hide loading screen and show login modal
        hideLoadingScreen();
        showLoginModal();
        return;
    }

    // Already authenticated — load the app normally
    initApp();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
