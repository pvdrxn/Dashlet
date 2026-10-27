# AGENTS.md — Contexto y Guía de Desarrollo de Dashlet

Monorepo `pnpm` + `Turborepo` para **Dashlet**, una aplicación de productividad de escritorio y web que combina dashboards de widgets en pestañas, calendario por bloques horarios y tablas de datos dinámicas, con autenticación de usuarios y empaquetado nativo en Electron.

---

## 1. Stack y Estructura del Monorepo

| Paquete | Descripción y Tecnologías |
|---|---|
| `apps/frontend` | **React 19.2**, **TypeScript ~6.0**, **Vite 8.1**, **Tailwind CSS 4.1**, **React Router 7**, `@dnd-kit`, `i18next` / `react-i18next`. Corre en el puerto **5173** en desarrollo. |
| `apps/backend` | **NestJS 11** + **Express 5**, **Prisma 6** + **SQLite**, **Passport + JWT** (`@nestjs/jwt`, `bcrypt`), `@nestjs/throttler`. Corre en el puerto **3001** con prefijo global `/api/v1`. |
| `packages/shared` | Paquete `@widget-master/shared`. Tipos, DTOs, constantes y validadores compartidos entre frontend y backend. Exporta TypeScript directo (`main: ./src/index.ts`) sin paso de compilación. |
| `apps/desktop` | Paquete `dashlet-desktop`. **Electron 35.7** + **electron-builder 26**. Orquesta el proceso del backend, sirve el frontend estático (puerto **3002** en producción) y genera el instalador `.exe` en `dist-electron/`. |

---

## 2. Comandos Principales

```bash
# Desarrollo y verificación general
pnpm dev          # Inicia backend (:3001) y frontend (:5173) en paralelo vía Turborepo
pnpm lint         # Ejecuta tsc --noEmit en frontend, backend y shared
pnpm build        # Compila backend y frontend
pnpm format       # Formatea el repositorio con Prettier
pnpm doctor       # Ejecuta react-doctor

# Base de datos (Prisma / SQLite)
pnpm --filter backend db:generate   # Obligatorio tras instalar dependencias o cambiar schema.prisma
pnpm --filter backend db:push       # Sincroniza schema.prisma con apps/backend/prisma/dev.db
pnpm --filter backend db:studio     # Abre Prisma Studio
pnpm --filter backend db:migrate    # Ejecuta migraciones versionadas

# Empaquetado Desktop (Electron)
pnpm --filter dashlet-desktop build:resources   # Compila y copia recursos a apps/desktop/resources/
pnpm --filter dashlet-desktop dist:exe          # Genera el ejecutable en dist-electron/Dashlet-*.exe
```

---

## 3. Arquitectura Actual de la Aplicación

### 3.1 Autenticación y Sesiones (`AuthModule` + `useAuth`)
La aplicación es **multi-usuario** y protege todos los recursos mediante JWT:
- **Backend (`apps/backend/src/auth/`)**:
  - Registro (`POST /api/v1/auth/register`): valida `email`, `username` (`3-20` caracteres alfanuméricos o `_`) y `password` (hasheado con `bcrypt`), y crea en transacción el usuario junto con su primera pestaña (`New tab`).
  - Login (`POST /api/v1/auth/login`), refresh token rotativo (`POST /api/v1/auth/refresh`, persistido en el modelo `Session` con validez de 7 días y access token de 15 minutos) y logout (`POST /api/v1/auth/logout`).
  - Gestión de cuenta (`JwtAuthGuard`): perfil actual (`GET /api/v1/auth/me`), sesiones activas (`GET /api/v1/auth/sessions` y `DELETE /api/v1/auth/sessions/:id`), cambio de contraseña (`PATCH /api/v1/auth/password`), cambio de email (`PATCH /api/v1/auth/email`) y borrado de cuenta en cascada (`DELETE /api/v1/auth/account`).
