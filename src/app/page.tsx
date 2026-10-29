import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getAdminContext();
  redirect(ctx ? "/dashboard" : "/login");
}
