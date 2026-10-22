declare module '@yakult-green-tea/qq-music-api/serverless' {
    export type QrEvent = { type?: string | null; payload?: unknown };
    export type QqQrRelay = {
        open(qrcodeId: string, image: string, ttlMs: number): Promise<void>;
        image(qrcodeId: string): Promise<string>;
        poll(qrcodeId: string, budgetMs: number): Promise<QrEvent[]>;
        close(qrcodeId: string): Promise<void>;
    };
    export type MqttConnect = (
        url: string,
        protocol: string,
        handlers: MqttSocketHandlers,
    ) => Promise<{ send(data: Uint8Array): void; close(): void }>;
    export type MqttSocketHandlers = {
        message(value: unknown): void;
        error(error?: Error): void;
        close(): void;
    };
    export type QrEventListener = {
        ready: Promise<void>;
        done: Promise<void>;
        close(): void;
    };
    export type MqttListener = {
        ready: Promise<void>;
        done: Promise<void>;
        close(): void;
    };
    export function createMqttListenOver(connect: MqttConnect): (
        qrcodeId: string,
        onEvent: (event: QrEvent) => void,
        timeoutMs: number,
    ) => MqttListener;
    const handleRequest: (
        request: Request,
        env?: { QQ_SESSION_SECRET?: string; QQ_SESSION_SECRET_PREVIOUS?: string },
        options?: { qqRelay?: QqQrRelay },
    ) => Promise<Response>;
    export default handleRequest;
}

declare module '@yakult-green-tea/qq-music-api/mqtt' {
    export type QrEvent = import('@yakult-green-tea/qq-music-api/serverless').QrEvent;
    export type QqQrRelay = import('@yakult-green-tea/qq-music-api/serverless').QqQrRelay;
    export type MqttConnect = import('@yakult-green-tea/qq-music-api/serverless').MqttConnect;
    export type MqttListener = import('@yakult-green-tea/qq-music-api/serverless').MqttListener;
    export type MqttSocketHandlers = import('@yakult-green-tea/qq-music-api/serverless').MqttSocketHandlers;
    export type QrEventListener = import('@yakult-green-tea/qq-music-api/serverless').QrEventListener;
    export function createMqttListenOver(connect: MqttConnect): (
        qrcodeId: string,
        onEvent: (event: QrEvent) => void,
        timeoutMs: number,
    ) => MqttListener;
}
