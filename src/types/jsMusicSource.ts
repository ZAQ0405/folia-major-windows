import type { AudioQualityPreference, ProviderAudioSource } from './onlineMusic';

// src/types/jsMusicSource.ts

export type JsMusicSourceRuntimeStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface JsMusicSourceRecord {
    id: string;
    name: string;
    description?: string;
    version?: string;
    author?: string;
    homepage?: string;
    code: string;
    enabled: boolean;
    /** Sources discovered from the installed Luoxue source folders are marked so they can be refreshed in place. */
    origin?: 'user' | 'luoxue';
    sourcePath?: string;
    createdAt: number;
    updatedAt: number;
}

export interface JsMusicSourceDescriptor {
    name?: string;
    type?: string;
    actions?: string[];
    qualitys?: string[];
}

export interface JsMusicSourceRuntimeState {
    status: JsMusicSourceRuntimeStatus;
    descriptors: Record<string, JsMusicSourceDescriptor>;
    error?: string;
}

export interface JsMusicSourceAudioResult extends ProviderAudioSource {
    sourceId: string;
    sourceKey: string;
    requestedQuality: AudioQualityPreference;
}
