<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Carousel from "$lib/components/ui/carousel/index.js";
  import { RotateCcw, Upload } from "@lucide/svelte";
  import { Separator } from "./ui/separator";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import Button from "./ui/button/button.svelte";
  import type { CarouselAPI } from "$lib/components/ui/carousel/context.js";
  import { onMount } from "svelte";
  import Loader from "./prompt-kit/loader/loader.svelte";

  interface ChatResourceProps {
    onFileSelected: (files: FileList) => void;
  }

  let { onFileSelected }: ChatResourceProps = $props();

  let fileCtx = $derived(useFileActions());
  let uploads = $derived(fileCtx.uploads.filter((u) => u.status === "pending" || u.status === "started"));

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      onFileSelected(target.files);
    }
  }

  // onMount(async () => {
  //   for (const upload of uploads) {
  //     console.log("Retrying upload: ", upload);
  //     fileCtx.retryUpload(upload);

  //     // Wait for the upload to complete by checking its status
  //     await new Promise<void>((resolve) => {
  //       const interval = setInterval(() => {
  //         const updatedUpload = fileCtx.uploads.find((u) => u.id === upload.id);
  //         if (
  //           updatedUpload &&
  //           (updatedUpload.success === true ||
  //             updatedUpload.status === "done" ||
  //             updatedUpload.status === "error")
  //         ) {
  //           clearInterval(interval);
  //           resolve();
  //         }
  //       }, 100); // Check every 100ms
  //     });
  //   }
  // });
</script>

{#if uploads.length > 0}
  <Carousel.Root class="relative w-full pt-12">
    <div class="flex min-h-full items-center text-sm mx-4">
      <Separator />
    </div>
    <div class="flex justify-center">
      <!-- <div class="my-4 md:basis-1/2 lg:basis-1/5">
        <Card.Root
          class="h-full border-0 bg-sidebar cursor-pointer hover:bg-accent transition-colors"
          onclick={() => (fileCtx.openModal = true)}
        >
          <Card.Content class="flex aspect-video items-center justify-center p-6 h-full">
            <Upload class="size-6" />
          </Card.Content>
        </Card.Root>
        <input type="file" class="hidden" bind:this={fileInput} onchange={handleFileChange} />
      </div>

      <div class="flex min-h-full items-center text-sm mx-4">
        <Separator orientation="vertical" />
      </div> -->

      <Carousel.Content class="flex-1 my-4 justify-center items-center">
        {#each uploads as upload, i (i)}
          <Carousel.Item class="md:basis-1/2 lg:basis-1/5 h-full -ms-1">
            <div class="h-full">
              <Card.Root class="h-full rounded-2xl">
                <Card.Content
                  class="relative flex aspect-square items-center justify-center px-4 h-full overflow-hidden"
                >
                  {#if upload.status === "pending"}
                    <img
                      src={`api/uploads/${upload.filename}`}
                      alt={upload.filename}
                      class="h-full w-full object-cover rounded-lg"
                    />
                  {/if}

                  <Button
                    variant="ghost"
                    size="icon"
                    class="absolute bottom-2 right-2 bg-black/70 text-white text-2xl font-semibold px-2 py-1 rounded-md cursor-pointer"
                    onclick={() => {
                      fileCtx.retryUpload(upload);
                    }}
                  >
                    {#if upload.status === "started"}
                      <Loader variant="circular" size="sm" />
                    {:else if upload.status === "pending"}
                      <RotateCcw class="size-4" />
                    {/if}
                  </Button>
                </Card.Content>
              </Card.Root>
            </div>
          </Carousel.Item>
        {/each}
      </Carousel.Content>
      <div class="absolute right-0 top-0 z-10 flex gap-2">
        <Carousel.Previous class="static translate-y-0 h-9 w-9" />
        <Carousel.Next class="static translate-y-0 h-9 w-9" />
      </div>
    </div>
  </Carousel.Root>
{/if}
