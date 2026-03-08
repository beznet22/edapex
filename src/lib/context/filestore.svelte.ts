import { getContext, setContext } from "svelte";
import type { UploadedData } from "$lib/types/chat-types";
import type { ExtractedAssessment } from "$lib/server/storage/student-files";
import { toast } from "svelte-sonner";
import { useFileActions } from "./file-context.svelte";
import { publishResult } from "$lib/api/assessment.remote";

const FILESTORE_CONTEXT_KEY = Symbol("filestore-context");

export class FilestoreContext {
    // Page State
    searchQuery = $state("");
    selectedFolder = $state<string | null>(null);
    isPageLoading = $state(true);

    // Modal State
    viewModalOpen = $state(false);
    selectedFile = $state<UploadedData | null>(null);
    zoom = $state(1);
    rotation = $state(0);
    showGrids = $state(false);
    showTranslation = $state(false);
    extractedData = $state<ExtractedAssessment | null>(null);
    isModalLoading = $state(false);
    isPublishing = $state(false);
    activeTab = $state("results");

    // Drawer State (Mobile selection)
    drawerOpen = $state(false);

    fileCtx = $derived(useFileActions());

    // Derived Page Data
    folders = $derived.by(() => {
        const tokens = new Set<string>();
        this.fileCtx.uploads.forEach((u) => {
            if (u.token) tokens.add(u.token);
        });
        return Array.from(tokens).sort();
    });

    filteredFiles = $derived.by(() => {
        let files = this.fileCtx.uploads;
        if (this.selectedFolder)
            files = files.filter((u) => u.token === this.selectedFolder);
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            files = files.filter((u) => u.filename.toLowerCase().includes(q));
        }
        return files;
    });

    // Derived Modal Data
    images = $derived(
        this.fileCtx.uploads.filter(
            (u) =>
                u.type?.startsWith("image/") ||
                u.filename.match(/\.(jpg|jpeg|png|gif)$/i),
        ),
    );

    currentIndex = $derived(this.images.findIndex((img) => img.id === this.selectedFile?.id));

    // Actions
    loadResources = async () => {
        this.isPageLoading = true;
        try {
            await this.fileCtx.loadResources();
        } finally {
            this.isPageLoading = false;
        }
    };

    handleView = (file: UploadedData) => {
        this.selectedFile = file;
        this.viewModalOpen = true;
        this.resetViewer();
        this.loadAssessmentData();
    };

    resetViewer = () => {
        this.zoom = 1;
        this.rotation = 0;
    };

    loadAssessmentData = async () => {
        if (!this.selectedFile || !this.selectedFile.id) return;
        this.isModalLoading = true;
        try {
            const resp = await fetch(
                `/api/uploads/${this.selectedFile.id}.json?token=${this.selectedFile.token}`,
            );
            if (resp.ok) {
                this.extractedData = await resp.json();
            } else {
                this.extractedData = null;
                toast.error("Failed to load extracted data");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error loading data");
        } finally {
            this.isModalLoading = false;
        }
    };

    handleApprove = async () => {
        if (!this.selectedFile || !this.extractedData || this.isModalLoading) return;

        this.isModalLoading = true;
        try {
            const resp = await fetch(`/api/uploads/${this.selectedFile.id}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    data: this.extractedData,
                    token: this.selectedFile.token,
                }),
            });

            if (resp.ok) {
                toast.success("Assessment approved and saved");
                
                // Optimistically update the UI status instantly to preserve reactivity
                this.selectedFile.status = "approved";
                this.fileCtx.updateUpload({ ...this.selectedFile });

                this.handleNext();
            } else {
                toast.error("Failed to approve assessment");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error approving assessment");
        } finally {
            this.isModalLoading = false;
        }
    };

    handlePrev = () => {
        if (this.currentIndex > 0) {
            this.selectedFile = this.images[this.currentIndex - 1];
            this.resetViewer();
            this.loadAssessmentData();
        }
    };

    handleNext = () => {
        if (this.currentIndex < this.images.length - 1) {
            this.selectedFile = this.images[this.currentIndex + 1];
            this.resetViewer();
            this.loadAssessmentData();
        }
    };

    updateScore = (subject: string, index: number, value: string) => {
        if (!this.extractedData) return;
        const num = parseFloat(value) || 0;

        // New Structure
        if (this.extractedData.data?.marksData) {
            const m = this.extractedData.data.marksData.find(
                (m) => m.subjectCode === subject,
            );
            if (m && m.marks) {
                m.marks[index] = num;
            }
        }

        // Legacy Structure
        const legacy = this.extractedData as any;
        if (legacy.marksData) {
            const m = legacy.marksData.find(
                (m: any) => m.subjectCode === subject,
            );
            if (m) {
                m.marks[index] = num;
            }
        }

        if (legacy.scores && legacy.scores[subject]) {
            legacy.scores[subject][index] = num;
        }
    };

    handlePublish = async () => {
        const data = this.extractedData?.data;
        const studentId = data?.studentData?.studentId;
        const examTypeId = data?.studentData?.examTypeId;

        if (!studentId || !examTypeId) {
            toast.error("Missing student or exam data for publishing");
            return;
        }

        this.isPublishing = true;
        try {
            const result = await publishResult({ studentId, examTypeId });
            if (result.success) {
                toast.success(result.message || "Result published successfully");
            } else {
                toast.error(result.message || "Failed to publish result");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error publishing result");
        } finally {
            this.isPublishing = false;
        }
    };

    setContext = () => {
        setContext(FILESTORE_CONTEXT_KEY, this);
    };

    static fromContext(): FilestoreContext {
        const context = getContext<FilestoreContext>(FILESTORE_CONTEXT_KEY);
        if (!context) {
            throw new Error("FilestoreContext must be used within a Filestore provider");
        }
        return context;
    }
}

export const useFilestore = () => FilestoreContext.fromContext();
