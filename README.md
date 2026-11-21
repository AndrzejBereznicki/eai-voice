# eai-voice — Polish voice for Paperclip

A [Paperclip](https://github.com/paperclipai/paperclip) plugin that adds **Polish voice dictation and read-aloud** to the AI agent task board — entirely in the browser, with no API keys and no paid services.

Built on the Web Speech API: `SpeechRecognition` for dictation and `speechSynthesis` for reading comments aloud.

## Features

| Plugin slot | What it does |
|---|---|
| `globalToolbarButton` | 🎤 in the top bar — create a new task by voice (dictated text becomes the title) |
| `toolbarButton` (task view) | 🎤 in the task toolbar — dictate a comment, with a preview before sending |
| `toolbarButton` (task view) | 🔊 next to the mic — reads the latest task comment aloud |
| `page` `/voice` + sidebar entry | pick a pl-PL voice, speech rate, and toggle auto-reading of new agent comments |

## How it works

- Dictation and speech synthesis run fully in the browser. The plugin worker only stores voice settings and creates the task or comment once a human sends the dictated text.
- If the browser doesn't support `SpeechRecognition`, the modal shows a clear message in Polish and lets you type the text instead.
- **Auto read-aloud:** while a task is open, the plugin polls the latest comment every 8 s. The first poll only remembers the current comment; any new comment written by an agent is then read aloud automatically (when enabled on the Voice page).

## Design notes

- Paperclip's `commentAnnotation` slot is validated by the backend but never rendered by the frontend (verified in the host bundle), so the 🔊 button lives in the task toolbar instead.
- Floating (`position: fixed`) buttons were tried and dropped — they covered native Paperclip controls. The task toolbar is the only integration point that doesn't overlap anything.

## Security — humans only

`create-task`, `add-comment` and `save-settings` accept only human board users (`context.actor.type === "user"`); calls from agents or the system key are rejected (covered by tests). Dictated comments are attributed to the real user (`actorUserId`), so they wake the assigned agent exactly like a normal UI comment — this requires the `issue.comments.create_human_attributed` capability.

## Build & test

```bash
npm install
npm run build
npm test
```

## Install (requires a board account)

```bash
npx paperclipai plugin install --local /path/to/eai-voice
```

After code changes: `npm run build`, then `npx paperclipai plugin upgrade eai-voice` (re-reads the same local path and restarts the worker).

## Roadmap

- Stage 2: local speech models (Whisper for recognition, Piper for synthesis).
