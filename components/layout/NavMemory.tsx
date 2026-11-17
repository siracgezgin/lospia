"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberView } from "@/lib/nav/nav-memory";

/** Her gezinmede bulunulan görünümü hatırlar — bkz. lib/nav/nav-memory.ts. Çizdiği bir şey yok. */
export function NavMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (pathname) rememberView(pathname, search);
  }, [pathname, search]);
  return null;
}