- **Frontend (`apps/frontend/src/hooks/useAuth.tsx` y `src/api/auth.ts`)**:
  - `AuthProvider` mantiene la sesión activa.
  - `apps/frontend/src/api/auth.ts` gestiona los tokens en memoria, reintenta automáticamente peticiones `401` mediante `/auth/refresh`, y expone `getAccessToken()` para `apps/frontend/src/api/request.ts`.
  - Rutas en `App.tsx`: `/login` (`LoginView`), `/register` (`RegisterView`), `/settings` (`SettingsView`) y `/` (`Dashboard`, que redirige a `/login` si no hay sesión).

### 3.2 Vistas de Nivel Superior (`apps/frontend/src/views/`)
El menú lateral `ViewSidebar` permite alternar entre tres vistas principales registradas en `apps/frontend/src/views/registry.ts` (la vista activa se recuerda en `localStorage` bajo `dashlet-active-view`):

1. **`widgets` (Widget View — `App.tsx`)**:
   - Dashboard principal organizado en pestañas (`TabBar`, reordenables con drag & drop, renombrables y con borrado lógico).
   - Incluye `Toolbar` (menú `+` para agregar o arrastrar widgets nuevos y acceso a la papelera), `WidgetGrid` (uno por pestaña), `TrashWindow` (restauración o borrado definitivo de widgets, pestañas y eventos de calendario) y `TaskPickerModal` (vinculación de tareas con temporizadores Pomodoro).
2. **`calendar` (Calendar View — `apps/frontend/src/views/calendar/CalendarView.tsx`)**:
   - Agenda por meses (ventana efímera de 6 meses antes y 6 meses después del mes actual) y grilla horaria diaria.
   - Los eventos (`CalendarEventDto`) guardan `date` como string local `YYYY-MM-DD`, hora de inicio en minutos desde medianoche (`startMin`, `0..1439`), duración (`durationMin`) y hasta una etiqueta (`tagId`).
   - Sistema de etiquetas (`TagPicker`, `TagFilterChips`) respaldado por `/api/v1/calendar/tags` y la paleta fría de 10 colores (`TAG_COLORS` en `@widget-master/shared`).
3. **`table` (Table View — `apps/frontend/src/views/table/TableView.tsx` y `TableGrid.tsx`)**:
   - Editor completo de tablas de datos del usuario (`/api/v1/tables`).
   - Esquema dinámico de columnas (`TableColumnDto`) con 6 tipos (`text`, `number`, `checkbox`, `date`, `status`, `select`), formatos numéricos (`plain`, `currency`, `percent`, `decimals`), opciones de categoría con color (`ColumnOption`), ancho ajustable por columna y filas reordenables (`position` Float).

### 3.3 Grilla de Widgets y Widgets Disponibles (`apps/frontend/src/widgets/`)
- **Grilla de celdas fijas (`grid-utils.ts`)**:
  - Cada celda mide `80×80px` (`CELL_W = 80`, `CELL_H = 80`) con separación de `8px` (`CELL_GAP = 8`).
  - El número de columnas se calcula dinámicamente según el ancho del contenedor (`colsForWidth`, entre `3` y `24` columnas; base `GRID_COLS = 12`).
  - La posición y el tamaño se expresan siempre en celdas enteras (`Position: { x, y, w, h }`).
  - `resolveDrop` evita solapamientos empujando los widgets afectados hacia el lado más corto o hacia abajo.
- **Modo retraído (Collapsed Readout)**:
  - Todo widget puede retraerse a `1` celda de alto (`COLLAPSED_CELLS_H = 1`, `config.collapsed = true`).
  - Cuando está retraído, el cuerpo del widget se desmonta y `WidgetFrame` renderiza el resumen puro definido en `collapsedSummary` (`collapsed-summaries.ts`), botones rápidos opcionales (`collapsedActions`) y suscripción en vivo (`live-config.ts` mediante `useSyncExternalStore` para widgets con `live: true`).
