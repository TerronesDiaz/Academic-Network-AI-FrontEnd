<script lang="ts">
    import { api } from '$lib/api/supervised-pilot';
    let { path }: {path: string} = $props();
    type Candidate = {value: string | number; source: string; eligible: boolean; row_id?: number; match_state?: string; retrieved_at?: string; source_title?: string};
    type Field = {frozen: unknown; status: string; suggested_value: string | number | null; candidates: Candidate[]; issues: {source: string; reason: string}[]};
    type Entry = {name: string; ror: string | null; institution_id: string | null; row_id: number; source_signature: string; source_position: number | null; association: string};
    type Supplement = {available: boolean; created_at?: string; evidence?: {doi: Field; year: Field; affiliations: {status: string; entries: Entry[]; excluded_unlinked_byline_rows: number}; sources: {source: string; attempt_status: string; endpoint: string | null; byline: {name: string; position: number | null; affiliations: {name: string}[]}[]}[]}};
    let result = $state<Supplement | null>(null), error = $state(''), loading = $state(false);
    const statuses: Record<string,string> = {MISSING:'Sin dato recuperable',PRESENT:'Ya presente en el piloto',RECOVERABLE_UNVERIFIED:'Recuperado · requiere verificar la fuente',CONFLICT:'Conflicto · no seleccionar automáticamente'};
    async function load() { loading=true; error=''; try { result=await api<Supplement>(`${path}/recovered-evidence`); } catch(e) {error=e instanceof Error ? e.message : String(e);} finally {loading=false;} }
</script>

<section class="recovery">
    <h3>Información recuperada · revisión posterior</h3>
    <p>Consulta separada de datos ya almacenados. No cambia la evidencia congelada, las predicciones ni tus respuestas. No realiza búsquedas externas.</p>
    {#if !result}<button disabled={loading} onclick={load}>{loading ? 'Comprobando integridad…' : 'Ver información recuperada'}</button>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if result && !result.available}<p>Todavía no hay un suplemento preparado para esta muestra.</p>{/if}
    {#if result?.evidence}
        {@const evidence=result.evidence}
        <small>Versión stored-evidence-review-v1 · extracción local: {result.created_at}</small>
        {#each [['DOI',evidence.doi],['Año',evidence.year]] as pair}
            {@const field=pair[1] as Field}
            <h4>{pair[0] as string}: {statuses[field.status] ?? field.status}</h4>
            <p>Dato congelado: {field.frozen == null ? 'UNKNOWN' : String(field.frozen)}{#if field.suggested_value !== null} · Valor disponible: {field.suggested_value}{/if}</p>
            <ul>{#each field.candidates as item}<li>{item.value} — {item.source}{item.row_id ? ` · registro ${item.row_id}` : ''} · {item.eligible ? 'Admisible para revisión; no verificado manualmente' : `No admisible (${item.match_state || 'sin confirmar'})`}{#if item.source_title}<small>Título de la fuente: {item.source_title}</small>{/if}{#if item.retrieved_at}<small>Recuperado: {item.retrieved_at}</small>{/if}</li>{/each}</ul>
            {#each field.issues as issue}<p role="status">Dato inválido de {issue.source}: {issue.reason}</p>{/each}
        {/each}
        <h4>Afiliaciones de la ocurrencia: {statuses[evidence.affiliations.status]}</h4>
        <ul>{#each evidence.affiliations.entries as item}<li><strong>{item.name}</strong><small>Firma en fuente: {item.source_signature} · posición: {item.source_position ?? 'desconocida'} · registro: {item.row_id}</small><small>Asociación: {item.association} · ROR: {item.ror || 'no disponible'} · ID institucional: {item.institution_id || 'no disponible'}</small></li>{/each}</ul>
        <p>{evidence.affiliations.excluded_unlinked_byline_rows} registros de autoría no vinculados a esta observación: sus afiliaciones no se atribuyen a esta firma.</p>
        {#if evidence.sources.length}<details><summary>Fuentes almacenadas · autorías sin asignar a la firma automáticamente</summary>{#each evidence.sources as source}<h4>{source.source}: {source.attempt_status}</h4><p>{source.endpoint || 'Sin URL registrada'}</p><ul>{#each source.byline as author}<li>{author.position ?? '?'}: {author.name} — {author.affiliations.map(a=>a.name).join('; ') || 'Afiliación desconocida'}</li>{/each}</ul>{/each}</details>{/if}
        <p class="warning">Estos vínculos almacenados requieren verificar su fuente. Afiliación en un artículo, vínculo histórico con UdeC e identidad en el catálogo son cosas diferentes. Otra afiliación no demuestra ausencia de vínculo con UdeC. No se recalcula ninguna clasificación institucional.</p>
    {/if}
</section>

<style>
    .recovery{border:1px solid #a8bbc9;border-left:4px solid #306b77;background:#f5fafb;padding:16px;margin:20px 0;border-radius:6px}h3{font-size:18px;font-weight:650}h4{font-weight:600;margin:16px 0 6px}p,li{font-size:14px;margin:8px 0;overflow-wrap:anywhere}small{display:block;color:#526070;font-size:12px;overflow-wrap:anywhere}button{background:white;border:1px solid #687f90;border-radius:5px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.6}ul{padding-left:18px;list-style:disc}.warning{border-top:1px solid #b9cbd4;padding-top:10px}details{margin-top:14px}summary{cursor:pointer}
</style>
