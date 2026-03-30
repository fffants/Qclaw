const PROVIDER_ID = "google-gemini-cli";
const PROVIDER_LABEL = "Gemini CLI OAuth";

const geminiCliPlugin = {
  id: "google-gemini-cli-auth",
  name: "Google Gemini CLI Auth",
  description: "OAuth flow for Gemini CLI (Google Code Assist)",
  register(api: any) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/models",
      aliases: ["gemini-cli"],
      auth: [
        {
          id: "oauth",
          label: "Google OAuth",
          hint: "PKCE + localhost callback",
          kind: "oauth",
          run: async () => {}
        }
      ]
    });
  }
};

export default geminiCliPlugin;
