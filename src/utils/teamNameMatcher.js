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

// Tradução de nomes de seleções em português (normalizados, sem acento) para
// o nome oficial em inglês usado pela football-data.org. Cobre as seleções
// da Copa do Mundo 2026 — complete aqui se precisar de outras competições.
const PT_TO_EN_ALIASES = {
  'brasil': 'Brazil',
  'estados unidos': 'United States',
  'eua': 'United States',
  'inglaterra': 'England',
  'alemanha': 'Germany',
  'mexico': 'Mexico',
  'holanda': 'Netherlands',
  'paises baixos': 'Netherlands',
  'nova zelandia': 'New Zealand',
  'noruega': 'Norway',
  'uruguai': 'Uruguay',
  'australia': 'Australia',
  'austria': 'Austria',
  'congo': 'Congo DR',
  'rd congo': 'Congo DR',
  'republica democratica do congo': 'Congo DR',
  'franca': 'France',
  'gana': 'Ghana',
  'ira': 'Iran',
  'costa do marfim': 'Ivory Coast',
  'marrocos': 'Morocco',
  'arabia saudita': 'Saudi Arabia',
  'coreia do sul': 'South Korea',
  'suecia': 'Sweden',
  'suica': 'Switzerland',
  'belgica': 'Belgium',
  'bosnia e herzegovina': 'Bosnia-Herzegovina',
  'bosnia': 'Bosnia-Herzegovina',
  'chequia': 'Czechia',
  'tchequia': 'Czechia',
  'republica tcheca': 'Czechia',
  'equador': 'Ecuador',
  'japao': 'Japan',
  'jordania': 'Jordan',
  'panama': 'Panama',
  'paraguai': 'Paraguay',
  'escocia': 'Scotland',
  'espanha': 'Spain',
  'argelia': 'Algeria',
  'cabo verde': 'Cape Verde Islands',
  'croacia': 'Croatia',
  'egito': 'Egypt',
  'iraque': 'Iraq',
  'catar': 'Qatar',
  'africa do sul': 'South Africa',
  'tunisia': 'Tunisia',
  'turquia': 'Turkey',
  'uzbequistao': 'Uzbekistan',
  'colombia': 'Colombia',
  'canada': 'Canada',
};

/**
 * Se o nome digitado bater com um apelido em português conhecido, devolve o
 * nome oficial em inglês correspondente. Caso contrário, devolve o nome
 * original sem alteração.
 */
function translateAlias(name) {
  const key = normalize(name);
  return PT_TO_EN_ALIASES[key] || name;
}

/**
 * Distância de Levenshtein: quantas inserções/remoções/substituições de
 * caractere separam duas strings. Usada para tolerar pequenos erros de
 * digitação (ex: "New Zeland" faltando uma letra de "New Zealand").
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Dado um nome de time (de qualquer fonte/idioma) e uma lista de candidatos
 * de outra fonte, retorna o candidato mais provável de ser o mesmo time, ou
 * null. Estratégia, em ordem: 0) tradução de apelido em português conhecido,
 * 1) igualdade exata normalizada, 2) inclusão de substring, 3) tolerância a
 * pequenos erros de digitação (Levenshtein).
 */
function findBestMatch(name, candidates) {
  const target = normalize(translateAlias(name));
  if (!target || !candidates?.length) return null;

  const exact = candidates.find((c) => normalize(c) === target);
  if (exact) return exact;

  const partial = candidates.find((c) => {
    const cn = normalize(c);
    return cn.includes(target) || target.includes(cn);
  });
  if (partial) return partial;

  // Erro de digitação pequeno: aceita se a diferença for curta em relação
  // ao tamanho do nome (no máximo ~25%, com um mínimo de 2 caracteres).
  let best = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const cn = normalize(c);
    const dist = levenshtein(target, cn);
    const threshold = Math.max(2, Math.floor(Math.max(target.length, cn.length) * 0.25));
    if (dist <= threshold && dist < bestDistance) {
      bestDistance = dist;
      best = c;
    }
  }

  return best;
}

module.exports = { normalize, findBestMatch, translateAlias };
