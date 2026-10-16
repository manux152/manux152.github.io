import { Platform, Share } from 'react-native';
import { supabase } from './supabase';

export type Col<T = any> = { header: string; get: (row: T) => unknown };

// A cell that starts with = + - or @ can run as a formula when the file is opened in a spreadsheet. A leading apostrophe makes it plain text.
const cell = (v: unknown): string => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv<T>(rows: T[], cols: Col<T>[]): string {
  return '\uFEFF' + [cols.map((c) => cell(c.header)).join(','), ...rows.map((r) => cols.map((c) => cell(c.get(r))).join(','))].join('\r\n');   // BOM so Excel reads accents correctly
}

/** Downloads the file in a browser, or opens the share sheet on a phone. Returns a short message for the screen. */
export async function saveCsv(filename: string, csv: string): Promise<string> {
  if (Platform.OS === 'web') {
    const g: any = globalThis; const url = g.URL.createObjectURL(new g.Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = g.document.createElement('a'); a.href = url; a.download = filename; g.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => g.URL.revokeObjectURL(url), 4000);
    return `Downloaded ${filename}`;
  }
  try {
    const FS = require('expo-file-system'); const Sharing = require('expo-sharing');
    const uri = `${FS.cacheDirectory}${filename}`; await FS.writeAsStringAsync(uri, csv, { encoding: FS.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: filename, UTI: 'public.comma-separated-values-text' }); return 'Shared'; }
  } catch { /* fall through to plain text */ }
  await Share.share({ message: csv, title: filename }); return 'Shared as text';
}

/** Reads every row of a query in pages (the server returns at most 1000 at a time). Stops at 20,000 rows. */
export async function fetchAll<T = any>(make: () => any, limit = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break;
  }
  return out;
}
export const logExport = (dataset: string, rows: number) => supabase.rpc('log_export', { p_dataset: dataset, p_rows: rows }).then(() => {}, () => {});
export const stamp = () => new Date().toISOString().slice(0, 10);
