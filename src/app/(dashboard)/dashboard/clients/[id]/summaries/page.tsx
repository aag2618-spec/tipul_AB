import { redirect } from "next/navigation";

export default async function SummariesRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/clients/${id}?tab=summaries`);
}
