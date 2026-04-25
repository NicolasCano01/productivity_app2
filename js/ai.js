// ============================================
// PRODUCTIVITY HUB - AI MODULE (powered by Grok / xAI)
// ============================================

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_MODEL = 'grok-3-mini';

// Cache for daily quote and insights (avoid repeated API calls)
// Persisted to localStorage so data survives page reloads within the same day
let aiCache = loadAICacheFromStorage();

function loadAICacheFromStorage() {
    try {
        const stored = localStorage.getItem('aiCache');
        if (stored) {
            const parsed = JSON.parse(stored);
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
            // Only use cache if it's from today
            if (parsed.calendarInsightsDate === todayStr || parsed.dailyQuoteDate === todayStr) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to load AI cache from localStorage:', e);
    }
    return {
        dailyQuote: null,
        dailyQuoteDate: null,
        calendarInsights: null,
        calendarInsightsDate: null,
        panelInsights: null,
        panelInsightsDate: null
    };
}

function saveAICacheToStorage() {
    try {
        localStorage.setItem('aiCache', JSON.stringify(aiCache));
    } catch (e) {
        console.warn('Failed to save AI cache to localStorage:', e);
    }
}

// Call this whenever tasks or habits change so insights stay fresh
function invalidateAIInsightsCache() {
    aiCache.calendarInsights = null;
    aiCache.calendarInsightsDate = null;
    aiCache.panelInsights = null;
    aiCache.panelInsightsDate = null;
    saveAICacheToStorage();
}

// Chat history for AI panel
let aiChatHistory = [];

// ============================================
// AI API CALL (direct to xAI / Grok)
// ============================================
async function callAI(type, data = {}, messages = [], systemPrompt = '') {
    if (!XAI_API_KEY || XAI_API_KEY === 'YOUR_XAI_API_KEY_HERE') {
        console.warn('xAI API key not configured — set XAI_API_KEY in config.js');
        return null;
    }

    try {
        // Build the messages array and expected response format for each type
        let grokMessages;
        let expectJson = true;

        if (type === 'insights') {
            grokMessages = [
                {
                    role: 'system',
                    content: 'You are a productivity analyst. Always respond with valid JSON only — no markdown, no explanation outside the JSON.'
                },
                {
                    role: 'user',
                    content: `Analyze this productivity data and return exactly this JSON shape:
{"insights":["insight 1","insight 2","insight 3"],"chart":{"type":"bar","title":"...","labels":[...],"data":[...],"colors":["#007AFF","#34C759","#FF9500","#FF3B30","#AF52DE"]}}

Rules:
- insights: 3 specific, actionable sentences referencing real numbers from the data
- chart: pick the most interesting metric (tasks per week, habits per day, goal progress, etc.)
- chart.type: "bar", "line", or "doughnut"

Data: ${JSON.stringify(data)}`
                }
            ];
        } else if (type === 'quote') {
            grokMessages = [
                {
                    role: 'system',
                    content: 'You are a motivational writer. Always respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content: `Generate a fresh, inspiring motivational quote for ${data.dayOfWeek}. Context: ${data.context}. Seed: ${data.random}.
Return JSON: {"quote":"...","author":"..."} — use a real historical figure, philosopher, or athlete as author.`
                }
            ];
        } else if (type === 'chat') {
            expectJson = false;
            grokMessages = [
                { role: 'system', content: systemPrompt || 'You are a helpful productivity assistant.' },
                ...messages
            ];
        } else {
            return null;
        }

        const response = await fetch(XAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`
            },
            body: JSON.stringify({
                model: XAI_MODEL,
                messages: grokMessages,
                temperature: type === 'quote' ? 0.9 : 0.7
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('xAI API error:', response.status, errText);
            return null;
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content || '';
        console.log('Grok response for', type, ':', content.substring(0, 200));

        if (!expectJson) {
            return { response: content };
        }

        // Strip markdown code fences if Grok wraps the JSON
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        return JSON.parse(cleaned);
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

    // Gather data first (needed for both cache check and fresh fetch)
    const data = gatherAIData();

    // Insights are cached per day (expensive). Quote is always fresh (random + day-specific).
    let insightsResult = null;
    if (aiCache.calendarInsights && aiCache.calendarInsightsDate === todayStr) {
        insightsResult = aiCache.calendarInsights;
    }

    // Always fetch a fresh quote so it varies across page loads
    // Call insights (if not cached) and quote in parallel
    const [freshInsights, quoteResult] = await Promise.all([
        insightsResult
            ? Promise.resolve(null)
            : callAI('insights', data),
        callAI('quote', {
            dayOfWeek: data.dayOfWeek,
            context: `${data.tasks.completedThisWeek} tasks done this week, ${data.habits.completionsThisWeek} habit completions, ${data.tasks.overdue.length} overdue`,
            random: Math.random()  // ensures AI generates a different quote each call
        })
    ]);

    if (freshInsights) {
        insightsResult = freshInsights;
        aiCache.calendarInsights = freshInsights;
        aiCache.calendarInsightsDate = todayStr;
        saveAICacheToStorage();
    }

    renderCalendarInsights(container, insightsResult, quoteResult);
}

function renderCalendarInsights(container, insights, quote) {
    const insightLines = insights?.insights || [];
    const quoteText = quote?.quote || '';
    const quoteAuthor = quote?.author || '';

    let html = '';

    // Daily Quote FIRST
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

    // AI Text Insights BELOW the quote
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

    const systemPrompt = `You are a personal productivity assistant. The user's timezone is Melbourne, Australia (AEST/AEDT). Today is ${getMelbourneDateString()} (${data.dayOfWeek}).

Key data available:
- completedTasksList: tasks sorted newest-first with completedDateMelbourne field
- lastCompletedTask: the single most recently completed task
- habitCompletionHistory: per-habit completion dates (last 30 days)
- goals, habitsList: full lists

Rules:
- For "last completed task" always use lastCompletedTask field directly
- For counts this week/month use tasks.completedThisWeek / tasks.completedThisMonth
- Always mention specific task names, dates, and counts — never say "I don't have that data" if it's present
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
            saveAICacheToStorage();
        }
    }

    if (!result || !result.chart) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Render insight text as compact cards (max 2)
    if (textContainer && result.insights) {
        const icons = ['lightbulb', 'chart-bar', 'bolt', 'bullseye', 'fire'];
        const colors = ['var(--warning)', 'var(--accent)', '#FF9500', '#34C759', '#FF3B30'];
        textContainer.innerHTML = result.insights.slice(0, 2).map((insight, i) => `
            <div class="rounded-lg p-2.5 mb-2" style="background:var(--bg-tertiary);border:1px solid var(--border)">
                <div class="flex items-start gap-2">
                    <i class="fas fa-${icons[i % icons.length]} mt-0.5" style="color:${colors[i % colors.length]};font-size:13px;flex-shrink:0"></i>
                    <p style="font-size:12px;color:var(--text-primary);line-height:1.4">${escapeHtml(insight)}</p>
                </div>
            </div>
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
