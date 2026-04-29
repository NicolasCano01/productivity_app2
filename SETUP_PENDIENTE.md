# ✅ Productivity Hub — Setup Pendiente

Todo el código ya está deployado en GitHub Pages. Lo que queda son **configuraciones manuales** que no se pueden automatizar porque requieren cuentas externas o acceso a bases de datos. Son 4 pasos independientes — podés hacer cualquiera sin los otros.

---

## Índice

1. [Gemini AI (Obligatorio para que funcione el AI)](#1-gemini-ai)
2. [Supabase: Múltiples categorías + objetivos](#2-supabase-migracion)
3. [Google Sheets Backup](#3-google-sheets-backup)
4. [Google Tasks Sync](#4-google-tasks-sync)

---

## 1. Gemini AI

> **Impacto:** Sin esto, el AI no funciona (insights, quotes, chat, habit insights). Es el cambio más importante.

> **Seguridad:** Como el repositorio es público, la API key se guarda como **Supabase Secret** (nunca en el código). La app llama a un Edge Function que actúa de proxy — la key jamás queda expuesta.

### Cómo obtener la API key (gratis)

1. Ir a **[aistudio.google.com](https://aistudio.google.com)**
2. Iniciar sesión con tu cuenta de Google
3. Click en **"Get API key"** → **"Create API key"**
4. Copiar la key (empieza con `AIza...`)

### Configurarlo en Supabase (no en el repo)

1. Ir a **[supabase.com](https://supabase.com)** → iniciar sesión
2. Abrir el proyecto **`byowdkmuurbrvkuydhml`**
3. En el menú izquierdo → **Edge Functions**
4. Click en la función **`ai-proxy`**
5. Click en la pestaña **Secrets** (o buscar en la sidebar "Secrets")
6. Click **"Add new secret"** (o el botón `+`)
   - **Name:** `GEMINI_API_KEY`
   - **Value:** `AIza-TuKeyAqui...`
7. Guardar

No hay que hacer ningún commit — la key nunca está en el código ni en GitHub.

### Verificar que funciona

Abrir la app → panel Calendar → esperar que aparezca la frase motivacional y los AI Insights. Si aparecen, está funcionando.

También: ir al panel **Habits** → click en cualquier hábito → debería aparecer el "AI Insight" en el panel de la derecha (desktop).

> **Nota sobre costos:** Gemini tiene un free tier generoso (vía Google AI Studio). Con el uso normal de esta app (1-2 veces por día) no debería costar nada.

---

## 2. Supabase: Migración (Múltiples categorías + Objetivos)

> **Impacto:** Sin esto, las funciones de múltiples categorías y la checklist de objetivos en las tareas quedan desactivadas (la UI aparece pero no guarda los datos extra).

### Qué hace esta migración

Crea dos tablas nuevas en tu base de datos Supabase:
- **`task_categories`** — permite asignar más de una categoría por tarea
- **`task_objectives`** — permite agregar sub-tareas/checklist dentro de una tarea

También migra automáticamente las categorías existentes al nuevo sistema.

### Pasos

1. Ir a **[supabase.com](https://supabase.com)** → iniciar sesión
2. Abrir el proyecto **`byowdkmuurbrvkuydhml`** (el que ya usa la app)
3. En el menú izquierdo → **SQL Editor**
4. Click en **New query**
5. Copiar y pegar el contenido completo de este archivo:

```
sql/migrations.sql
```

El código completo es:

```sql
-- Multiple categories per task
CREATE TABLE IF NOT EXISTS task_categories (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE(task_id, category_id)
);

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on task_categories"
    ON task_categories FOR ALL USING (true) WITH CHECK (true);

INSERT INTO task_categories (task_id, category_id)
SELECT id, category_id FROM tasks WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Task objectives / sub-tasks checklist
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
```

6. Click **Run** (o `Ctrl+Enter`)
7. Verificar que dice `Success. No rows returned`

### Verificar que funciona

Abrir la app → crear o editar una tarea → deberías ver:
- El selector de categorías como **pills de colores** (en lugar del dropdown)
- La sección **Objectives** con un input para agregar sub-tareas

---

## 3. Google Sheets Backup

> **Impacto:** El botón "Backup to Google Sheets Now" en el modal de backup no funciona sin este setup.

### Cómo funciona

Desplegás un pequeño script en Google Apps Script que actúa como receptor. La app envía tus tareas al script, y el script las escribe en una hoja de cálculo que vos controlás.

### Pasos

#### 3.1 — Crear la hoja de cálculo

1. Ir a **[sheets.google.com](https://sheets.google.com)**
2. Click en **+** para crear una hoja nueva
3. Darle un nombre, por ejemplo: `Productivity Hub Backup`

#### 3.2 — Crear el Apps Script

1. En la hoja → menú **Extensions** → **Apps Script**
2. Se abre el editor de scripts
3. **Borrar** todo el código que viene por defecto
4. En la app de Productivity Hub → click en el ícono de nube (header) → "How to set up →" → expandir "Show Apps Script code"
5. Copiar todo ese código y pegarlo en el editor de Apps Script

#### 3.3 — Deployar como Web App

1. En Apps Script → click **Deploy** → **New deployment**
2. Click en el engranaje ⚙️ al lado de "Select type" → elegir **Web App**
3. Configurar:
   - **Description:** `Productivity Hub Backup`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**
5. Si pide permisos → click **Authorize access** → elegir tu cuenta Google → click **Allow**
6. Copiar la **Web App URL** (empieza con `https://script.google.com/macros/s/...`)

#### 3.4 — Pegar la URL en la app

1. Abrir Productivity Hub → click ícono nube en el header
2. Pegar la URL en el campo **"Paste your Google Apps Script web app URL"**
3. Click **"Backup to Google Sheets Now"**

Si funciona verás un toast verde con la cantidad de tareas guardadas. La hoja de cálculo tendrá una pestaña llamada **"Tasks"**.

> **Nota:** El backup automático se activa solo si pasaron más de 24h desde el último backup. Se ejecuta silenciosamente al abrir la app.

---

## 4. Google Tasks Sync

> **Impacto:** El botón "Connect Google Tasks" en el modal de backup no funciona sin este setup. Es el más largo de configurar pero solo se hace una vez.

### Cómo funciona

La app sincroniza las tareas con fecha de vencimiento hacia una lista llamada "Productivity Hub" en tu Google Tasks. No borra tareas existentes, solo agrega las nuevas.

### Pasos

#### 4.1 — Crear un proyecto en Google Cloud

1. Ir a **[console.cloud.google.com](https://console.cloud.google.com)**
2. En el menú superior → click en el selector de proyecto → **New Project**
3. Nombre: `Productivity Hub` → click **Create**
4. Seleccionar el proyecto recién creado

#### 4.2 — Activar la Google Tasks API

1. En el menú izquierdo → **APIs & Services** → **Library**
2. Buscar **"Google Tasks API"**
3. Click en el resultado → click **Enable**

#### 4.3 — Crear credenciales OAuth

1. En el menú izquierdo → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Si te pide configurar la pantalla de consentimiento:
   - Click **Configure Consent Screen**
   - User Type: **External** → **Create**
   - App name: `Productivity Hub`
   - User support email: tu email
   - Developer contact email: tu email
   - Click **Save and Continue** en todas las pantallas hasta terminar
   - Volver a **Credentials** → **+ Create Credentials** → **OAuth client ID**
4. Application type: **Web application**
5. Name: `Productivity Hub Web`
6. **Authorized JavaScript origins** → click **+ Add URI**:
   ```
   https://nicolascano01.github.io
   ```
7. **Authorized redirect URIs** → click **+ Add URI**:
   ```
   https://nicolascano01.github.io/productivity_app2/oauth-callback.html
   ```
8. Click **Create**
9. Se abre un popup con el **Client ID** — copiarlo (formato: `XXXXXXXXXX.apps.googleusercontent.com`)

> **Si la app está en otro dominio/URL**, reemplazar `https://nicolascano01.github.io` y la redirect URI con tu URL real.

#### 4.4 — Agregar el Client ID a la app

Abrir el archivo:
```
js/config.js
```

Reemplazar esta línea:
```javascript
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';
```
Por:
```javascript
const GOOGLE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
```

Guardar → commit → push:
```bash
git add js/config.js
git commit -m "Add Google Client ID for Tasks sync"
git push origin main
```

#### 4.5 — Publicar la app OAuth (agregar test user)

Mientras la app esté en modo "Testing", solo vos podés usarla.

1. Ir a **APIs & Services** → **OAuth consent screen**
2. En la sección **Test users** → **+ Add Users**
3. Agregar tu email de Google
4. Click **Save**

#### 4.6 — Conectar desde la app

1. Abrir Productivity Hub → ícono nube en el header
2. Al final del modal → sección "Google Tasks Sync"
3. Click **"Connect Google Tasks"**
4. Se abre un popup de login de Google → autorizar
5. El popup se cierra solo y aparece "✅ Connected"
6. Click **"Sync Tasks to Google Tasks"**

Las tareas con fecha de vencimiento van a aparecer en la app de Google Tasks bajo la lista "Productivity Hub".

---

## Resumen rápido

| Tarea | Tiempo estimado | Necesita |
|-------|----------------|----------|
| 1. Gemini AI key | 5 min | Cuenta de Google |
| 2. Supabase migration | 2 min | Acceso al dashboard de Supabase |
| 3. Google Sheets backup | 10 min | Cuenta de Google |
| 4. Google Tasks sync | 20 min | Cuenta de Google + Google Cloud |

**Orden recomendado:** 1 → 2 → 3 → 4

---

## Archivos de referencia

| Archivo | Qué contiene |
|---------|-------------|
| `js/config.js` | Google Client ID (Gemini key va en Supabase Secrets, no aquí) |
| `sql/migrations.sql` | SQL listo para correr en Supabase |
| `oauth-callback.html` | Página técnica para el login de Google (no modificar) |
| `js/google-tasks.js` | Lógica de sincronización con Google Tasks |
| `js/backup.js` | Lógica de backup CSV y Google Sheets |
