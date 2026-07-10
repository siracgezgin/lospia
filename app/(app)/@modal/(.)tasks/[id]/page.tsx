import { TaskDetailContent } from "@/app/(app)/tasks/[id]/TaskDetailContent";
import { TaskDetailDrawer } from "@/components/task/TaskDetailDrawer";

// Intercepting route: a SOFT navigation to /tasks/[id] from within the app
// (a board card, a list row, an activity link) renders the task detail as a
// right-side drawer over the current Board/List instead of a full page. A hard
// load / refresh / new tab bypasses this and renders the full page fallback.
export default async function InterceptedTaskDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; visibility?: string; manager?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <TaskDetailDrawer>
      <TaskDetailContent id={id} backParams={sp} />
    </TaskDetailDrawer>
  );
}
