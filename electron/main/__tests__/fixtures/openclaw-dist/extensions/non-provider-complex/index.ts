const complexPlugin = {
  id: "non-provider-complex",
  name: "Non Provider Complex",
  register() {
    // This comment includes an unmatched opener that the lightweight parser
    // must never see for non-provider plugins: {
    return {
      ok: true,
    };
  },
};

export default complexPlugin;
