// src/skills/embeddings.ts — local sentence embeddings via Transformers.js.
// Runs entirely in-process. First call lazily downloads ~25 MB to the HF cache;
// subsequent calls reuse it. Zero API spend, fully offline after first run.
import { pipeline, env } from "@xenova/transformers";

// Force WASM backend so we don't fight the better-sqlite3 native rebuild flow.
// Slightly slower than onnxruntime-node but avoids native binding conflicts.
(env as any).backends.onnx.wasm.numThreads = 1;
(env as any).allowLocalModels = false;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2"; // 384-dim, ~25 MB
const EMBED_DIM = 384;

let pipelinePromise: Promise<any> | null = null;

async function getPipeline(): Promise<any> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline("feature-extraction", MODEL_ID, { quantized: true }).catch((err) => {
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

/**
 * Embed a single string into a 384-dim Float32 vector.
 * Returns null if the model fails to load or embedding fails.
 */
export async function embed(text: string): Promise<Float32Array | null> {
  if (!text || !text.trim()) return null;
  try {
    const extractor = await getPipeline();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  } catch (err: any) {
    console.warn("[embeddings] embed failed:", err?.message || err);
    return null;
  }
}

/**
 * Cosine similarity between two normalized vectors. Both inputs are assumed to
 * be L2-normalized (Transformers.js does this when normalize: true), so this
 * collapses to a dot product.
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export const EMBEDDING_DIMENSIONS = EMBED_DIM;
