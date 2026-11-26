<div align="center">
  
# 🌐 SoundScape: WebGL Data Visualization

**A high-performance 3D spatial mapping of the human musical spectrum, rendering 6,200+ distinct genres in a physics-driven universe.**

[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/Architecture-ES6-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/)
[![Performance](https://img.shields.io/badge/Performance-60FPS-brightgreen?style=for-the-badge)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

## 📖 Project Overview

**SoundScape** is a complex data visualization engineering project built from the ground up to map out how music genres relate to one another based on shared artist metadata. It plots exactly 6,291 unique genres into an interactive 3D universe, utilizing 42,735 weighted vertex links to group sonically similar styles.

Instead of rendering static 2D plots, this project pushes modern browser limits by utilizing a custom `Three.js` WebGL engine to render thousands of physical 3D spheres (nodes), connected by glowing neural pathways (links), complete with real-time post-processing and ambient spatial lighting.

## 🛠️ Architecture & Engineering

This project was built with a heavy focus on WebGL performance and audio engineering:

### 1. High-Performance WebGL Engine
- **InstancedMesh Rendering**: Rendering 6,291 individual 3D spheres would normally destroy browser framerates (via thousands of draw calls). I engineered a `THREE.InstancedMesh` pipeline that batches all nodes into a **single draw call** while allowing independent 3D scaling, matrix positioning, and dynamic coloring.
- **Physical Lighting Models**: Swapped basic sprite shaders for `MeshStandardMaterial`, computing real-time physical light bounces (Ambient & Directional) across the dataset to give the graph tangible 3D volume.
- **Custom Shader & Post-Processing**: Integrated Unreal Bloom passes over the WebGL pipeline to give the data graph a bioluminescent, deep-sea data-core aesthetic.

### 2. Seamless Audio Streaming Architecture
- **Web Audio Context Crossfading**: Browsers typically struggle to rapidly switch audio streams. I built a dual-channel audio engine that dynamically juggles two invisible `HTMLAudioElement` streams, performing millisecond-perfect volume crossfades as the user's cursor travels through the graph.
- **Debounce & Memory Protection**: Rapidly hovering across the 3D space could spam the network with hundreds of audio fetches. A 120ms debounce threshold ensures audio only streams when the user intentionally rests on a node, preventing network bottlenecking and `Play() Interrupted` DOM exceptions.

### 3. Data Processing & Force-Directed Graphing
- The spatial coordinates (`x`, `y`, `z`) were calculated via a heavily optimized force-directed graph algorithm. Genres that share multiple artists pull each other closer gravitationally, while unrelated genres repel. 
- Over 42,000 algorithmic links were parsed to create the structural "web" of the universe, visually mapping the bridge between, for example, *Heavy Metal* and *Classical*.

## 🚀 Local Development

To run this project locally, it requires a web server to securely resolve the ES6 module imports and fetch the binary data blobs without triggering browser CORS protections.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sisonpiy-droid/sound.git
   cd sound
   ```

2. **Launch a Local Server:**
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve
   ```

3. **Explore the Data:**
   Open your browser and navigate to `http://localhost:8000`.

## 📂 Data Lineage

- **Dataset**: Matrix artist calculations and genre mapping metadata sourced via Spotify's internal dataset.
- **Audio API**: 30-second low-latency MP3 buffers provided by the Spotify Web API.

---
<div align="center">
  <i>Engineered for the Web. Built for scale.</i>
</div>