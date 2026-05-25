'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const EditorClient = dynamic(() => import('./EditorClient'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center text-gray-500 bg-gray-950">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  ),
});

export default function EditorPage({ params }: { params: { id: string } }) {
  return <EditorClient mapId={params.id} />;
}
