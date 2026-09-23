'use client';

import * as React from 'react';
import { Button } from './button';
import { Dialog, DialogContent, DialogFooter } from './dialog';

interface ConfirmState {
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const ConfirmContext = React.createContext<
  (opts: Omit<ConfirmState, 'resolve'>) => Promise<boolean>
>(() => Promise.resolve(false));

/** Провайдер подтверждений: const confirm = useConfirm(); if (await confirm({...})) … */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState | null>(null);
  const confirm = React.useCallback(
    (opts: Omit<ConfirmState, 'resolve'>) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state !== null} onOpenChange={(o) => !o && close(false)}>
        {state && (
          <DialogContent title={state.title} description={state.description}>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Отмена
              </Button>
              <Button
                variant={state.danger ? 'danger' : 'default'}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirmText ?? 'Подтвердить'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return React.useContext(ConfirmContext);
}
