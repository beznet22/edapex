import { Chat } from "@ai-sdk/svelte";
const c = new Chat({ api: '/api/test' });
c.append({ role: 'user', content: 'hello' }, { body: { ctx: 'test' } });
