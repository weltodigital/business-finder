import { LookupClient } from './lookup-client';
import { PageHeader } from '@/components/primitives';

export const metadata = { title: 'Company Lookup' };

export default function LookupPage() {
  return (
    <>
      <PageHeader
        title="Company Lookup"
        subtitle="Import a single company from Companies House and inspect everything the pipeline extracted."
      />
      <LookupClient />
    </>
  );
}
