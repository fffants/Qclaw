const copilotProxyPlugin = {
  id: "copilot-proxy",
  name: "Copilot Proxy",
  description: "Local Copilot Proxy (VS Code LM) provider plugin",
  register(api: any) {
    api.registerProvider({
      id: "copilot-proxy",
      label: "Copilot Proxy",
      docsPath: "/providers/models",
      auth: [
        {
          id: "local",
          label: "Local proxy",
          hint: "Configure base URL + models for the Copilot Proxy server",
          kind: "custom",
          run: async () => {}
        }
      ]
    });
  }
};

export default copilotProxyPlugin;
