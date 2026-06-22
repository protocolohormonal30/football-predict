function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * P(X = k) para uma distribuição de Poisson com média lambda.
 * Usada para estimar a probabilidade de um time marcar exatamente k gols.
 */
function poissonProbability(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

module.exports = { poissonProbability, factorial };
