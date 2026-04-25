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
