# Token Speaker

[![GitHub Release](https://img.shields.io/github/v/release/mordachai/token-speaker?style=flat-square)](https://github.com/mordachai/token-speaker/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v14%2B-orange?style=flat-square)](https://foundryvtt.com)

Animate player tokens in real-time as they speak. Token Speaker listens to your microphone and translates your voice into dynamic canvas animations — no database writes, no network lag.

## Features

- **Simple Mode** — Tokens bounce, wobble, and scale based on microphone volume. Works with any token.
- **Advanced Mode (Lip-Sync)** — Analyzes pitch and tone to approximate mouth shapes (OO, AH, EE, closed) and swaps your token image in real-time.
- **Hybrid Mode (Auto)** — Uses lip-sync when viseme images are found for a token, falls back to bounce/wobble otherwise. Best for sessions with a mix of voiced PCs and generic NPCs.
- **Speaking Indicators** — A glowing ring, a speech bubble, or both appear on tokens while they speak. The character name briefly flashes above the token on first speech. All configurable by the GM.
- **Talking Heads** — Optional floating portrait panels, one per player, anchored anywhere on screen. The GM drags them into position; layout is saved per scene.
- **Flipbook Spritesheet** — Instead of four separate cropped images, drop a single 2×2 sprite sheet next to your token. The module slices it automatically.
- **Luminance Mask** — Provide a grayscale mask image to clip tokens to any shape (rounded frames, irregular silhouettes) without needing pre-cropped images.
- **Zero Database Impact** — Animations happen entirely on the visual layer. Nothing is written to the Foundry database during play.
- **Efficient Sync** — Visual updates are packaged over sockets at 15 Hz so every player sees animations with no bandwidth spikes.

---

## Visemes

Advanced and Hybrid modes map your voice to four mouth shapes:

| Shape | Sounds like | Example words |
| ----- | ----------- | ------------- |
| **Closed** | M, B, P, silence | *hm*, *bump*, *lamp*, *maybe* |
| **OO** | OO, W, U | *you*, *moon*, *blue*, *would* |
| **AH** | A, O (open) | *father*, *hot*, *calm*, *large* |
| **EE** | E, I, EE | *see*, *feel*, *green*, *city* |

The module cycles through these four shapes in real-time as it hears you speak — no manual input needed.

---

## Providing Viseme Images

You have two options: a **flipbook sheet** (one file, recommended) or **four individual files**.

### Option A — Flipbook Spritesheet (recommended)

A single image divided into a 2×2 grid. The module detects it automatically by the `-sheet` suffix.

```text
┌──────────┬──────────┐
│  CLOSED  │    AH    │  ← top row
├──────────┼──────────┤
│    EE    │    OO    │  ← bottom row
└──────────┴──────────┘
```

**File naming** — place the sheet next to the base token image and add `-sheet` before the extension:

```text
Katrina_token.webp           ← base token (not used for mouth, see Closed quadrant)
Katrina_token-sheet.webp     ← 2×2 flipbook sheet   ← add this
```

**How to build the sheet in any image editor:**

1. Open (or create) each of your four mouth-state images at the same size, e.g. 256×256 px each.
2. Create a new canvas at **double the width and double the height** — 512×512 px in this example.
3. Paste each image into the correct quadrant:
   - **Top-left** → Closed mouth
   - **Top-right** → AH shape
   - **Bottom-left** → EE shape
   - **Bottom-right** → OO shape
4. Export as `.webp` or `.png`.

> **Tip:** If you only have one master portrait and want to paint the mouth shapes, duplicate the layer four times and edit just the mouth region on each copy, then composite them into the 2×2 grid.

The sheet must have an even width and height (the module cuts it exactly in half each axis). Both dimensions do not need to be equal — a 512×256 sheet (wide rectangles) works fine for landscape portraits.

---

### Option B — Four Individual Files

Place four images in the same folder as your base token, following the naming convention `<base><sep><viseme>.<ext>`:

- `<sep>` is `-`, `_`, or a space (tried in that order)
- `<viseme>` is `OO`, `oo`, or `Oo` — and likewise for `AH` and `EE` (uppercase tried first)
- The base token image itself acts as the **Closed** mouth frame

Example for `Katrina_token.webp`:

```text
Katrina_token.webp        ← base / Closed mouth
Katrina_token-OO.webp
Katrina_token-AH.webp
Katrina_token-EE.webp
```

> **Note for players:** Name files with a dash and uppercase (`-OO`, `-AH`, `-EE`) to avoid 404 console noise. GMs and assistants use directory listings, so any capitalisation works.

---

## Luminance Mask

A mask clips the visible area of your token without you needing to pre-crop every mouth frame. Paint the shape once; every viseme uses it automatically.

**File naming** — place the mask next to the base token and add `-mask`:

```text
Katrina_token.webp           ← base token
Katrina_token-sheet.webp     ← flipbook (optional)
Katrina_token-mask.webp      ← luminance mask   ← add this
```

**How the mask works:**

- **White** pixels (luminance = 255) → fully visible
- **Black** pixels (luminance = 0) → fully transparent
- **Grey** pixels → partially transparent, proportional to brightness

This means you can use any standard greyscale image — no need to work with alpha channels.

**How to create a mask in any image editor:**

1. Open your token portrait (or the sheet).
2. Create a new layer filled with **black**.
3. Paint **white** over the area you want to be visible — e.g. an oval for a portrait frame, or an irregular silhouette for a creature.
4. Optionally feather or blur the edges for a soft fade.
5. Flatten to a single greyscale layer.
6. Export as `.webp` or `.png` at **exactly the same pixel dimensions** as the base token (or the individual viseme images, not the full sheet).

> **Example use cases:** Round portrait frames, hex token silhouettes, vignette fade around the edges, any non-rectangular token shape.
>
> **Sheet vs individual files:** The mask covers the area shown for each viseme frame. When using a flipbook sheet the mask should match the size of one quadrant (half width × half height of the full sheet), not the full sheet.

---

## Speaking Indicators

The GM controls visual cues for the whole table in **Module Settings → Token Speaker**:

| Setting | Options |
| ------- | ------- |
| Speaking Indicator | None / Ring Only / Bubble Only / Ring + Bubble |
| Name Flash on Speak | On / Off — briefly shows character name when speaking starts |
| Ring Color | Any hex colour — per-player, defaults to orange `#ff6400` |

---

## Talking Heads

Floating portrait panels can be enabled for the whole table in **Module Settings → Token Speaker → Talking Heads**:

- **Off** — disabled (default)
- **Always Visible** — portraits stay on screen at all times, animate when speaking
- **Visible While Speaking** — portraits fade in on speech, fade out when silent

The GM can drag each head to any position on screen. Positions are saved per scene and synced to all players.

GMs appear in the panel only when they have an NPC pinned in the Speaker Widget.

---

## Installation

**Via Foundry VTT** (recommended): paste the manifest URL in *Add-on Modules → Install Module*:

```text
https://github.com/mordachai/token-speaker/releases/latest/download/module.json
```

**Manual**: download `module.zip` from the [latest release](https://github.com/mordachai/token-speaker/releases/latest) and extract it into your `Data/modules/` folder.

---

## Usage

1. Enable **Token Speaker** in your world's Module Management.
2. Open **Module Settings → Token Speaker**.
3. Choose your **Animation Mode**: Simple, Advanced, or Hybrid.
4. For lip-sync, provide a flipbook sheet or four individual viseme images (see above).
5. Optionally add a mask image for shaped token frames.
6. Adjust mic sensitivity and animation intensity to taste.
7. Start talking — your token animates automatically.

---

## License

[MIT](LICENSE)
