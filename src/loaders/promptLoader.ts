import { PromptProtocol } from "../prompts/BasePrompt.js";
import { join, dirname } from "path";
import { promises as fs } from "fs";
import { logger } from "../core/Logger.js";

export class PromptLoader {
  private readonly PROMPTS_DIR: string;
  private readonly EXCLUDED_FILES = ["BasePrompt.js", "*.test.js", "*.spec.js"];

  constructor(basePath?: string) {
    const mainModulePath = basePath || process.argv[1];
    this.PROMPTS_DIR = join(dirname(mainModulePath), "prompts");
    logger.debug(
      `Initialized PromptLoader with directory: ${this.PROMPTS_DIR}`
    );
  }

  async hasPrompts(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.PROMPTS_DIR);
      if (!stats.isDirectory()) {
        logger.debug("Prompts path exists but is not a directory");
        return false;
      }

      const files = await fs.readdir(this.PROMPTS_DIR);
      const hasValidFiles = files.some((file) => this.isPromptFile(file));
      logger.debug(`Prompts directory has valid files: ${hasValidFiles}`);
      return hasValidFiles;
    } catch (error) {
      logger.debug(`No prompts directory found: ${(error as Error).message}`);
      return false;
    }
  }

  private isPromptFile(file: string): boolean {
    if (!file.endsWith(".js")) return false;
    const isExcluded = this.EXCLUDED_FILES.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace("*", ".*"));
        return regex.test(file);
      }
      return file === pattern;
    });

    logger.debug(
      `Checking file ${file}: ${isExcluded ? "excluded" : "included"}`
    );
    return !isExcluded;
  }

  private validatePrompt(prompt: any): prompt is PromptProtocol {
    const isValid = Boolean(
      prompt &&
        typeof prompt.name === "string" &&
        prompt.promptDefinition &&
        typeof prompt.getMessages === "function"
    );

    if (isValid) {
      logger.debug(`Validated prompt: ${prompt.name}`);
    } else {
      logger.warn(`Invalid prompt found: missing required properties`);
    }

    return isValid;
  }

  async loadPrompts(): Promise<PromptProtocol[]> {
    try {
      logger.debug(`Attempting to load prompts from: ${this.PROMPTS_DIR}`);

      let stats;
      try {
        stats = await fs.stat(this.PROMPTS_DIR);
      } catch (error) {
        logger.debug(`No prompts directory found: ${(error as Error).message}`);
        return [];
      }

      if (!stats.isDirectory()) {
        logger.error(`Path is not a directory: ${this.PROMPTS_DIR}`);
        return [];
      }

      const files = await fs.readdir(this.PROMPTS_DIR);
      logger.debug(`Found files in directory: ${files.join(", ")}`);

      const prompts: PromptProtocol[] = [];

      for (const file of files) {
        if (!this.isPromptFile(file)) {
          continue;
        }

        try {
          const fullPath = join(this.PROMPTS_DIR, file);
          logger.debug(`Attempting to load prompt from: ${fullPath}`);

          const importPath = `file://${fullPath}`;
          const { default: PromptClass } = await import(importPath);

          if (!PromptClass) {
            logger.warn(`No default export found in ${file}`);
            continue;
          }

          const prompt = new PromptClass();
          if (this.validatePrompt(prompt)) {
            prompts.push(prompt);
          }
        } catch (error) {
          logger.error(`Error loading prompt ${file}: ${(error as Error).message}`);
        }
      }

      logger.debug(
        `Successfully loaded ${prompts.length} prompts: ${prompts
          .map((p) => p.name)
          .join(", ")}`
      );
      return prompts;
    } catch (error) {
      logger.error(`Failed to load prompts: ${(error as Error).message}`);
      return [];
    }
  }
}
