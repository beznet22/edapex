<script lang="ts">
	import { Streamdown } from "svelte-streamdown";

	let { content }: { content: string } = $props();
</script>

<div class="prose prose-invert prose-sm max-w-none break-words [&_a]:text-primary">
	<Streamdown {content} />
</div>
