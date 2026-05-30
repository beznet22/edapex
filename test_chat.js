import { Chat } from "@ai-sdk/svelte";
const c = new Chat({ id: '1' });
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(c)));
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(c))));
