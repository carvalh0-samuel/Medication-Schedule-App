import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import CardMedicamento from '../components/CardMedicamento';

const STORAGE_KEY = '@medicamentos_app';
const CANAL_ANDROID = 'lembretes-medicamentos';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const FREQUENCIAS = [
  { id: '1', label: '1 vez ao dia (24/24h)', horas: 0 },
  { id: '6', label: 'De 6 em 6h (QID)', horas: 6 },
  { id: '8', label: 'De 8 em 8h (TID)', horas: 8 },
  { id: '12', label: 'De 12 em 12h (BID)', horas: 12 },
  { id: '4', label: 'De 4 em 4h', horas: 4 },
];

const hojeStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const horarioValido = (str) => {
  if (!/^\d{2}:\d{2}$/.test(str)) return false;
  const [h, m] = str.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
};

export default function GerenciadorMedicamentos() {
  const [medicamentos, setMedicamentos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);

  const [nome, setNome] = useState('');
  const [dose, setDose] = useState('');
  const [horario, setHorario] = useState('');
  const [frequenciaSelecionada, setFrequenciaSelecionada] = useState(0);

  useEffect(() => {
    carregarDados();
    prepararNotificacoes();
  }, []);

  // Só salva depois de carregar, para nunca sobrescrever os dados com lista vazia
  useEffect(() => {
    if (carregado) salvarDados(medicamentos);
  }, [medicamentos, carregado]);

  const prepararNotificacoes = async () => {
    if (Platform.OS === 'android') {
      // Android 8+ exige um canal; sem ele a notificação não aparece
      await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
        name: 'Lembretes de medicamentos',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('Atenção', 'Para receber os lembretes de medicamentos, ative as notificações nas configurações do seu celular.');
    }
  };

  const carregarDados = async () => {
    try {
      const dadosSalvos = await AsyncStorage.getItem(STORAGE_KEY);
      if (dadosSalvos) {
        const parsed = JSON.parse(dadosSalvos);
        // Compatível com o formato antigo (array puro)
        const itens = Array.isArray(parsed) ? parsed : parsed.itens || [];
        const data = Array.isArray(parsed) ? null : parsed.data;
        // Novo dia: zera o "tomado" de todos os horários
        setMedicamentos(data === hojeStr() ? itens : itens.map(m => ({ ...m, tomado: false })));
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setCarregado(true);
    }
  };

  const salvarDados = async (dados) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ data: hojeStr(), itens: dados }));
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
    }
  };

  const formatarHorario = (text) => {
    const numeros = text.replace(/\D/g, '');
    let formatado = numeros;
    if (numeros.length > 2) {
      formatado = `${numeros.slice(0, 2)}:${numeros.slice(2, 4)}`;
    }
    setHorario(formatado);
  };

  const gerarHorariosPorIntervalo = (horarioInicial, intervaloHoras) => {
    if (intervaloHoras === 0) return [horarioInicial];

    const [hStr, mStr] = horarioInicial.split(':');
    let horaAtual = parseInt(hStr, 10);
    const minutoAtual = parseInt(mStr, 10);

    const horariosGerados = [];
    for (let i = 0; i < 24; i += intervaloHoras) {
      horariosGerados.push(
        `${String(horaAtual).padStart(2, '0')}:${String(minutoAtual).padStart(2, '0')}`
      );
      horaAtual = (horaAtual + intervaloHoras) % 24;
    }
    return [...new Set(horariosGerados)];
  };

  // Agenda um lembrete diário e devolve o id, para poder cancelar depois
  const agendarNotificacaoReal = async (nomeMed, doseMed, horarioStr) => {
    const [h, m] = horarioStr.split(':').map(Number);

    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hora do remédio! 💊',
          body: `Está na hora de tomar ${nomeMed} (${doseMed}).`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: h,
          minute: m,
          channelId: CANAL_ANDROID,
        },
      });
    } catch (error) {
      console.error('Erro ao agendar notificação:', error);
      return null;
    }
  };

  const adicionarMedicamento = async () => {
    if (!nome.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, digite o nome do medicamento.');
      return;
    }
    if (!dose.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, digite a dose (ex: 500mg).');
      return;
    }
    if (!horarioValido(horario)) {
      Alert.alert('Horário Inválido', 'Digite um horário válido entre 00:00 e 23:59 (ex: 08:00).');
      return;
    }

    const horariosParaCadastrar = gerarHorariosPorIntervalo(horario, frequenciaSelecionada);
    const timestampBase = Date.now();
    const grupoId = String(timestampBase);

    const novosItens = [];
    for (let index = 0; index < horariosParaCadastrar.length; index++) {
      const hora = horariosParaCadastrar[index];
      const notificacaoId = await agendarNotificacaoReal(nome.trim(), dose.trim(), hora);
      novosItens.push({
        id: String(timestampBase + index),
        grupoId,
        notificacaoId,
        nome: nome.trim(),
        dose: dose.trim(),
        horario: hora,
        tomado: false,
      });
    }

    setMedicamentos(prev => [...prev, ...novosItens].sort((a, b) => a.horario.localeCompare(b.horario)));

    setNome('');
    setDose('');
    setHorario('');
    setFrequenciaSelecionada(0);
    setModalVisivel(false);
  };

  const marcarComoTomado = useCallback((id) => {
    setMedicamentos(prev => prev.map(med =>
      med.id === id ? { ...med, tomado: !med.tomado } : med
    ));
  }, []);

  // Exclui o tratamento inteiro (todos os horários) e cancela os lembretes
  const deletarMedicamento = (item) => {
    Alert.alert('Remover', `Deseja excluir o tratamento com ${item.nome}? Todos os horários e lembretes serão removidos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          const doGrupo = medicamentos.filter(med => med.grupoId && med.grupoId === item.grupoId);
          const alvos = doGrupo.length > 0 ? doGrupo : [item];

          for (const med of alvos) {
            if (med.notificacaoId) {
              try {
                await Notifications.cancelScheduledNotificationAsync(med.notificacaoId);
              } catch (error) {
                console.error('Erro ao cancelar notificação:', error);
              }
            }
          }

          const idsRemovidos = new Set(alvos.map(med => med.id));
          setMedicamentos(prev => prev.filter(med => !idsRemovidos.has(med.id)));
        }
      }
    ]);
  };

  const totalHoje = medicamentos.length;
  const tomadosHoje = medicamentos.filter(med => med.tomado).length;
  const progresso = totalHoje === 0 ? 0 : (tomadosHoje / totalHoje) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.saudacao}>Meu Cronograma</Text>
          <Text style={styles.titulo}>Saúde em Dia</Text>
        </View>
        <TouchableOpacity style={styles.perfilBtn}>
          <Feather name="activity" size={24} color="#0EA5E9" />
        </TouchableOpacity>
      </View>

      <View style={styles.dashboardContainer}>
        <View style={styles.progressoHeader}>
          <Text style={styles.progressoTexto}>
            {tomadosHoje} de {totalHoje} tomados hoje
          </Text>
          <Text style={styles.progressoPorcentagem}>{Math.round(progresso)}%</Text>
        </View>
        <View style={styles.barraFundo}>
          <View style={[styles.barraPreenchida, { width: `${progresso}%` }]} />
        </View>
      </View>

      <FlatList
        data={medicamentos}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <TouchableOpacity onLongPress={() => deletarMedicamento(item)} activeOpacity={0.9}>
            <CardMedicamento item={item} marcarComoTomado={marcarComoTomado} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.vazioContainer}>
            <Ionicons name="medical-outline" size={64} color="#CBD5E1" />
            <Text style={styles.vazioTitulo}>Nenhum remédio cadastrado</Text>
            <Text style={styles.vazioSub}>Toque no botão abaixo para adicionar seu primeiro medicamento.</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => setModalVisivel(true)}
      >
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisivel} animationType="slide" transparent onRequestClose={() => setModalVisivel(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Novo Medicamento</Text>
              <TouchableOpacity onPress={() => setModalVisivel(false)} style={{ padding: 4 }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.input}
                placeholder="Nome (ex: Dipirona)"
                value={nome}
                onChangeText={setNome}
                placeholderTextColor="#94A3B8"
              />
              <TextInput
                style={styles.input}
                placeholder="Dose (ex: 500mg ou 1 comprimido)"
                value={dose}
                onChangeText={setDose}
                placeholderTextColor="#94A3B8"
              />
              <TextInput
                style={styles.input}
                placeholder="Horário Inicial (ex: 08:00)"
                value={horario}
                onChangeText={formatarHorario}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
                maxLength={5}
              />

              <Text style={styles.labelFrequencia}>Frequência / Intervalo</Text>
              <View style={styles.frequenciaContainer}>
                {FREQUENCIAS.map((item) => {
                  const selecionado = frequenciaSelecionada === item.horas;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chipFrequencia, selecionado && styles.chipSelecionado]}
                      onPress={() => setFrequenciaSelecionada(item.horas)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipTexto, selecionado && styles.chipTextoSelecionado]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.btnSalvar} activeOpacity={0.8} onPress={adicionarMedicamento}>
                <Text style={styles.btnSalvarTexto}>Agendar Lembretes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 20,
    paddingBottom: 20, backgroundColor: '#FFF'
  },
  saudacao: { fontSize: 14, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
  titulo: { fontSize: 28, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  perfilBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0F9FF',
    justifyContent: 'center', alignItems: 'center'
  },
  dashboardContainer: {
    backgroundColor: '#FFF', paddingHorizontal: 24, paddingBottom: 24,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, marginBottom: 20
  },
  progressoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressoTexto: { fontSize: 15, fontWeight: '600', color: '#334155' },
  progressoPorcentagem: { fontSize: 15, fontWeight: '800', color: '#0EA5E9' },
  barraFundo: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  barraPreenchida: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  lista: { paddingHorizontal: 20, paddingBottom: 120 },
  vazioContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  vazioTitulo: { fontSize: 18, fontWeight: 'bold', color: '#475569', marginTop: 16 },
  vazioSub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 22 },
  fab: {
    position: 'absolute', bottom: 30, right: 24, width: 60, height: 60,
    borderRadius: 30, backgroundColor: '#0EA5E9', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
  },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.6)' },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  input: { backgroundColor: '#F1F5F9', borderRadius: 16, padding: 16, fontSize: 16, color: '#0F172A', marginBottom: 12 },
  labelFrequencia: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 4 },
  frequenciaContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chipFrequencia: {
    backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0'
  },
  chipSelecionado: { backgroundColor: '#E0F2FE', borderColor: '#0EA5E9' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextoSelecionado: { color: '#0284C7' },
  btnSalvar: { backgroundColor: '#0EA5E9', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 8 },
  btnSalvarTexto: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
