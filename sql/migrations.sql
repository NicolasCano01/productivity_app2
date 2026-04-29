-- ============================================================
-- PRODUCTIVITY HUB — MIGRATIONS
-- Run these in your Supabase Dashboard → SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Multiple categories per task (task_categories junction table)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_categories (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE(task_id, category_id)
);

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on task_categories"
    ON task_categories FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing single-category links into the junction table
INSERT INTO task_categories (task_id, category_id)
SELECT id, category_id
FROM   tasks
WHERE  category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Task objectives / sub-tasks checklist
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_objectives (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title         text NOT NULL,
    is_completed  boolean DEFAULT false,
    display_order integer DEFAULT 0,
    created_at    timestamptz DEFAULT now()
);

ALTER TABLE task_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on task_objectives"
    ON task_objectives FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 3. Daily AI insights cache (per user, per day)
--    Stores the AI-generated insights + motivational quote once
--    per day so tokens are not consumed on every page refresh.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_ai_insights (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    insight_date date NOT NULL,
    insights     jsonb NOT NULL DEFAULT '[]',
    quote        text,
    quote_author text,
    chart_data   jsonb,
    created_at   timestamptz DEFAULT now(),
    UNIQUE(user_id, insight_date)
);

ALTER TABLE daily_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own daily insights"
    ON daily_ai_insights FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Per-habit AI insight cache (one JSONB column per day row)
--    Keys are habit UUIDs, values are the AI insight objects.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE daily_ai_insights
    ADD COLUMN IF NOT EXISTS habit_insights jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- 5a. Sticky notes — Board panel notes stored in Supabase so
--     they sync across devices.  Falls back to localStorage
--     if the DB is unreachable.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sticky_notes (
    id         text        PRIMARY KEY,             -- 'note_<timestamp>_<rand>' (matches client ids)
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content    text        NOT NULL,
    color      text        NOT NULL DEFAULT '#FEF08A',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sticky_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sticky notes"
    ON sticky_notes FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 5b. Keep-alive table — write-pinged every 20 min while the
--     app is open (and on startup if >3 days since last ping)
--     so the free-tier Supabase project never goes idle/paused.
--     Rows are inserted and immediately deleted; the table stays
--     empty at all times.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _keepalive (
    id        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    pinged_at timestamptz DEFAULT now()
);

ALTER TABLE _keepalive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on _keepalive"
    ON _keepalive FOR ALL USING (true) WITH CHECK (true);
