const pad = (n) => String(n).padStart(2, '0');

export const formatarData = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const hojeStr = () => formatarData(new Date());

// Data (AAAA-MM-DD) de N dias atrás
export const subtrairDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return formatarData(d);
};

// Último dia do tratamento (o dia do cadastro conta como o dia 1)
export const dataFimTratamento = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias - 1);
  return formatarData(d);
};

// 'AAAA-MM-DD' -> 'DD/MM/AAAA'
export const dataBrasileira = (str) => str.split('-').reverse().join('/');

export const horarioValido = (str) => {
  if (!/^\d{2}:\d{2}$/.test(str)) return false;
  const [h, m] = str.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
};

// 'HH:MM' -> Date no mesmo dia de `base`
export const horarioParaDate = (horarioStr, base = new Date()) => {
  const [h, m] = horarioStr.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
};

// Date -> 'HH:MM'
export const dateParaHorario = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Dose atrasada: não tomada, horário de hoje já passou e o tratamento já existia nesse horário
export const estaAtrasado = (item, agora) => {
  if (item.tomado) return false;
  const programado = horarioParaDate(item.horario, agora).getTime();
  if (programado >= agora.getTime()) return false;
  return !item.criadoEm || item.criadoEm <= programado;
};

// 'fim' vem em AAAA-MM-DD; o último dia do tratamento conta como 1 dia restante
export const diasRestantes = (fim) => {
  const [a, m, d] = fim.split('-').map(Number);
  const dataFim = new Date(a, m - 1, d);
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.max(0, Math.round((dataFim - hoje) / 86400000) + 1);
};
