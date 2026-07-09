/** Wrap an async controller so rejections flow to the errorHandler middleware. */
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
