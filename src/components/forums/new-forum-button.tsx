'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ForumFormDialog } from './forum-form-dialog';

export function NewForumButton({ forumOptions }: { forumOptions: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="new-forum">
        <Plus /> Новый форум
      </Button>
      <ForumFormDialog open={open} onOpenChange={setOpen} forumOptions={forumOptions} />
    </>
  );
}
