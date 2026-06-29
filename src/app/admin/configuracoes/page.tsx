import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConfigPage() {
  await requireSector(["admin_central"]);
  const supabase = createSupabaseServer();
  const [{ data: seqs }, { data: cats }] = await Promise.all([
    supabase.from("property_code_sequences").select("*"),
    supabase.from("expense_categories").select("*").order("nome"),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl text-arini">Configurações</h1>
        <p className="text-muted-foreground mt-1">Sequências de código e categorias de despesa.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Sequências de código de imóvel</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Tipo</th><th>Categoria</th><th>Prefixo</th><th>Próximo nº</th></tr>
            </thead>
            <tbody>
              {(seqs ?? []).map((s) => (
                <tr key={s.type + s.category} className="border-t">
                  <td className="py-2">{s.type}</td>
                  <td>{s.category}</td>
                  <td className="font-mono">{s.prefix}</td>
                  <td className="font-mono">{s.next_seq}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Categorias de despesa</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm grid md:grid-cols-3 gap-2">
            {(cats ?? []).map((c) => (
              <li key={c.id} className="px-3 py-2 rounded-md bg-muted">{c.nome}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
