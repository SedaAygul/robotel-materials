import { api, reviewProposal } from '../../../../lib/library-server';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) { return api(async()=>reviewProposal(request,(await context.params).id)); }
