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

export async function runVoiceTurn(
  options: VoicePipelineOptions = {},
  deps: Partial<VoicePipelineDeps> = {}
): Promise<VoicePipelineResult> {
  const pipeline = await resolveVoicePipelineDeps(deps);
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

async function resolveVoicePipelineDeps(deps: Partial<VoicePipelineDeps>): Promise<VoicePipelineDeps> {
  const [listener, brain, speaker] = await Promise.all([
    deps.transcribe ? null : import("./listener.js"),
    deps.think ? null : import("./brain.js"),
    deps.speak ? null : import("./speaker.js"),
  ]);

  return {
    transcribe: deps.transcribe ?? listener!.transcribeAudio,
    think: deps.think ?? brain!.runBrain,
    speak: deps.speak ?? speaker!.speak,
  };
}
