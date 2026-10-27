import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Switch
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { horarioParaDate, dateParaHorario, horarioValido } from '../utils/datas';

export const FREQUENCIAS = [
  { id: '1', label: '1 vez ao dia (24/24h)', horas: 0 },
  { id: '6', label: 'De 6 em 6h (QID)', horas: 6 },
  { id: '8', label: 'De 8 em 8h (TID)', horas: 8 },
  { id: '12', label: 'De 12 em 12h (BID)', horas: 12 },
  { id: '4', label: 'De 4 em 4h', horas: 4 },
];

/**
 * Formulário de cadastro e de edição de tratamento.
 * `inicial` = null (novo) ou { nome, dose, horario, frequencia, duracao }.
 * `onSalvar` recebe { nome, dose, horario, frequencia, duracao: null | { tipo, limite } }.
 */
export default function ModalMedicamento({ visible, onClose, onSalvar, inicial }) {
  const editando = !!inicial;

  const [nome, setNome] = useState('');
  const [dose, setDose] = useState('');
  const [horario, setHorario] = useState('');
  const [frequencia, setFrequencia] = useState(0);
  const [delimitarTempo, setDelimitarTempo] = useState(false);
  const [tipoDuracao, setTipoDuracao] = useState('dias');
  const [valorDuracao, setValorDuracao] = useState('');
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMostrarPicker(false);
    setSalvando(false);
    if (inicial) {
      setNome(inicial.nome);
      setDose(inicial.dose);
      setHorario(inicial.horario);
      setFrequencia(inicial.frequencia);
      setDelimitarTempo(!!inicial.duracao);
      setTipoDuracao(inicial.duracao ? inicial.duracao.tipo : 'dias');
      setValorDuracao(inicial.duracao ? String(inicial.duracao.limite) : '');
    } else {
      setNome('');
      setDose('');
      setHorario('');
      setFrequencia(0);
      setDelimitarTempo(false);
      setTipoDuracao('dias');
      setValorDuracao('');
    }
  }, [visible, inicial]);

  const aoEscolherHorario = (event, data) => {
    if (Platform.OS === 'android') setMostrarPicker(false);
    if (event?.type === 'dismissed') return;
    if (data) setHorario(dateParaHorario(data));
  };

  const salvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, digite o nome do medicamento.');
      return;
    }
    if (!dose.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, digite a dose (ex: 500mg).');
      return;
    }
    if (!horarioValido(horario)) {
      Alert.alert('Horário Inválido', 'Escolha o horário inicial do tratamento.');
      return;
    }

    let duracao = null;
    if (delimitarTempo) {
      const valor = valorDuracao.trim();
      const numero = /^\d+$/.test(valor) ? parseInt(valor, 10) : 0;
      if (numero <= 0) {
        Alert.alert('Valor Inválido', 'Digite um número inteiro maior que zero para a duração do tratamento.');
        return;
      }
      duracao = { tipo: tipoDuracao, limite: numero };
    }

    setSalvando(true);
    try {
      await onSalvar({
        nome: nome.trim(),
        dose: dose.trim(),
        horario,
        frequencia,
        duracao,
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>{editando ? 'Editar Tratamento' : 'Novo Medicamento'}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
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

            <Text style={styles.label}>Horário inicial</Text>
            <TouchableOpacity
              style={styles.inputHorario}
              activeOpacity={0.8}
              onPress={() => setMostrarPicker(true)}
            >
              <Feather name="clock" size={20} color="#64748B" />
              <Text style={[styles.inputHorarioTexto, !horario && styles.placeholder]}>
                {horario || 'Toque para escolher (ex: 08:00)'}
              </Text>
            </TouchableOpacity>

            {mostrarPicker && (
              <View>
                <DateTimePicker
                  value={horario ? horarioParaDate(horario) : new Date()}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={aoEscolherHorario}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.btnOkPicker} onPress={() => setMostrarPicker(false)}>
                    <Text style={styles.btnOkPickerTexto}>OK</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.label}>Frequência / Intervalo</Text>
            <View style={styles.chipsContainer}>
              {FREQUENCIAS.map((item) => {
                const selecionado = frequencia === item.horas;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, selecionado && styles.chipSelecionado]}
                    onPress={() => setFrequencia(item.horas)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipTexto, selecionado && styles.chipTextoSelecionado]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.switchContainer}>
              <Text style={[styles.label, { flex: 1 }]}>Delimitar Duração do Tratamento?</Text>
              <Switch
                value={delimitarTempo}
                onValueChange={setDelimitarTempo}
                trackColor={{ false: '#CBD5E1', true: '#7DD3FC' }}
                thumbColor={delimitarTempo ? '#0EA5E9' : '#F1F5F9'}
              />
            </View>

            {delimitarTempo && (
              <View>
                <View style={styles.chipsContainer}>
                  <TouchableOpacity
                    style={[styles.chip, tipoDuracao === 'dias' && styles.chipSelecionado]}
                    onPress={() => setTipoDuracao('dias')}
                  >
                    <Text style={[styles.chipTexto, tipoDuracao === 'dias' && styles.chipTextoSelecionado]}>Por Dias</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, tipoDuracao === 'quantidade' && styles.chipSelecionado]}
                    onPress={() => setTipoDuracao('quantidade')}
                  >
                    <Text style={[styles.chipTexto, tipoDuracao === 'quantidade' && styles.chipTextoSelecionado]}>Qtd. Comprimidos</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder={tipoDuracao === 'dias' ? 'Número de dias (ex: 7)' : 'Quantidade total (ex: 20)'}
                  value={valorDuracao}
                  onChangeText={setValorDuracao}
                  keyboardType="numeric"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.btnSalvar, salvando && { opacity: 0.6 }]}
              activeOpacity={0.8}
              onPress={salvar}
              disabled={salvando}
            >
              <Text style={styles.btnSalvarTexto}>
                {editando ? 'Salvar Alterações' : 'Agendar Lembretes'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.6)' },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  input: { backgroundColor: '#F1F5F9', borderRadius: 16, padding: 16, fontSize: 16, color: '#0F172A', marginBottom: 12 },
  inputHorario: {
    backgroundColor: '#F1F5F9', borderRadius: 16, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10
  },
  inputHorarioTexto: { fontSize: 16, color: '#0F172A' },
  placeholder: { color: '#94A3B8' },
  btnOkPicker: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 8 },
  btnOkPickerTexto: { color: '#0EA5E9', fontSize: 16, fontWeight: 'bold' },
  label: { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 4 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0'
  },
  chipSelecionado: { backgroundColor: '#E0F2FE', borderColor: '#0EA5E9' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextoSelecionado: { color: '#0284C7' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  btnSalvar: { backgroundColor: '#0EA5E9', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 8 },
  btnSalvarTexto: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
