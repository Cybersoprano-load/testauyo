---
name: space-video-reporter
description: |
  Use this skill to build a space-themed video report (MP4) with Russian voiceover
  from a JSON manifest of slides. Each slide is one of: launch (rocket takes off),
  starfield (cosmic background with text), planet (planet hero shot), crash
  (used to report a bug, problem, or failure — explosion + red shake), rescue
  (used to show a fix or recovery — calm rocket + green planet). Procedurally
  generates frames with PIL/numpy and composites them with ffmpeg. Voiceover is
  macOS `say` (no API keys needed). Output runs ~15s per slide, so an 8-slide
  manifest gives ~2 minutes.
  TRIGGER when the user asks for "видеоотчёт", "космическое видео", "сделай ролик",
  "video report", "report as a video", "отчёт в виде видео", or wants a multimedia
  summary of work done (especially when bugs were found and fixed — those map
  cleanly to crash/rescue scenes).
---

# space-video-reporter

Скилл собирает MP4-видеоотчёт со звуком на космическую тематику. Все ассеты генерируются процедурно (звёздное небо, планеты с шумом Перлина, ракета, взрыв) — никаких внешних API не нужно. Голос — встроенный macOS `say -v Milena`.

## Когда применять

- Пользователь просит «прислать отчёт в виде видео», «сделай ролик», «space video», «видеоотчёт».
- Закончилась серия задач (тесты прошли / нашли и починили баги / сделали миграцию) и нужно показать визуально, что произошло.
- Особенно подходит, если в работе были «провалы и спасения» — они хорошо ложатся на `crash` → `rescue` сцены.

## Требования к окружению

- macOS (для `say`).
- `ffmpeg` в PATH (`brew install ffmpeg`).
- Python 3 с `Pillow` и `numpy` (`pip install Pillow numpy`).

## Использование

```bash
python3 agent/skills/space-video-reporter/scripts/render.py manifest.json report.mp4
```

`manifest.json` — массив слайдов. Минимум для каждого: `kind` и `text`.

```json
[
  { "kind": "launch",    "text": "Запускаем тестирование Todo-приложения" },
  { "kind": "starfield", "text": "Развёрнуто двадцать пять API-тестов" },
  { "kind": "crash",     "text": "Обнаружена угроза: контракт ошибок API расходился с тестами" },
  { "kind": "rescue",    "text": "Угроза устранена: обновили скилл и AGENT.md" },
  { "kind": "planet",    "text": "Все изменения готовы к коммиту" },
  { "kind": "launch",    "text": "Миссия выполнена. До связи!" }
]
```

Полный формат — см. [references/manifest_schema.md](references/manifest_schema.md).

## Виды сцен (`kind`)

| kind | визуал | музыкальная роль |
|---|---|---|
| `launch` | ракета поверх звёздного поля + земля внизу | начало / окончание |
| `starfield` | чистое звёздное небо + туманность | информация, статистика |
| `planet` | большая планета по центру | смысловая остановка, итоги |
| `crash` | красная планета + взрыв + красный мерцающий fade | сообщение о проблеме / падении / баге |
| `rescue` | ракета + зелёная планета (всё хорошо) | сообщение о фиксе / выходе из ситуации |

## Как добавить новую сцену

1. В `scripts/render.py` дописать функцию-рендер в `render_scene()` (новый `kind`).
2. По желанию — особый ffmpeg-фильтр в `render_slide()`.
3. Документировать в [references/manifest_schema.md](references/manifest_schema.md).

## Ограничения

- Это процедурная анимация, а не генеративная (нет Sora/Runway). Стиль — стилизованный, не фотореалистичный.
- Голос — macOS `say` (синтетический). Замена на ElevenLabs возможна, но не из коробки.
- Финальное видео — 1920×1080 @ 30fps, H.264 + AAC, ~5–10 MB на 2 минуты.
- Длительность каждого слайда = длина озвучки + 1 секунда (или явно заданный `duration`, который больше).
