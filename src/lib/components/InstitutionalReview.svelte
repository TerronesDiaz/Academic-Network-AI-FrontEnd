<script lang="ts">
	import type {CaseDetail, InstitutionLabel} from '$lib/api/supervised-pilot';
	let {detail, busy, save}: {detail: CaseDetail; busy: boolean; save: (label: InstitutionLabel) => void} = $props();
	let status = $state<InstitutionLabel['udec_status'] | ''>('');
	let affiliations = $state(''), period = $state(''), evidence = $state(''), sources = $state('');
	let external = $state(false), confirmed = $state(false);
	let issue = $state<InstitutionLabel['record_issue']>('NONE');
	let unresolved = $derived(detail.annotation?.human_label.kind === 'INSUFFICIENT_EVIDENCE' || issue === 'CORRUPT_RECORD');
	const labels: Record<string,string> = {YES:'Sí — vínculo con UdeC confirmado', NO:'No — sin vínculo con UdeC en ese periodo', UNKNOWN:'No se puede determinar'};
	const issueLabels: Record<string,string> = {NONE:'Sin problema señalado',INCOMPLETE_METADATA:'Metadatos incompletos',CORRUPT_RECORD:'Registro corrupto o inconsistente'};
</script>

<section class="institution" aria-label="Revisión institucional independiente">
	<h3>2. Vínculo con UdeC · independiente del catálogo</h3>
	<p>¿Esta persona tenía vínculo con la Universidad de Colima en la época de esta publicación{detail.query.year ? ` (${detail.query.year})` : ' (año desconocido)'}?</p>
	<p class="help">Estar en el catálogo no prueba pertenencia a UdeC. Otra afiliación tampoco descarta doble afiliación. No extrapoles una afiliación actual a una publicación antigua; si no puedes establecer el vínculo en ese periodo, elige «No se puede determinar».</p>
	{#if detail.institutional_review}
		<div role="status"><strong>Revisión institucional guardada</strong></div>
		<dl><dt>Vínculo UdeC</dt><dd>{labels[detail.institutional_review.label.udec_status]}</dd>
		<dt>Afiliaciones observadas</dt><dd>{detail.institutional_review.label.affiliations || 'No registradas'}</dd>
		<dt>Periodo / fecha de evidencia</dt><dd>{detail.institutional_review.label.period_note || 'Época de esta publicación'}</dd>
		<dt>Justificación</dt><dd>{detail.institutional_review.label.evidence_note}</dd>
		<dt>Fuentes</dt><dd>{detail.institutional_review.label.sources || 'No registradas'}</dd>
		<dt>Investigación fuera del piloto</dt><dd>{detail.institutional_review.label.external_research ? 'Sí' : 'No declarada'}</dd>
		<dt>Calidad del registro</dt><dd>{issueLabels[detail.institutional_review.label.record_issue]}</dd></dl>
		<small>{detail.institutional_review.post_reveal ? 'Revisión posterior a la revelación: no ciega.' : 'Suplemento posterior a la anotación de identidad.'} Guardada: {detail.institutional_review.at}. No modifica la decisión de identidad ni las métricas del ranker.</small>
	{:else}
		<div class="badge">PENDIENTE · segunda revisión {detail.state === 'REVEALED' ? '(ya viste la predicción)' : ''}</div>
		{#if unresolved}<p class="help">La identidad no está resuelta o el registro se marcó corrupto. Sólo puedes registrar vínculo UNKNOWN; no lo convertiremos en «no es de UdeC».</p>{/if}
		<fieldset disabled={busy}><legend>Vínculo institucional en ese periodo</legend>
			{#each ['YES','NO','UNKNOWN'] as option}<label class="radio"><input type="radio" name={`udec-${detail.occurrence_id}`} value={option} bind:group={status} disabled={unresolved && option !== 'UNKNOWN'} onchange={() => confirmed=false} />{labels[option]}</label>{/each}
		</fieldset>
		<label>Afiliaciones que encontraste (opcional)<input bind:value={affiliations} maxlength="4000" placeholder="Ej. Colegio de Postgraduados; doble afiliación, si consta" disabled={busy} /></label>
		<label>Periodo o fecha de la evidencia (opcional)<input bind:value={period} maxlength="4000" placeholder="Ej. afiliación declarada en el artículo de 2024" disabled={busy} /></label>
		<label>Justificación o motivo de incertidumbre (obligatorio)<textarea bind:value={evidence} maxlength="4000" rows="3" disabled={busy}></textarea></label>
		<label class="radio"><input type="checkbox" bind:checked={external} disabled={busy} />Tuve que investigar fuera del piloto para establecer este vínculo.</label>
		<label>Referencia o URL de las fuentes {external ? '(obligatoria al investigar fuera)' : '(opcional)'}<textarea bind:value={sources} maxlength="4000" rows="2" disabled={busy} placeholder="Artículo, página institucional u otra referencia verificable"></textarea></label>
		<label>Calidad de los datos de esta ocurrencia<select bind:value={issue} disabled={busy} onchange={() => {confirmed=false; if (issue === 'CORRUPT_RECORD') status='';}}><option value="NONE">Sin problema señalado</option><option value="INCOMPLETE_METADATA">Faltan metadatos (año, DOI, afiliación…)</option><option value="CORRUPT_RECORD">Registro corrupto o inconsistente</option></select></label>
		<p class="help">Esta información es una anotación humana complementaria. No se añade a los features ni se usa para recalcular predicciones o cambiar el catálogo.</p>
		<label class="radio"><input type="checkbox" bind:checked={confirmed} disabled={busy} />Confirmo esta revisión institucional definitiva; conservará su propio historial.</label>
		<button disabled={busy || !confirmed || !status || (unresolved && status !== 'UNKNOWN') || !evidence.trim() || (external && !sources.trim())} onclick={() => {if (status) save({udec_status:status,affiliations,period_note:period,evidence_note:evidence,sources,external_research:external,record_issue:issue});}}>Guardar sólo vínculo institucional</button>
	{/if}
</section>

<style>
	.institution{border:2px solid #6581b5;background:#f6f9ff;border-radius:8px;padding:18px;margin:20px 0}h3{font-weight:650;font-size:18px;margin-bottom:10px}p{margin:10px 0}.help,small{font-size:13px;color:#4c5d75}.badge{font-size:13px;font-weight:650;margin:12px 0}label{display:block;font-size:14px;margin:12px 0}.radio{display:flex;gap:8px;align-items:start}input:not([type=checkbox]):not([type=radio]),textarea,select{display:block;width:100%;border:1px solid #aab6c5;border-radius:5px;padding:9px;margin:5px 0;background:white}fieldset{border:1px solid #b8c8df;padding:12px;border-radius:6px}legend{font-weight:600;font-size:14px}button{background:#334ca0;color:white;border-radius:6px;padding:10px 14px;cursor:pointer}button:disabled{opacity:.5;cursor:default}dl{display:grid;grid-template-columns:minmax(130px,1fr) 2fr;gap:9px;margin:15px 0;font-size:14px}dt{font-weight:600}dd{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){dl{grid-template-columns:1fr}}
</style>
