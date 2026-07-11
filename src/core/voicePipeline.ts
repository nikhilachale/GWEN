import { transcribeAudio } from "./listener.js";
import { runBrain } from "./brain.js";
import { speak } from "./speaker.js";

export type VoicePipelineDeps = {
  transcribe: (maxMs?: number) => Promise<string> | string;
  think: (input: string, opts?: Record<string, any>) => Promise<string> | string;
  speak: (text: string) => Promise<void> | void;
};

export type VoicePipelineOptions = {
  maxMs?: number;
  brainOptions?: Record<string, any>;
};

export type VoicePipelineResult = {
  transcript: string;
  response: string;
  spoken: boolean;
};

const defaultDeps: VoicePipelineDeps = {
  transcribe: transcribeAudio,
  think: runBrain,
  speak,
};

export async function runVoiceTurn(
  options: VoicePipelineOptions = {},
  deps: Partial<VoicePipelineDeps> = {}
): Promise<VoicePipelineResult> {
  const pipeline = { ...defaultDeps, ...deps };
  const transcript = String(await pipeline.transcribe(options.maxMs)).trim();
  if (!transcript) {
    return { transcript: "", response: "", spoken: false };
  }

  const response = String(await pipeline.think(transcript, options.brainOptions)).trim();
  if (!response) {
    return { transcript, response: "", spoken: false };
  }

  await pipeline.speak(response);
  return { transcript, response, spoken: true };
}
