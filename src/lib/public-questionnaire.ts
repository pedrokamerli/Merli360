import { prisma } from "@/lib/prisma";

export type QuestionnaireQuestion = {
  id: string;
  section: string;
  text: string;
};

export const hmsQuestions: QuestionnaireQuestion[] = [
  { id: "p1_01", section: "Parte 1 - Sobre o negocio", text: "Qual e o seu nome completo?" },
  { id: "p1_02", section: "Parte 1 - Sobre o negocio", text: "Voce quer divulgar mais o nome HMS Saude & Estetica ou fortalecer Helena Sena como marca profissional?" },
  { id: "p1_03", section: "Parte 1 - Sobre o negocio", text: "Ha quanto tempo voce trabalha com estetica e massoterapia?" },
  { id: "p1_04", section: "Parte 1 - Sobre o negocio", text: "Quais sao suas principais formacoes, especializacoes e certificacoes?" },
  { id: "p1_05", section: "Parte 1 - Sobre o negocio", text: "Voce possui CNPJ ou trabalha como profissional autonoma?" },
  { id: "p1_06", section: "Parte 1 - Sobre o negocio", text: "Voce trabalha sozinha ou existem outros profissionais no mesmo espaco?" },
  { id: "p1_07", section: "Parte 1 - Sobre o negocio", text: "O endereco esta correto desta forma? Rua Joao do Patrocinio, 294 - Riviera Fluminense, Macae/RJ. Atras do Supermercado Extra, no terreo, ao lado da recepcao." },
  { id: "p1_08", section: "Parte 1 - Sobre o negocio", text: "Quais sao os dias e horarios de atendimento?" },
  { id: "p1_09", section: "Parte 1 - Sobre o negocio", text: "O atendimento funciona somente com horario marcado?" },
  { id: "p1_10", section: "Parte 1 - Sobre o negocio", text: "Quais formas de pagamento voce aceita?" },
  { id: "p1_11", section: "Parte 1 - Sobre o negocio", text: "Existe parcelamento para os pacotes? Se sim, em quantas vezes?" },
  { id: "p1_12", section: "Parte 1 - Sobre o negocio", text: "Existe alguma regra para cancelamento, atraso ou reagendamento?" },
  { id: "p1_13", section: "Parte 1 - Sobre o negocio", text: "Quantas clientes voce consegue atender por dia sem prejudicar a qualidade do atendimento?" },
  { id: "p1_14", section: "Parte 1 - Sobre o negocio", text: "Quais dias e horarios costumam ficar mais vazios?" },
  { id: "p1_15", section: "Parte 1 - Sobre o negocio", text: "Quem responde as mensagens e realiza os agendamentos pelo WhatsApp?" },

  { id: "p2_01", section: "Parte 2 - Servicos e ofertas", text: "Por favor, envie a lista completa dos servicos que voce oferece atualmente." },
  { id: "p2_02", section: "Parte 2 - Servicos e ofertas", text: "Qual e o preco individual de cada servico?" },
  { id: "p2_03", section: "Parte 2 - Servicos e ofertas", text: "Quanto tempo dura cada atendimento?" },
  { id: "p2_04", section: "Parte 2 - Servicos e ofertas", text: "Quais servicos possuem pacotes? Informe a quantidade de sessoes, o valor e as condicoes de pagamento." },
  { id: "p2_05", section: "Parte 2 - Servicos e ofertas", text: "Quais sao os tres servicos mais procurados atualmente?" },
  { id: "p2_06", section: "Parte 2 - Servicos e ofertas", text: "Quais tratamentos voce mais gosta de realizar?" },
  { id: "p2_07", section: "Parte 2 - Servicos e ofertas", text: "Quais servicos trazem maior retorno financeiro?" },
  { id: "p2_08", section: "Parte 2 - Servicos e ofertas", text: "Qual servico costuma fazer a cliente retornar com mais frequencia?" },
  { id: "p2_09", section: "Parte 2 - Servicos e ofertas", text: "Existe algum tratamento que voce oferece, mas quase ninguem procura?" },
  { id: "p2_10", section: "Parte 2 - Servicos e ofertas", text: "Voce realiza atendimento pos-operatorio? Se sim, possui formacao especifica e indicacao ou autorizacao medica quando necessaria?" },
  { id: "p2_11", section: "Parte 2 - Servicos e ofertas", text: "Voce realiza avaliacao antes de indicar um tratamento? Essa avaliacao e gratuita ou paga?" },
  { id: "p2_12", section: "Parte 2 - Servicos e ofertas", text: "Os protocolos sao iguais para todas as clientes ou personalizados depois da avaliacao?" },
  { id: "p2_13", section: "Parte 2 - Servicos e ofertas", text: "O pacote de cinco sessoes de limpeza de pele por R$ 500,00 esta confirmado?" },
  { id: "p2_14", section: "Parte 2 - Servicos e ofertas", text: "Qual e o valor normal das cinco sessoes fora da promocao?" },
  { id: "p2_15", section: "Parte 2 - Servicos e ofertas", text: "O que esta incluido em cada sessao?" },
  { id: "p2_16", section: "Parte 2 - Servicos e ofertas", text: "Qual deve ser o intervalo entre as sessoes?" },
  { id: "p2_17", section: "Parte 2 - Servicos e ofertas", text: "A cliente precisa comprar o pacote durante agosto ou realizar todas as sessoes em agosto?" },
  { id: "p2_18", section: "Parte 2 - Servicos e ofertas", text: "Qual sera o prazo maximo para utilizar as cinco sessoes?" },
  { id: "p2_19", section: "Parte 2 - Servicos e ofertas", text: "O pacote e individual e intransferivel?" },
  { id: "p2_20", section: "Parte 2 - Servicos e ofertas", text: "Sera possivel parcelar os R$ 500,00? Em quantas vezes?" },
  { id: "p2_21", section: "Parte 2 - Servicos e ofertas", text: "Quantos pacotes promocionais poderao ser vendidos?" },
  { id: "p2_22", section: "Parte 2 - Servicos e ofertas", text: "Existe alguma condicao, restricao ou contraindicacao que precisa ser informada?" },

  { id: "p3_01", section: "Parte 3 - Clientes e posicionamento", text: "Como e a sua cliente mais comum atualmente?" },
  { id: "p3_02", section: "Parte 3 - Clientes e posicionamento", text: "Qual e a faixa de idade predominante?" },
  { id: "p3_03", section: "Parte 3 - Clientes e posicionamento", text: "A maioria procura estetica, relaxamento, alivio de tensoes, pos-operatorio ou outro objetivo?" },
  { id: "p3_04", section: "Parte 3 - Clientes e posicionamento", text: "De quais bairros ou regioes vem suas clientes atuais?" },
  { id: "p3_05", section: "Parte 3 - Clientes e posicionamento", text: "Como elas normalmente conhecem seu trabalho? Instagram, indicacao, salao, Google, WhatsApp ou outro canal?" },
  { id: "p3_06", section: "Parte 3 - Clientes e posicionamento", text: "O que as clientes mais elogiam no seu atendimento?" },
  { id: "p3_07", section: "Parte 3 - Clientes e posicionamento", text: "Quais sao as principais duvidas ou insegurancas antes de agendar?" },
  { id: "p3_08", section: "Parte 3 - Clientes e posicionamento", text: "O preco costuma ser uma objecao frequente?" },
  { id: "p3_09", section: "Parte 3 - Clientes e posicionamento", text: "Por que uma cliente deveria escolher voce e nao outra profissional de Macae?" },
  { id: "p3_10", section: "Parte 3 - Clientes e posicionamento", text: "O que voce considera seu maior diferencial profissional?" },
  { id: "p3_11", section: "Parte 3 - Clientes e posicionamento", text: "Como voce quer que as pessoas percebam seu trabalho? Exemplos: profissional, acolhedor, sofisticado, acessivel, clinico, personalizado ou voltado para resultados." },
  { id: "p3_12", section: "Parte 3 - Clientes e posicionamento", text: "Voce quer priorizar estetica corporal, estetica facial, massoterapia ou trabalhar os tres segmentos?" },
  { id: "p3_13", section: "Parte 3 - Clientes e posicionamento", text: "Quais profissionais ou clinicas da regiao voce considera concorrentes ou referencias?" },
  { id: "p3_14", section: "Parte 3 - Clientes e posicionamento", text: "Voce possui avaliacoes, mensagens ou depoimentos de clientes que possam ser divulgados?" },
  { id: "p3_15", section: "Parte 3 - Clientes e posicionamento", text: "Possui fotos de resultados autorizadas pelas clientes?" },
  { id: "p3_16", section: "Parte 3 - Clientes e posicionamento", text: "Voce se sente confortavel aparecendo e falando nos videos?" },
  { id: "p3_17", section: "Parte 3 - Clientes e posicionamento", text: "As clientes autorizam a gravacao de partes dos atendimentos? Existe autorizacao de uso de imagem?" },

  { id: "p4_01", section: "Parte 4 - Marketing e objetivos", text: "Qual e o principal resultado que voce espera do nosso trabalho?" },
  { id: "p4_02", section: "Parte 4 - Marketing e objetivos", text: "Quantas novas clientes gostaria de conquistar por mes?" },
  { id: "p4_03", section: "Parte 4 - Marketing e objetivos", text: "Qual seria uma quantidade realista de novos agendamentos por semana?" },
  { id: "p4_04", section: "Parte 4 - Marketing e objetivos", text: "Qual e o seu faturamento medio mensal atual? Se preferir, pode informar apenas uma faixa aproximada." },
  { id: "p4_05", section: "Parte 4 - Marketing e objetivos", text: "Qual faturamento mensal voce gostaria de alcancar?" },
  { id: "p4_06", section: "Parte 4 - Marketing e objetivos", text: "Qual e o valor medio gasto por uma cliente atualmente?" },
  { id: "p4_07", section: "Parte 4 - Marketing e objetivos", text: "Quantas clientes novas atendem uma vez e quantas continuam em pacotes ou tratamentos recorrentes?" },
  { id: "p4_08", section: "Parte 4 - Marketing e objetivos", text: "Ja realizou anuncios pagos anteriormente?" },
  { id: "p4_09", section: "Parte 4 - Marketing e objetivos", text: "Quanto foi investido e quais resultados foram obtidos?" },
  { id: "p4_10", section: "Parte 4 - Marketing e objetivos", text: "Qual valor consegue investir semanalmente ou mensalmente em anuncios?" },
  { id: "p4_11", section: "Parte 4 - Marketing e objetivos", text: "O foco inicial sera receber mensagens no WhatsApp ou levar as pessoas diretamente para um sistema de agendamento?" },
  { id: "p4_12", section: "Parte 4 - Marketing e objetivos", text: "O WhatsApp utilizado e o WhatsApp Business?" },
  { id: "p4_13", section: "Parte 4 - Marketing e objetivos", text: "Existe uma mensagem automatica de recepcao e um padrao de atendimento?" },
  { id: "p4_14", section: "Parte 4 - Marketing e objetivos", text: "Possui conta no Gerenciador de Anuncios da Meta?" },
  { id: "p4_15", section: "Parte 4 - Marketing e objetivos", text: "Possui uma pagina da empresa no Facebook conectada ao Instagram?" },
  { id: "p4_16", section: "Parte 4 - Marketing e objetivos", text: "A empresa possui Perfil da Empresa no Google?" },
  { id: "p4_17", section: "Parte 4 - Marketing e objetivos", text: "Quais regioes devem ser prioridade na primeira campanha? Riviera Fluminense, Imbetiba, Centro de Macae, Praia dos Cavaleiros, Sao Marcos, Praia do Pecado, Cancela Preta, Praia da Barra e Rio das Ostras." },
  { id: "p4_18", section: "Parte 4 - Marketing e objetivos", text: "Existe alguma regiao que nao deseja atender?" },
  { id: "p4_19", section: "Parte 4 - Marketing e objetivos", text: "Voce possui fotos profissionais do espaco, dos procedimentos e dos equipamentos?" },
  { id: "p4_20", section: "Parte 4 - Marketing e objetivos", text: "Possui videos de atendimento alem do material ja enviado?" },
  { id: "p4_21", section: "Parte 4 - Marketing e objetivos", text: "Existe alguma promocao, pacote ou servico que nao deseja divulgar?" },
  { id: "p4_22", section: "Parte 4 - Marketing e objetivos", text: "Quais dias ou horarios voce mais precisa preencher com novos agendamentos?" }
];

