#!/usr/bin/env python3
"""Render a space-themed MP4 report from a JSON manifest.

Usage: python3 render.py manifest.json output.mp4
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30


# ---------- Procedural visuals ----------

def starfield(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), dtype=np.uint8)

    # Soft nebula
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = W // 2 + int(rng.integers(-400, 400)), H // 2 + int(rng.integers(-200, 200))
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    nebula = np.exp(-dist / 450)
    img[..., 0] = (nebula * 35 + 4).astype(np.uint8)
    img[..., 1] = (nebula * 15 + 4).astype(np.uint8)
    img[..., 2] = (nebula * 70 + 10).astype(np.uint8)

    # Stars
    n_stars = 900
    sx = rng.integers(0, W, n_stars)
    sy = rng.integers(0, H, n_stars)
    bright = rng.integers(70, 256, n_stars)
    for x, y, b in zip(sx, sy, bright):
        img[y, x] = [b, b, b]
        if b > 215 and 1 < x < W - 1 and 1 < y < H - 1:
            half = b // 2
            img[y - 1, x] = img[y + 1, x] = img[y, x - 1] = img[y, x + 1] = [half, half, half]

    pil = Image.fromarray(img)
    return pil.filter(ImageFilter.GaussianBlur(radius=0.3))


def draw_planet(img: Image.Image, cx: int, cy: int, r: int, hue=(60, 140, 200), seed: int = 0) -> Image.Image:
    arr = np.array(img).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    dx = (xx - cx) / max(r, 1)
    dy = (yy - cy) / max(r, 1)
    d2 = dx ** 2 + dy ** 2
    mask = d2 < 1.0
    nz = np.sqrt(np.clip(1 - d2, 0, 1))

    # Lighting from upper-left
    light = np.clip(0.25 + 0.8 * (dx * -0.55 + dy * -0.55 + nz * 0.62), 0, 1.1)

    # Multi-octave noise texture
    rng = np.random.default_rng(seed)
    noise = np.zeros((H, W), dtype=np.float32)
    for octave, amp in [(1, 1.0), (2, 0.5), (4, 0.25)]:
        small = rng.normal(0, 1, (max(H // (16 * octave), 2), max(W // (16 * octave), 2)))
        full = np.array(Image.fromarray(small.astype(np.float32)).resize((W, H), Image.BILINEAR))
        noise += full * amp
    tex = noise * 30

    for c in range(3):
        body = np.clip(hue[c] * light + tex, 0, 255)
        arr[..., c] = np.where(mask, body, arr[..., c])

    # Atmosphere glow on the limb
    dist = np.sqrt(d2)
    glow = np.exp(-((dist - 1.0) * 8) ** 2) * (dist > 0.95)
    for c in range(3):
        arr[..., c] = np.clip(arr[..., c] + glow * hue[c] * 0.6, 0, 255)

    return Image.fromarray(arr.astype(np.uint8))


def draw_rocket(img: Image.Image, cx: int, cy: int, scale: float = 1.0, flame: bool = True) -> Image.Image:
    s = scale
    draw = ImageDraw.Draw(img)

    # Body
    draw.rectangle([(cx - 22 * s, cy - 10 * s), (cx + 22 * s, cy + 90 * s)], fill=(235, 235, 240))
    # Nose
    draw.polygon([(cx, cy - 60 * s), (cx - 22 * s, cy - 10 * s), (cx + 22 * s, cy - 10 * s)],
                 fill=(210, 60, 60))
    # Window
    draw.ellipse([(cx - 14 * s, cy + 8 * s), (cx + 14 * s, cy + 36 * s)],
                 fill=(120, 200, 240), outline=(60, 100, 130), width=3)
    # Fins
    draw.polygon([(cx - 22 * s, cy + 55 * s), (cx - 50 * s, cy + 100 * s), (cx - 22 * s, cy + 100 * s)],
                 fill=(180, 50, 50))
    draw.polygon([(cx + 22 * s, cy + 55 * s), (cx + 50 * s, cy + 100 * s), (cx + 22 * s, cy + 100 * s)],
                 fill=(180, 50, 50))
    if flame:
        for i in range(4):
            offset = i * 18 * s
            shrink = i * 3 * s
            r = max(255 - i * 30, 80)
            g = max(220 - i * 60, 0)
            draw.polygon(
                [
                    (cx - 16 * s + shrink, cy + 100 * s),
                    (cx + 16 * s - shrink, cy + 100 * s),
                    (cx, cy + (120 + offset) * s),
                ],
                fill=(r, g, 0),
            )
    return img


def draw_explosion(img: Image.Image, cx: int, cy: int, r_max: int = 380) -> Image.Image:
    img = img.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for radius in range(40, r_max, 28):
        alpha = max(int(180 * (1 - radius / r_max)), 20)
        color_r = min(255, 200 + radius // 4)
        color_g = max(20, 200 - radius // 2)
        draw.ellipse(
            [(cx - radius, cy - radius), (cx + radius, cy + radius)],
            outline=(color_r, color_g, 30, alpha),
            width=8,
        )
    # Central white-hot core
    draw.ellipse([(cx - 60, cy - 60), (cx + 60, cy + 60)], fill=(255, 240, 200, 230))
    # Debris specks
    rng = np.random.default_rng(cx * cy + 7)
    for _ in range(80):
        angle = rng.uniform(0, 6.283)
        dist = rng.uniform(80, r_max - 30)
        px = int(cx + dist * np.cos(angle))
        py = int(cy + dist * np.sin(angle))
        size = int(rng.integers(3, 9))
        draw.ellipse([(px - size, py - size), (px + size, py + size)],
                     fill=(255, int(rng.integers(100, 220)), 0, 220))
    img = Image.alpha_composite(img, overlay)
    return img.convert("RGB")


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
    ]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for w in words:
        candidate = (line + " " + w).strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] > max_w and line:
            lines.append(line)
            line = w
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def draw_text_banner(img: Image.Image, text: str) -> Image.Image:
    img = img.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    font = load_font(56)
    lines = wrap_text(draw, text, font, W - 240)
    line_h = 78
    total_h = len(lines) * line_h
    y0 = H - total_h - 100

    # Banner with rounded-ish edges (rectangles + bigger blur on overlay later)
    pad_x, pad_y = 70, 32
    draw.rectangle(
        [(60, y0 - pad_y), (W - 60, y0 + total_h + pad_y)],
        fill=(8, 12, 35, 195),
        outline=(140, 180, 220, 220),
        width=2,
    )
    for i, ln in enumerate(lines):
        bbox = draw.textbbox((0, 0), ln, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, y0 + i * line_h), ln, font=font, fill=(245, 250, 255, 255))

    img = Image.alpha_composite(img, overlay)
    return img.convert("RGB")


# ---------- Scene composition ----------

def render_scene(kind: str, text: str, seed: int) -> Image.Image:
    img = starfield(seed)

    if kind == "launch":
        img = draw_planet(img, W // 2 - 80, H + 400, 700, hue=(60, 140, 90), seed=seed)
        img = draw_rocket(img, W // 2 - 200, H // 2 - 60, scale=2.4)
    elif kind == "starfield":
        # add a small distant planet for depth
        img = draw_planet(img, W - 300, 200, 140, hue=(120, 90, 180), seed=seed + 11)
    elif kind == "planet":
        img = draw_planet(img, W // 2, H // 2 - 60, 340, hue=(220, 150, 70), seed=seed + 3)
    elif kind == "crash":
        img = draw_planet(img, W // 2, H // 2 - 60, 280, hue=(160, 60, 60), seed=seed + 5)
        img = draw_explosion(img, W // 2, H // 2 - 60, r_max=380)
    elif kind == "rescue":
        img = draw_planet(img, W // 2 + 360, H // 2 - 40, 240, hue=(70, 180, 110), seed=seed + 9)
        img = draw_rocket(img, W // 2 - 220, H // 2 - 80, scale=1.9)
    else:
        raise ValueError(f"Unknown scene kind: {kind!r}")

    img = draw_text_banner(img, text)
    return img


# ---------- Audio + ffmpeg ----------

def narrate(text: str, out_m4a: str) -> None:
    # macOS `say` writes m4a directly when extension is .m4a.
    subprocess.run(
        ["say", "-v", "Milena", "-r", "175", "-o", out_m4a, text],
        check=True,
    )


def media_duration(path: str) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ])
    return float(out.strip())


def filter_for(kind: str, duration: float) -> str:
    n = max(int(duration * FPS), 1)
    if kind == "launch":
        return (
            f"zoompan=z='min(1+0.0006*on,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-on*1.2':"
            f"d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
        )
    if kind == "crash":
        return (
            f"zoompan=z='1.15-0.0008*on':x='iw/2-(iw/zoom/2)+8*sin(on*0.8)':"
            f"y='ih/2-(ih/zoom/2)+6*cos(on*0.9)':d={n}:s={W}x{H}:fps={FPS},"
            f"eq=brightness='0.12*sin(t*9)*exp(-t*0.6)':saturation='1.1',"
            f"format=yuv420p"
        )
    if kind == "rescue":
        return (
            f"zoompan=z='1+0.0004*on':x='iw/2-(iw/zoom/2)+on*0.6':"
            f"y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
        )
    # starfield, planet — slow ken-burns
    return (
        f"zoompan=z='1+0.0003*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
    )


def render_slide(slide: dict, idx: int, work_dir: Path) -> Path:
    kind = slide["kind"]
    text = slide["text"]

    bg_path = work_dir / f"bg_{idx:02d}.png"
    audio_path = work_dir / f"audio_{idx:02d}.m4a"
    out_path = work_dir / f"slide_{idx:02d}.mp4"

    img = render_scene(kind, text, seed=idx * 7 + 1)
    img.save(bg_path)
    narrate(text, str(audio_path))

    speech_dur = media_duration(str(audio_path))
    dur = max(speech_dur + 1.0, float(slide.get("duration", 0)))

    vf = filter_for(kind, dur)

    # `-shortest` would truncate to audio length (we want `dur`, with trailing
    # silence). Use apad on the audio so it stretches to the target duration,
    # then `-t` to clamp.
    subprocess.run([
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(bg_path),
        "-i", str(audio_path),
        "-vf", vf,
        "-af", "apad",
        "-t", f"{dur:.3f}",
        "-c:v", "libx264", "-crf", "23", "-preset", "medium",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return out_path


def make_music_bed(duration: float, out_path: Path) -> None:
    # Quiet ambient drone — chord built from three sines, lowpass-filtered.
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"sine=f=110:duration={duration}",
        "-f", "lavfi", "-i",
        f"sine=f=164.81:duration={duration}",
        "-f", "lavfi", "-i",
        f"sine=f=246.94:duration={duration}",
        "-filter_complex",
        "[0]volume=0.06[a];[1]volume=0.045[b];[2]volume=0.035[c];"
        "[a][b][c]amix=inputs=3,lowpass=f=900,aecho=0.8:0.9:1000:0.3",
        "-c:a", "aac", "-b:a", "96k",
        str(out_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def concat_slides(slide_paths: list[Path], out_path: Path, work_dir: Path) -> None:
    listfile = work_dir / "concat.txt"
    with listfile.open("w") as f:
        for p in slide_paths:
            f.write(f"file '{p.resolve()}'\n")
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(listfile),
        "-c", "copy",
        str(out_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def mix_music(video_path: Path, music_path: Path, out_path: Path) -> None:
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(music_path),
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "160k",
        str(out_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------- Main ----------

def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: render.py manifest.json output.mp4", file=sys.stderr)
        return 1

    manifest_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, list) or not manifest:
        print("manifest.json must be a non-empty array", file=sys.stderr)
        return 1

    work_dir = output_path.parent / ".space_video_work"
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    print(f"Rendering {len(manifest)} slide(s) → {output_path}")
    slides: list[Path] = []
    for i, slide in enumerate(manifest):
        kind = slide.get("kind", "starfield")
        text = slide.get("text", "")
        snippet = text if len(text) <= 60 else text[:57] + "…"
        print(f"  [{i + 1}/{len(manifest)}] {kind}: {snippet}")
        slides.append(render_slide(slide, i, work_dir))

    print("Concatenating slides…")
    raw_path = work_dir / "raw.mp4"
    concat_slides(slides, raw_path, work_dir)

    total = media_duration(str(raw_path))
    print(f"Adding music bed ({total:.1f}s)…")
    music_path = work_dir / "music.m4a"
    make_music_bed(total, music_path)

    mix_music(raw_path, music_path, output_path)

    final = media_duration(str(output_path))
    print(f"Done: {output_path} — {final:.1f}s")
    shutil.rmtree(work_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
