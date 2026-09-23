import { notFound } from 'next/navigation';
import { ReportView } from '@/components/report/report-view';
import { getForum, getForumOptions } from '@/server/queries';
import { getReportCharts } from '@/server/report-queries';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const forumId = Number(id);
  const forum = await getForum(forumId);
  if (!forum) notFound();
  const [charts, options] = await Promise.all([getReportCharts(forumId), getForumOptions()]);
  return (
    <ReportView
      forum={forum}
      charts={charts}
      forumOptions={options.filter((o) => o.id !== forumId)}
    />
  );
}
