'use client';

import { useActionState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { loginAction, type LoginState } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="Введите пароль"
        />
      </div>
      {state.error && (
        <p
          role="alert"
          data-testid="login-error"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-status-red"
        >
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        <Lock /> {pending ? 'Проверяем…' : 'Войти'}
      </Button>
    </form>
  );
}
