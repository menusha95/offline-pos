import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = Number(searchParams.get("since") || 0);
  void since;

  const ts = Date.now();

  return NextResponse.json({
    ts,
    changes: {
      orders: [],
      orderItems: [],
      menuItems: [],
      inventory: [],
    },
  });
}
