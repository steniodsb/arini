"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ExpenseDateFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const f = fd.get("from") as string;
    const t = fd.get("to") as string;
    const qs = new URLSearchParams();
    if (f) qs.set("from", f);
    if (t) qs.set("to", t);
    router.push(`/admin/financeiro-empresarial${qs.toString() ? `?${qs}` : ""}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 pt-2">
      <Input name="from" type="date" defaultValue={from} className="w-auto" />
      <span className="text-muted-foreground text-sm pb-2">até</span>
      <Input name="to" type="date" defaultValue={to} className="w-auto" />
      <Button type="submit" size="sm" variant="outline">Filtrar por data</Button>
    </form>
  );
}
