module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  const status = err.response?.status || err.status || 500;
  const message = err.response?.data?.message || err.message || 'Erro interno do servidor';

  res.status(status).json({ error: message });
};
