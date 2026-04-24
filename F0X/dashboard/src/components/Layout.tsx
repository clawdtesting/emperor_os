import { PropsWithChildren } from 'react';

export function Layout({ children }: PropsWithChildren) {
  return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
}
