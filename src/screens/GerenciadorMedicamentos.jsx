import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList, Alert, Platform, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import CardMedicamento from '../components/CardMedicamento';
import ModalMedicamento from '../components/ModalMedicamento';
import { hojeStr, dataFimTratamento, horarioParaDate, estaAtrasado } from '../utils/datas';
import { estoqueBaixo, textoDiasEstoque, DIAS_ALERTA_ESTOQUE } from '../utils/estoque';

const STORAGE_KEY = '@medicamentos_app';
const HISTORICO_KEY = '@medicamentos_historico';
const RESPOSTA_KEY = '@ultima_resposta_notificacao';
const CANAL_ANDROID = 'lembretes-medicamentos';
const CATEGORIA_LEMBRETE = 'lembrete-dose';
const ACAO_TOMEI = 'TOMEI';
const MAX_DIAS_HISTORICO = 90;

const AVISO_LEGAL =
  'Este aplicativo é um lembrete de apoio e não substitui a orientação de um médico ou farmacêutico. ' +
  'Siga sempre a prescrição médica e não altere doses por conta própria.';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------- Funções auxiliares (sem estado) ----------

const ordenar = (lista) => [...lista].sort((a, b) => a.horario.localeCompare(b.horario));

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

const cancelarNotificacoes = async (lista) => {
  for (const med of lista) {
    if (med.notificacaoId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(med.notificacaoId);
      } catch (error) {
        console.error('Erro ao cancelar notificação:', error);
      }
    }
  }
};

