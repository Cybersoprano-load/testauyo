# E2E-тесты (Playwright)

Сценарии, которые ходят в реальный браузер: открывают `http://localhost:5173`, кликают, проверяют что видно. Бэкенд и БД настоящие — это полная проверка стека.

## Быстрый старт — пошагово

### 1. Установите Node.js (один раз)
```sh
brew install node
node --version   # должно показать v20+ или новее
```

### 2. Установите зависимости Playwright (один раз)
```sh
cd ~/todo-app/e2e
npm install
npx playwright install chromium
```
Скачается:
- `node_modules/` с библиотекой `@playwright/test`
- браузер Chromium в `~/Library/Caches/ms-playwright/` (~170 МБ)

### 3. Поднимите стек (каждый раз перед прогоном)
В отдельной вкладке терминала:
```sh
cd ~/todo-app
docker compose up
```
Должны стартовать `db`, `backend`, `frontend`. Проверьте:
- http://localhost:5173 — должна открываться страница входа
- http://localhost:8000/api/health — должен вернуть `{"status":"ok"}`

### 4. Прогоните тесты
В другой вкладке:
```sh
cd ~/todo-app/e2e
npx playwright test
```
Через 5–10 секунд увидите список `✓`/`✘` и итог: `11 passed (6.9s)`.

## Способы запуска

| Команда | Когда использовать |
|---|---|
| `npx playwright test` | Обычный прогон, без браузера на экране. Самое быстрое. |
| `npx playwright test --ui` | **Интерактивный режим**. Открывает окно с деревом тестов, таймлайном, watch-режимом. **Главный инструмент при написании тестов.** |
| `npx playwright test --headed` | Прогон с **видимым** Chromium — окно открывается, можно наблюдать за курсором. |
| `npx playwright test --debug` | Открывает Playwright Inspector — пошаговый дебаггер. Можно ставить точки остановки, выполнять по одному шагу. |
| `npx playwright test --ui tests/auth.spec.ts` | Любой режим + конкретный файл. |
| `npx playwright test -g "регистрация"` | Прогон только тестов, у которых имя содержит «регистрация». |
| `npx playwright codegen http://localhost:5173` | Записать новый тест мышкой. Открывает Chromium + панель-рекордер. |

## Дебаг упавшего теста

После `npx playwright test`:

### A. HTML-отчёт
```sh
npx playwright show-report
```
Откроется http://localhost:9323 — кликабельный отчёт со скриншотами, видео и trace для каждого упавшего теста.

### B. Trace Viewer — главный инструмент
В отчёте у красного теста кнопка **«View trace»** → откроется тот же интерфейс, что и UI mode, но в режиме просмотра.

Что там:
- **Timeline** — все действия теста по времени
- **Snapshot** — DOM на каждом шаге (можно ткнуть в любой момент)
- **Actions** — что именно делал Playwright + подсвеченный элемент
- **Network** — запросы и ответы API
- **Console** — `console.log` со страницы
- **Source** — место в коде теста

### C. Запустить trace для **всех** тестов (не только упавших)
По умолчанию trace пишется только при падении — это экономит место. Чтобы получить trace всегда:
```sh
npx playwright test --trace=on
```
Файлы лягут в `test-results/<имя теста>/trace.zip`. Открыть:
```sh
npx playwright show-trace test-results/auth-регистрация-chromium/trace.zip
```

### D. Шаговая отладка
```sh
npx playwright test --debug -g "регистрация"
```
Откроется Playwright Inspector — кнопки «Step over», «Resume», «Record». Браузер пошагово выполняет действия. Видно, на каком шаге локатор не находит элемент.

## Структура

```
e2e/
├── package.json
├── playwright.config.ts        ← конфиг (baseURL, retries, reporter)
├── tests/
│   ├── auth.spec.ts            ← регистрация, логин, logout
│   ├── tasks.spec.ts           ← CRUD, фильтры, сортировка, статистика
│   ├── theme.spec.ts           ← переключатель темы
│   └── validation.spec.ts      ← негативные сценарии форм
└── support/
    └── user.ts                 ← хелперы: makeTestUser, registerViaUi
```

## Как изолируем данные

Каждый тест регистрирует **уникального** пользователя (`e2e-{random}@example.com`) через `makeTestUser()` в [support/user.ts](support/user.ts). Поэтому тесты не мешают друг другу и не трогают `vborisov@mail.ru`. В БД накопятся `e2e-…` записи — можно периодически чистить:
```sh
docker compose exec db psql -U todo -d todo -c "DELETE FROM users WHERE email LIKE 'e2e-%';"
```

## Типовые ошибки и как их читать

| Ошибка в логе | Что значит |
|---|---|
| `locator.click: Test timeout of 30000ms exceeded` | Элемент не появился за 30 секунд. Скорее всего селектор не находит элемент — открыть trace и в Snapshot посмотреть, что было на странице. |
| `Clicking the checkbox did not change its state` | Чекбокс — controlled-input, состояние обновляется асинхронно. Использовать `.click()` + `await expect(...).toBeChecked()`. |
| Несколько `addTask`, статистика «всего» меньше ожидаемого | Гонка: после клика «Добавить» форма очищается, **но мутация TanStack Query ещё в полёте**. Между добавлениями обязательно ждать появления карточки: `await expect(page.locator(".task-item", { hasText: title })).toBeVisible();` |
| `expect(received).toBeVisible()` | Элемент **есть в DOM**, но не виден (display:none / opacity:0 / за границей окна). |
| `expect(received).toHaveText('X')` Received: `'Y'` | Текст не совпадает — может быть проблема локализации, лишних пробелов, или асинхронной отрисовки. |

## Локаторы — best practice

Предпочитайте «role-based» локаторы — они стабильны и описывают пользовательский опыт, а не структуру HTML:

```ts
// ✅ хорошо — переживёт перестройку CSS
page.getByRole("button", { name: "Войти" })
page.getByLabel("Email")
page.getByText("Здесь пусто.")

// ⚠ только когда нет лучшего варианта
page.locator(".task-item.done")
page.locator("input[type='date']")
```
