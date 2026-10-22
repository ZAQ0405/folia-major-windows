import { describe, expect, it } from 'vitest';
import { handleAndroidQqApiRequest } from '@/services/onlineMusic/androidQqRuntime';

describe('Android embedded QQ API runtime', () => {
    it('advertises its in-app login channels without a configured API server', async () => {
        const response = await handleAndroidQqApiRequest(new Request('https://folia-qq.local/login/channels'));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            code: 200,
            data: {
                channels: ['qq', 'wechat'],
                sessionMode: 'sealed',
                configured: true,
            },
        });
    });
});
