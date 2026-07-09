import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/types";

/**
 * Barra de filtros dos imóveis. É um <form method="get" action="/imoveis">,
 * então funciona igual na HOME e na página de listagem: submeter leva para
 * /imoveis já com os parâmetros aplicados (?q=&type=&category=&cidade=).
 */
export function PropertyFilterBar({
  defaults = {},
}: {
  defaults?: { q?: string; type?: string; category?: string; cidade?: string };
}) {
  return (
    <form
      action="/imoveis"
      method="get"
      className="grid md:grid-cols-6 gap-3 p-4 bg-muted/40 rounded-lg border"
    >
      <div className="md:col-span-2">
        <Label>Buscar</Label>
        <Input name="q" placeholder="Código, bairro, título…" defaultValue={defaults.q} />
      </div>
      <div>
        <Label>Tipo</Label>
        <Select name="type" defaultValue={defaults.type}>
          <option value="">Todos</option>
          {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Categoria</Label>
        <Select name="category" defaultValue={defaults.category}>
          <option value="">Todas</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Cidade</Label>
        <Input name="cidade" placeholder="Cidade" defaultValue={defaults.cidade} />
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="gold" className="w-full">Filtrar</Button>
      </div>
    </form>
  );
}
