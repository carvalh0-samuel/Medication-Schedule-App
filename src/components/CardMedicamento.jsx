import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { diasRestantes } from '../utils/datas';
import { estoqueBaixo, textoDiasEstoque } from '../utils/estoque';

function CardMedicamento({ item, marcarComoTomado, atrasado = false }) {
  const renderInfoDuracao = () => {
    if (!item.duracao) return null;

    if (item.duracao.tipo === 'quantidade') {
      const esgotado = item.duracao.atual === 0;
      const baixo = estoqueBaixo(item);
      return (
        <>
          <Text style={[styles.cardDetalhes, esgotado && styles.alertaEstoque, baixo && styles.estoqueBaixo]}>
            📦 Restam: {item.duracao.atual} comprimido(s)
            {baixo ? ` (${textoDiasEstoque(item)})` : ''}
          </Text>
          {baixo && <Text style={styles.estoqueBaixo}>⚠ Estoque baixo, renove a receita</Text>}
        </>
      );
    }

    if (item.duracao.tipo === 'dias') {
      // Tratamentos criados antes do campo 'fim' mostram só o total
      const texto = item.duracao.fim
        ? `⏳ Restam: ${diasRestantes(item.duracao.fim)} dia(s)`
        : `⏳ Duração total: ${item.duracao.limite} dia(s)`;
      return <Text style={styles.cardDetalhes}>{texto}</Text>;
    }
    return null;
  };

  return (
    <View style={[styles.card, item.tomado && styles.cardTomado, atrasado && styles.cardAtrasado]}>
      <View style={styles.info}>
        <Text style={styles.cardNome} numberOfLines={2}>{item.nome}</Text>
        <Text style={styles.cardDetalhes}>Dose: {item.dose}</Text>
        <Text style={[styles.cardDetalhes, atrasado && styles.textoAtrasado]}>
          Horário: ⏰ {item.horario}{atrasado ? '  ·  ATRASADO' : ''}
        </Text>
        {renderInfoDuracao()}
      </View>
      <TouchableOpacity
        style={[styles.botaoCheck, item.tomado ? styles.btnTomado : styles.btnPendente, atrasado && styles.btnAtrasado]}
        onPress={() => marcarComoTomado(item.id)}
        accessibilityRole="button"
        accessibilityLabel={
          item.tomado
            ? `Desmarcar dose de ${item.nome} às ${item.horario}`
            : `Marcar dose de ${item.nome} às ${item.horario} como tomada`
        }
      >
        <Text style={[styles.textoCheck, item.tomado && styles.textoTomado, atrasado && styles.textoBtnAtrasado]}>
          {item.tomado ? '✓ Tomado' : 'Marcar Dose'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(CardMedicamento);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardTomado: {
    backgroundColor: '#E2E8F0',
    opacity: 0.7,
  },
  cardAtrasado: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  cardNome: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  cardDetalhes: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  textoAtrasado: {
    color: '#DC2626',
    fontWeight: 'bold',
  },
  alertaEstoque: {
    color: '#DC2626',
    fontWeight: 'bold',
  },
  estoqueBaixo: {
    fontSize: 13,
    color: '#D97706',
    fontWeight: 'bold',
    marginTop: 2,
  },
  botaoCheck: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  btnPendente: {
    backgroundColor: '#E0F2FE',
  },
  btnTomado: {
    backgroundColor: '#DCFCE7',
  },
  btnAtrasado: {
    backgroundColor: '#FEE2E2',
  },
  textoCheck: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  textoTomado: {
    color: '#15803D',
  },
  textoBtnAtrasado: {
    color: '#B91C1C',
  },
});
