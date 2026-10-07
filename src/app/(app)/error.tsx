"use client";

import { ErrorView } from "@/components/layout/error-view";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView reset={reset} timeout={/tard/i.test(error.message)} />;
}
