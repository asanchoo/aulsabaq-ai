# AGENTS.md — AulSabaq AI

Инструкция для AI-агента (Claude Code / Codex), который работает в этом репозитории.
Читай целиком перед любой задачей.

## Что мы строим
AulSabaq AI — веб-приложение для учителей малокомплектных (сельских) школ Казахстана,
где один учитель ведёт урок одновременно для 2–3 классов в одном кабинете.
ИИ строит совмещённый урок на 45 минут, готовит карточки для самостоятельной работы
и даёт группе, которая работает без учителя, помощника с подсказками (без готовых ответов).

Проект — заявка на **Codex Challenge** (Bilim AI × OpenAI, ChatGPT Edu, Tech Orda).
Полный контекст: `docs/CONTEXT.md`. Спецификация: `docs/SPEC.md`. План: `docs/PLAN.md`.

## Порядок работы (обязательный)
SPEC → PLAN → IMPLEMENT → REVIEW.
1. Перед кодом перечитай нужный раздел `docs/SPEC.md`.
2. Для задачи больше ~30 строк — сначала короткий план (файлы, шаги), потом код.
3. После изменений: `npm run lint && npm run typecheck && npm test`. Не говори «готово», пока это не прошло.
4. В конце — короткое ревью: что сделано, что не сделано, риски.

Автор проекта — Асан, он учится. Объясняй ключевые архитектурные решения в 1–2 фразах,
чтобы он понимал код, а не просто получал его. Не делай магии, которую он не сможет защитить на финале.

## Стек
- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres) — хранение уроков и прогресса учеников
- OpenAI API — генерация (Structured Outputs по JSON-схеме)
- Zod — валидация всего, что приходит от модели
- Vitest — тесты
- Деплой: Vercel

## Жёсткие правила
- **Рецензент запускает продукт сам, без автора и без покупки подписки.**
  Поэтому: никакой обязательной регистрации; ключ модели только на сервере (`OPENAI_API_KEY` или `GEMINI_API_KEY`
  в env, никогда в клиенте); есть **демо-режим** (`DEMO_MODE=true` или кнопка «Демо-урок»),
  который работает из `fixtures/` без вызова модели.
- Провайдер модели — OpenAI или Gemini (`AI_PROVIDER`), ключ и модель только из env
  (`OPENAI_API_KEY`/`OPENAI_MODEL` или `GEMINI_API_KEY`/`GEMINI_MODEL`), не хардкодить.
- Всё, что вернула модель, проходит через Zod-схему и `validateLessonPlan()`. Если невалидно —
  до двух повторных попыток с перечнем нарушений, затем понятная ошибка пользователю.
  Расписание по минутам считает код (`lib/schedule.ts`), модель пишет только содержание.
- Rate limit на API-роуты (по IP, счётчик в базе): 10 уроков/час, подсказки и ответы с запасом на весь класс.
- База: таблицы закрыты, сервер вызывает только функции из `supabase/schema.sql`; права проверяет сама функция.
- Языки интерфейса и контента: казахский и русский (`kk`, `ru`). Все строки UI — в словаре `lib/i18n.ts`, не в JSX.
- Дизайн: макет первого экрана — `design/landing/v3.html`. В UI-текстах без длинных тире и эмодзи; одна пара кнопок (`.btn-primary`, `.btn-secondary`); цвет режима урока только из `components/modes.ts`.
- ИИ для ученика **никогда не даёт готовый ответ** — только наводящие вопросы и подсказки. Это проверяется промптом и тестом.
- Никаких персональных данных учеников: ученик входит по коду урока и имени/номеру, без почты и телефона.
- Секреты в `.env.local`, в репозитории только `.env.example`.

## Next.js 16 — важно
Версия новее, чем в обучающих данных моделей. Перед кодом страниц читай гайды в
`node_modules/next/dist/docs/`. Включены `cacheComponents` и `partialPrefetching`:
- `params` в страницах — Promise; данные, зависящие от адреса (`lessonId`), читать внутри `<Suspense>`;
- вместо `middleware.ts` — `proxy.ts` (у нас он подставляет язык в адрес);
- `PageProps<"/route">` / `LayoutProps` генерирует `next typegen` (входит в `npm run typecheck`).

