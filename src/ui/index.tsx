import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginHostContext,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";

interface VoiceSettings {
  voiceURI: string | null;
  rate: number;
  autoRead: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = { voiceURI: null, rate: 1, autoRead: false };

// --- Web Speech API helpers (browser-only, no server round-trip, no keys) ---

function getSpeechRecognitionCtor(): typeof window.SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition ?? null;
}

function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Brak dostępu do mikrofonu — zezwól przeglądarce w ustawieniach.";
    case "no-speech":
      return "Nie wykryto mowy — spróbuj ponownie.";
    case "audio-capture":
      return "Nie znaleziono mikrofonu.";
    case "network":
      return "Błąd sieci rozpoznawania mowy.";
    default:
      return `Błąd rozpoznawania mowy (${code}).`;
  }
}

// Strips common Markdown so TTS reads plain words instead of "gwiazdka gwiazdka pogrubione".
function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^-{3,}$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(voices: SpeechSynthesisVoice[], preferredURI: string | null): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  return voices.find((v) => v.lang?.toLowerCase().startsWith("pl")) ?? null;
}

function speakText(text: string, settings: VoiceSettings, onEnd?: () => void): boolean {
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

function usePolishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
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
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);

  // One utterance per session (continuous = false): Android Chrome in continuous mode re-sends
  // already-final phrases as new results, which duplicated words. Each event carries the whole
  // utterance so far, so the text is rebuilt from scratch instead of appended. Tap the mic again
  // to keep dictating — the new utterance is appended to what is already in the box.
  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Ta przeglądarka nie wspiera rozpoznawania mowy. Wpisz tekst ręcznie.");
      return;
    }
    setError(null);
    const base = transcript ? `${transcript} ` : "";
    const rec = new Ctor();
    rec.lang = "pl-PL";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let utterance = "";
      for (let i = 0; i < event.results.length; i++) utterance += event.results[i][0].transcript;
      setTranscript(`${base}${utterance}`.trim());
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => setError(speechErrorMessage(event.error));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // Already running — ignore (double-click on the mic button).
    }
  }, [transcript]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, error, transcript, setTranscript, start, stop };
}

