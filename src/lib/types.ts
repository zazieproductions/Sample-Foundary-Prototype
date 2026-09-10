export type Category = 'Texture' | 'Percussion' | 'Tonal' | 'Ambience' | 'Voice' | 'Effects' | 'Unclassified'
export type Status = 'ready' | 'review'
export interface AudioAnalysis {
  duration: number; sampleRate: number; channels: number; bitDepth: number | null;
  peakDb: number; rmsDb: number; silenceStart: number; silenceEnd: number;
  centroid: number; flatness: number; waveform: number[];
  bpm: number | null; key: string | null; pitch: number | null;
  category: Category; tags: string[]; method: 'signal' | 'model' | 'synthesized';
  predictions?: { label: string; score: number }[];
}
export interface Sample {
  id: string; packId: string; name: string; originalName: string; blob: Blob;
  category: Category; tags: string[]; bpm: number | null; key: string | null;
  status: Status; favorite: boolean; createdAt: number; analysis: AudioAnalysis;
  trim: boolean; normalize: boolean; fade: boolean;
  /** True while the filename is kept in sync with analysis (BPM · original name · genre). */
  autoNamed?: boolean;
}
export interface Pack { id: string; name: string; description: string; author: string; createdAt: number; starter?: boolean }
export interface Workspace { samples: Sample[]; packs: Pack[]; activePackId: string }
export const CATEGORIES: Category[] = ['Texture', 'Percussion', 'Tonal', 'Ambience', 'Voice', 'Effects', 'Unclassified']
