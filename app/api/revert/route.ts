import { api, revertEvent } from '../../lib/library-server';
export const dynamic='force-dynamic';
export async function POST(request:Request) { return api(()=>revertEvent(request)); }