const CSS = `
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

const SIDEBAR_LINK_CLASS =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

// On mobile the host swaps the task header for its own toolbar (back / archive / menu), which has
// no plugin slot. The issue toolbarButton slot stays mounted under the title, so the buttons are
// portaled into that header instead — visible without scrolling. Desktop has no such toolbar,
// so the buttons render inline as before.
const HEADER_HOST_ATTR = "data-eai-voice-host";

function findMobileHeaderHost(): HTMLElement | null {
  const actions = document.querySelector('[aria-label="Back to inbox"]')?.nextElementSibling;
  if (!(actions instanceof HTMLElement)) return null;
  let host = actions.querySelector<HTMLElement>(`[${HEADER_HOST_ATTR}]`);
  if (!host) {
    host = document.createElement("span");
    host.setAttribute(HEADER_HOST_ATTR, "");
    host.className = "flex items-center gap-0.5";
    actions.insertBefore(host, actions.firstChild);
  }
  return host;
}

function useMobileHeaderHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const sync = () => {
      const next = findMobileHeaderHost();
      setHost((prev) => (prev === next ? prev : next));
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

function IssueToolbarButton({ host, ...props }: { host: HTMLElement | null } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const button = <button type="button" {...props} className={`eai-voice-btn${host ? " in-header" : ""}`} />;
  return host ? createPortal(button, host) : button;
}

function DictationModal({
  title,
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const { supported, listening, error, transcript, setTranscript, start, stop } = useDictation();
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current && supported) {
      startedRef.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Portal to <body>: the host toolbars use backdrop-filter, which turns `position: fixed`
  // into "fixed to the toolbar" and clipped the modal to half its height on mobile.
  return createPortal(
    <div className="eai-voice-overlay" onClick={onClose}>
      <style>{CSS}</style>
      <div className="eai-voice-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {!supported ? <p className="eai-voice-error">Ta przeglądarka nie wspiera rozpoznawania mowy. Wpisz tekst ręcznie poniżej.</p> : null}
        <textarea
          value={transcript}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setTranscript(e.target.value)}
        />
        <div className="eai-voice-row">
          <button
            type="button"
            className={`eai-voice-mic${listening ? " listening" : ""}`}
            onClick={() => (listening ? stop() : start())}
            disabled={!supported}
            title={listening ? "Zatrzymaj dyktowanie" : "Dyktuj"}
            aria-label={listening ? "Zatrzymaj dyktowanie" : "Dyktuj"}
          >
            🎤
          </button>
          <span className="eai-voice-hint">{listening ? "Słucham…" : supported ? "Dotknij mikrofonu, by dyktować" : ""}</span>
        </div>
        {error ? <p className="eai-voice-error">{error}</p> : null}
        {submitError ? <p className="eai-voice-error">{submitError}</p> : null}
        <div className="eai-voice-row">
          <button type="button" className="eai-voice-primary" onClick={handleSubmit} disabled={busy || !transcript.trim()}>
            {busy ? "Wysyłam…" : submitLabel}
          </button>
          <button type="button" className="eai-voice-ghost" onClick={onClose} disabled={busy}>
            Zamknij
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function VoiceNewTaskButton({ context }: { context: PluginHostContext }) {
  const [open, setOpen] = useState(false);
  const createTask = usePluginAction("create-task");
  const toast = usePluginToast();

  return (
    <>
      <button type="button" className="eai-voice-btn" onClick={() => setOpen(true)} title="Nowe zadanie głosem">
        <style>{CSS}</style>
        🎤
      </button>
      {open ? (
        <DictationModal
          title="Nowe zadanie głosem"
          placeholder="Powiedz, co trzeba zrobić…"
          submitLabel="Utwórz zadanie"
          onClose={() => setOpen(false)}
          onSubmit={async (text) => {
            const result = (await createTask({ companyId: context.companyId, title: text })) as { issue: { identifier: string } };
            toast({ title: "Zadanie utworzone", body: result.issue.identifier, tone: "success" });
          }}
        />
      ) : null}
    </>
  );
}

export function VoiceCommentButton({ context }: { context: PluginHostContext & { entityId: string; entityType: "issue" } }) {
  const [open, setOpen] = useState(false);
  const addComment = usePluginAction("add-comment");
  const toast = usePluginToast();
  const host = useMobileHeaderHost();

  return (
    <>
      <style>{CSS}</style>
      <IssueToolbarButton host={host} onClick={() => setOpen(true)} title="Dyktuj komentarz" aria-label="Dyktuj komentarz">
        🎤
      </IssueToolbarButton>
      {open ? (
        <DictationModal
          title="Dyktuj komentarz"
          placeholder="Powiedz treść komentarza…"
          submitLabel="Wyślij komentarz"
          onClose={() => setOpen(false)}
          onSubmit={async (text) => {
            await addComment({ companyId: context.companyId, issueId: context.entityId, body: text });
            toast({ title: "Komentarz wysłany", tone: "success" });
          }}
        />
      ) : null}
    </>
  );
}

interface LastComment {
  id: string;
  body: string;
  authorType: string;
  createdAt: string;
}

// Polled instead of mounted per-comment: this host build never renders the commentAnnotation
// slot, so "read aloud" lives as a second toolbarButton next to the dictate-comment mic and
// reads the issue's latest comment. The same poll loop drives the auto-read-agent-comments
// toggle from the "Głos" settings page while this button stays mounted on the issue page.
const POLL_MS = 8000;

export function VoiceReadLastCommentButton({ context }: { context: PluginHostContext & { entityId: string; entityType: "issue" } }) {
  const { data, refresh } = usePluginData<LastComment | null>("last-comment", {
    companyId: context.companyId,
    issueId: context.entityId,
  });
  const { data: settingsData } = usePluginData<VoiceSettings>("settings", { companyId: context.companyId });
  const settings = settingsData ?? DEFAULT_SETTINGS;
  const lastAnnouncedIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const interval = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data) return;
    const isFirstObservation = lastAnnouncedIdRef.current === undefined;
    const isNewComment = data.id !== lastAnnouncedIdRef.current;
    lastAnnouncedIdRef.current = data.id;
    if (isFirstObservation || !isNewComment) return;
    if (!settingsData?.autoRead || data.authorType !== "agent") return;
    speakText(data.body, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <>
      <style>{CSS}</style>
      <IssueToolbarButton host={host} onClick={toggleSpeaking} disabled={!data} title={label} aria-label={label}>
        {speaking ? "⏹" : "🔊"}
      </IssueToolbarButton>
    </>
  );
}

export function VoiceSidebarLink(_props: PluginSidebarProps) {
  const nav = useHostNavigation();
  return (
    <a {...nav.linkProps("/voice")} className={SIDEBAR_LINK_CLASS}>
      <MicIcon />
      <span>Głos</span>
    </a>
  );
}

export function VoiceSettingsPage({ context }: PluginPageProps) {
  const { data, loading } = usePluginData<VoiceSettings>("settings", { companyId: context.companyId });
  const saveSettings = usePluginAction("save-settings");
  const toast = usePluginToast();
  const voices = usePolishVoices();
  const polishVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("pl"));
  const listedVoices = polishVoices.length > 0 ? polishVoices : voices;

  const [voiceURI, setVoiceURI] = useState<string>("");
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
      toast({ title: "Zapisano ustawienia głosu", tone: "success" });
    } catch (err) {
      toast({ title: "Nie udało się zapisać", body: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function handleTest() {
    speakText("To jest test głosu po polsku.", { voiceURI: voiceURI || null, rate, autoRead });
  }

  if (loading) return <div className="eai-voice-page">Wczytywanie…</div>;

  return (
    <div className="eai-voice-page">
      <style>{CSS}</style>
      <h1>Głos</h1>
      {typeof window !== "undefined" && !window.speechSynthesis ? (
        <p className="eai-voice-error">Ta przeglądarka nie wspiera syntezy mowy (czytania na głos).</p>
      ) : (
        <>
          <div className="eai-voice-field">
            <label htmlFor="eai-voice-select">Głos (pl-PL)</label>
            <select id="eai-voice-select" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
              <option value="">Domyślny głos polski systemu</option>
              {listedVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            {listedVoices.length === 0 ? <p className="eai-voice-hint">Przeglądarka jeszcze nie zgłosiła dostępnych głosów — odśwież stronę.</p> : null}
          </div>
          <div className="eai-voice-field">
            <label htmlFor="eai-voice-rate">Tempo: {rate.toFixed(2)}×</label>
            <input id="eai-voice-rate" type="range" min={0.5} max={2} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </div>
        </>
      )}
      <label className="eai-voice-check">
        <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />
        Czytaj na głos nowe komentarze agentów automatycznie
      </label>
      <div className="eai-voice-row">
        <button type="button" className="eai-voice-ghost" onClick={handleTest}>
          🔊 Testuj głos
        </button>
        <button type="button" className="eai-voice-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Zapisuję…" : "Zapisz"}
        </button>
      </div>
      <p className="eai-voice-hint">
        🎤 w górnym pasku tworzy nowe zadanie głosem (działa od razu, bez otwierania „New task”). W pasku otwartego zadania, zaraz pod tytułem: 🎤 dyktuje komentarz, 🔊 czyta ostatni komentarz na głos.
      </p>
    </div>
  );
}

// Re-export for TS consumers that only need the shared settings shape.
export type { VoiceSettings };
