const AUTH_CHOICE_GROUP_DEFS = [
  {
    value: "openai",
    label: "OpenAI",
    hint: "Codex OAuth + API key",
    choices: ["openai-codex", "openai-api-key"]
  },
  {
    value: "google",
    label: "Google",
    hint: "Gemini API key + OAuth",
    choices: ["gemini-api-key", "google-gemini-cli"]
  },
  {
    value: "qwen",
    label: "Qwen",
    hint: "OAuth",
    choices: ["qwen-portal"]
  },
  {
    value: "minimax",
    label: "MiniMax",
    hint: "M2.5 (recommended)",
    choices: ["minimax-portal", "minimax-api"]
  }
];

const PROVIDER_AUTH_CHOICE_OPTION_HINTS = {
  "gemini-api-key": "Gemini API key from Google AI Studio",
  "google-gemini-cli": "Unofficial flow; review account-risk warning before use"
};

const PROVIDER_AUTH_CHOICE_OPTION_LABELS = {
  "openai-api-key": "OpenAI API key",
  "gemini-api-key": "Gemini API key",
  "minimax-api": "MiniMax M2.5"
};

const BASE_AUTH_CHOICE_OPTIONS = [
  {
    value: "openai-codex",
    label: "OpenAI Codex (ChatGPT OAuth)"
  },
  {
    value: "google-gemini-cli",
    label: "Google Gemini CLI OAuth",
    hint: "Unofficial flow; review account-risk warning before use"
  },
  {
    value: "qwen-portal",
    label: "Qwen OAuth"
  },
  {
    value: "minimax-portal",
    label: "MiniMax OAuth",
    hint: "Oauth plugin for MiniMax"
  }
];

function formatAuthChoiceChoicesForCli(params) {
  return params;
}

export {
  AUTH_CHOICE_GROUP_DEFS,
  PROVIDER_AUTH_CHOICE_OPTION_HINTS,
  PROVIDER_AUTH_CHOICE_OPTION_LABELS,
  BASE_AUTH_CHOICE_OPTIONS,
  formatAuthChoiceChoicesForCli
};
