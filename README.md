# AulSabaq AI

ИИ-помощник для учителей малокомплектных школ Казахстана: совмещённый урок для 2–3 классов за минуты,
карточки для самостоятельной работы и подсказки ученикам без готовых ответов.

Заявка на Codex Challenge (Bilim AI × OpenAI, ChatGPT Edu).

## Запуск
```bash
npm install
cp .env.example .env.local   # для демо ключи не нужны
npm run dev                  # http://localhost:3000
```
Проверки: `npm run lint && npm run typecheck && npm test`.

Дальше — по `docs/PLAN.md`, промпты на каждый день в `prompts/02-next-days.md`.

## Файлы
| Файл | Зачем |
|---|---|
| `AGENTS.md` | Правила для AI-агента (Codex читает его сам; Claude Code — через `CLAUDE.md`) |
| `docs/CONTEXT.md` | Конкурс: календарь, баллы, критерии, конкуренты, цифры о проблеме |
| `docs/SPEC.md` | Что строим: сценарии, модель данных, инварианты, промпты, тесты |
| `docs/PLAN.md` | План по дням до финала с чек-листами сдачи |
| `docs/PROJECT_PASSPORT.md` | Черновик паспорта проекта (сдаётся вместе с MVP) |
| `fixtures/demo-lesson.ru.json` | Готовый урок для демо-режима и тестов (2 и 4 класс, математика) |
| `prompts/` | Промпты для агента |
