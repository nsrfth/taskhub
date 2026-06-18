import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useT } from '@/lib/i18n';
import * as formsApi from '@/features/forms/api';
import FormRenderer from '@/features/forms/FormRenderer';

/** Standalone public intake form — no app chrome, no auth, minimal data exposure. */
export default function PublicFormPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const t = useT();
  const [submitted, setSubmitted] = useState(false);

  const { data: form, isLoading, isError } = useQuery({
    queryKey: ['publicForm', token],
    queryFn: () => formsApi.fetchPublicForm(token!),
    enabled: !!token,
    retry: false,
  });

  const submitMut = useMutation({
    mutationFn: ({ values, website }: { values: Record<string, unknown>; website: string }) =>
      formsApi.submitPublicForm(token!, values, website),
    onSuccess: () => setSubmitted(true),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-slate-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (isError || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-text-muted">{t('forms.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm">
        <header className="mb-6 border-b border-border pb-4">
          <h1 className="text-xl font-semibold text-text">{form.name}</h1>
          {form.description && (
            <p className="mt-1 text-sm text-text-muted">{form.description}</p>
          )}
        </header>
        <FormRenderer
          fields={form.fields}
          submitted={submitted}
          submitting={submitMut.isPending}
          onSubmit={async (values, website) => {
            await submitMut.mutateAsync({ values, website });
          }}
        />
      </div>
    </div>
  );
}
