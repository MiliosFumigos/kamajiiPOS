import { redirect } from "next/navigation";
import { getBrandFromSubdomain } from "@/lib/brand-context";

export default async function AppIndexPage() {
  const brand = await getBrandFromSubdomain();
  redirect(brand ? `/${brand.subdomain}/app/dashboard` : "/app/dashboard");
}

