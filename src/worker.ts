import { definePlugin, runWorker, type PluginPerformActionContext } from "@paperclipai/plugin-sdk";

export interface VoiceSettings {
  voiceURI: string | null;
  rate: number;
  autoRead: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = { voiceURI: null, rate: 1, autoRead: false };

// Dictation and TTS run entirely in the browser (Web Speech API); the worker only
// stores preferences and proxies the two writes a human can trigger from the mic UI.
function requireHuman(context: PluginPerformActionContext | undefined): string {
  const actor = context?.actor;
  if (!actor || actor.type !== "user" || !actor.userId) {
    throw new Error("Dyktowanie jest dostępne tylko dla użytkownika board (człowieka). Agenci nie mogą go uruchamiać.");
  }
  return actor.userId;
}

function requireCompanyId(params: Record<string, unknown>): string {
  const companyId = params.companyId;
  if (typeof companyId !== "string" || !companyId) throw new Error("companyId is required");
  return companyId;
}

function requireText(params: Record<string, unknown>, field: string): string {
  const value = params[field];
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(field === "title" ? "Dyktowanie nie wykryło żadnego tekstu — spróbuj ponownie." : "Komentarz jest pusty — spróbuj dyktować ponownie.");
  return text;
}

const plugin = definePlugin({
  async setup(ctx) {
    const settingsKey = (companyId: string) => ({ scopeKind: "company" as const, scopeId: companyId, stateKey: "voice-settings" });

    ctx.data.register("settings", async (params) => {
      const companyId = requireCompanyId(params);
      const stored = (await ctx.state.get(settingsKey(companyId))) as Partial<VoiceSettings> | null;
      return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    });

    ctx.actions.register("save-settings", async (params, context) => {
      requireHuman(context);
      const companyId = requireCompanyId(params);
      const current = (await ctx.state.get(settingsKey(companyId))) as Partial<VoiceSettings> | null;
      const next: VoiceSettings = {
        voiceURI: typeof params.voiceURI === "string" && params.voiceURI ? params.voiceURI : null,
        rate: typeof params.rate === "number" && Number.isFinite(params.rate) ? Math.min(2, Math.max(0.5, params.rate)) : (current?.rate ?? DEFAULT_SETTINGS.rate),
        autoRead: typeof params.autoRead === "boolean" ? params.autoRead : (current?.autoRead ?? DEFAULT_SETTINGS.autoRead),
      };
      await ctx.state.set(settingsKey(companyId), next);
      return { settings: next };
    });

    // commentAnnotation slots aren't rendered by the installed Paperclip host build (checked
    // its UI bundle directly — no code path mounts that slot type), so "read aloud" is a
    // toolbarButton next to the dictate-comment button that reads the issue's latest comment.
    ctx.data.register("last-comment", async (params) => {
      const companyId = requireCompanyId(params);
      const issueId = typeof params.issueId === "string" ? params.issueId : "";
      // The real host returns newest-first, the SDK test harness oldest-first. Same-millisecond
      // createdAt ties make a full sort unreliable, so detect the direction from the ends.
      const comments = await ctx.issues.listComments(issueId, companyId);
      const kept = comments.filter((c) => !c.deletedAt);
      const first = kept[0];
      const last = kept[kept.length - 1];
      const newestFirst = !!first && !!last && new Date(first.createdAt).getTime() > new Date(last.createdAt).getTime();
      const latest = newestFirst ? first : last;
      if (!latest) return null;
      return {
        id: latest.id,
        body: latest.body,
        authorType: latest.authorType,
        createdAt: latest.createdAt,
      };
    });

    ctx.actions.register("create-task", async (params, context) => {
      const userId = requireHuman(context);
      const companyId = requireCompanyId(params);
      const title = requireText(params, "title");
      const issue = await ctx.issues.create({ companyId, title, actor: { actorUserId: userId } });
      return { issue };
    });

    ctx.actions.register("add-comment", async (params, context) => {
      const userId = requireHuman(context);
      const companyId = requireCompanyId(params);
      const issueId = typeof params.issueId === "string" ? params.issueId : "";
      if (!issueId) throw new Error("issueId is required");
      const body = requireText(params, "body");
      const comment = await ctx.issues.createComment(issueId, body, companyId, { actorUserId: userId });
      return { comment };
    });
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
