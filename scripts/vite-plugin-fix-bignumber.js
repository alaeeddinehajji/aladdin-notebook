/**
 * Vite plugin that patches the Appwrite SDK's BigNumber.isBigNumber() call
 * at build time. The static method breaks after bundling because the class
 * identity / prototype chain can differ across chunks.
 *
 * We replace:
 *   BigNumber.isBigNumber(value)
 * with the equivalent inline check that bignumber.js uses internally:
 *   (value && value._isBigNumber === true)
 *
 * This avoids editing node_modules and works on Vercel.
 */
export function fixBigNumberPlugin() {
  /** @type {"pre"} */
  const enforce = "pre";

  return {
    name: "fix-bignumber",
    enforce,
    transform(code, id) {
      // Only transform the Appwrite SDK client source
      if (!id.includes("appwrite") || !id.includes("client")) {
        return null;
      }

      if (!code.includes("BigNumber.isBigNumber")) {
        return null;
      }

      const patched = code.replace(
        /BigNumber\.isBigNumber\((\w+)\)/g,
        "($1 && $1._isBigNumber === true)",
      );

      if (patched === code) return null;

      return { code: patched, map: null };
    },
  };
}
