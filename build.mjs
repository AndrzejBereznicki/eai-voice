import { build } from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx", sourcemap: false });

await build(presets.esbuild.worker);
await build(presets.esbuild.manifest);
await build({ ...presets.esbuild.ui, jsx: "automatic" });
