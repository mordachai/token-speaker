# Token Speaker

[![GitHub Release](https://img.shields.io/github/v/release/mordachai/token-speaker?style=flat-square)](https://github.com/mordachai/token-speaker/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v14%2B-orange?style=flat-square)](https://foundryvtt.com)
[![License](https://img.shields.io/github/license/mordachai/token-speaker?style=flat-square)](LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/mordachai/token-speaker?style=flat-square)](https://github.com/mordachai/token-speaker/issues)

Animate player tokens in real-time as they speak. Token Speaker listens to your microphone and translates your voice into dynamic canvas animations — no database writes, no network lag.

## Features

**Simple Mode** — Tokens bounce, wobble, or scale based on microphone volume. Works with any portrait or top-down token.

**Advanced Mode (Lip-Sync)** — Analyzes pitch and tone to approximate mouth shapes (OO, AH, EE, closed) and swaps your token image in real-time to match the sounds you make.

**Zero Database Impact** — Animations happen entirely on the visual layer. Nothing is written to the Foundry database during play.

**Efficient Sync** — Visual updates are packaged efficiently over sockets so other players see animations without bandwidth spikes.

**Per-Player Settings** — Each player controls their own mic sensitivity, bounce intensity, and lip-sync images from a clean settings panel.

## Visemes

Advanced Mode maps your voice to four mouth shapes. Prepare one token image per shape and assign them in the settings panel:

| Shape | Sounds like | Example words |
| ----- | ----------- | ------------- |
| **Closed** | M, B, P | *hm*, *bump*, *lamp*, *maybe* |
| **OO** | OO, W, U | *you*, *moon*, *blue*, *would* |
| **AH** | A, O (open) | *father*, *hot*, *calm*, *large* |
| **EE** | E, I, EE | *see*, *feel*, *green*, *city* |

The module cycles through these four shapes in real-time as it hears you speak — no manual input needed.

## Installation

**Via Foundry VTT** (recommended): paste the manifest URL in *Add-on Modules → Install Module*:

```text
https://github.com/mordachai/token-speaker/releases/latest/download/module.json
```

**Manual**: download `module.zip` from the [latest release](https://github.com/mordachai/token-speaker/releases/latest) and extract it into your `Data/modules/` folder.

## Usage

1. Enable **Token Speaker** in your world's Module Management.
2. Open **Module Settings → Token Speaker** to configure your microphone and animation preferences.
3. For lip-sync, provide token images for each mouth shape (OO, AH, EE, closed) in the settings panel.
4. Start talking — your token animates automatically.

## License

[MIT](LICENSE)
