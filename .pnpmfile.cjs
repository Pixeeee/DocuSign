// This file is used to provide hooks into pnpm lifecycle
module.exports = {
  hooks: {
    readPackage(pkg, context) {
      // Add any package.json modifications here if needed
      return pkg;
    },
  },
};
