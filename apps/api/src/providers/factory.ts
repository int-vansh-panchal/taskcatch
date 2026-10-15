import type { SpeechProvider, LLMProvider } from "@taskcatch/shared";
import { FasterWhisperSpeechProvider } from "./fasterWhisperSpeechProvider.js";
import { MockSpeechProvider } from "./mockSpeechProvider.js";
import { OllamaLLMProvider } from "./ollamaProvider.js";
import { MockLLMProvider } from "./mockLLMProvider.js";
import { config } from "../config.js";

export class ProviderFactory {
  private static speechInstance: SpeechProvider | null = null;
  private static llmInstance: LLMProvider | null = null;

  static async getSpeechProvider(providerType?: string): Promise<SpeechProvider> {
    const selected = providerType || config.sttProvider || "faster-whisper";

    if (selected === "mock") {
      return new MockSpeechProvider();
    }

    // Try real faster-whisper sidecar
    const provider = new FasterWhisperSpeechProvider(config.sttServiceUrl);
    const health = await provider.healthCheck();
    if (health.ok) {
      return provider;
    }

    console.warn(`[ProviderFactory] Speech provider '${selected}' is unhealthy (${health.message}). Falling back to MockSpeechProvider for resilience.`);
    return new MockSpeechProvider();
  }

  static async getLLMProvider(providerType?: string, model?: string): Promise<LLMProvider> {
    const selected = providerType || config.llmProvider || "ollama";

    if (selected === "mock") {
      return new MockLLMProvider();
    }

    // Try real Ollama local provider
    const provider = new OllamaLLMProvider(config.ollamaBaseUrl, model || config.ollamaModel);
    const health = await provider.healthCheck();
    if (health.ok) {
      return provider;
    }

    console.warn(`[ProviderFactory] LLM provider '${selected}' is unhealthy (${health.message}). Falling back to MockLLMProvider for resilience.`);
    return new MockLLMProvider();
  }
}
