/**
 * CommonJS monkey-patch helper: services call `model.fn(...)` via property
 * access at call time, so replacing the property on the shared module object
 * swaps the implementation. restoreAll() reverts after each test.
 */
const patched = [];

exports.patch = (obj, key, impl) => {
  patched.push({ obj, key, original: obj[key] });
  obj[key] = impl;
};

exports.restoreAll = () => {
  while (patched.length) {
    const { obj, key, original } = patched.pop();
    obj[key] = original;
  }
};
