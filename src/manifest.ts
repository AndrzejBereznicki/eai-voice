const manifest = {
  id: "eai-voice",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Głos",
  description: "Dyktowanie zadań i komentarzy po polsku oraz czytanie ostatniego komentarza na głos (Web Speech API, bez zewnętrznych kluczy).",
  author: "EkspertAI",
  categories: ["ui"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
    "ui.sidebar.register",
    "ui.action.register",
    "issues.create",
    "issue.comments.read",
    "issue.comments.create",
    "issue.comments.create_human_attributed",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      { type: "globalToolbarButton", id: "voice-new-task", displayName: "Nowe zadanie głosem", exportName: "VoiceNewTaskButton" },
      { type: "toolbarButton", id: "voice-comment", displayName: "Dyktuj komentarz", exportName: "VoiceCommentButton", entityTypes: ["issue"] },
      { type: "toolbarButton", id: "voice-read-last-comment", displayName: "Przeczytaj ostatni komentarz", exportName: "VoiceReadLastCommentButton", entityTypes: ["issue"] },
      { type: "page", id: "voice-settings", displayName: "Głos", exportName: "VoiceSettingsPage", routePath: "voice" },
      { type: "sidebar", id: "voice-sidebar-link", displayName: "Głos", exportName: "VoiceSidebarLink" },
    ],
  },
};

export default manifest;