## Структура
Язык — первый сегмент адреса (`/ru/...`, `/kk/...`): ссылку можно отправить, и она откроется
на нужном языке, а страницы собираются статически. `proxy.ts` перенаправляет `/` на нужный язык.
```
app/
  globals.css              # дизайн-система v3: белый, графит, мята; кнопки .btn, поля .field
  [lang]/layout.tsx        # корневой layout: шрифты, шапка, <html lang>
  [lang]/page.tsx          # лендинг: первый экран, как это работает, для учеников, цифры, финал
  [lang]/teacher/new/page.tsx       # форма совмещённого урока + предпросмотр
  [lang]/teacher/preview/page.tsx   # созданный урок из sessionStorage (до Supabase)
  [lang]/teacher/[lessonId]/page.tsx  # урок из базы (или demo): код для учеников, панель, таймер, правка, печать
  [lang]/join/page.tsx              # ученик вводит код урока, класс и имя
  [lang]/student/[sessionId]/page.tsx # карточки ученика: проверка ответа, «Подсказка», «Мне нужна помощь»
  api/lessons/route.ts     # POST: генерация урока и сохранение (id, код, ключ учителя)
  api/lessons/demo/route.ts          # POST: своя копия демо-урока с кодом, без модели
  api/lessons/[id]/route.ts          # PATCH: правка текстов учителем (x-teacher-token)
  api/lessons/[id]/cards/route.ts    # POST: заменить одну карточку через ИИ
  api/lessons/[id]/students/route.ts # GET: панель учителя; POST: «Помощь оказана»
  api/join/route.ts        # GET ?code: классы урока; POST: вход ученика
  api/student/[sessionId]/route.ts   # GET/POST: карточки и действия ученика (ответ, сверка, готово, помощь)
  api/hint/route.ts        # POST: подсказка ученику (урок → ИИ с guard → запасная)
components/
  LessonScore.tsx          # «партитура» урока с ползунком (лендинг)
  modes.ts                 # цвета режимов урока: графит / мята / серый
  StudentPhone.tsx, Logo.tsx, LessonForm.tsx, LessonView.tsx, LessonPreview.tsx
  TeacherWorkspace.tsx     # код для учеников, «Начать урок», «Редактировать», «Ссылка для себя»
  StudentsPanel.tsx        # ученики по классам, флаг помощи, «Где было трудно» (опрос раз в 5 с)
  LessonRunner.tsx         # таймер урока: что сейчас делает каждый класс и кто следующий
  LessonEditor.tsx         # правка текстов урока и замена карточки
  JoinFlow.tsx, StudentApp.tsx       # вход ученика и его экран
  DemoLive.tsx, RecentLessons.tsx    # копия демо с кодом; уроки на этом устройстве
  LessonTimeline.tsx       # таймлайн: колонки на компьютере, промежутки на телефоне
  TaskCards.tsx            # карточки с подсказкой, print CSS (ответ печатается вверх ногами)
  TopicExplanation.tsx     # объяснение новой темы для каждого класса (правило, шаги, пример, вопросы)
  ExplanationSlides.tsx    # то же объяснение слайдами для показа классу (<dialog>, стрелки)
  LessonActions.tsx        # «Распечатать» / «Скопировать»
  SiteHeader.tsx, LangSwitch.tsx
lib/
  schema.ts                # Zod-схемы: ФОРМА данных
  validate.ts              # validateLessonPlan(): СМЫСЛ — инварианты 1–9 (коды INV-1…9, EXP)
  lesson.ts                # чистые помощники: segmentAt, timeSlots, lessonToText
  demo.ts                  # демо-урок (проходит те же проверки при сборке)
  i18n.ts                  # словарь ru/kk
  schedule.ts              # расписание по минутам считает код: очередь учителя, раскладка карточек
  ai.ts                    # генерация: содержание и объяснения параллельными запросами, проверка, повторные попытки
  arithmetic.ts            # пересчёт равенств вида «6 + 8 = 14» в тексте урока
  providers.ts             # HTTP к OpenAI или Gemini, выбор провайдера по env
  prompts.ts, generation-schema.ts
  rate-limit.ts            # лимиты по IP: счётчик в базе, без базы — в памяти
  db.ts, store.ts          # вызовы функций Supabase (RPC); уроки, ключ учителя (SHA-256), сессии учеников
  student.ts, student-view.ts, check-answer.ts  # правила карточки ученика, что видит ученик, проверка ответа
  edit.ts                  # правка урока учителем: только тексты, расписание не меняется
  local.ts                 # что помнит браузер: уроки учителя с ключом, последняя сессия ученика
proxy.ts                   # / → /ru или /kk по Accept-Language
fixtures/demo-lesson.ru.json
tests/                     # validate, schedule, arithmetic, generation, hint-guard, hint-ai, check-answer, student, edit
supabase/schema.sql        # таблицы, функции и права базы
```

## Команды
```
npm run dev        # локально, http://localhost:3000
npm run lint
npm run typecheck  # next typegen && tsc --noEmit
npm test           # vitest run
npm run build
```
