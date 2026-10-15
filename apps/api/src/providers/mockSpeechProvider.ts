import type { SpeechProvider, SpeechTranscriptionResult } from "@taskcatch/shared";

export class MockSpeechProvider implements SpeechProvider {
  name = "mock-speech-provider";

  async transcribe(
    audioFilePath: string,
    vocabularyHints?: string
  ): Promise<SpeechTranscriptionResult> {
    // If testing specific fixture audio
    if (audioFilePath.includes("hindi")) {
      return {
        language_detected: "hi",
        language_probability: 0.94,
        segments: [
          {
            start_ms: 0,
            end_ms: 3200,
            speaker: "Speaker 1",
            text_original: "कल सुबह दस बजे तक टीम मीटिंग के नोट्स भेज देना।",
            text_english: "Send the team meeting notes by 10 AM tomorrow.",
          },
          {
            start_ms: 3300,
            end_ms: 6500,
            speaker: "Speaker 1",
            text_original: "और क्लाइंट का डेटा चेक कर लेना।",
            text_english: "And verify the client's data.",
          },
        ],
      };
    }

    if (audioFilePath.includes("gujarati")) {
      return {
        language_detected: "gu",
        language_probability: 0.92,
        segments: [
          {
            start_ms: 0,
            end_ms: 4500,
            speaker: "Speaker 1",
            text_original: "આવતીકાલે બપોરે ત્રણ વાગ્યે પ્રોજેક્ટનો રિવ્યુ કરવાનો છે.",
            text_english: "We need to conduct the project review tomorrow at 3 PM.",
          },
          {
            start_ms: 4600,
            end_ms: 7000,
            speaker: "Speaker 1",
            text_original: "અને રિપોર્ટ મોકલવાનો છે.",
            text_english: "And send the final report.",
          },
        ],
      };
    }

    if (audioFilePath.includes("hinglish")) {
      return {
        language_detected: "hi",
        language_probability: 0.88,
        segments: [
          {
            start_ms: 0,
            end_ms: 4000,
            speaker: "Speaker 1",
            text_original: "Kal shaam tak production release ready hona chahiye.",
            text_english: "The production release must be ready by tomorrow evening.",
          },
          {
            start_ms: 4100,
            end_ms: 6800,
            speaker: "Speaker 1",
            text_original: "Aur testing team ko update de dena.",
            text_english: "And provide an update to the QA testing team.",
          },
        ],
      };
    }

    // Default English
    return {
      language_detected: "en",
      language_probability: 0.98,
      segments: [
        {
          start_ms: 0,
          end_ms: 3500,
          speaker: "Speaker 1",
          text_original: "Please prepare the weekly deployment report by tomorrow evening at 5 PM.",
          text_english: "Please prepare the weekly deployment report by tomorrow evening at 5 PM.",
        },
        {
          start_ms: 3600,
          end_ms: 5500,
          speaker: "Speaker 1",
          text_original: "Also schedule the sync with the DevOps lead.",
          text_english: "Also schedule the sync with the DevOps lead.",
        },
      ],
    };
  }
}
