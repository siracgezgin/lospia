import { TaskDetailContent } from "./TaskDetailContent";

// Direct URL / hard-navigation fallback — the full-page task detail. Soft
// navigations from the Board/List are intercepted by @modal/(.)tasks/[id] and
// open the same content as a right-side drawer instead; both render
// TaskDetailContent so there is a single source of data + UI.
export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; visibility?: string; manager?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <TaskDetailContent id={id} backParams={sp} />;
}
