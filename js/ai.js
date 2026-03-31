// ============================================
// PRODUCTIVITY HUB - AI MODULE
// ============================================

const AI_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`;

// Cache for daily quote and insights (avoid repeated API calls)
let aiCache = {
    dailyQuote: null,
    dailyQuoteDate: null,
    calendarInsights: null,
    calendarInsightsDate: null,
    panelInsights: null,
    panelInsightsDate: null
};

// Chat history for AI panel
let aiChatHistory = [];

// ============================================
// AI API CALL (through Supabase Edge Function)
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

        return await response.json();
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
        const linked = activeTasks.filter(t => t.goal_id === g.id);
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

function formatWeekDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ============================================
// CALENDAR INSIGHTS (1-2 sentences + quote)
// ============================================
async function loadCalendarInsights() {
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

    // Check cache
    if (aiCache.calendarInsights && aiCache.calendarInsightsDate === todayStr) {
        renderCalendarInsights(container, aiCache.calendarInsights, aiCache.dailyQuote);
        return;
    }

    // Gather data and call AI
    const data = gatherAIData();

    // Call insights and quote in parallel
    const [insightsResult, quoteResult] = await Promise.all([
        callAI('insights', data),
        (aiCache.dailyQuote && aiCache.dailyQuoteDate === todayStr)
            ? Promise.resolve(aiCache.dailyQuote)
            : callAI('quote', { dayOfWeek: data.dayOfWeek, context: `${data.tasks.completedThisWeek} tasks done this week, ${data.tasks.overdue.length} overdue` })
    ]);

    // Cache results
    if (insightsResult) {
        aiCache.calendarInsights = insightsResult;
        aiCache.calendarInsightsDate = todayStr;
    }
    if (quoteResult && quoteResult.quote) {
        aiCache.dailyQuote = quoteResult;
        aiCache.dailyQuoteDate = todayStr;
    }

    renderCalendarInsights(container, insightsResult, quoteResult);
}

function renderCalendarInsights(container, insights, quote) {
    const insightLines = insights?.insights || [];
    const quoteText = quote?.quote || '';
    const quoteAuthor = quote?.author || '';

    let html = '';

    // AI Insights
    if (insightLines.length > 0) {
        html += `
            <div class="rounded-xl p-3 mb-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
                <div class="flex items-center gap-2 mb-2">
                    <i class="fas fa-sparkles" style="color:var(--accent)"></i>
                    <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">AI INSIGHTS</span>
                </div>
                ${insightLines.map(line => `
                    <p style="font-size:13px;color:var(--text-primary);margin-bottom:4px;line-height:1.4">${escapeHtml(line)}</p>
                `).join('')}
            </div>
        `;
    }

    // Daily Quote
    if (quoteText) {
        html += `
            <div class="rounded-xl p-3 mb-3" style="background:linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));border:1px solid var(--border)">
                <div class="flex items-start gap-2">
                    <i class="fas fa-quote-left" style="color:var(--accent);opacity:0.5;font-size:14px;margin-top:2px"></i>
                    <div>
                        <p style="font-size:13px;color:var(--text-primary);font-style:italic;line-height:1.4;margin-bottom:4px">${escapeHtml(quoteText)}</p>
                        ${quoteAuthor ? `<p style="font-size:11px;color:var(--text-secondary);font-weight:600">— ${escapeHtml(quoteAuthor)}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Fallback if AI failed
    if (!html) {
        html = `
            <div class="rounded-xl p-3 mb-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
                <div class="flex items-center gap-2">
                    <i class="fas fa-sparkles" style="color:var(--text-secondary)"></i>
                    <span style="font-size:13px;color:var(--text-secondary)">AI insights unavailable — check your API key setup</span>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ============================================
// AI PANEL — Full insights + Chat
// ============================================
function renderAIPanel() {
    const container = document.getElementById('ai-panel-content');
    if (!container) return;

    container.innerHTML = `
        <!-- AI Insights Section -->
        <div id="ai-panel-insights" class="mb-4">
            <div class="flex items-center gap-2 mb-3">
                <i class="fas fa-chart-line" style="color:var(--accent)"></i>
                <span class="font-bold" style="color:var(--text-primary)">Insights</span>
            </div>
            <div id="ai-insights-cards" class="space-y-3">
                <div class="flex items-center gap-2 p-4 rounded-xl" style="background:var(--bg-secondary)">
                    <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
                    <span style="font-size:13px;color:var(--text-secondary)">Loading insights...</span>
                </div>
            </div>
        </div>

        <!-- AI Chart Section -->
        <div id="ai-chart-section" class="mb-4" style="display:none">
            <div class="rounded-xl p-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
                <h4 id="ai-chart-title" class="text-sm font-semibold mb-2" style="color:var(--text-primary)"></h4>
                <div style="position:relative;height:200px">
                    <canvas id="ai-dynamic-chart"></canvas>
                </div>
            </div>
        </div>

        <!-- AI Chat Section -->
        <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border)">
            <div class="flex items-center gap-2 p-3" style="background:var(--bg-secondary);border-bottom:1px solid var(--border)">
                <i class="fas fa-robot" style="color:var(--accent)"></i>
                <span class="font-bold text-sm" style="color:var(--text-primary)">Ask AI</span>
                <span style="font-size:11px;color:var(--text-secondary);margin-left:auto">Powered by Gemini</span>
            </div>
            <div id="ai-chat-messages" class="p-3 space-y-3" style="max-height:300px;overflow-y:auto;background:var(--bg-primary)">
                <div class="flex items-start gap-2">
                    <i class="fas fa-robot text-sm mt-1" style="color:var(--accent)"></i>
                    <div class="rounded-lg p-2.5" style="background:var(--bg-secondary);font-size:13px;color:var(--text-primary);line-height:1.4;max-width:85%">
                        Hi! I have access to your productivity data. Ask me anything — e.g., "When did I last complete a goal?" or "How many times have I done habit X?"
                    </div>
                </div>
            </div>
            <div class="flex gap-2 p-3" style="border-top:1px solid var(--border);background:var(--bg-secondary)">
                <input id="ai-chat-input" type="text" placeholder="Ask about your productivity..."
                    class="flex-1 px-3 py-2 rounded-lg text-sm"
                    style="background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);outline:none"
                    onkeydown="if(event.key==='Enter')sendAIChat()">
                <button onclick="sendAIChat()" class="px-3 py-2 rounded-lg" style="background:var(--accent);color:white;border:none;cursor:pointer">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;

    // Load insights
    loadAIPanelInsights();
}

let aiDynamicChart = null;

async function loadAIPanelInsights() {
    const data = gatherAIData();
    const result = await callAI('insights', data);

    const cardsContainer = document.getElementById('ai-insights-cards');
    if (!cardsContainer) return;

    if (!result || !result.insights) {
        cardsContainer.innerHTML = `
            <div class="p-3 rounded-xl" style="background:var(--bg-secondary)">
                <p style="font-size:13px;color:var(--text-secondary)">Could not load insights. Make sure GEMINI_API_KEY is set in Supabase secrets.</p>
            </div>
        `;
        return;
    }

    // Render insight cards
    const insights = result.insights || [];
    cardsContainer.innerHTML = insights.map((insight, i) => `
        <div class="rounded-xl p-3" style="background:var(--bg-secondary);border:1px solid var(--border)">
            <div class="flex items-start gap-2">
                <i class="fas fa-${i === 0 ? 'lightbulb' : 'chart-bar'} mt-0.5" style="color:${i === 0 ? 'var(--warning)' : 'var(--accent)'};font-size:14px"></i>
                <p style="font-size:13px;color:var(--text-primary);line-height:1.4">${escapeHtml(insight)}</p>
            </div>
        </div>
    `).join('');

    // Render AI chart if provided
    if (result.chart) {
        renderAIDynamicChart(result.chart);
    }
}

function renderAIDynamicChart(chartConfig) {
    const section = document.getElementById('ai-chart-section');
    const titleEl = document.getElementById('ai-chart-title');
    const ctx = document.getElementById('ai-dynamic-chart');
    if (!section || !ctx) return;

    section.style.display = 'block';
    if (titleEl) titleEl.textContent = chartConfig.title || 'AI Analysis';

    if (aiDynamicChart) aiDynamicChart.destroy();

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

    // Handle doughnut border for dark mode
    if (type === 'doughnut') {
        config.data.datasets[0].borderWidth = 3;
        config.data.datasets[0].borderColor = dark ? '#1C1C1E' : '#FFFFFF';
    }

    aiDynamicChart = new Chart(ctx, config);
}

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

    // Add user message to UI
    messagesContainer.innerHTML += `
        <div class="flex items-start gap-2 justify-end">
            <div class="rounded-lg p-2.5" style="background:var(--accent);color:white;font-size:13px;line-height:1.4;max-width:85%">
                ${escapeHtml(userMessage)}
            </div>
        </div>
    `;

    // Add loading indicator
    const loadingId = 'ai-loading-' + Date.now();
    messagesContainer.innerHTML += `
        <div id="${loadingId}" class="flex items-start gap-2">
            <i class="fas fa-robot text-sm mt-1" style="color:var(--accent)"></i>
            <div class="rounded-lg p-2.5" style="background:var(--bg-secondary);font-size:13px;color:var(--text-secondary)">
                <div class="flex items-center gap-2">
                    <div class="spinner" style="width:14px;height:14px;border-width:2px"></div>
                    Thinking...
                </div>
            </div>
        </div>
    `;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Add to chat history
    aiChatHistory.push({ role: 'user', content: userMessage });

    // Gather full data context
    const data = gatherFullDataForChat();

    const systemPrompt = `You are a personal productivity assistant. The user's timezone is Melbourne, Australia. Today is ${getMelbourneDateString()}. Answer questions about their habits, tasks, goals, and productivity data. Be specific with dates and numbers. If asked about a specific habit or task, search through all the data to find matches.`;

    const result = await callAI('chat', data, aiChatHistory, systemPrompt);

    // Remove loading
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    const aiResponse = result?.response || 'Sorry, I couldn\'t process that request. Please try again.';
    aiChatHistory.push({ role: 'assistant', content: aiResponse });

    // Add AI response to UI
    messagesContainer.innerHTML += `
        <div class="flex items-start gap-2">
            <i class="fas fa-robot text-sm mt-1" style="color:var(--accent)"></i>
            <div class="rounded-lg p-2.5" style="background:var(--bg-secondary);font-size:13px;color:var(--text-primary);line-height:1.4;max-width:85%">
                ${formatAIResponse(aiResponse)}
            </div>
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

async function loadAnalyticsAIChart() {
    const section = document.getElementById('analytics-ai-chart-section');
    const textContainer = document.getElementById('analytics-ai-insights-text');
    const ctx = document.getElementById('analytics-ai-chart');
    if (!section || !ctx) return;

    const todayStr = getMelbourneDateString();

    // Use cached insights if available from same day
    let result = aiCache.calendarInsights;
    if (!result || aiCache.calendarInsightsDate !== todayStr) {
        const data = gatherAIData();
        result = await callAI('insights', data);
        if (result) {
            aiCache.calendarInsights = result;
            aiCache.calendarInsightsDate = todayStr;
        }
    }

    if (!result || !result.chart) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Render insight text
    if (textContainer && result.insights) {
        textContainer.innerHTML = result.insights.map(line => `
            <p style="font-size:12px;color:var(--text-secondary);line-height:1.4;margin-bottom:3px">${escapeHtml(line)}</p>
        `).join('');
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
    // Send more detailed data for chat context
    const data = gatherAIData();

    // Add raw habit list with IDs for specific queries
    data.habitsList = appState.habits.map(h => ({
        name: h.name,
        emoji: h.emoji,
        frequency: h.frequency,
        archived: h.archived
    }));

    // Add all completions summary (grouped by habit)
    const completionsByHabit = {};
    appState.habitCompletions.forEach(c => {
        const habit = appState.habits.find(h => h.id === c.habit_id);
        const name = habit ? habit.name : 'Unknown';
        if (!completionsByHabit[name]) completionsByHabit[name] = [];
        completionsByHabit[name].push(c.completion_date);
    });
    data.habitCompletionHistory = completionsByHabit;

    // Add completed tasks with dates
    data.completedTasksList = appState.tasks
        .filter(t => t.is_completed && t.completed_at)
        .map(t => ({
            title: t.title,
            completedAt: t.completed_at,
            category: t.category?.name,
            goal: t.goal?.name
        }));

    // Add goal completion info
    data.goalsList = appState.goals.map(g => ({
        name: g.name,
        status: g.status,
        emoji: g.emoji,
        dueDate: g.due_date
    }));

    return data;
}