// Agenda um lembrete diário com o botão "Tomei" e devolve o id (para poder cancelar depois)
const agendarNotificacao = async (nomeMed, doseMed, horarioStr, itemId) => {
  const [h, m] = horarioStr.split(':').map(Number);

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hora do remédio! 💊',
        body: `Está na hora de tomar ${nomeMed} (${doseMed}).`,
        sound: true,
        data: { itemId },
        categoryIdentifier: CATEGORIA_LEMBRETE,
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

// Cria os itens (um por horário) e agenda os lembretes.
// `anteriores` = itens antigos do mesmo tratamento (edição): preserva "tomado", "criadoEm" e a duração.
const criarItens = async (dados, grupoId, anteriores = []) => {
  const horarios = gerarHorariosPorIntervalo(dados.horario, dados.frequencia);
  const dosesDia = horarios.length;
  const base = Date.now();

  let duracaoBase = null;
  if (dados.duracao) {
    const ant = anteriores[0]?.duracao;
    if (ant && ant.tipo === dados.duracao.tipo && ant.limite === dados.duracao.limite) {
      duracaoBase = ant;
    } else if (dados.duracao.tipo === 'dias') {
      duracaoBase = {
        tipo: 'dias',
        limite: dados.duracao.limite,
        fim: dataFimTratamento(dados.duracao.limite),
      };
    } else {
      duracaoBase = {
        tipo: 'quantidade',
        limite: dados.duracao.limite,
        atual: dados.duracao.limite,
        avisado: false,
        // Se já começa com pouco estoque, não precisa avisar logo no cadastro
        avisadoBaixo: dados.duracao.limite <= dosesDia * DIAS_ALERTA_ESTOQUE,
      };
    }
  }

  const itens = [];
  for (let i = 0; i < horarios.length; i++) {
    const hora = horarios[i];
    const id = String(base + i);
    const anterior = anteriores.find(a => a.horario === hora);
    const notificacaoId = await agendarNotificacao(dados.nome, dados.dose, hora, id);

    itens.push({
      id,
      grupoId,
      notificacaoId,
      nome: dados.nome,
      dose: dados.dose,
      horario: hora,
      horarioInicial: dados.horario,
      frequencia: dados.frequencia,
      dosesDia,
      tomado: anterior ? anterior.tomado : false,
      criadoEm: anterior?.criadoEm ?? Date.now(),
      duracao: duracaoBase ? { ...duracaoBase } : null,
    });
  }
  return itens;
};

// Virada de dia: arquiva o dia anterior, zera "tomado" e remove tratamentos encerrados
const processarVirada = async (lista, dataAnterior) => {
  const hoje = hojeStr();
  const novoDia = !!dataAnterior && dataAnterior !== hoje;
  let nova = lista;

  if (novoDia) {
    if (lista.length > 0) {
      const historicoSalvo = await AsyncStorage.getItem(HISTORICO_KEY);
      const historico = (historicoSalvo ? JSON.parse(historicoSalvo) : [])
        .filter(h => h.data !== dataAnterior);
      historico.unshift({
        data: dataAnterior,
        itens: lista.map(m => ({ nome: m.nome, dose: m.dose, horario: m.horario, tomado: !!m.tomado })),
      });
      await AsyncStorage.setItem(
        HISTORICO_KEY,
        JSON.stringify(historico.slice(0, MAX_DIAS_HISTORICO))
      );
    }
    nova = lista.map(m => ({ ...m, tomado: false }));
  }

  // Prazo vencido, ou estoque que já tinha zerado em um dia anterior
  const encerrados = nova.filter(m => m.duracao && (
    (m.duracao.tipo === 'dias' && m.duracao.fim && m.duracao.fim < hoje) ||
    (novoDia && m.duracao.tipo === 'quantidade' && m.duracao.atual === 0)
  ));
  if (encerrados.length > 0) {
    await cancelarNotificacoes(encerrados);
    const ids = new Set(encerrados.map(m => m.id));
    nova = nova.filter(m => !ids.has(m.id));
  }
  return nova;
};

// ---------- Tela ----------

export default function GerenciadorMedicamentos() {
  const [medicamentos, setMedicamentos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [itemEmEdicao, setItemEmEdicao] = useState(null);
  const [agora, setAgora] = useState(new Date());

  const medsRef = useRef([]);
  const carregadoRef = useRef(false);
  const diaRef = useRef(hojeStr()); // dia a que os dados em memória pertencem
  const virandoRef = useRef(false);
  const respostaTratadaRef = useRef(null);

  medsRef.current = medicamentos;

  const resposta = Notifications.useLastNotificationResponse();

  useEffect(() => {
    carregarDados();
    prepararNotificacoes();
  }, []);

  // Salva sempre com a data a que os dados pertencem (não a data "de agora")
  useEffect(() => {
    if (carregado) salvarDados(medicamentos);
  }, [medicamentos, carregado]);

  // Alertas de estoque baixo e esgotado (uma vez por tratamento)
  useEffect(() => {
    if (!carregado) return;
    const esgotados = medicamentos.filter(
      m => m.duracao?.tipo === 'quantidade' && m.duracao.atual === 0 && !m.duracao.avisado
    );
    const baixos = medicamentos.filter(m => estoqueBaixo(m) && !m.duracao.avisadoBaixo);
    if (esgotados.length === 0 && baixos.length === 0) return;

    const gruposEsgotados = new Set(esgotados.map(m => m.grupoId));
    const gruposBaixos = new Set(baixos.map(m => m.grupoId));

    const linhas = [];
    if (esgotados.length > 0) {
      cancelarNotificacoes(medicamentos.filter(m => gruposEsgotados.has(m.grupoId)));
      const nomes = [...new Set(esgotados.map(m => m.nome))].join(', ');
      linhas.push(`O estoque de ${nomes} acabou e os lembretes foram cancelados. Renove a receita.`);
    }
    const vistos = new Set();
    baixos.forEach(m => {
      if (vistos.has(m.grupoId)) return;
      vistos.add(m.grupoId);
      linhas.push(`${m.nome}: restam ${m.duracao.atual} comprimido(s), para ${textoDiasEstoque(m)}.`);
    });
    Alert.alert(
      esgotados.length > 0 ? 'Estoque Esgotado' : 'Estoque Baixo',
      linhas.join('\n\n')
    );

    setMedicamentos(prev => prev.map(m => {
      if (!m.duracao) return m;
      const esgotou = gruposEsgotados.has(m.grupoId);
      const ficouBaixo = gruposBaixos.has(m.grupoId);
      if (!esgotou && !ficouBaixo) return m;
      return {
        ...m,
        notificacaoId: esgotou ? null : m.notificacaoId,
        duracao: {
          ...m.duracao,
          avisado: esgotou ? true : m.duracao.avisado,
          avisadoBaixo: true,
        },
      };
    }));
  }, [medicamentos, carregado]);

  const prepararNotificacoes = async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
          name: 'Lembretes de medicamentos',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORIA_LEMBRETE, [
        {
          identifier: ACAO_TOMEI,
          buttonTitle: 'Tomei ✓',
          options: { opensAppToForeground: true },
        },
      ]);
    } catch (error) {
      console.error('Erro ao configurar notificações:', error);
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
        const lista = Array.isArray(parsed) ? parsed : parsed.itens || [];
        const dataSalva = Array.isArray(parsed) ? null : parsed.data;

        const nova = await processarVirada(lista, dataSalva);
        diaRef.current = hojeStr();
        setMedicamentos(nova);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      carregadoRef.current = true;
      setCarregado(true);
    }
  };

  const salvarDados = async (dados) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ data: diaRef.current, itens: dados }));
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
    }
  };

  const verificarVirada = useCallback(async () => {
    if (!carregadoRef.current || virandoRef.current) return;
    const hoje = hojeStr();
    if (diaRef.current === hoje) return;

    virandoRef.current = true;
    try {
      const nova = await processarVirada(medsRef.current, diaRef.current);
      diaRef.current = hoje;
      setMedicamentos(nova);
    } catch (error) {
      console.error('Erro ao virar o dia:', error);
    } finally {
      virandoRef.current = false;
    }
  }, []);

  // `forcar` = true/false define o estado; sem ele, alterna. O estoque é do tratamento todo.
  const atualizarTomado = useCallback((id, forcar) => {
    setMedicamentos(prev => {
      const alvo = prev.find(m => m.id === id);
      if (!alvo) return prev;
      const novoTomado = typeof forcar === 'boolean' ? forcar : !alvo.tomado;
      if (novoTomado === alvo.tomado) return prev;
      const controlaEstoque = alvo.duracao?.tipo === 'quantidade';

      return prev.map(med => {
        let atualizado = med;
        if (med.id === id) {
          atualizado = { ...atualizado, tomado: novoTomado };
        }
        if (controlaEstoque && med.grupoId === alvo.grupoId && med.duracao) {
          const { atual, limite } = med.duracao;
          const novoAtual = novoTomado ? Math.max(0, atual - 1) : Math.min(limite, atual + 1);
          atualizado = { ...atualizado, duracao: { ...med.duracao, atual: novoAtual } };
        }
        return atualizado;
      });
    });
  }, []);

  const marcarComoTomado = useCallback((id) => atualizarTomado(id), [atualizarTomado]);

  // Relógio da tela (atrasos / próxima dose) e virada de dia com o app aberto
  useEffect(() => {
    const id = setInterval(() => {
      setAgora(new Date());
      verificarVirada();
    }, 30000);
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        setAgora(new Date());
        verificarVirada();
      }
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [verificarVirada]);

  // Botão "Tomei" da notificação
  useEffect(() => {
    if (!carregado || !resposta) return;
    if (resposta.actionIdentifier !== ACAO_TOMEI) return;

    const chave = `${resposta.notification.request.identifier}-${resposta.notification.date}`;
    if (respostaTratadaRef.current === chave) return;
    respostaTratadaRef.current = chave;

    (async () => {
      // Evita reaplicar uma resposta antiga quando o app é aberto de novo
      const jaTratada = await AsyncStorage.getItem(RESPOSTA_KEY);
      if (jaTratada === chave) return;
      await AsyncStorage.setItem(RESPOSTA_KEY, chave);

      const itemId = resposta.notification.request.content.data?.itemId;
      if (itemId) atualizarTomado(itemId, true);
    })();
  }, [resposta, carregado, atualizarTomado]);

  const fecharModal = () => {
    setModalVisivel(false);
    setItemEmEdicao(null);
  };

  const abrirNovo = () => {
    setItemEmEdicao(null);
    setModalVisivel(true);
  };

  const salvarNovo = async (dados) => {
    const grupoId = String(Date.now());
    const itens = await criarItens(dados, grupoId);
    setMedicamentos(prev => ordenar([...prev, ...itens]));
    fecharModal();
  };

  const salvarEdicao = async (dados) => {
    const original = itemEmEdicao;
    const grupo = medsRef.current.filter(m => m.grupoId === original.grupoId);

    await cancelarNotificacoes(grupo);
    const itens = await criarItens(dados, original.grupoId, grupo);

    const idsAntigos = new Set(grupo.map(m => m.id));
    setMedicamentos(prev => ordenar([...prev.filter(m => !idsAntigos.has(m.id)), ...itens]));
    fecharModal();
  };

  const iniciarEdicao = (item) => {
    if (!item.grupoId || item.frequencia === undefined) {
      Alert.alert(
        'Não é possível editar',
        'Este tratamento foi criado em uma versão antiga do app. Exclua e cadastre de novo para poder editá-lo.'
      );
      return;
    }
    setItemEmEdicao(item);
    setModalVisivel(true);
  };

  const confirmarExclusao = (item) => {
    Alert.alert('Remover', `Deseja excluir o tratamento com ${item.nome}? Todos os horários e lembretes serão removidos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          const doGrupo = medsRef.current.filter(med => med.grupoId && med.grupoId === item.grupoId);
          const alvos = doGrupo.length > 0 ? doGrupo : [item];

          await cancelarNotificacoes(alvos);

          const idsRemovidos = new Set(alvos.map(med => med.id));
          setMedicamentos(prev => prev.filter(med => !idsRemovidos.has(med.id)));
        }
      }
    ]);
  };

  const abrirMenuItem = (item) => {
    Alert.alert(item.nome, 'O que deseja fazer com este tratamento?', [
      { text: 'Editar', onPress: () => iniciarEdicao(item) },
      { text: 'Excluir', style: 'destructive', onPress: () => confirmarExclusao(item) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const inicialModal = useMemo(() => (
    itemEmEdicao
      ? {
          nome: itemEmEdicao.nome,
          dose: itemEmEdicao.dose,
          horario: itemEmEdicao.horarioInicial,
          frequencia: itemEmEdicao.frequencia,
          duracao: itemEmEdicao.duracao,
        }
      : null
  ), [itemEmEdicao]);

  const totalHoje = medicamentos.length;
  const tomadosHoje = medicamentos.filter(med => med.tomado).length;
  const progresso = totalHoje === 0 ? 0 : (tomadosHoje / totalHoje) * 100;

  const atrasados = medicamentos.filter(med => estaAtrasado(med, agora));
  const proxima = medicamentos.find(
    med => !med.tomado && horarioParaDate(med.horario, agora).getTime() > agora.getTime()
  );

  const renderResumo = () => {
    if (totalHoje === 0) return null;
    return (
      <View style={styles.resumo}>
        {atrasados.length > 0 && (
          <Text style={styles.resumoAtrasado}>⚠ {atrasados.length} dose(s) atrasada(s)</Text>
        )}
        {proxima ? (
          <Text style={styles.resumoProxima}>
            Próxima dose: {proxima.horario} · {proxima.nome} ({proxima.dose})
          </Text>
        ) : tomadosHoje === totalHoje ? (
          <Text style={styles.resumoOk}>Tudo em dia por hoje ✓</Text>
        ) : (
          <Text style={styles.resumoProxima}>Sem mais doses programadas para hoje</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.saudacao}>Meu Cronograma</Text>
          <Text style={styles.titulo}>Saúde em Dia</Text>
        </View>
        <TouchableOpacity
          style={styles.perfilBtn}
          onPress={() => Alert.alert('Aviso importante', AVISO_LEGAL)}
          accessibilityRole="button"
          accessibilityLabel="Aviso importante sobre o uso do aplicativo"
        >
          <Feather name="info" size={24} color="#0EA5E9" />
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
        {renderResumo()}
      </View>

      <FlatList
        data={medicamentos}
        extraData={agora}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          medicamentos.length > 0
            ? <Text style={styles.dica}>Segure um card para editar ou excluir</Text>
            : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity onLongPress={() => abrirMenuItem(item)} activeOpacity={0.9}>
            <CardMedicamento
              item={item}
              marcarComoTomado={marcarComoTomado}
              atrasado={estaAtrasado(item, agora)}
            />
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
        onPress={abrirNovo}
        accessibilityRole="button"
        accessibilityLabel="Adicionar medicamento"
      >
        <Feather name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      <ModalMedicamento
        visible={modalVisivel}
        onClose={fecharModal}
        onSalvar={itemEmEdicao ? salvarEdicao : salvarNovo}
        inicial={inicialModal}
      />
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
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, marginBottom: 12
  },
  progressoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressoTexto: { fontSize: 15, fontWeight: '600', color: '#334155' },
  progressoPorcentagem: { fontSize: 15, fontWeight: '800', color: '#0EA5E9' },
  barraFundo: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  barraPreenchida: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  resumo: { marginTop: 14, gap: 4 },
  resumoAtrasado: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  resumoProxima: { fontSize: 14, fontWeight: '600', color: '#475569' },
  resumoOk: { fontSize: 14, fontWeight: '700', color: '#15803D' },
  dica: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 10 },
  lista: { paddingHorizontal: 20, paddingBottom: 120 },
  vazioContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  vazioTitulo: { fontSize: 18, fontWeight: 'bold', color: '#475569', marginTop: 16 },
  vazioSub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 22 },
  fab: {
    position: 'absolute', bottom: 30, right: 24, width: 60, height: 60,
    borderRadius: 30, backgroundColor: '#0EA5E9', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
  },
});
