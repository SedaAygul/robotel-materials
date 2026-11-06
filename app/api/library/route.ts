import { api, libraryResponse } from '../../lib/library-server';
export const dynamic='force-dynamic';
export async function GET() { return api(libraryResponse); }
