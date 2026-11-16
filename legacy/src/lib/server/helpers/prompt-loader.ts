import { readFileSync, existsSync } from "fs";
import { join } from "path";

export function loadPrompt(moduleName: string, designation: string): string {
    const path = join(process.cwd(), ".system/prompts", moduleName, `${designation}.md`);

    if (!existsSync(path)) {
        console.warn(`Prompt file not found: ${path}`);
        return `System prompt not found for ${moduleName} - ${designation}`;
    }

    return readFileSync(path, "utf-8");
}
