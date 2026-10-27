// Estoque baixo = restam doses para até DIAS_ALERTA_ESTOQUE dias de tratamento.
// Considera 1 comprimido por dose (é o que o contador já faz ao marcar "tomado").
export const DIAS_ALERTA_ESTOQUE = 3;

const dosesPorDia = (item) => item.dosesDia || 1;

export const diasDeEstoque = (item) =>
  Math.floor(item.duracao.atual / dosesPorDia(item));

export const estoqueBaixo = (item) =>
  item.duracao?.tipo === 'quantidade' &&
  item.duracao.atual > 0 &&
  item.duracao.atual <= dosesPorDia(item) * DIAS_ALERTA_ESTOQUE;

export const textoDiasEstoque = (item) => {
  const dias = diasDeEstoque(item);
  return dias < 1 ? 'menos de 1 dia' : `cerca de ${dias} dia(s)`;
};
