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

        // Try loading multi-category + objectives relations (graceful if tables don't exist yet)
        await loadTaskRelations();

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
// MULTI-CATEGORY + OBJECTIVES RELATIONS
// ============================================
async function loadTaskRelations(taskIds = null) {
    // task_categories
    try {
        let q = supabaseClient
            .from('task_categories')
            .select('task_id, category_id, categories(id, name, color_hex)');
        if (taskIds) q = q.in('task_id', taskIds);

        const { data: taskCats, error } = await q;

        if (error) {
            appState.hasMultiCategories = false;
        } else {
            const catsByTask = {};
            (taskCats || []).forEach(tc => {
                if (!catsByTask[tc.task_id]) catsByTask[tc.task_id] = [];
                if (tc.categories) catsByTask[tc.task_id].push(tc.categories);
            });
            appState.tasks.forEach(task => {
                if (!taskIds || taskIds.includes(task.id)) {
                    task.extraCategories = catsByTask[task.id] || [];
                }
            });
            appState.hasMultiCategories = true;
        }
    } catch (e) {
        appState.hasMultiCategories = false;
    }

    // task_objectives
    try {
        let q = supabaseClient
            .from('task_objectives')
            .select('*')
            .order('display_order');
        if (taskIds) q = q.in('task_id', taskIds);

        const { data: objectives, error } = await q;

        if (error) {
            appState.hasObjectives = false;
        } else {
            const objByTask = {};
            (objectives || []).forEach(obj => {
                if (!objByTask[obj.task_id]) objByTask[obj.task_id] = [];
                objByTask[obj.task_id].push(obj);
            });
            appState.tasks.forEach(task => {
                if (!taskIds || taskIds.includes(task.id)) {
                    task.objectives = objByTask[task.id] || [];
                }
            });
            appState.hasObjectives = true;
        }
    } catch (e) {
        appState.hasObjectives = false;
    }
}

// ============================================
// SUPABASE KEEP-ALIVE (ping every 20 min via insert+delete)
//
// Supabase free-tier projects pause after 7 days of no activity.
// A read-only ping does NOT reset the inactivity timer on all plans;
// an actual write (INSERT) guarantees the project stays awake.
//
// We INSERT one row into _keepalive and DELETE it immediately so
// the table never accumulates data.  The timestamp is stored in
// localStorage so we can also fire a write on app startup when the
// app wasn't opened for a long time.
//
// Required SQL (migration 5):
//   CREATE TABLE IF NOT EXISTS _keepalive (
//       id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//       pinged_at timestamptz DEFAULT now()
//   );
//   ALTER TABLE _keepalive ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Allow all on _keepalive"
//       ON _keepalive FOR ALL USING (true) WITH CHECK (true);
// ============================================
const KEEPALIVE_LS_KEY = 'supabase_last_keepalive';
let _keepAliveTimer = null;

async function pingSupabaseDB() {
    try {
        // Insert a dummy row
        const { data, error: insertErr } = await supabaseClient
            .from('_keepalive')
            .insert({ pinged_at: new Date().toISOString() })
            .select('id')
            .single();

        if (insertErr) throw insertErr;

        // Delete it immediately — keep the table empty
        await supabaseClient.from('_keepalive').delete().eq('id', data.id);

        const ts = new Date().toISOString();
        localStorage.setItem(KEEPALIVE_LS_KEY, ts);
        console.log('💓 Supabase keep-alive: insert+delete OK at', ts);
        updateConnectionStatus(true);
        return true;
    } catch (err) {
        console.warn('⚠️ Supabase keep-alive failed:', err.message);
        updateConnectionStatus(false, err.message);
        return false;
    }
}

function startSupabaseKeepAlive() {
    if (_keepAliveTimer) return; // already running

    // Fire immediately on startup if last ping was >3 days ago (or never)
    const lastPing = localStorage.getItem(KEEPALIVE_LS_KEY);
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    if (!lastPing || Date.now() - new Date(lastPing).getTime() > threeDaysMs) {
        pingSupabaseDB();
    }

    // Then ping every 20 minutes while the app is open
    _keepAliveTimer = setInterval(pingSupabaseDB, 20 * 60 * 1000);
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
