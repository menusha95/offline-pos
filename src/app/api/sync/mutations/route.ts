import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mutations = (body as any).mutations || [];
  const appliedIds = mutations.map((m: any) => m.id);
  return NextResponse.json({ appliedIds });
}
