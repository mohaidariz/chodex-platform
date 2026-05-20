'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import type { FieldMap } from '@/types';

const CalibrationWizard = dynamic(() => import('./CalibrationWizard'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  ),
});

interface PageRow {
  page_number: number;
  scale_denominator: number | null;
  image_width: number | null;
  image_height: number | null;
  rendered_image_storage_key: string | null;
  calibration: any;
}

export default function CalibratePage({ params }: { params: { id: string } }) {
  const sp = useSearchParams();
  const requestedPage = parseInt(sp.get('page') ?? '1', 10) || 1;

  const [map, setMap] = useState<FieldMap | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [error, setError] = useState<string>('');
  const [activePage, setActivePage] = useState<number>(requestedPage);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/maps/${params.id}`);
        if (!res.ok) throw new Error('Load failed');
        const data = await res.json();
        setMap(data.map);
        setPages(data.pages);
        // If the requested page doesn't exist, fall back to first page
        if (!data.pages.find((p: PageRow) => p.page_number === requestedPage)) {
          setActivePage(data.pages[0]?.page_number ?? 1);
        }
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [params.id, requestedPage]);

  if (error) {
    return (
      <div className="p-8">
        <Link
          href={`/maps/${params.id}`}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to map
        </Link>
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 inline-block mr-2" />
          {error}
        </div>
      </div>
    );
  }

  if (!map || !pages.length) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  const current = pages.find((p) => p.page_number === activePage);

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-3 border-b border-gray-800 bg-gray-950 flex items-center gap-4 shrink-0">
        <Link
          href={`/maps/${params.id}`}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to map</span>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold truncate">Calibrate · {map.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pin one anchor point per page. The page&apos;s scale fills in the rest.
          </p>
        </div>
        <select
          value={activePage}
          onChange={(e) => setActivePage(parseInt(e.target.value, 10))}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          {pages.map((p) => (
            <option key={p.page_number} value={p.page_number}>
              Page {p.page_number}
              {p.scale_denominator ? ` · 1:${p.scale_denominator}` : ''}
              {p.calibration ? ' ✓' : ''}
              {!p.rendered_image_storage_key ? ' (no image)' : ''}
            </option>
          ))}
        </select>
      </header>

      {current ? (
        <div className="flex-1 overflow-hidden">
          <CalibrationWizard
            key={`${params.id}-${current.page_number}`}
            mapId={params.id}
            pageNumber={current.page_number}
            scaleDenominator={current.scale_denominator}
            imageWidth={current.image_width}
            imageHeight={current.image_height}
            hasStoredImage={!!current.rendered_image_storage_key}
            existingCalibration={current.calibration}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Page not found
        </div>
      )}
    </div>
  );
}
