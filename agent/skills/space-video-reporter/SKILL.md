---
name: space-video-reporter
description: |
  Use this skill to build a fully animated space-themed video report (MP4) with
  a natural-sounding Russian voiceover (Piper TTS) from a JSON manifest of
  slides. Each slide is one of: launch (rocket lifts off with smoke trail and
  rumble), starfield (parallax stars with text), planet (rotating planet hero
  shot), crash (used to report a bug or failure — rotating red planet, shake,
  flash, expanding particle explosion, boom SFX), rescue (used to show a fix
  or recovery — rocket flies across to a green planet, triumphant chime).
  All visuals are rendered per-frame with PIL + numpy (no slideshow): parallax
  starfields drift, planets rotate, rockets fly with smoke particles, explosions
  expand with gravity. Audio mixes narration + scene SFX + ambient music bed.

  TRIGGER when the user asks for "видеоотчёт", "космическое видео", "сделай
  ролик", "report as a video", "отчёт в виде видео", or wants a multimedia
  summary of work done — especially when bugs were found and fixed, which map
  cleanly to crash → rescue scenes.
---

# space-video-reporter

Скилл собирает **полностью анимированный** MP4-отчёт со звуком на космическую тематику:

- **Голос** — [Piper TTS](https://github.com/rhasspy/piper) (локальный нейронный TTS, MIT, без API). Русский голос `ru_RU-irina-medium` — звучит близко к живому.
- **Картинка** — покадровая процедурная анимация (PIL + numpy):
  - параллакс из трёх слоёв звёзд с разной скоростью,
  - планеты с цилиндрической текстурой и UV-вращением,
  - ракета — sprite с per-frame пламенем + дым из частиц с гравитацией,
  - взрыв — 900 частиц, расходящихся радиально с гравитацией.
- **Звуковое оформление** — ffmpeg lavfi: rumble + chirp whoosh при запуске, boom + crackle при крушении, многоголосый chime при спасении, ambient drone для нейтральных сцен.

## Когда применять

- Пользователь просит «прислать отчёт в виде видео», «сделай ролик», «видеоотчёт».
- Закончилась серия задач (тесты прошли, нашли и починили баги) и нужно показать визуально.
- Особенно подходит для драматургии «провал → спасение» (`crash` → `rescue`).

## Требования к окружению

| Зависимость | Установка |
|---|---|
| `ffmpeg` | `brew install ffmpeg` |
| Python 3 + Pillow + numpy | `python3 -m pip install --user --break-system-packages Pillow numpy` |
| Piper TTS | `python3 -m pip install --user --break-system-packages piper-tts` |
| Голосовая модель | см. ниже |

### Загрузка голосовой модели (один раз)

Голосовая модель `ru_RU-irina-medium` (60 МБ) в репозитории не лежит — её нужно скачать в [`voices/`](voices/). Конфиг `*.onnx.json` (4 КБ) закоммичен.

```bash
cd agent/skills/space-video-reporter/voices
curl -sL -o ru_RU-irina-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx
```

Источник — официальные модели Piper на Hugging Face. Есть и другие русские голоса (`denis`, `dmitri`, `ruslan`) — поменяй имя модели в [scripts/render.py](scripts/render.py) (`PIPER_MODEL`).

Если Piper или модель отсутствуют — скрипт автоматически падает на macOS `say -v Milena` (синтетика).

## Использование

```bash
python3 agent/skills/space-video-reporter/scripts/render.py manifest.json report.mp4
```

`manifest.json` — массив слайдов. Формат — см. [references/manifest_schema.md](references/manifest_schema.md).

## Виды сцен (`kind`)

| kind | визуал | звук |
|---|---|---|
| `launch` | ракета взмывает из-под планеты-Земли, тянется дым | низкий gulь + chirp-вуш |
| `starfield` | дрейфующее звёздное поле, маленькая планета в углу | спокойный drone |
| `planet` | большая вращающаяся планета по центру | спокойный drone |
| `crash` | красная вращающаяся планета, тряска, белый flash, разлёт 900 частиц | boom + хвост падающей высоты |
| `rescue` | ракета летит слева-направо к зелёной планете, дым | многоголосый chime + бас |

## Производительность

- 1920×1080 @ 30 fps. ~3660 кадров на 2-минутное видео.
- ~5 минут рендера на M1/M2. На старых машинах — дольше.
- Результат: `.mp4` весом 20–30 МБ.

## Как добавить новую сцену

1. В [`scripts/render.py`](scripts/render.py):
   - дописать ветку в `prepare_scene()` (какие assets бейкать),
   - дописать ветку в `render_frame()` (что компоновать каждый кадр),
   - дописать ветку в `synth_sfx()` (своё звуковое оформление),
   - если нужна анимация ракеты — добавить ветку в `rocket_position()`.
2. Документировать в [`references/manifest_schema.md`](references/manifest_schema.md).

## Ограничения

- Это процедурная анимация, а не генеративная (нет Sora/Runway). Стиль — стилизованный, не фотореалистичный.
- Piper-голоса — нейронные, но не идеальные: ударения в редких словах могут плыть. Латинские слова (`API`, `JSON`, `E2E`) Piper иногда читает по-русски, иногда побуквенно — пиши их кириллицей в тексте слайда, если важно (`A-P-I` → «эй-пи-ай»).
- Цифры лучше писать словами («двадцать пять»), у Piper падежи по числам нестабильны.
