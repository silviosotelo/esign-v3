"use client"; // 📌 Necesario en Next.js 13+ para usar hooks en componentes de página

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login"); // 📌 Reemplaza la URL actual con /login (sin dejar historial)
  }, [router]);

  return null; // 📌 Evita renderizar contenido antes de redirigir
}
