<script lang="ts">
    import { Badge } from "$lib/components/ui/badge";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import type { Student } from "$lib/server/db/schema";

    let { student }: { student: any } = $props();
</script>

<Card class="w-full max-w-sm">
    <CardHeader
        class="flex flex-row items-center justify-between space-y-0 pb-2"
    >
        <CardTitle class="text-sm font-medium">
            {student.fullName || student.name}
        </CardTitle>
        <Badge variant="outline">{student.admissionNo ?? student.adminNo}</Badge
        >
    </CardHeader>
    <CardContent>
        <div class="text-2xl font-bold">
            Class {student.className ?? student.classId}
        </div>
        <p class="text-muted-foreground text-xs">
            Section {student.sectionName ?? student.sectionId ?? "N/A"}
        </p>
    </CardContent>
</Card>
