// ============================================
// PRODUCTIVITY HUB - AI MODULE (powered by Grok / xAI)
// ============================================

// AI calls go through the Supabase Edge Function so the xAI key never lives in the repo
const AI_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`;

// Cache for daily insights and quote (avoid repeated API calls)
// Persisted to localStorage (and optionally Supabase DB) per day
let aiCache = loadAICacheFromStorage();

function loadAICacheFromStorage() {
    try {
        const stored = localStorage.getItem('aiCache');
        if (stored) {
            const parsed = JSON.parse(stored);
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
            if (parsed.date === todayStr) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to load AI cache from localStorage:', e);
    }
    return {
        date: null,
        calendarInsights: null,
        calendarInsightsDate: null,
        dailyQuote: null,
        dailyQuoteAuthor: null,
        dailyQuoteDate: null,
        panelInsights: null,
        panelInsightsDate: null,
        habitInsights: {}  // { [habitId]: { date, insight, trend, tip } }
    };
}

function saveAICacheToStorage() {
    try {
        aiCache.date = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
        localStorage.setItem('aiCache', JSON.stringify(aiCache));
    } catch (e) {
        console.warn('Failed to save AI cache to localStorage:', e);
    }
}

// Save insights to Supabase DB for cross-device persistence
async function saveInsightsToDB(todayStr, insights, quote, quoteAuthor, chart) {
    if (!supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        await supabaseClient.from('daily_ai_insights').upsert({
            user_id: session.user.id,
            insight_date: todayStr,
            insights: insights || [],
            quote: quote || null,
            quote_author: quoteAuthor || null,
            chart_data: chart || null
        }, { onConflict: 'user_id,insight_date' });
    } catch (e) {
        console.warn('Could not persist AI insights to DB (run migrations.sql):', e);
    }
}

// Load insights from Supabase DB
async function loadInsightsFromDB(todayStr) {
    if (!supabaseClient) return null;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;
        const { data, error } = await supabaseClient
            .from('daily_ai_insights')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('insight_date', todayStr)
            .maybeSingle();
        if (error || !data) return null;
        return data;
    } catch (e) {
        return null;
    }
}

// Load a single habit's cached insight from DB for today
async function loadHabitInsightFromDB(habitId, todayStr) {
    const row = await loadInsightsFromDB(todayStr);
    return row?.habit_insights?.[habitId] || null;
}

// Persist a single habit's insight into the daily_ai_insights row (merge with existing)
async function saveHabitInsightToDB(habitId, todayStr, data) {
    if (!supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const existing = await loadInsightsFromDB(todayStr);
        const merged = { ...(existing?.habit_insights || {}), [habitId]: data };
        await supabaseClient.from('daily_ai_insights').upsert({
            user_id: session.user.id,
            insight_date: todayStr,
            habit_insights: merged
        }, { onConflict: 'user_id,insight_date' });
    } catch (e) {
        console.warn('Could not persist habit insight to DB:', e);
    }
}

// Call this whenever tasks or habits change so insights stay fresh
function invalidateAIInsightsCache() {
    aiCache.calendarInsights = null;
    aiCache.calendarInsightsDate = null;
    aiCache.dailyQuote = null;
    aiCache.dailyQuoteAuthor = null;
    aiCache.dailyQuoteDate = null;
    aiCache.panelInsights = null;
    aiCache.panelInsightsDate = null;
    saveAICacheToStorage();
}

// Chat history for AI panel
let aiChatHistory = [];

// ============================================
// AI API CALL (via Supabase Edge Function proxy)
// The xAI key is stored as a Supabase secret — never in the repo.
// ============================================
async function callAI(type, data = {}, messages = [], systemPrompt = '') {
    try {
        const response = await fetch(AI_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ type, data, messages, systemPrompt })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('AI proxy error:', response.status, errText);
            return null;
        }

        return response.json();
    } catch (err) {
        console.error('AI call failed:', err);
        return null;
    }
}

// ============================================
// DATA GATHERING — builds context for AI
// ============================================
function gatherAIData() {
    const today = getMelbourneDate();
    const todayStr = getMelbourneDateString();
    const { start: weekStart, end: weekEnd } = getMelbourneWeekRange();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Last week range
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(weekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setDate(weekStart.getDate() - 1);
    lastWeekEnd.setHours(23, 59, 59, 999);

    // This month range
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    // Last month range
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    // Active tasks (not deleted)
    const activeTasks = appState.tasks.filter(t => t.status !== 'deleted');

    // Tasks completed this week
    const tasksCompletedThisWeek = activeTasks.filter(t => {
        if (!t.is_completed || !t.completed_at) return false;
        const d = new Date(t.completed_at);
        return d >= weekStart && d <= weekEnd;
    });

    // Tasks completed last week
    const tasksCompletedLastWeek = activeTasks.filter(t => {
        if (!t.is_completed || !t.completed_at) return false;
        const d = new Date(t.completed_at);
        return d >= lastWeekStart && d <= lastWeekEnd;
    });

    // Tasks completed this month
    const tasksCompletedThisMonth = activeTasks.filter(t => {
        if (!t.is_completed || !t.completed_at) return false;
        const d = new Date(t.completed_at);
        return d >= monthStart && d <= monthEnd;
    });

    // Tasks completed last month
    const tasksCompletedLastMonth = activeTasks.filter(t => {
        if (!t.is_completed || !t.completed_at) return false;
        const d = new Date(t.completed_at);
        return d >= lastMonthStart && d <= lastMonthEnd;
    });

    // Overdue tasks
    const todayMidnight = new Date(today);
    todayMidnight.setHours(0, 0, 0, 0);
    const overdueTasks = activeTasks.filter(t => {
        if (t.is_completed || !t.due_date) return false;
        return new Date(t.due_date + 'T00:00:00') < todayMidnight;
    });

    // Upcoming tasks (next 7 days)
    const nextWeekEnd = new Date(todayMidnight);
    nextWeekEnd.setDate(todayMidnight.getDate() + 7);
    const upcomingTasks = activeTasks.filter(t => {
        if (t.is_completed || !t.due_date) return false;
        const d = new Date(t.due_date + 'T00:00:00');
        return d >= todayMidnight && d <= nextWeekEnd;
    });

    // Habits data
    const dailyHabits = appState.habits.filter(h => h.frequency === 'daily');
    const habitsCompletedToday = appState.habitCompletions.filter(c => c.completion_date === todayStr).length;

    // Habit completions this week
    const weekStartStr = formatWeekDate(weekStart);
    const weekEndStr = formatWeekDate(weekEnd);
    const habitCompletionsThisWeek = appState.habitCompletions.filter(c =>
        c.completion_date >= weekStartStr && c.completion_date <= weekEndStr
    ).length;

    // Habit completions last week
    const lastWeekStartStr = formatWeekDate(lastWeekStart);
    const lastWeekEndStr = formatWeekDate(lastWeekEnd);
    const habitCompletionsLastWeek = appState.habitCompletions.filter(c =>
        c.completion_date >= lastWeekStartStr && c.completion_date <= lastWeekEndStr
    ).length;

    // Streaks
    const streakInfo = appState.habitStreaks.map(s => {
        const habit = appState.habits.find(h => h.id === s.habit_id);
        return {
            habit: habit ? habit.name : 'Unknown',
            currentStreak: s.current_streak || 0,
            longestStreak: s.longest_streak || 0
        };
    }).filter(s => s.currentStreak > 0);

    // Goals
    const activeGoals = appState.goals.filter(g => g.status === 'active');
    const goalsWithProgress = activeGoals.map(g => {
        const linked = activeTasks.filter(t => t.goal_id === g.id && t.status !== 'deleted');
        const completed = linked.filter(t => t.is_completed).length;
        return {
            name: g.name,
            progress: linked.length > 0 ? Math.round((completed / linked.length) * 100) : 0,
            totalTasks: linked.length,
            completedTasks: completed,
            dueDate: g.due_date
        };
    });

    return {
        dayOfWeek: dayNames[today.getDay()],
        todayDate: todayStr,
        currentWeek: { start: weekStartStr, end: weekEndStr },
        lastWeek: { start: lastWeekStartStr, end: lastWeekEndStr },
        currentMonth: today.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        tasks: {
            completedThisWeek: tasksCompletedThisWeek.length,
            completedLastWeek: tasksCompletedLastWeek.length,
            completedThisMonth: tasksCompletedThisMonth.length,
            completedLastMonth: tasksCompletedLastMonth.length,
            overdue: overdueTasks.map(t => ({ title: t.title, dueDate: t.due_date })),
            upcoming: upcomingTasks.map(t => ({ title: t.title, dueDate: t.due_date, category: t.category?.name })),
            totalActive: activeTasks.filter(t => !t.is_completed).length
        },
        habits: {
            total: dailyHabits.length,
            completedToday: habitsCompletedToday,
            completionsThisWeek: habitCompletionsThisWeek,
            completionsLastWeek: habitCompletionsLastWeek,
            streaks: streakInfo
        },
        goals: goalsWithProgress
    };
}

// Build a system prompt for the 'insights' call that includes pending task context
// and asks the AI to include task suggestions.
function buildInsightsSystemPrompt(data) {
    const today = getMelbourneDateString();

    // Compute urgency sort key: overdue tasks first (most overdue = lowest key),
    // then due today, then future by days, then no-date last.
    function urgencySortKey(t) {
        if (!t.due_date) return 99999;
        const d = Math.round((new Date(t.due_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        return d < 0 ? d : d; // negative = overdue (sorts first), positive = future
    }

    const pendingTasks = (appState.tasks || [])
        .filter(t => t.status !== 'deleted' && !t.is_completed)
        .sort((a, b) => urgencySortKey(a) - urgencySortKey(b))
        .map(t => {
            const cats = (t.extraCategories && t.extraCategories.length > 0)
                ? t.extraCategories.map(c => c.name).join(', ')
                : (t.category?.name || null);
            const daysUntilDue = t.due_date
                ? Math.round((new Date(t.due_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
                : null;
            const urgency = daysUntilDue === null ? 'no date'
                : daysUntilDue < 0 ? `OVERDUE ${Math.abs(daysUntilDue)}d`
                : daysUntilDue === 0 ? 'due TODAY'
                : `due in ${daysUntilDue}d`;
            const goalStr = t.goal ? ` (goal: ${t.goal.name})` : '';
            const catStr = cats ? ` {${cats}}` : '';
            const notesStr = t.notes ? ` — "${t.notes.slice(0, 80)}${t.notes.length > 80 ? '…' : ''}"` : '';
            const pendingObjectives = (t.objectives || []).filter(o => !o.is_completed);
            const objStr = pendingObjectives.length > 0
                ? ` [${pendingObjectives.length} sub-task${pendingObjectives.length > 1 ? 's' : ''} open]`
                : '';
            return `"${t.title}" [${urgency}]${catStr}${goalStr}${notesStr}${objStr}`;
        })
        .slice(0, 30) // cap at 30 to avoid huge payloads
        .join('\n  ');

    return `You are an AI productivity coach. The user is in Melbourne, Australia. Today is ${today} (${data.dayOfWeek}).
