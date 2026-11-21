// src/ui/index.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginToast
} from "@paperclipai/plugin-sdk/ui";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var DEFAULT_SETTINGS = { voiceURI: null, rate: 1, autoRead: false };
function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
function speechErrorMessage(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Brak dost\u0119pu do mikrofonu \u2014 zezw\xF3l przegl\u0105darce w ustawieniach.";
    case "no-speech":
      return "Nie wykryto mowy \u2014 spr\xF3buj ponownie.";
    case "audio-capture":
      return "Nie znaleziono mikrofonu.";
    case "network":
      return "B\u0142\u0105d sieci rozpoznawania mowy.";
    default:
      return `B\u0142\u0105d rozpoznawania mowy (${code}).`;
  }
}
function stripMarkdown(input) {
  return input.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/^[-*+]\s+/gm, "").replace(/^\d+\.\s+/gm, "").replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1").replace(/~~([^~]+)~~/g, "$1").replace(/^-{3,}$/gm, "").replace(/\s+/g, " ").trim();
}
function pickVoice(voices, preferredURI) {
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  return voices.find((v) => v.lang?.toLowerCase().startsWith("pl")) ?? null;
}
function speakText(text, settings, onEnd) {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const clean = stripMarkdown(text);
  if (!clean) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "pl-PL";
  utter.rate = settings.rate || 1;
  const voice = pickVoice(window.speechSynthesis.getVoices(), settings.voiceURI);
  if (voice) utter.voice = voice;
  if (onEnd) {
    utter.onend = onEnd;
    utter.onerror = onEnd;
  }
  window.speechSynthesis.speak(utter);
  return true;
}
function usePolishVoices() {
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}
function useDictation() {
  const supported = !!getSpeechRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef(null);
  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Ta przegl\u0105darka nie wspiera rozpoznawania mowy. Wpisz tekst r\u0119cznie.");
      return;
    }
    setError(null);
    const base = transcript ? `${transcript} ` : "";
    const rec = new Ctor();
    rec.lang = "pl-PL";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let utterance = "";
      for (let i = 0; i < event.results.length; i++) utterance += event.results[i][0].transcript;
      setTranscript(`${base}${utterance}`.trim());
    };
    rec.onerror = (event) => setError(speechErrorMessage(event.error));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
    }
  }, [transcript]);
  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);
  useEffect(() => () => recRef.current?.stop(), []);
  return { supported, listening, error, transcript, setTranscript, start, stop };
}
var CSS = `
.eai-voice-btn { display: inline-flex; align-items: center; gap: 6px; height: 2rem; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); font: inherit; font-size: 13px; cursor: pointer; }
.eai-voice-btn:hover { background: var(--accent); }
.eai-voice-btn.in-header { border-color: transparent; background: transparent; padding: 0 6px; font-size: 18px; }
.eai-voice-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.85); display: flex; padding: 16px; overflow-y: auto; z-index: 2147483000; }
.eai-voice-modal { margin: auto; background: var(--background); color: var(--foreground); border: 1px solid var(--border); border-radius: 12px; padding: 18px; width: min(32rem, 100%); display: grid; gap: 10px; }
.eai-voice-modal h2 { font-size: 16px; font-weight: 600; margin: 0; }
.eai-voice-modal textarea { font: inherit; font-size: 15px; width: 100%; min-height: 90px; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); resize: vertical; }
.eai-voice-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.eai-voice-mic { font-size: 20px; line-height: 1; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--background); cursor: pointer; }
.eai-voice-mic.listening { background: var(--destructive); color: var(--destructive-foreground, #fff); border-color: var(--destructive); }
.eai-voice-primary { font: inherit; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--primary); background: var(--primary); color: var(--primary-foreground); cursor: pointer; }
.eai-voice-primary:disabled { opacity: .5; cursor: default; }
.eai-voice-ghost { font: inherit; padding: 8px 12px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--muted-foreground); cursor: pointer; }
.eai-voice-error { color: var(--destructive); font-size: 13px; }
.eai-voice-hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
.eai-voice-page { padding: 16px; max-width: 640px; display: grid; gap: 16px; }
.eai-voice-page h1 { font-size: 20px; font-weight: 600; margin: 0; }
.eai-voice-field { display: grid; gap: 6px; }
.eai-voice-field label { font-size: 13px; font-weight: 500; }
.eai-voice-field select, .eai-voice-field input[type=range] { font: inherit; }
.eai-voice-field select { padding: 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); }
.eai-voice-check { display: flex; align-items: center; gap: 8px; font-size: 14px; }
`;
var SIDEBAR_LINK_CLASS = "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
function MicIcon() {
  return /* @__PURE__ */ jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flexShrink: 0 }, children: [
    /* @__PURE__ */ jsx("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" }),
    /* @__PURE__ */ jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" })
  ] });
}
var HEADER_HOST_ATTR = "data-eai-voice-host";
function findMobileHeaderHost() {
  const actions = document.querySelector('[aria-label="Back to inbox"]')?.nextElementSibling;
  if (!(actions instanceof HTMLElement)) return null;
  let host = actions.querySelector(`[${HEADER_HOST_ATTR}]`);
  if (!host) {
    host = document.createElement("span");
    host.setAttribute(HEADER_HOST_ATTR, "");
    host.className = "flex items-center gap-0.5";
    actions.insertBefore(host, actions.firstChild);
  }
  return host;
}
function useMobileHeaderHost() {
  const [host, setHost] = useState(null);
  useEffect(() => {
    const sync = () => {
      const next = findMobileHeaderHost();
      setHost((prev) => prev === next ? prev : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      const current = document.querySelector(`[${HEADER_HOST_ATTR}]`);
      if (current && current.childElementCount === 0) current.remove();
    };
  }, []);
  return host;
}
function IssueToolbarButton({ host, ...props }) {
  const button = /* @__PURE__ */ jsx("button", { type: "button", ...props, className: `eai-voice-btn${host ? " in-header" : ""}` });
  return host ? createPortal(button, host) : button;
}
function DictationModal({
  title,
  placeholder,
  submitLabel,
  onSubmit,
  onClose
}) {
  const { supported, listening, error, transcript, setTranscript, start, stop } = useDictation();
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current && supported) {
      startedRef.current = true;
      start();
    }
  }, [supported]);
  useEffect(() => () => stop(), [stop]);
  async function handleSubmit() {
    const text = transcript.trim();
    if (!text || busy) return;
    stop();
    setBusy(true);
    setSubmitError(null);
    try {
      await onSubmit(text);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    /* @__PURE__ */ jsxs("div", { className: "eai-voice-overlay", onClick: onClose, children: [
      /* @__PURE__ */ jsx("style", { children: CSS }),
      /* @__PURE__ */ jsxs("div", { className: "eai-voice-modal", onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsx("h2", { children: title }),
        !supported ? /* @__PURE__ */ jsx("p", { className: "eai-voice-error", children: "Ta przegl\u0105darka nie wspiera rozpoznawania mowy. Wpisz tekst r\u0119cznie poni\u017Cej." }) : null,
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: transcript,
            placeholder,
            autoFocus: true,
            onChange: (e) => setTranscript(e.target.value)
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "eai-voice-row", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: `eai-voice-mic${listening ? " listening" : ""}`,
              onClick: () => listening ? stop() : start(),
              disabled: !supported,
              title: listening ? "Zatrzymaj dyktowanie" : "Dyktuj",
              "aria-label": listening ? "Zatrzymaj dyktowanie" : "Dyktuj",
              children: "\u{1F3A4}"
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "eai-voice-hint", children: listening ? "S\u0142ucham\u2026" : supported ? "Dotknij mikrofonu, by dyktowa\u0107" : "" })
        ] }),
        error ? /* @__PURE__ */ jsx("p", { className: "eai-voice-error", children: error }) : null,
        submitError ? /* @__PURE__ */ jsx("p", { className: "eai-voice-error", children: submitError }) : null,
        /* @__PURE__ */ jsxs("div", { className: "eai-voice-row", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "eai-voice-primary", onClick: handleSubmit, disabled: busy || !transcript.trim(), children: busy ? "Wysy\u0142am\u2026" : submitLabel }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "eai-voice-ghost", onClick: onClose, disabled: busy, children: "Zamknij" })
        ] })
      ] })
    ] }),
    document.body
  );
}
function VoiceNewTaskButton({ context }) {
  const [open, setOpen] = useState(false);
  const createTask = usePluginAction("create-task");
  const toast = usePluginToast();
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("button", { type: "button", className: "eai-voice-btn", onClick: () => setOpen(true), title: "Nowe zadanie g\u0142osem", children: [
      /* @__PURE__ */ jsx("style", { children: CSS }),
      "\u{1F3A4}"
    ] }),
    open ? /* @__PURE__ */ jsx(
      DictationModal,
      {
        title: "Nowe zadanie g\u0142osem",
        placeholder: "Powiedz, co trzeba zrobi\u0107\u2026",
        submitLabel: "Utw\xF3rz zadanie",
        onClose: () => setOpen(false),
        onSubmit: async (text) => {
          const result = await createTask({ companyId: context.companyId, title: text });
          toast({ title: "Zadanie utworzone", body: result.issue.identifier, tone: "success" });
        }
      }
    ) : null
  ] });
}
function VoiceCommentButton({ context }) {
  const [open, setOpen] = useState(false);
  const addComment = usePluginAction("add-comment");
  const toast = usePluginToast();
  const host = useMobileHeaderHost();
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsx(IssueToolbarButton, { host, onClick: () => setOpen(true), title: "Dyktuj komentarz", "aria-label": "Dyktuj komentarz", children: "\u{1F3A4}" }),
    open ? /* @__PURE__ */ jsx(
      DictationModal,
      {
        title: "Dyktuj komentarz",
        placeholder: "Powiedz tre\u015B\u0107 komentarza\u2026",
        submitLabel: "Wy\u015Blij komentarz",
        onClose: () => setOpen(false),
        onSubmit: async (text) => {
          await addComment({ companyId: context.companyId, issueId: context.entityId, body: text });
          toast({ title: "Komentarz wys\u0142any", tone: "success" });
        }
      }
    ) : null
  ] });
}
var POLL_MS = 8e3;
function VoiceReadLastCommentButton({ context }) {
  const { data, refresh } = usePluginData("last-comment", {
    companyId: context.companyId,
    issueId: context.entityId
  });
  const { data: settingsData } = usePluginData("settings", { companyId: context.companyId });
  const settings = settingsData ?? DEFAULT_SETTINGS;
  const lastAnnouncedIdRef = useRef(void 0);
  useEffect(() => {
    const interval = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!data) return;
    const isFirstObservation = lastAnnouncedIdRef.current === void 0;
    const isNewComment = data.id !== lastAnnouncedIdRef.current;
    lastAnnouncedIdRef.current = data.id;
    if (isFirstObservation || !isNewComment) return;
    if (!settingsData?.autoRead || data.authorType !== "agent") return;
    speakText(data.body, settings);
  }, [data, settingsData]);
  const host = useMobileHeaderHost();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  function toggleSpeaking() {
    if (speaking) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    if (data && speakText(data.body, settings, () => setSpeaking(false))) setSpeaking(true);
  }
  const label = speaking ? "Zatrzymaj czytanie" : "Przeczytaj ostatni komentarz";
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsx(IssueToolbarButton, { host, onClick: toggleSpeaking, disabled: !data, title: label, "aria-label": label, children: speaking ? "\u23F9" : "\u{1F50A}" })
  ] });
}
function VoiceSidebarLink(_props) {
  const nav = useHostNavigation();
  return /* @__PURE__ */ jsxs("a", { ...nav.linkProps("/voice"), className: SIDEBAR_LINK_CLASS, children: [
    /* @__PURE__ */ jsx(MicIcon, {}),
    /* @__PURE__ */ jsx("span", { children: "G\u0142os" })
  ] });
}
function VoiceSettingsPage({ context }) {
  const { data, loading } = usePluginData("settings", { companyId: context.companyId });
  const saveSettings = usePluginAction("save-settings");
  const toast = usePluginToast();
  const voices = usePolishVoices();
  const polishVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("pl"));
  const listedVoices = polishVoices.length > 0 ? polishVoices : voices;
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [autoRead, setAutoRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current || !data) return;
    loadedRef.current = true;
    setVoiceURI(data.voiceURI ?? "");
    setRate(data.rate);
    setAutoRead(data.autoRead);
  }, [data]);
  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({ companyId: context.companyId, voiceURI: voiceURI || null, rate, autoRead });
      toast({ title: "Zapisano ustawienia g\u0142osu", tone: "success" });
    } catch (err) {
      toast({ title: "Nie uda\u0142o si\u0119 zapisa\u0107", body: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  }
  function handleTest() {
    speakText("To jest test g\u0142osu po polsku.", { voiceURI: voiceURI || null, rate, autoRead });
  }
  if (loading) return /* @__PURE__ */ jsx("div", { className: "eai-voice-page", children: "Wczytywanie\u2026" });
  return /* @__PURE__ */ jsxs("div", { className: "eai-voice-page", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsx("h1", { children: "G\u0142os" }),
    typeof window !== "undefined" && !window.speechSynthesis ? /* @__PURE__ */ jsx("p", { className: "eai-voice-error", children: "Ta przegl\u0105darka nie wspiera syntezy mowy (czytania na g\u0142os)." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "eai-voice-field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "eai-voice-select", children: "G\u0142os (pl-PL)" }),
        /* @__PURE__ */ jsxs("select", { id: "eai-voice-select", value: voiceURI, onChange: (e) => setVoiceURI(e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Domy\u015Blny g\u0142os polski systemu" }),
          listedVoices.map((v) => /* @__PURE__ */ jsxs("option", { value: v.voiceURI, children: [
            v.name,
            " (",
            v.lang,
            ")"
          ] }, v.voiceURI))
        ] }),
        listedVoices.length === 0 ? /* @__PURE__ */ jsx("p", { className: "eai-voice-hint", children: "Przegl\u0105darka jeszcze nie zg\u0142osi\u0142a dost\u0119pnych g\u0142os\xF3w \u2014 od\u015Bwie\u017C stron\u0119." }) : null
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "eai-voice-field", children: [
        /* @__PURE__ */ jsxs("label", { htmlFor: "eai-voice-rate", children: [
          "Tempo: ",
          rate.toFixed(2),
          "\xD7"
        ] }),
        /* @__PURE__ */ jsx("input", { id: "eai-voice-rate", type: "range", min: 0.5, max: 2, step: 0.05, value: rate, onChange: (e) => setRate(Number(e.target.value)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("label", { className: "eai-voice-check", children: [
      /* @__PURE__ */ jsx("input", { type: "checkbox", checked: autoRead, onChange: (e) => setAutoRead(e.target.checked) }),
      "Czytaj na g\u0142os nowe komentarze agent\xF3w automatycznie"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "eai-voice-row", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "eai-voice-ghost", onClick: handleTest, children: "\u{1F50A} Testuj g\u0142os" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "eai-voice-primary", onClick: handleSave, disabled: saving, children: saving ? "Zapisuj\u0119\u2026" : "Zapisz" })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "eai-voice-hint", children: "\u{1F3A4} w g\xF3rnym pasku tworzy nowe zadanie g\u0142osem (dzia\u0142a od razu, bez otwierania \u201ENew task\u201D). W pasku otwartego zadania, zaraz pod tytu\u0142em: \u{1F3A4} dyktuje komentarz, \u{1F50A} czyta ostatni komentarz na g\u0142os." })
  ] });
}
export {
  VoiceCommentButton,
  VoiceNewTaskButton,
  VoiceReadLastCommentButton,
  VoiceSettingsPage,
  VoiceSidebarLink
};
