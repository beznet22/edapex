/// <reference types="svelte" />

// Declare all .svelte files as modules
declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component<any>;
  export default component;
}

// Specific type for ResultTemplate component
declare module '$lib/components/template/ResultTemplate.svelte' {
  import type { Component } from 'svelte';
  import type { StudentResultData } from '$lib/types/rusult';
  
  const component: Component<{ data: StudentResultData }>;
  export default component;
}

