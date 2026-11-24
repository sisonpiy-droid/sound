<div align="center">
  
# 🌌 Sound

**An interactive 3D universe of 6,291 music genres.**

[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

## 📖 Overview

**Sound** is an interactive WebGL data visualization that maps out the entire musical spectrum. It plots 6,291 unique genres into a 3D "star map" based on their sonic similarities and shared artists. 

Reimagined with a vivid **cyberpunk / neon aesthetic** against a deep pinkish space void, this project allows you to physically navigate the connections between thousands of musical styles. Hover over any node in the galaxy to seamlessly crossfade into a 30-second Spotify audio preview of that genre.

## ✨ Features

- 🎧 **Seamless Audio Engine**: Smoothly crossfades between 6,000+ track previews without audio stuttering.
- 🗺️ **Massive Dataset**: Visualizes exactly 6,291 genres and 42,735 connecting links based on shared artists.
- 🚀 **High-Performance 3D**: Runs purely in the browser at 60FPS using a custom Three.js WebGL renderer with bloom post-processing.
- 🎨 **Cyberpunk Palette**: A completely customized visual identity featuring high-saturation neon nodes and a deep void background.
- 🔍 **Interactive Discovery**: See what genres overlap, which ones are isolated, and discover completely new sounds by wandering the map.

## 🎮 Controls

- **Scroll / Pinch:** Zoom in and out of the galaxy.
- **Left Click & Drag:** Orbit and rotate around the 3D space.
- **Right Click & Drag:** Pan the camera up, down, left, or right.
- **Hover:** Rest your mouse on a node to instantly play a representative audio clip.
- **Click (Name):** Go one level deeper to see overlapping genres and closely related sounds.

## 💻 Local Installation

Because the application uses ES6 modules and fetches local JSON data files, it needs to be served via a local web server (opening the `.html` file directly in the browser will result in CORS errors).

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sisonpiy-droid/sound.git
   cd sound
   ```

2. **Start a local web server:**
   You can use Python's built-in HTTP server:
   ```bash
   python -m http.server 8000
   ```
   *(Alternatively, use Node.js `npx serve`, or VS Code Live Server).*

3. **Explore:**
   Open your browser and navigate to `http://localhost:8000`.

## 📂 Data Sources & Credits

- **Dataset:** Data compiled from the incredible [Every Noise at Once](https://everynoise.com/) by Glenn McDonald, built on Spotify data (2023).
- **Audio:** 30-second MP3 previews provided by the Spotify Web API.
- **Original Architecture:** Reverse-engineered and adapted from the original concept at *Sky of Sound*.

---
<div align="center">
  <i>"Loading the sound..."</i>
</div>
