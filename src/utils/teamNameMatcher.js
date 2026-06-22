// Sufixos/prefixos comuns que variam entre provedores
// (ex: "Manchester United FC" na football-data.org vs "Manchester United" na Odds API).
const TOKENS_TO_STRIP = ['fc', 'cf', 'afc', 'sc', 'ac', 'cd', 'ec', 'sad', 'ssd'];

/**
 * Normaliza um nome de time para comparação: remove acentos, deixa minúsculo,
 * remove sufixos/prefixos comuns de clube e espaços duplicados.
 */
function normalize(name) {
  if (!name) return '';

  let n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // remove pontuação
    .trim();

  const words = n.split(/\s+/).filter((w) => !TOKENS_TO_STRIP.includes(w));
  return words.join(' ').trim();
}

/**
 * Dado um nome de time (de qualquer fonte) e uma lista de candidatos de outra
 * fonte, retorna o candidato mais provável de ser o mesmo time, ou null.
 * Estratégia: 1) igualdade exata normalizada, 2) inclusão de substring.
 */
function findBestMatch(name, candidates) {
  const target = normalize(name);
  if (!target || !candidates?.length) return null;

  const exact = candidates.find((c) => normalize(c) === target);
  if (exact) return exact;

  const partial = candidates.find((c) => {
    const cn = normalize(c);
    return cn.includes(target) || target.includes(cn);
  });

  return partial || null;
}

module.exports = { normalize, findBestMatch };
