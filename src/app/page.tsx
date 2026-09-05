"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Play, Dumbbell } from "lucide-react";
import { Button, Card, EmptyState, LoadingBlock } from "@/components/ui";
import { ElapsedClock } from "@/components/session/ElapsedClock";
import { SessionSummaryCard } from "@/components/SessionSummaryCard";
import { InstallBanner } from "@/components/InstallBanner";
import {
  getActiveSession,
  listRecentSessions,
  loadSession,
  loadSessions,
  startSession,
} from "@/lib/db/repo";
import { formatDateFullKo, todayKey } from "@/lib/format/date";

export default function HomePage() {
  const router = useRouter();

  const active = useLiveQuery(async () => {
    const session = await getActiveSession();
    return session ? await loadSession(session.id) : null;
  }, []);

  const recent = useLiveQuery(async () => {
    const sessions = await listRecentSessions(20);
    const finished = sessions.filter((s) => s.endedAt !== 0).slice(0, 5);
    return loadSessions(finished.map((s) => s.id));
  }, []);

  const begin = async () => {
    const id = await startSession();
    router.push(`/session/${id}`);
  };

  return (
    <>
      <header className="px-4 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))] pb-2">
        <p className="text-sm text-muted">{formatDateFullKo(todayKey())}</p>
        <h1 className="text-2xl font-bold">운동 기록</h1>
      </header>

      <main className="flex-1 space-y-6 p-4">
        <InstallBanner />

        {active === undefined ? (
          <LoadingBlock />
        ) : active ? (
          <Link href={`/session/${active.id}`} className="block">
            <Card className="border-accent/40 bg-accent/10 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-accent">
                <span className="size-1.5 rounded-full bg-accent" />
                진행 중인 운동
              </div>
              <p className="mt-2 font-mono text-3xl font-bold">
                <ElapsedClock startedAt={active.startedAt} endedAt={0} />
              </p>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {active.items.length}종목 ·{" "}
                {active.items.reduce((n, i) => n + i.sets.length, 0)}세트
              </p>
              <Button variant="primary" size="lg" className="mt-4 w-full">
                이어서 하기
              </Button>
            </Card>
          </Link>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={begin}>
            <Play size={18} />
            운동 시작
          </Button>
        )}

        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">최근 기록</h2>
          {recent === undefined ? (
            <LoadingBlock />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={28} />}
              title="아직 기록이 없습니다"
              description="운동을 시작하면 여기에 쌓입니다."
            />
          ) : (
            <div className="space-y-2">
              {recent.map((session) => (
                <SessionSummaryCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
