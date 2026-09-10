import { env, pipeline } from '@huggingface/transformers'
env.allowLocalModels = false
env.backends.onnx.wasm!.numThreads = 1
let classifier: Awaited<ReturnType<typeof pipeline<'audio-classification'>>> | null = null
self.onmessage = async (event: MessageEvent<{ id: string; audio: Float32Array }>) => {
  const { id, audio } = event.data
  try {
    if (!classifier) classifier = await pipeline('audio-classification', 'Xenova/ast-finetuned-audioset-10-10-0.4593', {
      dtype: 'q8', device: 'wasm',
      progress_callback: (progress) => { self.postMessage({ type: 'progress', id, progress }) },
    })
    const predictions = await classifier(audio, { top_k: 5 })
    self.postMessage({ type: 'result', id, predictions })
  } catch (error) { self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Identification could not complete.' }) }
}
