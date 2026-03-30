const PROVIDER_ID = "minimax-portal";
const PROVIDER_LABEL = "MiniMax";

function buildModelDefinition(params: {
  id: string;
  name: string;
  input: Array<"text" | "image">;
}) {
  return {
    id: params.id,
    name: params.name,
    input: params.input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

const modelDefinitions = [
  buildModelDefinition({
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    input: ["text"],
  }),
];

const minimaxPortalPlugin = {
  id: "minimax-portal-auth",
  name: "MiniMax OAuth",
  description: "OAuth flow for MiniMax models",
  register(api: any) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/minimax",
      aliases: ["minimax"],
      auth: [
        {
          id: "oauth",
          label: "MiniMax OAuth (Global)",
          hint: "Global endpoint - api.minimax.io",
          kind: "device_code",
          run: async () => {}
        },
        {
          id: "oauth-cn",
          label: "MiniMax OAuth (CN)",
          hint: "CN endpoint - api.minimaxi.com",
          kind: "device_code",
          run: async () => {}
        }
      ],
      models: modelDefinitions
    });
  }
};

export default minimaxPortalPlugin;
