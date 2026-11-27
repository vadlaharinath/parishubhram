export interface AdminReport {
  id: string;
  category: string;
  severity: string;
  status: string;
  description: string | null;
  address: string | null;
  image_url: string | null;
  resolution_photo_url: string | null;
  resolution_note: string | null;
  ward_id: string | null;
  created_at: string;
  ward?: {
    ward_number: number;
    ward_name: string;
    zone_id: string | null;
  } | null;
}

export interface ZoneRow {
  id: string;
  name: string;
  code: string;
}