Analyze their productivity data and respond with a JSON object with these fields:
- "insights": array of 2-3 short motivational insight strings about habits/tasks/progress
- "taskSuggestions": array of 2-3 actionable strings recommending which tasks to focus on, ordered by urgency (overdue → due today → upcoming → no-date). Reference specific task names.
- "chart": optional chart config object (type, labels, data, colors, title)

Pending tasks sorted by urgency (overdue first, no-date last):
  ${pendingTasks || 'No pending tasks'}

Productivity summary:
- Completed this week: ${data.tasks.completedThisWeek}, last week: ${data.tasks.completedLastWeek}
- Overdue: ${data.tasks.overdue.length}
- Habits today: ${data.habits.completedToday}/${data.habits.total}
- Goals: ${(data.goals || []).map(g => g.name + ' ' + g.progress + '%').join(', ') || 'none'}

Keep each insight/suggestion under 25 words. Be specific — name the actual task the user should focus on.`;
}

function formatWeekDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ============================================
// CALENDAR INSIGHTS (1-2 sentences + quote)
// ============================================
async function loadCalendarInsights(forceRefresh = false) {
    const container = document.getElementById('calendar-ai-insights');
    if (!container) return;

    const todayStr = getMelbourneDateString();

    // Show loading state
    container.innerHTML = `
        <div class="rounded-xl p-3 mb-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
            <div class="flex items-center gap-2 mb-2">
                <i class="fas fa-sparkles" style="color:var(--accent)"></i>
                <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">AI INSIGHTS</span>
            </div>
            <div class="flex items-center gap-2" style="color:var(--text-secondary);font-size:13px">
                <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
                <span>Analyzing your productivity...</span>
            </div>
        </div>
    `;

    // Gather data (needed for fresh fetch)
    const data = gatherAIData();

    let insightsResult = null;
    let quoteResult = null;

    if (!forceRefresh) {
        // 1. Try localStorage cache
        if (aiCache.calendarInsights && aiCache.calendarInsightsDate === todayStr) {
            insightsResult = aiCache.calendarInsights;
        }
        if (aiCache.dailyQuote && aiCache.dailyQuoteDate === todayStr) {
            quoteResult = { quote: aiCache.dailyQuote, author: aiCache.dailyQuoteAuthor };
        }

        // 2. Try DB cache if localStorage missed
        if (!insightsResult || !quoteResult) {
            const dbRow = await loadInsightsFromDB(todayStr);
            if (dbRow) {
                if (!insightsResult && dbRow.insights?.length) {
                    insightsResult = { insights: dbRow.insights, chart: dbRow.chart_data };
                    aiCache.calendarInsights = insightsResult;
                    aiCache.calendarInsightsDate = todayStr;
                }
                if (!quoteResult && dbRow.quote) {
                    quoteResult = { quote: dbRow.quote, author: dbRow.quote_author };
                    aiCache.dailyQuote = dbRow.quote;
                    aiCache.dailyQuoteAuthor = dbRow.quote_author;
                    aiCache.dailyQuoteDate = todayStr;
                }
                saveAICacheToStorage();
            }
        }
    }

    // 3. Fetch whatever is still missing
    const [freshInsights, freshQuote] = await Promise.all([
        insightsResult ? Promise.resolve(null) : callAI('insights', data, [], buildInsightsSystemPrompt(data)),
        quoteResult ? Promise.resolve(null) : callAI('quote', {
            dayOfWeek: data.dayOfWeek,
            context: `${data.tasks.completedThisWeek} tasks done this week, ${data.habits.completionsThisWeek} habit completions, ${data.tasks.overdue.length} overdue`
        })
    ]);

    if (freshInsights) {
        insightsResult = freshInsights;
        aiCache.calendarInsights = freshInsights;
        aiCache.calendarInsightsDate = todayStr;
    }
    if (freshQuote) {
        quoteResult = freshQuote;
        aiCache.dailyQuote = freshQuote.quote || null;
        aiCache.dailyQuoteAuthor = freshQuote.author || null;
        aiCache.dailyQuoteDate = todayStr;
    }

    if (freshInsights || freshQuote) {
        saveAICacheToStorage();
        // Persist to DB asynchronously
        saveInsightsToDB(
            todayStr,
            insightsResult?.insights,
            quoteResult?.quote,
            quoteResult?.author,
            insightsResult?.chart
        );
    }

    renderCalendarInsights(container, insightsResult, quoteResult);
}

function refreshCalendarInsights() {
    invalidateAIInsightsCache();
    loadCalendarInsights(true);
}

function renderCalendarInsights(container, insights, quote) {
    const insightLines = insights?.insights || [];
    const taskSuggestions = insights?.taskSuggestions || [];
    const quoteText = quote?.quote || '';
    const quoteAuthor = quote?.author || '';

    const refreshBtn = `
        <button onclick="refreshCalendarInsights()" title="Refresh AI insights"
            style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:11px;padding:2px 4px;opacity:0.6;transition:opacity 0.15s"
            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
            <i class="fas fa-rotate-right"></i>
        </button>`;

    let html = '';

    // Daily Quote FIRST
    if (quoteText) {
        html += `
            <div class="rounded-xl p-3 mb-3" style="background:linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));border:1px solid var(--border)">
                <div class="flex items-start gap-2">
                    <i class="fas fa-quote-left" style="color:var(--accent);opacity:0.5;font-size:14px;margin-top:2px"></i>
                    <div style="flex:1;min-width:0">
                        <p style="font-size:13px;color:var(--text-primary);font-style:italic;line-height:1.4;margin-bottom:4px">${escapeHtml(quoteText)}</p>
                        ${quoteAuthor ? `<p style="font-size:11px;color:var(--text-secondary);font-weight:600">— ${escapeHtml(quoteAuthor)}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // AI Text Insights
    if (insightLines.length > 0 || taskSuggestions.length > 0) {
        html += `
            <div class="rounded-xl p-3 mb-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-sparkles" style="color:var(--accent)"></i>
                        <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">AI INSIGHTS</span>
                    </div>
                    ${refreshBtn}
                </div>
                ${insightLines.map(line => `
                    <p style="font-size:13px;color:var(--text-primary);margin-bottom:4px;line-height:1.4">${escapeHtml(line)}</p>
                `).join('')}
                ${taskSuggestions.length > 0 ? `
                    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                        <div class="flex items-center gap-1.5 mb-2">
                            <i class="fas fa-bullseye" style="color:var(--accent);font-size:11px"></i>
                            <span style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.3px">Focus Today</span>
                        </div>
                        ${taskSuggestions.map(s => `
                            <div class="flex items-start gap-2 mb-1.5">
                                <i class="fas fa-arrow-right" style="color:var(--accent);font-size:10px;margin-top:3px;flex-shrink:0"></i>
                                <p style="font-size:13px;color:var(--text-primary);line-height:1.4;margin:0">${escapeHtml(s)}</p>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Fallback if AI failed
    if (!html) {
        html = `
            <div class="rounded-xl p-3 mb-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-sparkles" style="color:var(--text-secondary)"></i>
                        <span style="font-size:13px;color:var(--text-secondary)">AI insights unavailable</span>
                    </div>
                    ${refreshBtn}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ============================================
// AI CHAT POPUP — opens over Calendar / Analytics
// ============================================
function openAIChatPopup() {
    const overlay = document.getElementById('ai-chat-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        // Focus the input
        setTimeout(() => {
            const input = document.getElementById('ai-chat-input');
            if (input) input.focus();
        }, 100);
    }
}

function closeAIChatPopup(event) {
    // If called from overlay click, only close if clicking the backdrop itself
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('ai-chat-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function clearAIChat() {
    aiChatHistory = [];
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="ai-chat-welcome">
                <div class="ai-chat-welcome-icon">
                    <i class="fas fa-stars"></i>
                </div>
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Hi there!</div>
                <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;max-width:280px">
                    I have access to your productivity data. Ask me anything about your habits, tasks, or goals.
                </div>
            </div>
        `;
    }
}

// (Old AI panel functions removed — chat is now a popup overlay)

// ============================================
// AI CHAT
// ============================================
async function sendAIChat() {
    const input = document.getElementById('ai-chat-input');
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!input || !messagesContainer) return;

    const userMessage = input.value.trim();
    if (!userMessage) return;

    input.value = '';

    // Remove welcome message if present
    const welcome = messagesContainer.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();

    // Add user message to UI
    messagesContainer.innerHTML += `
        <div class="ai-chat-bubble-user">
            <div>${escapeHtml(userMessage)}</div>
        </div>
    `;

    // Add loading indicator
    const loadingId = 'ai-loading-' + Date.now();
    messagesContainer.innerHTML += `
        <div id="${loadingId}" class="ai-chat-bubble-ai">
            <div class="ai-chat-bubble-ai-avatar"><i class="fas fa-stars"></i></div>
            <div class="ai-chat-bubble-content">
                <div class="flex items-center gap-2">
                    <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
                    <span style="font-size:13px">Thinking...</span>
                </div>
            </div>
        </div>
    `;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Add to chat history
    aiChatHistory.push({ role: 'user', content: userMessage });

    // Gather full data context
    const data = gatherFullDataForChat();
    const lastTask = data.lastCompletedTask;
    const recentCompleted = (data.completedTasksList || []).slice(0, 5)
        .map(t => `"${t.title}" on ${t.completedDateMelbourne}${t.category ? ' [' + t.category + ']' : ''}`).join('; ');

    const systemPrompt = `You are a personal productivity assistant. The user's timezone is Melbourne, Australia (AEST/AEDT). Today is ${getMelbourneDateString()} (${data.dayOfWeek}).

KEY FACTS (use these directly in your answers):
- Last completed task: ${lastTask ? `"${lastTask.title}" completed on ${lastTask.completedDateMelbourne}${lastTask.category ? ' (category: ' + lastTask.category + ')' : ''}${lastTask.goal ? ' (goal: ' + lastTask.goal + ')' : ''}` : 'No tasks completed yet'}
- Tasks completed this week: ${data.tasks?.completedThisWeek ?? 0}
- Tasks completed this month: ${data.tasks?.completedThisMonth ?? 0}
- Overdue tasks: ${data.tasks?.overdue?.length ?? 0}${data.tasks?.overdue?.length ? ' — ' + data.tasks.overdue.map(t => '"' + t.title + '"').join(', ') : ''}
- Recent 5 completed: ${recentCompleted || 'none'}
- Active habits today: ${data.habits?.completedToday ?? 0}/${data.habits?.total ?? 0} done
- Active goals: ${(data.goals || []).map(g => `"${g.name}" ${g.progress}%`).join(', ') || 'none'}

Full context JSON for detailed queries: ${JSON.stringify(data)}

Rules:
- Answer directly using the KEY FACTS above
- For "last completed task" use the Last completed task field above
- Never say "I don't have that data" if it appears in KEY FACTS or the JSON
- If completedTasksList is empty, say so honestly`;

    const result = await callAI('chat', data, aiChatHistory, systemPrompt);

    // Remove loading
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    const aiResponse = result?.response || 'Sorry, I couldn\'t process that request. Please try again.';
    aiChatHistory.push({ role: 'assistant', content: aiResponse });

    // Add AI response to UI
    messagesContainer.innerHTML += `
        <div class="ai-chat-bubble-ai">
            <div class="ai-chat-bubble-ai-avatar"><i class="fas fa-stars"></i></div>
            <div class="ai-chat-bubble-content">${formatAIResponse(aiResponse)}</div>
        </div>
    `;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatAIResponse(text) {
    // Basic markdown-like formatting
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

// ============================================
// ANALYTICS AI CHART (inside insights section)
// ============================================
let analyticsAIChart = null;

async function loadAnalyticsAIChart(forceRefresh = false) {
    const section = document.getElementById('analytics-ai-chart-section');
    const textContainer = document.getElementById('analytics-ai-insights-text');
    const ctx = document.getElementById('analytics-ai-chart');
    if (!section || !ctx) return;

    const todayStr = getMelbourneDateString();

    let result = null;
    if (!forceRefresh) {
        if (aiCache.calendarInsights && aiCache.calendarInsightsDate === todayStr) {
            result = aiCache.calendarInsights;
        }
        if (!result) {
            const dbRow = await loadInsightsFromDB(todayStr);
            if (dbRow?.insights?.length) {
                result = { insights: dbRow.insights, chart: dbRow.chart_data };
                aiCache.calendarInsights = result;
                aiCache.calendarInsightsDate = todayStr;
                saveAICacheToStorage();
            }
        }
    }

    if (!result) {
        const data = gatherAIData();
        result = await callAI('insights', data, [], buildInsightsSystemPrompt(data));
        if (result) {
            aiCache.calendarInsights = result;
            aiCache.calendarInsightsDate = todayStr;
            saveAICacheToStorage();
            saveInsightsToDB(todayStr, result.insights, aiCache.dailyQuote, aiCache.dailyQuoteAuthor, result.chart);
        }
    }

    if (!result || !result.chart) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Render insight text as compact cards (max 2) + refresh button
    if (textContainer && result.insights) {
        const icons = ['lightbulb', 'chart-bar', 'bolt', 'bullseye', 'fire'];
        const colors = ['var(--warning)', 'var(--accent)', '#FF9500', '#34C759', '#FF3B30'];
        const taskSugg = result.taskSuggestions || [];
        textContainer.innerHTML = `
            <div class="flex items-center justify-between mb-1">
                <span style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.3px">AI Insights</span>
                <button onclick="loadAnalyticsAIChart(true)" title="Refresh insights"
                    style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:11px;padding:2px 4px;opacity:0.6"
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
                    <i class="fas fa-rotate-right"></i>
                </button>
            </div>
            ${result.insights.slice(0, 2).map((insight, i) => `
                <div class="rounded-lg p-2.5 mb-2" style="background:var(--bg-tertiary);border:1px solid var(--border)">
                    <div class="flex items-start gap-2">
                        <i class="fas fa-${icons[i % icons.length]} mt-0.5" style="color:${colors[i % colors.length]};font-size:13px;flex-shrink:0"></i>
                        <p style="font-size:12px;color:var(--text-primary);line-height:1.4">${escapeHtml(insight)}</p>
                    </div>
                </div>
            `).join('')}
            ${taskSugg.length > 0 ? `
                <div class="rounded-lg p-2.5 mb-2" style="background:var(--bg-tertiary);border:1px solid var(--border)">
                    <div class="flex items-center gap-1.5 mb-1.5">
                        <i class="fas fa-bullseye" style="color:var(--accent);font-size:11px"></i>
                        <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">Focus Today</span>
                    </div>
                    ${taskSugg.slice(0, 2).map(s => `
                        <div class="flex items-start gap-1.5 mb-1">
                            <i class="fas fa-arrow-right" style="color:var(--accent);font-size:9px;margin-top:3px;flex-shrink:0"></i>
                            <p style="font-size:12px;color:var(--text-primary);line-height:1.4;margin:0">${escapeHtml(s)}</p>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    }

    // Render chart
    const chartConfig = result.chart;
    if (analyticsAIChart) analyticsAIChart.destroy();

    const dark = isDarkMode();
    const tickColor = dark ? '#98989D' : '#6E6E73';
    const gridColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const type = chartConfig.type || 'bar';

    const config = {
        type: type,
        data: {
            labels: chartConfig.labels || [],
            datasets: [{
                label: chartConfig.title || 'Data',
                data: chartConfig.data || [],
                backgroundColor: chartConfig.colors || ['#007AFF'],
                borderColor: type === 'line' ? (chartConfig.colors?.[0] || '#007AFF') : undefined,
                borderWidth: type === 'line' ? 3 : 0,
                borderRadius: type === 'bar' ? 4 : undefined,
                tension: type === 'line' ? 0.4 : undefined,
                fill: type === 'line' ? false : undefined,
                pointRadius: type === 'line' ? 4 : undefined,
                pointBackgroundColor: type === 'line' ? (chartConfig.colors?.[0] || '#007AFF') : undefined
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: type === 'doughnut', position: 'bottom', labels: { color: tickColor, font: { size: 11 } } },
                tooltip: {
                    backgroundColor: dark ? '#2C2C2E' : 'rgba(0,0,0,0.85)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#E5E5EA',
                    cornerRadius: 8,
                    padding: 10
                }
            },
            scales: type === 'doughnut' ? {} : {
                x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } }
            }
        }
    };

    if (type === 'doughnut') {
        config.data.datasets[0].borderWidth = 3;
        config.data.datasets[0].borderColor = dark ? '#1C1C1E' : '#FFFFFF';
    }

    analyticsAIChart = new Chart(ctx, config);
}

function gatherFullDataForChat() {
    const data = gatherAIData();

    // Habit list (non-archived)
    data.habitsList = appState.habits
        .filter(h => !h.archived)
        .map(h => ({ name: h.name, emoji: h.emoji, frequency: h.frequency }));

    // Habit completions grouped by habit (last 30 days only to keep payload small)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

    const completionsByHabit = {};
    appState.habitCompletions
        .filter(c => c.completion_date >= thirtyDaysAgoStr)
        .forEach(c => {
            const habit = appState.habits.find(h => h.id === c.habit_id);
            const name = habit ? habit.name : 'Unknown';
            if (!completionsByHabit[name]) completionsByHabit[name] = [];
            completionsByHabit[name].push(c.completion_date);
        });
    data.habitCompletionHistory = completionsByHabit;

    // Completed tasks — convert completed_at to Melbourne date string for clarity
    const allCompleted = appState.tasks
        .filter(t => t.status !== 'deleted' && t.is_completed && t.completed_at)
        .map(t => ({
            title: t.title,
            completedAt: t.completed_at,
            completedDateMelbourne: new Date(t.completed_at)
                .toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }),
            category: t.category?.name || null,
            goal: t.goal?.name || null
        }))
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    // Keep last 50 completed tasks max to avoid payload size issues
    data.completedTasksList = allCompleted.slice(0, 50);
    data.lastCompletedTask = allCompleted[0] || null;

    // Goals
    data.goalsList = appState.goals.map(g => ({
        name: g.name,
        status: g.status,
        emoji: g.emoji,
        dueDate: g.due_date
    }));

    return data;
}
