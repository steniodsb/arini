import { PropertyCoverUploader } from "@/components/crm/PropertyCoverUploader";
import { PropertyMediaManager } from "@/components/crm/PropertyMediaManager";
import { EditedMediaManager } from "@/components/crm/EditedMediaManager";
import type { MarketingMedia, PropertyMedia } from "@/lib/types";

/**
 * Bloco unificado de mídias do imóvel para o admin, na ordem:
 *   1. Foto principal (capa fixa do site)
 *   2. Mídias cruas (captação)
 *   3. Mídias editadas (marketing — vão para o site no lugar das cruas)
 *
 * Montado tanto na página de detalhe quanto na tela de editar do imóvel.
 */
export function PropertyMediaBlock({
  propertyId,
  coverUrl,
  coverPath,
  campaignId,
  rawMedia,
  editedMedia,
}: {
  propertyId: string;
  coverUrl: string | null;
  coverPath: string | null;
  campaignId: string | null;
  rawMedia: PropertyMedia[];
  editedMedia: MarketingMedia[];
}) {
  return (
    <div className="space-y-6">
      <PropertyCoverUploader propertyId={propertyId} url={coverUrl} path={coverPath} />
      <PropertyMediaManager propertyId={propertyId} initial={rawMedia} />
      <EditedMediaManager propertyId={propertyId} campaignId={campaignId} initial={editedMedia} />
    </div>
  );
}
