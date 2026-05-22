export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  settings: Record<string, any>;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface FieldMap {
  id: string;
  org_id: string;
  name: string;
  project_code: string | null;
  map_type: 'byggkarta' | 'borrkarta' | 'other';
  original_pdf_storage_key: string;
  page_count: number | null;
  status: 'uploading' | 'extracting' | 'ready' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
