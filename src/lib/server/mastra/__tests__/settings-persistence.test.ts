import { describe, it, expect, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../db/schema';
import { 
    saveProviderConfig, 
    getAllActiveProviders,
    encrypt,
    decrypt,
    maskKey
} from '../provider-config';

const ENCRYPTION_KEY = 'test-key-32-characters-long-12345';

describe('Mastra Settings Persistence', () => {
    let db: any;

    beforeEach(async () => {
        const client = createClient({ url: ':memory:' });
        db = drizzle(client, { schema });
        
        // Manual table creation for memory DB
        await client.execute(`
            CREATE TABLE provider_configs (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                api_key_encrypted TEXT,
                priority INTEGER NOT NULL DEFAULT 1,
                base_url TEXT NOT NULL DEFAULT '',
                task_mappings TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, provider)
            )
        `);
    });

    it('should encrypt and decrypt keys correctly', () => {
        const secret = 'sk-1234567890';
        const encrypted = encrypt(secret, ENCRYPTION_KEY);
        expect(encrypted).not.toBe(secret);
        expect(decrypt(encrypted, ENCRYPTION_KEY)).toBe(secret);
    });

    it('should persist and retrieve provider configs', async () => {
        const userId = 1;
        const provider = 'groq';
        const apiKey = 'sk-groq-key';
        const encryptedKey = encrypt(apiKey, ENCRYPTION_KEY);

        await saveProviderConfig(db, {
            provider,
            userId,
            apiKeyEncrypted: encryptedKey,
            priority: 1,
            baseUrl: 'https://groq.api',
            taskMappings: '{}',
            enabled: 1
        });

        const providers = await getAllActiveProviders(db, userId, {}, [provider]);
        const groqProvider = providers.find(p => p.provider === provider);
        expect(groqProvider).toBeDefined();
        expect(groqProvider!.provider).toBe(provider);
        expect(groqProvider!.baseUrl).toBe('https://groq.api');
        expect(groqProvider!.source).toBe('db');
    });

    it('should fallback to .env when no DB config exists', async () => {
        const userId = 1;
        const provider = 'mistral';
        const envKeys = { 'MISTRAL_API_KEY': 'sk-env-mistral' };

        const providers = await getAllActiveProviders(db, userId, envKeys, [provider]);
        const mistralProvider = providers.find(p => p.provider === provider);
        expect(mistralProvider).toBeDefined();
        expect(mistralProvider!.source).toBe('env');
        expect(mistralProvider!.apiKeyMasked).toBe(maskKey('sk-env-mistral'));
    });

    it('should respect multi-tenant isolation', async () => {
        const userA = 1;
        const userB = 2;
        const provider = 'groq';

        // Save for User A
        await saveProviderConfig(db, {
            provider,
            userId: userA,
            apiKeyEncrypted: 'key-a',
            priority: 1,
            baseUrl: '',
            taskMappings: '{}',
            enabled: 1
        });

        // Save for User B
        await saveProviderConfig(db, {
            provider,
            userId: userB,
            apiKeyEncrypted: 'key-b',
            priority: 1,
            baseUrl: '',
            taskMappings: '{}',
            enabled: 1
        });

        const configsA = await getAllActiveProviders(db, userA, {}, [provider]);
        const configsB = await getAllActiveProviders(db, userB, {}, [provider]);

        expect(configsA[0].apiKeyEncrypted).toBe('key-a');
        expect(configsB[0].apiKeyEncrypted).toBe('key-b');
    });

    it('should handle UPSERT correctly', async () => {
        const userId = 1;
        const provider = 'groq';

        await saveProviderConfig(db, {
            provider,
            userId,
            apiKeyEncrypted: 'key-1',
            priority: 1,
            baseUrl: '',
            taskMappings: '{}',
            enabled: 1
        });

        await saveProviderConfig(db, {
            provider,
            userId,
            apiKeyEncrypted: 'key-2',
            priority: 2,
            baseUrl: 'new-url',
            taskMappings: '{}',
            enabled: 1
        });

        const providers = await getAllActiveProviders(db, userId, {}, [provider]);
        const groqProvider = providers.find(p => p.provider === provider);
        expect(groqProvider).toBeDefined();
        expect(groqProvider!.apiKeyEncrypted).toBe('key-2');
        expect(groqProvider!.priority).toBe(2);
        expect(groqProvider!.baseUrl).toBe('new-url');
    });
});
