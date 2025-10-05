# WellnessQuest

A minimal TypeScript + Vite life-simulation prototype where you manage nutrition, fitness, work, and avoid diseases.

## Features
- Turn cycle: Eat -> Fitness -> Work -> Disease Check -> End of Day
- Stats: health, energy, fitness, mood, money, vitamins, minerals, protein, sugar, cholesterol, sodium
- Foods & fitness actions from JSON definitions
- Job selection and dynamic income formula evaluation
- Disease triggering with simple rule parsing and active condition notifications
- Streak mechanic for healthy meals leading to income bonuses
- Stat decay & clamping per `gameRules.json`

## Project Structure
```
root
  |-- index.html
  |-- main.ts (bootstraps game)
  |-- src/
        types.ts (interfaces)
        dataLoader.ts (fetches JSON assets)
        game.ts (core turn logic & rules)
        ui.ts (DOM rendering & events)
        utils.ts (helpers: clamp, expression eval, etc.)
  |-- *.json (data assets)
```

## Getting Started

Install dependencies and run dev server:
```bash
npm install
npm run dev
```
Open the printed local URL (usually http://localhost:5173) in your browser.

## How to Play
1. Select a food (improves or worsens certain stats, costs money) 
2. Select a fitness action
3. Pick a job (affects pay and some stat modifiers)
4. Click "Next Day" to process the cycle.
5. Watch the log and stats panel for changes & disease notifications.

## Extending
Ideas:
- Add persistence with localStorage (save/load game state)
- Add animations or a nicer UI framework later (React, Svelte, etc.)
- Expand disease system to use a proper rule engine
- Add multiple meals per day or separate morning/evening phases
- Implement achievements and leaderboards
- Add audio feedback for events

## Audio System
The game now includes a lightweight synthesized audio layer (no external assets) using the Web Audio API.

Implemented event sounds:
- Day start: ascending soft triangle sweep
- Collect food: quick bright triangle → high sweep
- Collect fitness: gritty sawtooth downward sweep
- Mid‑day refresh (MORE ▶): square blip sweep
- Day end positive (health improved): warm ascending sine
- Day end negative (health worsened): descending sine with longer tail
- Disease triggered: square warning drop
- Death: low sawtooth decay
- Confirmation (toggling sound back on): short sine chirp
- Test ping (debug): square blip (available via `audioManager.testPing()` in the console when debug on)

Debugging / Control:
- Global singleton exposed as `window.audioManager` for console inspection.
- `audioManager.setDebug(true)` enables verbose logging of each attempted playback and auto-init attempts.
- `audioManager.status()` reports `{ started, enabled, ctxState, sampleRate, suspended }`.
- Automatic initialization occurs on first: Start button click, sound toggle interaction, pointerdown/keydown (one-time), or any sound play attempt (autoInit fallback).

Design notes:
- All sounds are procedural oscillator tones with per-note ADSR style (attack + linear release) envelopes and optional exponential frequency sweeps.
- Master gain is capped at 0.6; mute toggling sets gain to 0 instead of suspending the context to reduce start latency.
- iOS/Safari unlock handled by playing a 1-frame silent buffer during `init()`.

Potential future enhancements:
- Volume slider (persist preference in localStorage).
- Option to select alternate sound themes (e.g., chiptune vs mellow vs minimalist beeps).
- Spatial mixing or subtle stereo panning for different event categories.
- Queue / debounce layer to prevent rapid stacking if user spams inputs.
- Offline mixing of simple chord intervals for positive outcomes.
- Accessibility: visual pulse highlight synchronized with key sounds for users who play muted.

If audio ever appears unresponsive:
1. Verify at least one user interaction occurred (browser autoplay policy).
2. Run `audioManager.status()` – if `started:false` call `audioManager.init()` manually.
3. Enable debug logging and fire `audioManager.testPing()`.
4. Check browser console for blocked AudioContext messages (rare in secure origins).

The system is intentionally small; no build step changes required.

## Notes on Safety
The small `evalExpression` utility uses `new Function` on controlled expressions shipped with the game data. Avoid exposing it to user-provided input without sandboxing.

## License
MIT (add a license file if you plan to open source)