- **Arrastre y transferencia (`drag-session.ts`)**:
  - Soporta arrastrar widgets nuevos desde el `Toolbar` usando DnD nativo (`WIDGET_DRAG_MIME = 'application/x-dashlet-widget'`) con previsualización de celda en la grilla, así como mover widgets existentes entre pestañas soltándolos sobre una pestaña en `TabBar`.
- **Widgets registrados (`WIDGET_TYPES` en `@widget-master/shared`)**:
  1. `todo-list` (`TodoListWidget`): Lista de tareas con urgencia (`0..3`), persistida en `config.items`. Se comunica con `pomodoro` vía `widget-bus.ts`.
  2. `pomodoro` (`PomodoroWidget`): Temporizador (Pomodoro / Stopwatch), motor en `pomodoro/timer.ts`, estado en vivo en `live-config.ts`, vinculable a tareas de `todo-list`.
  3. `notes` (`NotesWidget`): Notas de texto libre guardadas en `config.content`.
  4. `calculator` (`CalculatorWidget`): Calculadora con historial y último resultado en `config`.
  5. `habit-tracker` (`HabitTrackerWidget`): Registro de hábitos diarios en `config.habits`.
  6. `diary` (`DiaryWidget`): Diario paginado por fecha en `config.entries`.
  7. `data-table` (`DataTableWidget`): Vista compacta de una tabla de `TablesModule`. Crea perezosamente su tabla en el backend al montarse, guarda `tableId`, `rows`, `columns` y `updatedAt` en `config`, e incluye `headerAction` para abrir la tabla completa en `TableView` (evento `OPEN_TABLE_EVENT`).

---

## 4. Base de Datos y Rutas de API

### 4.1 Configuración de SQLite
- Archivo de base de datos en desarrollo: `apps/backend/prisma/dev.db`.
- Requiere `apps/backend/.env` (ignorado en git):
  ```env
  DATABASE_URL="file:./dev.db"
  PORT=3001
  JWT_SECRET="dev-secret-change-in-production"
  ```
- En `NODE_ENV !== 'production'`, `PrismaService.onModuleInit` ejecuta automáticamente `npx prisma db push --skip-generate`.

### 4.2 Modelos en `apps/backend/prisma/schema.prisma`
- `User` y `Session`: Usuarios y refresh tokens activos.
- `Tab` y `Widget`: Pestañas y widgets del usuario (ambos con `deletedAt` para papelera; `Widget.config` y `Widget.position` se almacenan como JSON serializado en texto).
- `CalendarEvent` y `Tag`: Bloques horarios del calendario (`deletedAt` para papelera) y etiquetas por usuario (`@@unique([userId, nameLower])`).
- `DataTable` y `DataRow`: Tablas de datos (`columns` en JSON string) y sus filas (`values` en JSON string indexado por `columnId`, `position` Float).
- `TodoList` y `TodoItem`: Modelos legados sin uso actual (el widget `todo-list` persiste todo en `Widget.config`).

### 4.3 Flujo de Peticiones HTTP (`apps/frontend/src/api/`)
- En **desarrollo**, los clientes de `apps/frontend/src/api/*.ts` usan rutas relativas (`/api/v1/...`) redirigidas a `:3001` por el proxy de `vite.config.ts`.
- En **producción** (`import.meta.env.PROD`), apuntan a `http://localhost:3001/api/v1/...` porque el servidor estático de Electron corre en `:3002` sin proxy.
- Toda petición autenticada debe usar `request()` de `apps/frontend/src/api/request.ts` para incluir el header `Authorization: Bearer <token>`.

---

## 5. Receta: Cómo Agregar un Nuevo Widget

Agregar un widget requiere actualizar **4 puntos**:

1. **`packages/shared/src/index.ts`**:
   - Añadir el identificador en `kebab-case` al union type `WidgetType` y al array `WIDGET_TYPES`.
