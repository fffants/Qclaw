const PREFERRED_PROVIDER_BY_AUTH_CHOICE = {
  "openai-codex": "openai-codex",
  "openai-api-key": "openai",
  "gemini-api-key": "google",
  "google-gemini-cli": "google-gemini-cli",
  "qwen-portal": "qwen-portal",
  "minimax-portal": "minimax-portal",
  "minimax-api": "minimax"
};

function resolvePreferredProviderForAuthChoice(choice) {
  return PREFERRED_PROVIDER_BY_AUTH_CHOICE[choice] || choice;
}

export { PREFERRED_PROVIDER_BY_AUTH_CHOICE, resolvePreferredProviderForAuthChoice };
