import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as corrApi from './api';
import { useAuth } from '@/features/auth/AuthContext';
import { formatRelativeTime, formatShamsiTimestamp } from '@/lib/shamsi';
import { useT } from '@/lib/i18n';

// Forked from features/attachments/AttachmentsSection — same UX, but hits the
// correspondence letter attachment routes and keys off ['correspondence',
// 'attachments', letterId]. Kept separate on purpose (do not refactor the task
// one to share).

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface LetterAttachmentsProps {
  teamId: string;
  projectId: string;
  letterId: string;
  canManage: boolean;
}

export function LetterAttachments({
  teamId,
  projectId,
  letterId,
  canManage,
}: LetterAttachmentsProps): JSX.Element {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const key = ['correspondence', 'attachments', letterId];

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => corrApi.listLetterAttachments(teamId, projectId, letterId),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => corrApi.uploadLetterAttachment(teamId, projectId, letterId, file),
    onSuccess: async () => {
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => setUploadError(corrApi.errorMessage(err, t('correspondence.attachments.uploadFailed'))),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => corrApi.deleteLetterAttachment(teamId, projectId, letterId, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-slate-600">
          {t('correspondence.attachments.title')}
        </h3>
        {attachments.length > 0 && (
          <span className="text-xs text-slate-500">{attachments.length}</span>
        )}
      </div>

      {isLoading && <p className="text-xs text-slate-500">{t('common.loading')}</p>}
      {!isLoading && attachments.length === 0 && (
        <p className="text-xs text-slate-400 italic">{t('correspondence.attachments.none')}</p>
      )}

      <ul className="space-y-2">
        {attachments.map((a) => {
          const canDelete = canManage || a.uploaderId === user?.id;
          return (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 text-sm rounded border border-border px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() =>
                  corrApi.downloadLetterAttachment(teamId, projectId, letterId, a).catch(() => {})
                }
                className="text-left flex-1 min-w-0 hover:underline"
                title={`${a.mimeType} · ${formatBytes(a.sizeBytes)}`}
              >
                <span className="font-medium block truncate">{a.filename}</span>
                <span className="text-xs text-slate-500">
                  {formatBytes(a.sizeBytes)} · {a.uploaderName} ·{' '}
                  <span dir="rtl" title={formatShamsiTimestamp(a.createdAt) ?? ''}>
                    {formatRelativeTime(a.createdAt)}
                  </span>
                </span>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('correspondence.attachments.deleteConfirm').replace('{name}', a.filename))) {
                      deleteMut.mutate(a.id);
                    }
                  }}
                  disabled={deleteMut.isPending}
                  className="text-xs text-danger hover:underline shrink-0 disabled:opacity-50"
                  aria-label={t('correspondence.attachments.deleteAria').replace('{name}', a.filename)}
                >
                  {t('common.delete')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
            }}
            className="text-xs"
            disabled={uploadMut.isPending}
          />
          {uploadMut.isPending && (
            <span className="text-xs text-slate-500">{t('correspondence.attachments.uploading')}</span>
          )}
        </div>
      )}
      {uploadError && <p role="alert" className="text-xs text-danger">{uploadError}</p>}
    </div>
  );
}
