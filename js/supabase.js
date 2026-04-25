// ============================================
// PRODUCTIVITY HUB - SUPABASE DATABASE
// ============================================

// ============================================
// AUTH HELPERS
// ============================================

function showLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
}
function hideLoginModal() {
    document.getElementById('login-modal').classList.add('hidden');
}

async function handleLogin(event) {
    event.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errEl    = document.getElementById('login-error');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…';
    errEl.classList.add('hidden');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    } else {
        hideLoginModal();
        initApp();
    }
}

async function signOut() {
    await supabaseClient.auth.signOut();
    location.reload();
}

// ============================================
// SUPABASE CLIENT INIT
// ============================================

// Initialize Supabase Client
async function initializeSupabase() {
    try {
        console.log('🔌 Connecting to Supabase...');

        // Client is created in boot(); only create here if somehow missing
        if (!supabaseClient) {
            const { createClient } = supabase;
            supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }

        // Test connection
        const { data, error } = await supabaseClient
            .from('categories')
            .select('count')
            .limit(1);
        
        if (error) throw error;
        
        console.log('✅ Supabase connected successfully');
        updateConnectionStatus(true);
        
        return true;
    } catch (error) {
        console.error('❌ Supabase connection failed:', error);
        updateConnectionStatus(false, error.message);
        return false;
    }
}

// Fetch all initial data
async function fetchInitialData() {
    try {
        console.log('📥 Fetching initial data...');
        
        // Fetch categories (exclude soft-deleted)
        const { data: categories, error: catError } = await supabaseClient
            .from('categories')
            .select('*')
            .is('deleted_at', null)
            .order('display_order', { nullsFirst: false });
        
        if (catError) throw catError;
        appState.categories = categories;
        console.log(`✅ Loaded ${categories.length} categories`);
        
        // Fetch habits
        const { data: habits, error: habitError } = await supabaseClient
            .from('habits')
            .select('*')
            .eq('archived', false)
            .order('user_order');
        
        if (habitError) throw habitError;
        appState.habits = habits;
        console.log(`✅ Loaded ${habits.length} habits`);
        
        // Fetch habit streaks
        const { data: streaks, error: streakError } = await supabaseClient
            .from('habit_streaks')
            .select('*');
        
        if (streakError) throw streakError;
        appState.habitStreaks = streaks;
        console.log(`✅ Loaded ${streaks.length} habit streaks`);
        
        // Fetch active tasks
        const { data: activeTasks, error: activeTaskError } = await supabaseClient
            .from('tasks')
            .select(`
                *,
                category:categories(id, name, color_hex),
                goal:goals(id, name)
            `)
            .eq('status', 'active')
            .order('user_order', { ascending: true, nullsFirst: false })
            .order('due_date', { ascending: true, nullsFirst: false });

        if (activeTaskError) throw activeTaskError;

        // Fetch soft-deleted tasks (within 30-day retention window)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: deletedTasks, error: deletedTaskError } = await supabaseClient
            .from('tasks')
            .select(`
                *,
                category:categories(id, name, color_hex),
                goal:goals(id, name)
            `)
            .eq('status', 'deleted')
            .not('deleted_at', 'is', null)
            .gte('deleted_at', thirtyDaysAgo.toISOString())
            .order('deleted_at', { ascending: false });

        if (deletedTaskError) throw deletedTaskError;

        appState.tasks = [...activeTasks, ...deletedTasks];
        console.log(`✅ Loaded ${activeTasks.length} active tasks + ${deletedTasks.length} deleted tasks`);
        
        // Fetch goals: active + recently-archived (for analytics), exclude deleted
        const { data: goals, error: goalError } = await supabaseClient
            .from('goals')
            .select('*')
            .neq('status', 'deleted')
            .is('deleted_at', null)
            .order('due_date', { nullsFirst: false });
        
        if (goalError) throw goalError;
        appState.goals = goals;
        console.log(`✅ Loaded ${goals.length} goals`);
        
        // Fetch habit completions for the last 365 days (needed for analytics)
        const oneYearAgo = getMelbourneDate();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const oneYearAgoStr = oneYearAgo.getFullYear() + '-' +
            String(oneYearAgo.getMonth() + 1).padStart(2, '0') + '-' +
            String(oneYearAgo.getDate()).padStart(2, '0');
        const { data: completions, error: compError } = await supabaseClient
            .from('habit_completions')
            .select('*')
            .gte('completion_date', oneYearAgoStr);

        if (compError) throw compError;
        appState.habitCompletions = completions;
        console.log(`✅ Loaded ${completions.length} habit completions (last 365 days)`);
        
        // Populate filter dropdowns
        populateFilterDropdowns();

        appState.isLoading = false;

        return true;
    } catch (error) {
        console.error('❌ Error fetching initial data:', error);
        appState.error = error.message;
        showToast('Failed to load data', 'error');
        return false;
    }
}

// ============================================
// SUPABASE KEEP-ALIVE (ping every 20 min)
// ============================================
let _keepAliveTimer = null;

function startSupabaseKeepAlive() {
    if (_keepAliveTimer) return; // already running
    _keepAliveTimer = setInterval(async () => {
        try {
            // Lightweight read — just checks the connection is alive
            const { error } = await supabaseClient
                .from('categories')
                .select('id')
                .limit(1);
            if (error) {
                console.warn('⚠️ Keep-alive ping failed:', error.message);
                updateConnectionStatus(false, error.message);
            } else {
                console.log('💓 Supabase keep-alive OK');
                updateConnectionStatus(true);
            }
        } catch (err) {
            console.warn('⚠️ Keep-alive error:', err.message);
        }
    }, 20 * 60 * 1000); // every 20 minutes
}

function stopSupabaseKeepAlive() {
    if (_keepAliveTimer) {
        clearInterval(_keepAliveTimer);
        _keepAliveTimer = null;
    }
}

// ============================================
// SOFT-DELETE PURGE (30-day retention)
// ============================================
async function purgeSoftDeleted() {
    try {
        const { error } = await supabaseClient.rpc('purge_old_deleted_records');
        if (error) {
            // Non-critical — log and continue
            console.warn('⚠️ Purge skipped:', error.message);
        } else {
            console.log('🗑️ Purged records older than 30 days');
        }
    } catch (err) {
        console.warn('⚠️ Purge error (non-critical):', err);
    }
}
