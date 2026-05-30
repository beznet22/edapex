import { useChat } from "@ai-sdk/svelte";
const c = useChat({ api: '/api/test' });
c.append({ role: 'user', content: 'hello' }, { body: { ctx: 'test' } });
