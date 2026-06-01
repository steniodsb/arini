"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRangeForm({ from, to }: { from: string; to: string }) {
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const f = fd.get("from") as string;
    const t = fd.get("to") as string;
    router.push(`/admin/relatorios?from=${f}&to=${t}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div><Label>De</Label><Input name="from" type="date" defaultValue={from} /></div>
      <div><Label>Até</Label><Input name="to" type="date" defaultValue={to} /></div>
      <Button type="submit" variant="gold">Gerar relatório</Button>
    </form>
  );
}
