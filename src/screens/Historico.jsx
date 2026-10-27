import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { subtrairDias, dataBrasileira } from '../utils/datas';

const HISTORICO_KEY = '@medicamentos_historico';
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ALTURA_BARRA = 56;

const calcularTaxa = (itens) => {
  const total = itens.length;
  const tomados = itens.filter(med => med.tomado).length;
  return { total, tomados, taxa: total === 0 ? 0 : Math.round((tomados / total) * 100) };
};

const corDaTaxa = (taxa) => (taxa === 100 ? '#10B981' : taxa >= 50 ? '#F59E0B' : '#EF4444');

const diaDaSemana = (dataStr) => {
  const [a, m, d] = dataStr.split('-').map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
};

export default function Historico() {
  const [historico, setHistorico] = useState([]);
  const [expandido, setExpandido] = useState(null);

  const carregarHistorico = useCallback(async () => {
    try {
      const dados = await AsyncStorage.getItem(HISTORICO_KEY);
      setHistorico(dados ? JSON.parse(dados) : []);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  }, []);

  // Recarrega toda vez que a aba ganha foco
  useFocusEffect(
    useCallback(() => {
      carregarHistorico();
    }, [carregarHistorico])
  );

  // Os 7 dias anteriores a hoje (só dias já arquivados têm registro)
  const semana = useMemo(() => {
    const porData = new Map(historico.map(h => [h.data, h]));
    const dias = [];
    for (let i = 7; i >= 1; i--) {
      const data = subtrairDias(i);
      const entrada = porData.get(data);
      dias.push({ data, ...(entrada ? calcularTaxa(entrada.itens) : { total: 0, tomados: 0, taxa: null }) });
    }
    const totalDoses = dias.reduce((s, d) => s + d.total, 0);
    const totalTomadas = dias.reduce((s, d) => s + d.tomados, 0);
    return {
      dias,
      totalDoses,
      totalTomadas,
      diasComRegistro: dias.filter(d => d.taxa !== null).length,
      taxa: totalDoses === 0 ? null : Math.round((totalTomadas / totalDoses) * 100),
    };
  }, [historico]);

  const renderResumoSemana = () => (
    <View style={styles.resumoCard}>
      <Text style={styles.resumoTitulo}>Adesão dos últimos 7 dias</Text>
      <Text style={[styles.resumoTaxa, { color: semana.taxa === null ? '#94A3B8' : corDaTaxa(semana.taxa) }]}>
        {semana.taxa === null ? '—' : `${semana.taxa}%`}
      </Text>
      <Text style={styles.resumoDetalhe}>
        {semana.taxa === null
          ? 'Ainda não há dias registrados nesta semana.'
          : `${semana.totalTomadas} de ${semana.totalDoses} doses em ${semana.diasComRegistro} dia(s) com registro`}
      </Text>

      <View style={styles.barras}>
        {semana.dias.map((dia) => (
          <View key={dia.data} style={styles.barraColuna}>
            <View style={styles.barraTrilho}>
              {dia.taxa !== null && (
                <View
                  style={[
                    styles.barraPreenchida,
                    {
                      height: Math.max(4, (dia.taxa / 100) * ALTURA_BARRA),
                      backgroundColor: corDaTaxa(dia.taxa),
                    },
                  ]}
                />
              )}
            </View>
            <Text style={styles.barraRotulo}>{diaDaSemana(dia.data)}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    const { tomados, total, taxa } = calcularTaxa(item.itens);
    const aberto = expandido === item.data;
    const doses = [...item.itens].sort((a, b) => a.horario.localeCompare(b.horario));

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => setExpandido(aberto ? null : item.data)}
        accessibilityRole="button"
        accessibilityLabel={`Detalhes do dia ${dataBrasileira(item.data)}`}
      >
        <View style={styles.headerCard}>
          <Text style={styles.data}>{dataBrasileira(item.data)}</Text>
          <View style={styles.headerDireita}>
            <Text style={[styles.taxa, { color: corDaTaxa(taxa) }]}>{taxa}% Concluído</Text>
            <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </View>
        </View>
        <Text style={styles.detalhes}>{tomados} de {total} doses tomadas</Text>

        {aberto && (
          <View style={styles.listaDoses}>
            {doses.map((dose, index) => (
              <View key={`${dose.horario}-${index}`} style={styles.linhaDose}>
                <Feather
                  name={dose.tomado ? 'check-circle' : 'x-circle'}
                  size={18}
                  color={dose.tomado ? '#10B981' : '#EF4444'}
                />
                <Text style={styles.textoDose}>
                  {dose.horario} · {dose.nome} ({dose.dose})
                </Text>
                <Text style={[styles.statusDose, { color: dose.tomado ? '#15803D' : '#B91C1C' }]}>
                  {dose.tomado ? 'Tomada' : 'Não tomada'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Histórico Diário</Text>
        <TouchableOpacity onPress={carregarHistorico} activeOpacity={0.7} accessibilityLabel="Atualizar histórico">
          <Feather name="refresh-cw" size={24} color="#0EA5E9" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={historico}
        keyExtractor={(item) => item.data}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderResumoSemana}
        ListEmptyComponent={
          <View style={styles.vazioContainer}>
            <Feather name="calendar" size={48} color="#CBD5E1" />
            <Text style={styles.vazio}>Nenhum registro de dias anteriores.</Text>
            <Text style={styles.vazioSub}>O histórico será gerado automaticamente quando o dia virar.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 20
  },
  titulo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A'
  },
  lista: {
    paddingHorizontal: 20,
    paddingBottom: 40
  },
  resumoCard: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  resumoTitulo: { fontSize: 14, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  resumoTaxa: { fontSize: 40, fontWeight: '900', marginTop: 4 },
  resumoDetalhe: { fontSize: 13, color: '#64748B', marginTop: 2 },
  barras: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  barraColuna: { alignItems: 'center', flex: 1 },
  barraTrilho: {
    width: 18,
    height: ALTURA_BARRA,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden'
  },
  barraPreenchida: { width: '100%', borderRadius: 6 },
  barraRotulo: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontWeight: '600' },
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  headerDireita: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  data: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155'
  },
  taxa: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  detalhes: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500'
  },
  listaDoses: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 10
  },
  linhaDose: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textoDose: { flex: 1, fontSize: 14, color: '#334155' },
  statusDose: { fontSize: 12, fontWeight: '700' },
  vazioContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40
  },
  vazio: {
    textAlign: 'center',
    marginTop: 16,
    color: '#475569',
    fontSize: 16,
    fontWeight: 'bold'
  },
  vazioSub: {
    textAlign: 'center',
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 14,
    paddingHorizontal: 40,
    lineHeight: 20
  }
});