export async function ensureHmsQuestionnaire() {
  return prisma.publicQuestionnaire.upsert({
    where: { slug: "hms-saude-estetica" },
    update: {
      title: "Questionario HMS Saude & Estetica",
      description: "Diagnostico comercial, posicionamento, servicos e marketing.",
      questions: JSON.stringify(hmsQuestions),
      active: true
    },
    create: {
      slug: "hms-saude-estetica",
      title: "Questionario HMS Saude & Estetica",
      description: "Diagnostico comercial, posicionamento, servicos e marketing.",
      questions: JSON.stringify(hmsQuestions),
      active: true
    }
  });
}

export function parseQuestions(value: string | null | undefined): QuestionnaireQuestion[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseAnswers(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function submissionToTxt(input: {
  title: string;
  createdAt: Date;
  respondentName?: string | null;
  respondentPhone?: string | null;
  respondentEmail?: string | null;
  questions: QuestionnaireQuestion[];
  answers: Record<string, string>;
}) {
  const lines = [
    input.title,
    `Enviado em: ${input.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    `Nome: ${input.respondentName || "-"}`,
    `WhatsApp: ${input.respondentPhone || "-"}`,
    `Email: ${input.respondentEmail || "-"}`,
    ""
  ];

  let currentSection = "";
  input.questions.forEach((question) => {
    if (question.section !== currentSection) {
      currentSection = question.section;
      lines.push("");
      lines.push(currentSection.toUpperCase());
    }
    lines.push("");
    lines.push(question.text);
    lines.push(input.answers[question.id]?.trim() || "-");
  });

  return `${lines.join("\n").trim()}\n`;
}
