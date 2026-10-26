import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

function CardMedicamento({ item, marcarComoTomado }) {
  return (
    <View style={[styles.card, item.tomado && styles.cardTomado]}>
      <View style={styles.info}>
        <Text style={styles.cardNome} numberOfLines={2}>{item.nome}</Text>
        <Text style={styles.cardDetalhes}>Dose: {item.dose}</Text>
        <Text style={styles.cardDetalhes}>Horário: ⏰ {item.horario}</Text>
      </View>
      <TouchableOpacity
        style={[styles.botaoCheck, item.tomado ? styles.btnTomado : styles.btnPendente]}
        onPress={() => marcarComoTomado(item.id)}
        accessibilityRole="button"
        accessibilityLabel={
          item.tomado
            ? `Desmarcar dose de ${item.nome} às ${item.horario}`
            : `Marcar dose de ${item.nome} às ${item.horario} como tomada`
        }
      >
        <Text style={[styles.textoCheck, item.tomado && styles.textoTomado]}>
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
  },
  cardTomado: {
    backgroundColor: '#E2E8F0',
    opacity: 0.7,
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
  textoCheck: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  textoTomado: {
    color: '#15803D',
  },
});
