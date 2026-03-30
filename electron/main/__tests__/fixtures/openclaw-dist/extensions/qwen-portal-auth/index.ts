const PROVIDER_ID = "qwen-portal";
const PROVIDER_LABEL = "Qwen";

const qwenPortalPlugin = {
  id: "qwen-portal-auth",
  name: "Qwen OAuth",
  description: "OAuth flow for Qwen (free-tier) models",
  register(api: any) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/qwen",
      aliases: ["qwen"],
      auth: [
        {
          id: "device",
          label: "Qwen OAuth",
          hint: "Device code login",
          kind: "device_code",
          run: async () => {}
        }
      ]
    });
  }
};

export default qwenPortalPlugin;
