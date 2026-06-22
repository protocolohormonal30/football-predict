// Evita repetir try/catch em toda rota assíncrona: encaminha erros para o errorHandler.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
