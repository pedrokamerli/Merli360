import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureHmsQuestionnaire, parseAnswers, parseQuestions } from "@/lib/public-questionnaire";

export const dynamic = "force-dynamic";

export default async function QuestionariosPage() {
  await requireUser();
  await ensureHmsQuestionnaire();
  const questionnaires = await prisma.publicQuestionnaire.findMany({
    orderBy: { createdAt: "desc" },
    include: { submissions: { orderBy: { createdAt: "desc" } } }
  });

  return (
    <main className="space-y-6 pb-24">
      <section className="page-header">
        <div>
          <p className="eyebrow">Links publicos</p>
          <h1 className="text-3xl font-black text-slate-950">Questionarios</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
            Envie o link para a pessoa responder. As respostas ficam salvas no banco e podem ser exportadas em TXT.
          </p>
        </div>
      </section>

      <section className="grid gap-5">
        {questionnaires.map((questionnaire) => {
          const questions = parseQuestions(questionnaire.questions);
          const publicPath = `/q/${questionnaire.slug}`;
          return (
            <article key={questionnaire.id} className="panel space-y-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">{questions.length} perguntas</p>
                  <h2 className="text-xl font-black text-slate-950">{questionnaire.title}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{questionnaire.description}</p>
                  <p className="mt-2 break-all rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{publicPath}</p>
                </div>
                <Link href={publicPath} target="_blank" className="btn-secondary">
                  <ExternalLink size={16} />
                  Abrir link
                </Link>
              </div>

              <div className="grid gap-3">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                  Respostas recebidas ({questionnaire.submissions.length})
                </h3>
                {questionnaire.submissions.length ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    {questionnaire.submissions.map((submission) => {
                      const answers = parseAnswers(submission.answers);
                      const answeredCount = Object.values(answers).filter(Boolean).length;
                      return (
                        <div key={submission.id} className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                          <div>
                            <strong className="text-slate-950">{submission.respondentName || "Sem nome"}</strong>
                            <p className="text-sm font-semibold text-slate-500">
                              {answeredCount} respostas - {submission.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                            </p>
                            <p className="text-xs font-bold text-slate-400">
                              {[submission.respondentPhone, submission.respondentEmail].filter(Boolean).join(" | ") || "Sem contato extra"}
                            </p>
                          </div>
                          <Link href={`/api/public-questionnaires/${submission.id}/txt`} className="btn-secondary">
                            <Download size={16} />
                            Baixar TXT
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
                    <FileText className="mx-auto text-slate-400" size={32} />
                    <p className="mt-2 text-sm font-bold text-slate-500">Nenhuma resposta enviada ainda.</p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
