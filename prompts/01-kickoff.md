# Первый промпт агенту (вставь целиком в Claude Code или Codex)

Прочитай AGENTS.md, docs/CONTEXT.md, docs/SPEC.md и docs/PLAN.md.

Задача на сегодня — «День 1» из docs/PLAN.md:
1. Инициализируй проект: Next.js (App Router) + TypeScript + Tailwind + Zod + Vitest.
   Добавь npm-скрипты lint, typecheck (tsc --noEmit), test (vitest run). Создай .env.example
   с OPENAI_API_KEY, OPENAI_MODEL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_MODE.
   Не удаляй существующие файлы docs/, fixtures/, prompts/, AGENTS.md, CLAUDE.md.
2. Реализуй lib/schema.ts (Zod-схемы из SPEC §5) и lib/validate.ts (validateLessonPlan с инвариантами 1–6 из SPEC §5).
3. Напиши tests/validate.test.ts по SPEC §8 на fixtures/demo-lesson.ru.json + два сломанных варианта.
4. Прогони lint, typecheck, test — всё должно быть зелёным.

Сначала покажи короткий план (файлы и шаги), дождись моего «ок», потом пиши код.
В конце: что сделано, как запустить, и объясни в 3–4 предложениях, как работает validateLessonPlan,
чтобы я мог объяснить это на защите.
