const AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI = {};

const ONBOARD_PROVIDER_AUTH_FLAGS = [
  {
    optionKey: "openaiApiKey",
    authChoice: "openai-api-key",
    cliFlag: "--openai-api-key",
    cliOption: "--openai-api-key <key>",
    description: "OpenAI API key"
  },
  {
    optionKey: "geminiApiKey",
    authChoice: "gemini-api-key",
    cliFlag: "--gemini-api-key",
    cliOption: "--gemini-api-key <key>",
    description: "Gemini API key"
  },
  {
    optionKey: "minimaxApiKey",
    authChoice: "minimax-api",
    cliFlag: "--minimax-api-key",
    cliOption: "--minimax-api-key <key>",
    description: "MiniMax M2.5"
  }
];
export { AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI as n, ONBOARD_PROVIDER_AUTH_FLAGS as t };
