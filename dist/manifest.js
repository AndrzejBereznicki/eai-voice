// src/manifest.ts
var manifest = {
  id: "eai-voice",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "G\u0142os",
  description: "Dyktowanie zada\u0144 i komentarzy po polsku oraz czytanie ostatniego komentarza na g\u0142os (Web Speech API, bez zewn\u0119trznych kluczy).",
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
    "issue.comments.create_human_attributed"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      { type: "globalToolbarButton", id: "voice-new-task", displayName: "Nowe zadanie g\u0142osem", exportName: "VoiceNewTaskButton" },
      { type: "toolbarButton", id: "voice-comment", displayName: "Dyktuj komentarz", exportName: "VoiceCommentButton", entityTypes: ["issue"] },
      { type: "toolbarButton", id: "voice-read-last-comment", displayName: "Przeczytaj ostatni komentarz", exportName: "VoiceReadLastCommentButton", entityTypes: ["issue"] },
      { type: "page", id: "voice-settings", displayName: "G\u0142os", exportName: "VoiceSettingsPage", routePath: "voice" },
      { type: "sidebar", id: "voice-sidebar-link", displayName: "G\u0142os", exportName: "VoiceSidebarLink" }
    ]
  }
};
var manifest_default = manifest;
export {
  manifest_default as default
};
