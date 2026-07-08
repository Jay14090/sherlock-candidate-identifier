import type { CandidateMetadata } from '@/lib/types';
import { formatEventTime } from '@/lib/utils';

interface CandidateMetadataPanelProps {
  metadata: CandidateMetadata;
}

function Row({ label, value, missing = false }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className={`text-right text-xs ${missing ? 'italic text-amber-500/80' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}

export default function CandidateMetadataPanel({ metadata }: CandidateMetadataPanelProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Known Candidate Metadata
      </h2>
      <div className="divide-y divide-slate-800">
        <Row
          label="Candidate name"
          value={metadata.candidateName ?? 'Not provided'}
          missing={!metadata.candidateName}
        />
        <Row
          label="Candidate email"
          value={metadata.candidateEmail ?? 'Not provided'}
          missing={!metadata.candidateEmail}
        />
        <Row label="Scheduled start" value={formatEventTime(metadata.scheduledStartTime)} />
        <Row label="Interviewers" value={metadata.interviewerNames.join(', ') || 'Unknown'} missing={metadata.interviewerNames.length === 0} />
        {metadata.jobRole && <Row label="Role" value={metadata.jobRole} />}
      </div>
      {metadata.calendarInviteText && (
        <p className="mt-3 rounded-lg bg-slate-800/60 p-2.5 text-[11px] leading-relaxed text-slate-400">
          <span className="font-medium text-slate-300">Calendar invite: </span>
          {metadata.calendarInviteText}
        </p>
      )}
    </section>
  );
}
