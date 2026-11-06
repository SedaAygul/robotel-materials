import { api, submitProposal } from '../../lib/library-server';
export const dynamic='force-dynamic';
export async function POST(request: Request) { return api(()=>submitProposal(request)); }
