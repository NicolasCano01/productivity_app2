// ============================================
// PRODUCTIVITY HUB - STATE MANAGEMENT
// ============================================

// Global Supabase Client
let supabaseClient = null;

// Midnight watcher — tracks last-checked Melbourne date for habit auto-reset
let lastCheckedDate = '';

// Current Panel State
let currentPanel = 'habits';
let currentTaskView = 'all'; // 'all', 'overdue', 'upcoming'

// Habit log date — allows logging completions for past dates
let habitLogDate = ''; // set to getMelbourneDateString() on init

// Modal State
let editingHabitId = null;
let editingTaskId = null;
let editingGoalId = null;
let editingCategoryId = null; 

// Application State
const appState = {
    categories: [],
    habits: [],
    tasks: [],
    goals: [],
    habitCompletions: [],
    habitStreaks: [],
    isLoading: true,
    error: null
};
