'use client';

import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Меню по умолчанию немодальное: из пунктов меню открываются окна (редактирование,
 * подтверждение удаления), и модальное меню оставляло страницу заблокированной для кликов.
 */
export function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Root>) {
  return <Menu.Root modal={modal} {...props} />;
}
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  align = 'end',
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={4}
        className={cn(
          'z-50 min-w-[180px] rounded-md border border-line bg-white p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface [&_svg]:size-4',
        danger ? 'text-status-red' : 'text-ink',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}
