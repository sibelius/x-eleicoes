import { Suspense } from "react";
import { connection } from "next/server";
import { Card, PageTitle } from "@/components/admin/Card";
import { TopicForm, TopicRow } from "@/components/admin/TopicForm";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { listTopics, topicCounts } from "@/lib/topics";

export default function TopicsAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <TopicsAdmin />
    </Suspense>
  );
}

async function TopicsAdmin() {
  await connection();
  await requireAdmin();
  const [topics, counts] = await Promise.all([listTopics({ all: true }), topicCounts()]);
  return (
    <>
      <PageTitle
        title="Temas"
        sub="Outras perguntas A × B sobre o mesmo grafo de quem segue quem (sem importar nada de novo). Só aparecem para o público com status “No ar”; rascunhos abrem em /t/<slug> só para admins."
      />
      <Card title="Novo tema">
        <TopicForm />
      </Card>
      <Card title="Todos os temas" className="mt-4">
        {topics.length === 0 ? (
          <p className="text-sm text-subtle">Nenhum tema ainda.</p>
        ) : (
          <ul className="grid gap-3">
            {topics.map((t, i) => (
              <li key={t.id} className={i ? "border-t border-line pt-3" : ""}>
                <TopicRow topic={t} counts={counts[t.id] ?? { a: 0, b: 0 }} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