2. **`apps/frontend/src/widgets/grid-utils.ts`**:
   - Definir las dimensiones en celdas del nuevo tipo en `WIDGET_DEFAULT_SIZE`, `WIDGET_MIN_SIZE` y `WIDGET_MAX_SIZE`.
3. **`apps/frontend/src/widgets/<tipo>/<Nombre>Widget.tsx`**:
   - Crear el componente recibiendo `WidgetComponentProps` (`config`, `onConfigChange`, `widgetId`).
   - **Regla clave**: Todo estado persistente debe vivir en `config` y notificarse mediante `onConfigChange`.
4. **`apps/frontend/src/widgets/index.ts`** (y opcionalmente `collapsed-summaries.ts`):
   - Importar el componente con `lazy(...)`.
   - Llamar a `registerWidget('<tipo>', { component, label, icon, defaultConfig, collapsedSummary, ... })`.

---

## 6. Sistema de Diseño y Convenciones de Código

- **Paleta y Color Semántico (`apps/frontend/src/index.css`)**:
  - **El color comunica estado, nunca adorno.** Las superficies, bordes y textos usan la rampa de grises neutra (`gray-950`/`gray-900` `#121212` canvas, `gray-800` `#191919` superficie de widget/modal, `gray-700` `#383838` controles elevados).
  - **Banda cálida para prioridad/estado**: `--color-p1` (`#868e9a`, bajo/inactivo), `--color-p2` (`#d9a441`, ámbar para activo/en curso/foco de acción), `--color-p2-oscura` (`#b7831d`), `--color-p3` (`#e2703f`, naranja para urgencia alta) y `--color-danger` (`#d4605f`, destructivo/error).
  - **Banda fría para categorías**: Los 10 tonos de `TAG_COLORS` en `@widget-master/shared` se reservan exclusivamente para etiquetas del calendario y opciones de columnas `select`.
- **Radios de borde**:
  - `rounded-lg` (`8px`) para contenedores (widgets, modales, paneles).
  - `rounded` (`4px`) para controles (botones, inputs, chips, menús).
  - `rounded-full` solo para elementos circulares.
- **Escala de `z-index`**:
  - Usar los tokens de `@theme` en `index.css`: `--z-widget` (`0`), `--z-widget-top` (`100`), `--z-sticky` (`1000`), `--z-menu` (`2000`), `--z-modal` (`3000`), `--z-overlay` (`4000`).
- **Tipografía**:
  - **Geist** variable (`100–900`) self-hosted en `apps/frontend/src/assets/fonts/` bajo `--font-sans`. No usar CDNs externos para fuentes o íconos para garantizar que el `.exe` de Electron funcione 100% offline.
- **Estilo de código**:
  - Prettier: comillas simples, `printWidth: 100`, punto y coma, trailing commas, 2 espacios.
  - Mantener DTOs, constantes y validadores compartidos en `packages/shared/src/index.ts` sin duplicarlos entre frontend y backend.

---

## 7. Trampas Conocidas y Verificación

- **`prisma generate` obligatorio**: Si tras un `pnpm install` limpio o un cambio en `schema.prisma` falla la compilación por tipos de `@prisma/client`, ejecutar `pnpm --filter backend db:generate`.
- **Dos versiones de TypeScript**: `apps/frontend` usa `~6.0.2` y `apps/backend` / `packages/shared` usan `^5.8.0`. No unificarlas sin verificar ambos builds.
- **Ignorar `package-lock.json`**: El repositorio usa exclusivamente `pnpm` (`pnpm-lock.yaml`).
- **`build:resources` en desktop**: El script mueve `apps/frontend/dist` hacia `apps/backend/public` y luego limpia ambos al empaquetar; si necesitas el build del frontend después, vuelve a correr `pnpm --filter frontend build`.
- **Verificación antes de finalizar cualquier tarea**:
  ```bash
  pnpm lint
  pnpm build
  ```
  Ambos comandos deben terminar sin errores.
