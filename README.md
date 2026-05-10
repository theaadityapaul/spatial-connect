# 🎓 SpatialConnect: Graphic Era 3D Campus

Hey! Welcome to SpatialConnect. I built this project to tackle the boring "Zoom fatigue" we all experience during remote work and online classes. Instead of staring at a grid of video boxes, this is a real-time, browser-based 3D digital twin of a university campus. 

The idea is simple: You log in, run around the campus, and naturally walk up to people to talk to them or collaborate in 3D storage hubs.

## ✨ What's Inside?

* **Zero Downloads:** The whole 3D world runs directly in your web browser using WebGL and React Three Fiber.
* **Smooth Multiplayer:** I wrote a custom Node.js backend using WebSockets to sync everyone's positions, animations, and chat at 60 FPS without lag.
* **Proximity Voice Chat:** Used native WebRTC so you can literally just walk up to another player and start talking. It's peer-to-peer, meaning the audio doesn't overload the server.
* **Interactive Study Hubs:** Every player gets their own building on campus. You can walk inside to share live notes, use AI to summarize scratchpads, dictate with speech-to-text, or upload image galleries.
* **Smart Physics:** Custom client-side collision detection so you can't walk through walls (or get permanently trapped in the central fountain!).

## 💻 How I Built It

**The Frontend:**
* **Next.js & React:** For the UI, login state, and overlays.
* **Three.js & React Three Fiber:** For rendering the 3D campus and handling lighting/shadows.
* **WebRTC:** For the decentralized voice comms.

**The Backend (The Brain):**
* **Node.js & Express:** To keep things fast and non-blocking.
* **Socket.io:** The WebSocket pipeline that handles all the real-time movement and chat data.
* **In-Memory State:** Instead of a traditional database (which would lag trying to save movement data 60 times a second), the server uses RAM to track all player coordinates instantly.

## 🛠️ Want to run it locally?

You'll need two terminal windows open to run the server and the frontend at the same time.

**1. Start the Brain (Backend)**
Open your first terminal and run:
```bash
cd server
npm install
node index.js
