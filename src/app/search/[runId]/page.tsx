import { RunResults } from './run-results';

export const metadata = { title: 'Search results' };

export default function RunPage({ params }: { params: { runId: string } }) {
  return <RunResults runId={params.runId} />;
}
