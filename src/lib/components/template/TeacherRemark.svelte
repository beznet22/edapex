<script lang="ts">
  import type { ResultOutput } from "$lib/schema/result";

	interface Props {
		remark: ResultOutput["remark"];
	}

	let { remark }: Props = $props();

	// Get remark text or default message
	const remarkText = $derived(remark?.remark || 'No comment');
</script>

<div class="border-b grid grid-cols-5 px-1 py-1">
	<div>
		<span
			class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
		>
			Teacher's Remark
		</span>
	</div>
	<span class="col-span-4 pl-2 text-xs print:text-slate-500 leading-7">
		{remarkText}
	</span>
</div>

