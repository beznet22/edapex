<script lang="ts">
	import { InspectorContext } from "$lib/context/inspector-context.svelte";

	const inspector = new InspectorContext();
	inspector.setContext();

	let { children } = $props();
</script>

{@render children()}
