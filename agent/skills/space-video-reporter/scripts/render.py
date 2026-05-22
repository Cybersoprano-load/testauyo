#!/usr/bin/env python3
"""Render a space-themed MP4 report with full per-frame procedural animation.

Pipeline per slide:
  1. Pre-bake static layers (parallax star fields, planet world-map texture,
     rocket sprite, text banner) once.
  2. Render N = FPS * duration PNG frames; each frame composites the layers
     with time-dependent transforms (drift, rotation, motion, particles).
  3. Generate narration with Piper (local neural TTS) — falls back to macOS
     `say` if Piper is not available.
  4. Synthesise scene-specific SFX (whoosh / boom / chime / drone) with
     ffmpeg lavfi.
  5. ffmpeg image2 + amix → per-slide MP4.

Final step: concat slides, mix in a subtle music bed, write the result.

Usage: render.py manifest.json output.mp4
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
SKILL_DIR = Path(__file__).resolve().parent.parent
VOICES_DIR = SKILL_DIR / "voices"
PIPER_BIN = Path(os.path.expanduser("~/Library/Python/3.14/bin/piper"))
PIPER_MODEL = VOICES_DIR / "ru_RU-irina-medium.onnx"


# ============================================================
# Pre-baked layers
# ============================================================

def bake_starfield_layer(seed: int, density: float, max_brightness: int, nebula: bool = False) -> np.ndarray:
    """Single star layer as RGB uint8 numpy array."""
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), dtype=np.uint8)

    if nebula:
        yy, xx = np.mgrid[0:H, 0:W]
        cx = W // 2 + int(rng.integers(-500, 500))
        cy = H // 2 + int(rng.integers(-300, 300))
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        # Two-color nebula
        glow = np.exp(-d / 500)
        img[..., 0] = (glow * 45 + 4).astype(np.uint8)
        img[..., 1] = (glow * 18 + 4).astype(np.uint8)
        img[..., 2] = (glow * 80 + 10).astype(np.uint8)
        # Second nebula patch
        cx2 = W // 2 + int(rng.integers(-700, 700))
        cy2 = H // 2 + int(rng.integers(-400, 400))
        d2 = np.sqrt((xx - cx2) ** 2 + (yy - cy2) ** 2)
        glow2 = np.exp(-d2 / 400)
        img[..., 0] = np.clip(img[..., 0] + (glow2 * 25).astype(np.uint8), 0, 255)
        img[..., 2] = np.clip(img[..., 2] + (glow2 * 55).astype(np.uint8), 0, 255)

    n_stars = int(density * W * H / 5000)
    sx = rng.integers(0, W, n_stars)
    sy = rng.integers(0, H, n_stars)
    bright = rng.integers(60, max_brightness + 1, n_stars)
    img[sy, sx] = np.stack([bright, bright, bright], axis=-1)
    # Glints for the brightest stars
    glint_mask = bright > (max_brightness - 30)
    gx, gy, gb = sx[glint_mask], sy[glint_mask], bright[glint_mask]
    inb = (gx > 1) & (gx < W - 1) & (gy > 1) & (gy < H - 1)
    gx, gy, gb = gx[inb], gy[inb], gb[inb]
    half = (gb // 2).astype(np.uint8)
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        img[gy + dy, gx + dx] = np.stack([half, half, half], axis=-1)

    return img


def bake_planet_strip(seed: int, hue: tuple[int, int, int], strip_w: int = 4096) -> np.ndarray:
    """Cylindrical 'world map' for the planet — sampled later for rotation.

    Returns RGB uint8 array of shape (H, strip_w, 3).
    """
    rng = np.random.default_rng(seed)
    strip_h = H
    arr = np.zeros((strip_h, strip_w, 3), dtype=np.float32)

    # Multi-octave value noise — wrapping horizontally.
    noise = np.zeros((strip_h, strip_w), dtype=np.float32)
    for octave, amp in [(1, 1.0), (2, 0.55), (4, 0.3), (8, 0.18)]:
        sh = max(strip_h // (16 * octave), 2)
        sw = max(strip_w // (16 * octave), 2)
        small = rng.normal(0, 1, (sh, sw))
        # Tile horizontally to ensure wrap-friendly noise.
        small[:, -1] = small[:, 0]
        full = np.array(
            Image.fromarray(small.astype(np.float32)).resize((strip_w, strip_h), Image.BILINEAR)
        )
        noise += full * amp
    noise -= noise.min()
    noise /= max(noise.max(), 1e-6)

    # Continents vs oceans via threshold
    land_mask = noise > 0.55
    for c, v in enumerate(hue):
        arr[..., c] = v * (0.55 + 0.45 * noise)
        arr[..., c] = np.where(land_mask, arr[..., c] * 1.15, arr[..., c] * 0.8)

    # Polar cooling
    yy = np.linspace(0, 1, strip_h)[:, None]
    polar = (1 - np.minimum(yy, 1 - yy) * 2)  # 0 at equator, 1 at poles
    polar = np.clip(polar, 0, 1) ** 2
    for c in range(3):
        arr[..., c] = arr[..., c] * (1 - polar * 0.5) + polar * 220 * 0.5

    return np.clip(arr, 0, 255).astype(np.uint8)


def render_planet_frame(
    bg: np.ndarray, strip: np.ndarray, cx: int, cy: int, r: int, rot_phase: float
) -> np.ndarray:
    """Render a rotating planet sphere into bg using the cylindrical strip."""
    strip_w = strip.shape[1]
    y0 = max(0, cy - r)
    y1 = min(H, cy + r)
    x0 = max(0, cx - r)
    x1 = min(W, cx + r)
    if y1 <= y0 or x1 <= x0:
        return bg

    yy, xx = np.mgrid[y0:y1, x0:x1]
    dx = (xx - cx) / r
    dy = (yy - cy) / r
    d2 = dx ** 2 + dy ** 2
    mask = d2 < 1.0
    nz = np.sqrt(np.clip(1 - d2, 0, 1))

    # Map sphere surface point to (u, v) on cylindrical strip.
    # phi = arcsin(dy) gives latitude (-pi/2..pi/2); use linear approx.
    lat = np.arcsin(np.clip(dy, -1, 1))
    lon = np.arctan2(dx, nz) + rot_phase
    u = (lon / (2 * np.pi)) % 1.0
    v = (lat / np.pi + 0.5)
    sx = (u * strip_w).astype(np.int32) % strip_w
    sy = np.clip((v * strip.shape[0]).astype(np.int32), 0, strip.shape[0] - 1)
    sampled = strip[sy, sx]  # RGB

    # Lighting (constant direction)
    light = np.clip(0.25 + 0.85 * (dx * -0.5 + dy * -0.5 + nz * 0.65), 0, 1.1)
    lit = (sampled.astype(np.float32) * light[..., None]).clip(0, 255).astype(np.uint8)

    region = bg[y0:y1, x0:x1].copy()
    region[mask] = lit[mask]

    # Atmosphere glow on the limb
    dist = np.sqrt(d2)
    glow = np.exp(-((dist - 1.0) * 9) ** 2) * (dist > 0.9) * (dist < 1.15)
    glow_color = np.array([min(255, strip[0, 0, 0] + 80), 200, 255], dtype=np.float32)
    region = region.astype(np.float32)
    region += (glow[..., None] * glow_color * 0.6)
    region = np.clip(region, 0, 255).astype(np.uint8)

    bg[y0:y1, x0:x1] = region
    return bg


def make_rocket_sprite(scale: float = 1.0) -> Image.Image:
    """Transparent RGBA rocket sprite (no flame — flame is per-frame)."""
    s = scale
    w = int(120 * s) + 60
    h = int(180 * s) + 40
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w // 2
    cy = 50

    # Body
    d.rectangle([(cx - 22 * s, cy + 10 * s), (cx + 22 * s, cy + 110 * s)], fill=(238, 240, 246, 255))
    # Vertical stripe
    d.rectangle([(cx - 3, cy + 10 * s), (cx + 3, cy + 110 * s)], fill=(40, 50, 70, 255))
    # Nose
    d.polygon(
        [(cx, cy - 50 * s), (cx - 22 * s, cy + 10 * s), (cx + 22 * s, cy + 10 * s)],
        fill=(214, 60, 60, 255),
    )
    # Window
    d.ellipse([(cx - 14 * s, cy + 30 * s), (cx + 14 * s, cy + 58 * s)],
              fill=(140, 215, 245, 255), outline=(60, 100, 130, 255), width=3)
    d.ellipse([(cx - 8 * s, cy + 33 * s), (cx + 2 * s, cy + 43 * s)], fill=(225, 240, 250, 200))
    # Fins
    d.polygon([(cx - 22 * s, cy + 75 * s), (cx - 52 * s, cy + 120 * s), (cx - 22 * s, cy + 120 * s)],
              fill=(180, 50, 50, 255))
    d.polygon([(cx + 22 * s, cy + 75 * s), (cx + 52 * s, cy + 120 * s), (cx + 22 * s, cy + 120 * s)],
              fill=(180, 50, 50, 255))
    # Engine bell
    d.rectangle([(cx - 16 * s, cy + 110 * s), (cx + 16 * s, cy + 124 * s)], fill=(70, 70, 80, 255))
    return img


def render_flame(sprite_w: int, sprite_h: int, scale: float, t_phase: float, intensity: float = 1.0) -> Image.Image:
    """Per-frame animated flame as RGBA overlay matched to rocket sprite."""
    img = Image.new("RGBA", (sprite_w, sprite_h), (0, 0, 0, 0))
    if intensity <= 0:
        return img
    d = ImageDraw.Draw(img)
    cx = sprite_w // 2
    # Engine bottom = sprite_h - 5
    base_y = sprite_h - 8
    rng = np.random.default_rng(int(t_phase * 1e6) % 2**31)
    flicker = 1.0 + 0.15 * np.sin(t_phase * 30)
    for layer in range(5):
        wave = 1.0 + 0.18 * np.sin(t_phase * 22 + layer)
        length = (130 * scale) * intensity * flicker * wave - layer * 14 * scale
        width = (18 * scale) - layer * 2.2 * scale
        if length <= 0 or width <= 0:
            continue
        r = max(60, 255 - layer * 38)
        g = max(0, 230 - layer * 60)
        b = max(0, 80 - layer * 25)
        alpha = max(120, 240 - layer * 35)
        jitter_x = int(rng.integers(-3, 4) * scale)
        d.polygon(
            [
                (cx - width + jitter_x, base_y),
                (cx + width + jitter_x, base_y),
                (cx + jitter_x, base_y + length),
            ],
            fill=(int(r), int(g), int(b), int(alpha)),
        )
    return img.filter(ImageFilter.GaussianBlur(radius=2))


# ============================================================
# Particles
# ============================================================

@dataclass
class Particles:
    pos: np.ndarray         # (N, 2)
    vel: np.ndarray         # (N, 2)
    color: np.ndarray       # (N, 3) uint8
    size: np.ndarray        # (N,)
    life: np.ndarray        # (N,) total life in seconds
    age0: np.ndarray        # (N,) spawn time relative to slide start


def make_explosion_particles(cx: int, cy: int, t0: float = 0.0, count: int = 600) -> Particles:
    rng = np.random.default_rng(int(cx * 7919 + cy) & 0x7FFFFFFF)
    angles = rng.uniform(0, 2 * np.pi, count)
    speeds = rng.uniform(140, 720, count)
    vel = np.column_stack([np.cos(angles) * speeds, np.sin(angles) * speeds])
    # Color: oranges and yellows
    r = rng.integers(220, 256, count).astype(np.uint8)
    g = rng.integers(80, 220, count).astype(np.uint8)
    b = rng.integers(0, 60, count).astype(np.uint8)
    color = np.column_stack([r, g, b])
    size = rng.uniform(2, 8, count)
    life = rng.uniform(1.4, 3.5, count)
    pos = np.full((count, 2), [cx, cy], dtype=np.float64)
    age0 = np.full(count, t0)
    return Particles(pos=pos, vel=vel, color=color, size=size, life=life, age0=age0)


def make_smoke_trail(spawn_xy: tuple[float, float], t0: float, count: int = 1) -> Particles:
    rng = np.random.default_rng(int(spawn_xy[0] * 13 + spawn_xy[1] * 7 + t0 * 1000) & 0x7FFFFFFF)
    n = count
    pos = np.tile(np.array(spawn_xy, dtype=np.float64), (n, 1))
    vy = rng.uniform(60, 130, n)
    vx = rng.uniform(-25, 25, n)
    vel = np.column_stack([vx, vy])
    grey = rng.integers(140, 220, n).astype(np.uint8)
    color = np.column_stack([grey, grey, grey])
    size = rng.uniform(14, 28, n)
    life = rng.uniform(0.9, 1.6, n)
    age0 = np.full(n, t0)
    return Particles(pos=pos, vel=vel, color=color, size=size, life=life, age0=age0)


def render_particles(img: np.ndarray, particles: list[Particles], t: float, gravity: float = 220.0) -> np.ndarray:
    """Splat live particles onto img (mutated)."""
    h, w, _ = img.shape
    for p in particles:
        age = t - p.age0
        alive = (age >= 0) & (age < p.life)
        if not np.any(alive):
            continue
        a = age[alive]
        cur_pos = p.pos[alive] + p.vel[alive] * a[:, None] + 0.5 * np.array([0, gravity]) * (a[:, None] ** 2)
        # Alpha = (1 - age/life)^2
        alpha = (1 - a / p.life[alive]) ** 1.6
        sizes = p.size[alive] * (0.4 + 0.6 * (1 - a / p.life[alive]))
        colors = p.color[alive].astype(np.float32)

        x = cur_pos[:, 0].astype(np.int32)
        y = cur_pos[:, 1].astype(np.int32)
        s = np.clip(sizes.astype(np.int32), 1, 14)

        # Splat as small filled circles via square footprint for speed
        for px, py, sz, al, col in zip(x, y, s, alpha, colors):
            if px < -sz or px >= w + sz or py < -sz or py >= h + sz:
                continue
            x0 = max(px - sz, 0); x1 = min(px + sz + 1, w)
            y0 = max(py - sz, 0); y1 = min(py + sz + 1, h)
            if x1 <= x0 or y1 <= y0:
                continue
            # Local mask = circle
            ly, lx = np.mgrid[y0 - py:y1 - py, x0 - px:x1 - px]
            mask = (lx * lx + ly * ly) <= sz * sz
            region = img[y0:y1, x0:x1].astype(np.float32)
            blend = al * mask[..., None]
            region[..., 0] = region[..., 0] * (1 - blend[..., 0]) + col[0] * blend[..., 0]
            region[..., 1] = region[..., 1] * (1 - blend[..., 0]) + col[1] * blend[..., 0]
            region[..., 2] = region[..., 2] * (1 - blend[..., 0]) + col[2] * blend[..., 0]
            img[y0:y1, x0:x1] = np.clip(region, 0, 255).astype(np.uint8)
    return img


# ============================================================
# Text banner
# ============================================================

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
    lines: list[str] = []
    line = ""
    for w in text.split():
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


def make_text_banner(text: str) -> Image.Image:
    """RGBA banner sized to text — composited per-frame with fade alpha."""
    tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    font = load_font(54)
    lines = wrap_text(d, text, font, W - 280)
    line_h = 74
    total_h = len(lines) * line_h
    pad_x, pad_y = 70, 30
    banner_h = total_h + pad_y * 2

    banner = Image.new("RGBA", (W, banner_h), (0, 0, 0, 0))
    db = ImageDraw.Draw(banner)
    db.rectangle(
        [(60, 0), (W - 60, banner_h)],
        fill=(8, 12, 35, 210),
        outline=(140, 180, 220, 220),
        width=2,
    )
    for i, ln in enumerate(lines):
        bb = db.textbbox((0, 0), ln, font=font)
        tw = bb[2] - bb[0]
        db.text(((W - tw) // 2, pad_y + i * line_h), ln, font=font, fill=(245, 250, 255, 255))
    return banner


# ============================================================
# Scene state & per-frame render
# ============================================================

@dataclass
class Scene:
    kind: str
    dur: float
    # Three star layers (far, mid, near) — RGB uint8 arrays sized 2W × H for wraparound pan.
    star_layers: list[np.ndarray] = field(default_factory=list)
    star_speeds: list[float] = field(default_factory=list)
    planet_strip: np.ndarray | None = None
    planet_center: tuple[int, int] = (0, 0)
    planet_radius: int = 0
    rocket_sprite: Image.Image | None = None
    rocket_scale: float = 1.0
    text_banner: Image.Image | None = None
    smoke: list[Particles] = field(default_factory=list)
    explosion: Particles | None = None


def prepare_scene(kind: str, text: str, dur: float, seed: int) -> Scene:
    sc = Scene(kind=kind, dur=dur)

    # Build star layers as wide arrays for horizontal wrap.
    def wide(arr: np.ndarray) -> np.ndarray:
        return np.concatenate([arr, arr], axis=1)  # 2W × H

    far = bake_starfield_layer(seed + 1, density=0.7, max_brightness=140, nebula=True)
    mid = bake_starfield_layer(seed + 2, density=0.45, max_brightness=200, nebula=False)
    near = bake_starfield_layer(seed + 3, density=0.15, max_brightness=255, nebula=False)
    sc.star_layers = [wide(far), wide(mid), wide(near)]
    sc.star_speeds = [8.0, 22.0, 50.0]  # px/sec

    if kind == "launch":
        sc.planet_strip = bake_planet_strip(seed + 7, (60, 140, 90))
        sc.planet_center = (W // 2 - 80, H + 380)
        sc.planet_radius = 700
        sc.rocket_scale = 2.3
        sc.rocket_sprite = make_rocket_sprite(sc.rocket_scale)
    elif kind == "starfield":
        sc.planet_strip = bake_planet_strip(seed + 11, (120, 90, 180))
        sc.planet_center = (W - 280, 220)
        sc.planet_radius = 130
    elif kind == "planet":
        sc.planet_strip = bake_planet_strip(seed + 13, (220, 150, 70))
        sc.planet_center = (W // 2, H // 2 - 60)
        sc.planet_radius = 320
    elif kind == "crash":
        sc.planet_strip = bake_planet_strip(seed + 17, (160, 60, 60))
        sc.planet_center = (W // 2, H // 2 - 60)
        sc.planet_radius = 260
        sc.explosion = make_explosion_particles(W // 2, H // 2 - 60, t0=0.5, count=900)
    elif kind == "rescue":
        sc.planet_strip = bake_planet_strip(seed + 19, (70, 180, 110))
        sc.planet_center = (W // 2 + 360, H // 2 - 40)
        sc.planet_radius = 230
        sc.rocket_scale = 1.8
        sc.rocket_sprite = make_rocket_sprite(sc.rocket_scale)
    else:
        raise ValueError(f"unknown kind: {kind}")

    sc.text_banner = make_text_banner(text)
    return sc


def rocket_position(kind: str, t: float, dur: float) -> tuple[float, float, float]:
    """Returns (x, y, intensity) for rocket sprite center over time."""
    progress = t / dur
    if kind == "launch":
        # Starts low-left, arcs up
        x = W * 0.32 + np.sin(t * 0.7) * 28
        y = H * 0.78 - progress * H * 0.65
        intensity = min(1.0, 0.4 + progress * 1.4)
        return x, y, intensity
    if kind == "rescue":
        # Crosses left to right, slight bob
        x = W * 0.10 + progress * W * 0.55
        y = H * 0.45 + np.sin(t * 1.3) * 22
        intensity = 0.9 + np.sin(t * 14) * 0.1
        return x, y, intensity
    return 0, 0, 0


def composite_sprite(canvas: Image.Image, sprite: Image.Image, cx: float, cy: float) -> Image.Image:
    """Alpha-composite RGBA sprite centered at (cx, cy)."""
    sw, sh = sprite.size
    x = int(cx - sw / 2)
    y = int(cy - sh / 2)
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def render_frame(sc: Scene, t: float, kind: str) -> Image.Image:
    # 1. Starfield with parallax — composite three offset layers as RGB array.
    bg = np.zeros((H, W, 3), dtype=np.uint8)
    for layer, speed in zip(sc.star_layers, sc.star_speeds):
        offset = int(t * speed) % W
        bg = np.maximum(bg, layer[:, offset:offset + W])

    # 2. Planet rotation
    if sc.planet_strip is not None:
        rot = t * 0.18  # radians/sec
        bg = render_planet_frame(
            bg, sc.planet_strip, sc.planet_center[0], sc.planet_center[1], sc.planet_radius, rot
        )

    # 3. Crash shake & flash
    if kind == "crash":
        shake_x = int(np.sin(t * 26) * 14 * max(0, 1 - (t - 0.5) / 1.5))
        shake_y = int(np.cos(t * 22) * 11 * max(0, 1 - (t - 0.5) / 1.5))
        if shake_x or shake_y:
            bg = np.roll(bg, shift=(shake_y, shake_x), axis=(0, 1))
        if 0.45 <= t <= 0.7:
            flash = (0.7 - t) / 0.25
            bg = np.clip(bg.astype(np.float32) + np.array([255, 200, 120]) * flash, 0, 255).astype(np.uint8)

    # 4. Particles (explosion + smoke)
    if sc.explosion is not None:
        bg = render_particles(bg, [sc.explosion], t)
    if sc.smoke:
        bg = render_particles(bg, sc.smoke, t, gravity=-80.0)

    # 5. Switch to PIL for sprite + banner compositing.
    canvas = Image.fromarray(bg).convert("RGBA")

    # 6. Rocket sprite with flame
    if sc.rocket_sprite is not None:
        rx, ry, intensity = rocket_position(kind, t, sc.dur)
        if intensity > 0:
            sprite = sc.rocket_sprite.copy()
            flame = render_flame(sprite.width, sprite.height, sc.rocket_scale, t, intensity)
            sprite.alpha_composite(flame, (0, 0))
            canvas = composite_sprite(canvas, sprite, rx, ry)
            # Smoke trail spawn (mutate state — adds new particles each frame)
            engine_x = rx
            engine_y = ry + sprite.height * 0.45
            sc.smoke.append(make_smoke_trail((engine_x, engine_y), t0=t, count=4))
            # Trim very old smoke particle batches
            sc.smoke = [p for p in sc.smoke if t - p.age0.max() < 2.0]

    # 7. Text banner with fade in/out
    if sc.text_banner is not None:
        banner = sc.text_banner
        bh = banner.height
        y_pos = H - bh - 90
        # Fade envelope: in over 0.6s, out over last 0.6s
        if t < 0.6:
            a = t / 0.6
        elif t > sc.dur - 0.6:
            a = max(0.0, (sc.dur - t) / 0.6)
        else:
            a = 1.0
        if a > 0.05:
            faded = banner.copy()
            alpha = faded.split()[-1].point(lambda v: int(v * a))
            faded.putalpha(alpha)
            canvas.alpha_composite(faded, (0, y_pos))

    return canvas.convert("RGB")


# ============================================================
# Audio: Piper TTS + SFX synthesis
# ============================================================

def narrate(text: str, out_wav: str) -> None:
    """Generate WAV narration with Piper. Falls back to macOS `say` if Piper missing."""
    if PIPER_BIN.exists() and PIPER_MODEL.exists():
        proc = subprocess.run(
            [str(PIPER_BIN), "-m", str(PIPER_MODEL), "-f", out_wav,
             "--length-scale", "1.0", "--sentence-silence", "0.25"],
            input=text, text=True, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return
    # Fallback
    aiff = out_wav.replace(".wav", ".aiff")
    subprocess.run(["say", "-v", "Milena", "-r", "175", "-o", aiff, text], check=True)
    subprocess.run(["ffmpeg", "-y", "-i", aiff, out_wav], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(aiff)


def synth_sfx(kind: str, dur: float, out_path: str) -> None:
    """Synthesise scene-specific SFX as M4A.

    Uses ffmpeg lavfi only — no external samples. Frequency sweeps are built
    with `aevalsrc='sin(2*PI*phase(t))'` because `sine=f=…` accepts only a
    constant frequency.
    """
    if kind == "launch":
        # Low rumble (sine 55Hz + brown noise) + chirped whoosh 80 → 280 Hz
        sweep_dur = min(dur, 3.0)
        whoosh = (
            f"aevalsrc=exprs=sin(2*PI*(80*t+100*t*t)):"
            f"d={sweep_dur},apad=pad_dur={dur}"
        )
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=f=55:duration={dur}",
            "-f", "lavfi", "-i", f"anoisesrc=duration={dur}:color=brown:amplitude=0.4",
            "-f", "lavfi", "-i", whoosh,
            "-filter_complex",
            "[0]volume=0.35[a];"
            "[1]highpass=f=60,lowpass=f=380,volume=0.55[b];"
            "[2]volume=0.25,highpass=f=180[c];"
            "[a][b][c]amix=inputs=3:duration=longest,"
            "aecho=0.7:0.5:60:0.3,acompressor",
            "-t", f"{dur:.3f}", "-c:a", "aac", "-b:a", "160k",
            out_path,
        ]
    elif kind == "crash":
        boom_t = 0.5
        # Falling pitch tail 140 → 40 Hz over 1.5s
        debris = (
            f"aevalsrc=exprs=sin(2*PI*(140*t-33*t*t)):"
            f"d=1.5,apad=pad_dur={dur}"
        )
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=f=45:duration={dur}",
            "-f", "lavfi", "-i", f"anoisesrc=duration={dur}:color=brown:amplitude=0.9",
            "-f", "lavfi", "-i", debris,
            "-filter_complex",
            f"[0]volume=eval=frame:volume='if(lt(t,{boom_t}),0,1.0*exp(-1.8*(t-{boom_t})))',lowpass=f=120[a];"
            f"[1]volume=eval=frame:volume='if(lt(t,{boom_t}),0,0.8*exp(-0.9*(t-{boom_t})))',highpass=f=80,lowpass=f=2200[b];"
            f"[2]volume=eval=frame:volume='if(lt(t,{boom_t}),0,0.4*exp(-2.5*(t-{boom_t})))'[c];"
            f"[a][b][c]amix=inputs=3,aecho=0.8:0.7:120:0.4,acompressor",
            "-t", f"{dur:.3f}", "-c:a", "aac", "-b:a", "160k",
            out_path,
        ]
    elif kind == "rescue":
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=f=523.25:duration={dur}",
            "-f", "lavfi", "-i", f"sine=f=659.25:duration={dur}",
            "-f", "lavfi", "-i", f"sine=f=783.99:duration={dur}",
            "-f", "lavfi", "-i", f"sine=f=146.83:duration={dur}",
            "-filter_complex",
            "[0]volume=eval=frame:volume='0.18*exp(-2.5*mod(t,1.6))'[c1];"
            "[1]volume=eval=frame:volume='0.14*exp(-2.5*mod(t,1.6))'[c2];"
            "[2]volume=eval=frame:volume='0.12*exp(-2.5*mod(t,1.6))'[c3];"
            "[3]volume=0.10[d];"
            "[c1][c2][c3][d]amix=inputs=4,aecho=0.8:0.9:600:0.5",
            "-t", f"{dur:.3f}", "-c:a", "aac", "-b:a", "160k",
            out_path,
        ]
    else:  # starfield / planet
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=f=110:duration={dur}",
            "-f", "lavfi", "-i", f"sine=f=164.81:duration={dur}",
            "-f", "lavfi", "-i", f"sine=f=246.94:duration={dur}",
            "-filter_complex",
            "[0]volume=0.08[a];[1]volume=0.06[b];[2]volume=0.045[c];"
            "[a][b][c]amix=inputs=3,lowpass=f=900,aecho=0.8:0.9:1100:0.3",
            "-t", f"{dur:.3f}", "-c:a", "aac", "-b:a", "160k",
            out_path,
        ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def media_duration(path: str) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ])
    return float(out.strip())


# ============================================================
# Slide render
# ============================================================

def render_slide(slide: dict, idx: int, work_dir: Path) -> Path:
    kind = slide["kind"]
    text = slide["text"]

    # Narrate first to size duration.
    narration_wav = work_dir / f"narr_{idx:02d}.wav"
    narrate(text, str(narration_wav))
    speech_dur = media_duration(str(narration_wav))
    dur = max(speech_dur + 1.2, float(slide.get("duration", 0)))

    sc = prepare_scene(kind, text, dur, seed=idx * 19 + 3)

    frames_dir = work_dir / f"frames_{idx:02d}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    n_frames = int(round(dur * FPS))
    for f in range(n_frames):
        t = f / FPS
        img = render_frame(sc, t, kind)
        img.save(frames_dir / f"{f:05d}.png", optimize=False, compress_level=1)

    sfx_path = work_dir / f"sfx_{idx:02d}.m4a"
    synth_sfx(kind, dur, str(sfx_path))

    out_path = work_dir / f"slide_{idx:02d}.mp4"
    # Mix narration + SFX, lower SFX while voice is talking via sidechain not used —
    # SFX is already much quieter than voice via filter graph.
    subprocess.run([
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", str(frames_dir / "%05d.png"),
        "-i", str(narration_wav),
        "-i", str(sfx_path),
        "-filter_complex",
        "[1:a]volume=1.0[v];[2:a]volume=0.55[s];[v][s]amix=inputs=2:duration=longest:normalize=0[a]",
        "-map", "0:v", "-map", "[a]",
        "-t", f"{dur:.3f}",
        "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        str(out_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Free frames
    shutil.rmtree(frames_dir, ignore_errors=True)
    return out_path


# ============================================================
# Final assembly
# ============================================================

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


def mix_music(video_path: Path, duration: float, out_path: Path) -> None:
    music_path = video_path.parent / "music.m4a"
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"sine=f=110:duration={duration}",
        "-f", "lavfi", "-i", f"sine=f=164.81:duration={duration}",
        "-f", "lavfi", "-i", f"sine=f=246.94:duration={duration}",
        "-filter_complex",
        "[0]volume=0.05[a];[1]volume=0.04[b];[2]volume=0.03[c];"
        "[a][b][c]amix=inputs=3,lowpass=f=850,aecho=0.8:0.9:1100:0.35",
        "-c:a", "aac", "-b:a", "96k",
        str(music_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(music_path),
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        str(out_path),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ============================================================
# Main
# ============================================================

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
        print(f"  [{i + 1}/{len(manifest)}] {kind}: {snippet}", flush=True)
        slides.append(render_slide(slide, i, work_dir))

    print("Concatenating slides…", flush=True)
    raw_path = work_dir / "raw.mp4"
    concat_slides(slides, raw_path, work_dir)

    total = media_duration(str(raw_path))
    print(f"Adding music bed ({total:.1f}s)…", flush=True)
    mix_music(raw_path, total, output_path)

    final = media_duration(str(output_path))
    print(f"Done: {output_path} — {final:.1f}s")
    shutil.rmtree(work_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
