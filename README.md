# Token Speaker

[![GitHub Release](https://img.shields.io/github/v/release/mordachai/token-speaker?style=flat-square)](https://github.com/mordachai/token-speaker/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v14%2B-orange?style=flat-square)](https://foundryvtt.com)

Animate player tokens in real-time as they speak. Token Speaker listens to your microphone and translates your voice into dynamic canvas animations — no database writes, no network lag.

## Features

### ANIMATION MODES:

- **Simple Mode:**  Bounce, Wobble and Stretch animations. You have controls to make it more serious or goofy looking
- **Advanced Mode (Lip-Sync):**  Analyzes pitch and tone to approximate mouth shapes (OO, AH, EE, closed) and swaps your token image in real-time. You will need some extra images, check below how to do it.
- **Hybrid Mode (Auto):**  Uses lip-sync when viseme images are found for a token, falls back to bounce/wobble otherwise.
- **Both:** Activate Simple and Advanced mode at the same time so you will see it with lip-sync and stretchy animations.

---

The animations both above are applied in two layers: **Tokens** and/or **Talking Heads**

- **Flipbook Spritesheet** — Instead of four separate cropped images, drop a single 2×2 sprite sheet next to your token. The module slices it automatically.
- **Luminance Mask** — Provide a grayscale mask image to clip tokens to any shape (rounded frames, irregular silhouettes) without needing pre-cropped images.

---

## The Flipbook Image: Visemes

_**Visemes** are a lipsync animation term, it stands for **"Visual Phonemes"**. Its a simplification of the shape of the lips/mouth when you are vocalizing words._

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

> **A single image divided into a 2×2 grid. The module detects it automatically by the `-sheet` suffix.**

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

### **How to build the sheet in any image editor. No-IA route:**

1. Open (or create) each of your four mouth-state images at the same size, e.g. 256×256 px each.
2. Create a new canvas at **double the width and double the height** — 512×512 px in this example.
3. Paste each image into the correct quadrant:
   - **Top-left** → Closed mouth
   - **Top-right** → AH shape
   - **Bottom-left** → EE shape
   - **Bottom-right** → OO shape
4. Export as `.webp` or `.png`.

> **Tip:** If you only have one master portrait and want to paint the mouth shapes, duplicate the layer four times and edit just the mouth region on each copy, then composite them into the 2×2 grid.

---

### **How to build the sheet using an AI software. Two prompts:**

**Prompt 1:**

```Portrait of [subject and style] for a tabletop rpg. Square image. [Neutral/Transparent] background. No token frame```

ChatGPT can do transparency correctly, Gemini, Midjourney, Grok not. So select the correct one at the end.

**Prompt 2:**

```From this image create 4 visemes for the mouth in a 2 by 2 spritesheet: Closed (top left), AH (top-right), EE (bottom left), OO (bottom right). Keep same position and same POV, animate only mouth and do subtle eye animation. No text.```

Using two prompts initialy it's best because you can first set the style you want and when you're cool with the character you can make the spritesheet.

But after you make the fisrt one a simple "do the same, but now its a Dwarven Shopkeeper" will give you fast and cool results.

Examples below, using free ChataGPT:

**Prompt:** Portrait of __Elf Female Wizard with white hair, acrylic painting__, for a tabletop rpg. Square image. __Transparent__ background. No token frame

<img width="512" height="512" alt="image" src="https://github.com/user-attachments/assets/c42e07c4-fbe8-4a0f-936f-f04115be4345" />

---

**Prompt:** From this image create 4 visemes for the mouth in a 2 by 2 spritesheet: Closed (top left), AH (top-right), EE (bottom left), OO (bottom right). Keep same position and same POV, animate only mouth and do subtle eye animation. No text.

<img width="512" height="512" alt="image" src="https://github.com/user-attachments/assets/7e1f2858-470e-4444-a4c8-f2d3bd46dea0" />

---

**Prompt:** Keeping the same style make a spritesheet for a Dwarf Fighter armed with a hammer
<img width="512" height="512" alt="image" src="https://github.com/user-attachments/assets/b4c96bcf-4c6b-4b31-8583-d6db94916916" />


---

### Option B — Individual Files

- The base token image stays your **token art** and is never used as a mouth shape. Provide a dedicated `-closed` frame for the resting mouth.

Example for `Katrina_token.webp`:

```text
Katrina_token.webp           ← token art (untouched unless animation is on)
Katrina_token-closed.webp    ← Closed mouth (resting frame)
Katrina_token-OO.webp
Katrina_token-AH.webp
Katrina_token-EE.webp
```

> **Note:** Name files with a dash and uppercase (`-CLOSED`, `-OO`, `-AH`, `-EE`) to avoid 404 console noise. GMs and assistants use directory listings, so any capitalisation works. IF you use lowercase suffix it will work but it will thrown an error in console.
>
> If no `-closed` file is found, the token falls back to its original art as the resting frame.

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

> **Sheet vs individual files:** The size of the mask its for one token, DON'T MAKE A SHEET OF MASKS. The mask is applied on the token after its automatically cropped from the sheet.
>
> **Example use cases:** Round portrait frames, hex token silhouettes, vignette fade around the edges, any non-rectangular token shape.

---

## Speaking Indicators

Chat Bubble and Color Rings

Independent controls for talking heads and tokens: you can make the talking animate while the tolken only flashs and/ or display a small chat bubble icon.

The Ring Color its the same color of the user assigned in User Configuration (bottom left panel on canvas)

---

## Talking Heads

Thats the awesome feature: a speaking floating portrait!

**Module Settings → Token Speaker → Talking Heads**:

- **Off** — disabled (default)
- **Always Visible** — portraits stay on screen at all times, animate when speaking
- **Visible While Speaking** — portraits fade in on speech, fade out when silent

The **GM** can drag each head to any position on screen. Positions are saved per scene and synced to all players.

**As a GM, any token on screen that you select that doesn't belong to a player will be the one doing the talking. Only one can be selected at a time.**

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
