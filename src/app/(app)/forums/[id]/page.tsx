import { redirect } from 'next/navigation';

export default async function ForumIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/forums/${id}/gantt`);
}
