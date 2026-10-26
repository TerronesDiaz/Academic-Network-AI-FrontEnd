<script lang="ts">
	import { onMount } from 'svelte';
	import { api, login, logout, loggedIn, type CaseRow, type CaseDetail, type Metrics, type InstitutionLabel, type InstitutionSummary } from '$lib/api/supervised-pilot';
	import InstitutionalReview from '$lib/components/InstitutionalReview.svelte';
	import RecoveredEvidence from '$lib/components/RecoveredEvidence.svelte';
	let authenticated = $state(false), busy = $state(false), error = $state('');
	let username = $state(''), password = $state('');
	let runs = $state<{run_id: string; cases: number}[]>([]), run = $state('');
	let rows = $state<CaseRow[]>([]), detail = $state<CaseDetail | null>(null), metrics = $state<Metrics | null>(null);
	let query = $state(''), results = $state<{author_id: string; name: string; directory_affiliation: string | null}[]>([]), totalFound = $state(0);
	let kind = $state(''), author = $state(''), selectedName = $state(''), note = $state(''), confirmed = $state(false);
	let evidenceAuthor = $state('');
	let institutions = $state<InstitutionSummary | null>(null);
	const identityLabels: Record<string,string> = {EXISTING:'En el catálogo',EXTERNAL:'Fuera del catálogo',INSUFFICIENT_EVIDENCE:'Identidad no determinada / evidencia insuficiente'};
	const percent = (v: number | null) => v === null ? 'Sin etiquetas' : `${(v * 100).toFixed(1)}%`;
	const prefix = () => `/runs/${encodeURIComponent(run)}`;
	const casePath = () => `${prefix()}/cases/${encodeURIComponent(detail!.occurrence_id)}`;
	async function safely(action: () => Promise<void>) { busy = true; error = ''; try { await action(); } catch(e) { error = e instanceof Error ? e.message : String(e); if (!loggedIn()) {authenticated=false; detail=null; rows=[]; metrics=null; institutions=null;} } finally { busy = false; } }
	async function load() { runs = await api('/runs'); if (!run && runs.length) run = runs[0].run_id; if (run) await refresh(); }
	async function refresh() { rows = await api(`${prefix()}/cases`); metrics = await api(`${prefix()}/metrics`); institutions = await api(`${prefix()}/institutional-summary`); }
	async function openCase(oid: string) {
		detail = await api(`${prefix()}/cases/${encodeURIComponent(oid)}`);
		kind = ''; author = ''; selectedName = ''; note = ''; confirmed = false; query = ''; results = []; totalFound = 0; evidenceAuthor = '';
	}
	async function signIn() { await login(username,password); password = ''; authenticated = true; await load(); }
	async function search() { const data = await api<{results: typeof results; total: number}>(`${casePath()}/search?q=${encodeURIComponent(query)}`); results = data.results; totalFound = data.total; }
	function choose(id: string, name: string) { kind = 'EXISTING'; author = id; selectedName = name; confirmed = false; }
	async function save() { await api(`${casePath()}/annotation`,{kind,author_id: kind === 'EXISTING' ? author : null,note}); await openCase(detail!.occurrence_id); await refresh(); }
	async function reveal() { await api(`${casePath()}/reveal`,{}); await openCase(detail!.occurrence_id); await refresh(); }
	async function saveInstitution(label: InstitutionLabel) { const oid=detail!.occurrence_id; await api(`${casePath()}/institutional-annotation`,label); await openCase(oid); await refresh(); }
	onMount(() => { authenticated = loggedIn(); if (authenticated) void safely(load); });
</script>

<svelte:head><title>Supervised Ranker Pilot · AcademicNetwork</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<div class="pilot">
	<header><div><p class="eyebrow">AcademicNetwork · Evaluación experimental UdeC</p><h1>Supervised Ranker Pilot</h1></div>{#if authenticated}<button onclick={() => {logout(); authenticated=false; detail=null; rows=[]; metrics=null;}}>Cerrar sesión piloto</button>{/if}</header>
	<div class="notice">E6-minus-onomastic congelado · Sólo 20 casos · Revisor único, no Gold Standard formal. Ninguna revisión modifica identidades ni decisiones productivas.</div>
	{#if error}<div class="error" role="alert">{error}</div>{/if}
	{#if !authenticated}
		<form class="panel login" onsubmit={(e) => {e.preventDefault(); void safely(signIn);}}>
			<h2>Entrar al piloto aislado</h2><p>Usa tu cuenta local de AcademicNetwork autorizada para esta muestra. La sesión del piloto es independiente.</p>
			<label>Usuario<input autocomplete="username" bind:value={username} required /></label>
			<label>Contraseña<input type="password" autocomplete="current-password" bind:value={password} required /></label>
			<button class="primary" disabled={busy}>Entrar</button>
		</form>
	{:else}
		<div class="toolbar"><label>Muestra<select bind:value={run} disabled={busy} onchange={() => safely(async () => {detail=null; await refresh();})}>{#each runs as r}<option value={r.run_id}>{r.run_id} · {r.cases} ocurrencias</option>{/each}</select></label><span>Identidad: {metrics?.reviewed ?? 0}/{rows.length} · Vínculo UdeC: {institutions?.reviewed ?? 0}/{rows.length}</span></div>
		<div class="notice">Segunda revisión habilitada: conserva tu selección original del catálogo y completa el vínculo con UdeC por separado. No hay que repetir la revisión de identidad.</div>
		<div class="workspace">
			<aside class="panel cases"><h2>Casos</h2><p class="muted">Orden de muestreo, independiente del modelo.</p>{#each rows as row, index}<button class:active={detail?.occurrence_id === row.occurrence_id} disabled={busy} onclick={() => safely(() => openCase(row.occurrence_id))}><span>{index+1}. {row.signature}</span><small>Identidad: {row.state} · UdeC: {row.institutional_state === 'REVIEWED' ? 'GUARDADO' : 'PENDIENTE'}</small></button>{/each}</aside>
			<section class="panel detail" aria-busy={busy}>
				{#if !detail}<h2>Selecciona una ocurrencia</h2><p>La predicción ya existe y está congelada. No se enviará al navegador hasta guardar la revisión y pulsar “Revelar”.</p>
				{:else}
					<div class="tag">{detail.state}</div><h2>{detail.occurrence.raw_signature}</h2><h3>{detail.query.title || 'Título no disponible'}</h3>
					<p>{detail.query.year ?? 'Año UNKNOWN'} · {detail.query.venue || 'Revista UNKNOWN'}</p>
					<dl><dt>Posición original (base 0)</dt><dd>{detail.occurrence.author_position ?? 'Ausente; ID inmutable de fuente'}</dd><dt>Publicación</dt><dd>{detail.query.publication.canonical_id}</dd><dt>DOI</dt><dd>{detail.query.publication.doi || 'UNKNOWN'}</dd><dt>Afiliaciones de la firma</dt><dd>{detail.query.affiliations.map(a => a.institution).filter(Boolean).join('; ') || 'UNKNOWN'}</dd></dl>
					<details open><summary>Firmas y posiciones de la publicación</summary><ul>{#each detail.byline as entry}<li>{entry.position ?? '?'}: {entry.names.join(' / ')}</li>{/each}</ul>{#if !detail.query.coauthors_known}<p class="muted">Coautores UNKNOWN para features: no se pudo establecer una lista posicional inequívoca.</p>{/if}</details>
					<p class="notice">Evidencia congelada del catálogo y fuentes ya almacenadas. Historia bibliográfica limitada a años anteriores y hasta 20 obras por perfil. La disponibilidad histórica se aproxima por año; no se consultan fuentes en vivo. Afiliación institucional no prueba identidad.</p>
					<details><summary>Perfiles recuperados · orden alfabético, sin scores</summary><label>Consultar evidencia<select bind:value={evidenceAuthor}><option value="">Selecciona un perfil</option>{#each detail.candidates as c}<option value={c.author_id}>{c.name} · {c.author_id}</option>{/each}</select></label>
					{#each detail.candidates.filter(c => c.author_id === evidenceAuthor) as c}<h3>{c.name}</h3>{#if detail.state === 'PENDING_REVIEW'}<button disabled={busy} onclick={() => choose(c.author_id,c.name)}>Seleccionar como autor humano</button>{/if}<ul>{#each c.papers as paper}<li><strong>{paper.title || 'Sin título'}</strong> ({paper.year ?? '?'}) · {paper.venue || 'Sin revista'}<small>Fuente: {paper.publication.canonical_id} · DOI: {paper.publication.doi || 'UNKNOWN'}</small><small>Coautores: {paper.coauthors_known ? paper.coauthors.map(a => a.raw_name).join('; ') || 'Lista vacía declarada' : 'UNKNOWN'}</small></li>{/each}</ul>{#if !c.papers.length}<p>Sin historia bibliográfica elegible.</p>{/if}{/each}</details>
					{#if detail.state === 'PENDING_REVIEW'}
						<h3>Tu decisión, antes de conocer el ranking</h3><form class="search" onsubmit={(e) => {e.preventDefault(); void safely(search);}}><label>Buscar en todo el directorio congelado<input bind:value={query} minlength="2" maxlength="120" placeholder="Nombre o apellidos" /></label><button disabled={busy || query.trim().length<2}>Buscar</button></form>
						{#if totalFound}<p>{totalFound} coincidencias; se muestran hasta 50. La búsqueda no cambia candidatos ni predicciones.</p>{/if}
						<ul class="search-results">{#each results as r}<li><button disabled={busy} onclick={() => choose(r.author_id,r.name)}>{r.name} · {r.author_id}</button><small>{r.directory_affiliation || 'Sin afiliación actual registrada'} · No prueba autoría</small></li>{/each}</ul>
						<div class="choices"><button class:active={kind === 'EXISTING'} disabled={!author || busy} onclick={() => {kind='EXISTING'; confirmed=false;}}>EXISTING {selectedName ? `· ${selectedName}` : '· selecciona un autor'}</button><button class:active={kind === 'EXTERNAL'} disabled={busy} onclick={() => {kind='EXTERNAL'; confirmed=false;}}>Persona externa al directorio</button><button class:active={kind === 'INSUFFICIENT_EVIDENCE'} disabled={busy} onclick={() => {kind='INSUFFICIENT_EVIDENCE'; confirmed=false;}}>Evidencia insuficiente</button></div>
						<label>Justificación humana<textarea bind:value={note} maxlength="4000" rows="3"></textarea></label>
						<label class="confirm"><input type="checkbox" bind:checked={confirmed} /> Confirmo mi decisión definitiva. No podré editarla después de guardarla.</label>
						<button class="primary" disabled={busy || !confirmed || !kind || (kind === 'EXISTING' && !author)} onclick={() => safely(save)}>Guardar revisión definitiva</button>
					{:else}
						<h3>1. Identidad y catálogo · revisión original conservada</h3><p>{identityLabels[detail.annotation?.human_label.kind || '']} · {detail.annotation?.human_label.author_id || 'Sin identidad seleccionada'}</p><p>{detail.annotation?.human_label.note}</p><p class="muted">«En el catálogo» no significa «pertenece a UdeC». «Fuera del catálogo» no significa «no pertenece a UdeC».</p>
						{#if detail.state === 'REVIEWED'}<button class="primary" disabled={busy} onclick={() => safely(reveal)}>Revelar predicción y comparar</button>{/if}
					{/if}
					{#if detail.annotation}{#key detail.occurrence_id}<InstitutionalReview {detail} {busy} save={(label) => {void safely(() => saveInstitution(label));}} />{/key}{/if}
					{#if detail.annotation}{#key `${run}:${detail.occurrence_id}`}<RecoveredEvidence path={casePath()} />{/key}{/if}
					{#if detail.comparison}<section class="comparison"><h3>Comparación posterior a la revisión</h3><p>Top1: {detail.comparison.top5[0]?.name || 'Pool vacío; sin asignación'}</p><p>Posición del autor humano: {detail.comparison.human_rank ?? 'No aplica / ausente'} · {detail.comparison.candidate_status}</p><p>{detail.comparison.correct === null ? 'Categoría descriptiva, excluida de accuracy' : detail.comparison.correct ? 'Correcto' : `Incorrecto · ${detail.comparison.error_type}`}</p><table><thead><tr><th>Top5</th><th>Score no calibrado</th></tr></thead><tbody>{#each detail.comparison.top5 as r,i}<tr><td>{i+1}. {r.name}</td><td>{r.score.toFixed(6)}</td></tr>{/each}</tbody></table><small>Predicción: {detail.comparison.prediction_timestamp}<br />Anotación: {detail.comparison.annotation_timestamp}</small><details><summary>Features del top1 y autor humano · UNKNOWN explícito</summary>{#each Object.entries(detail.comparison.features) as [id,values]}<h4>Autor {id}</h4><table><tbody>{#each Object.entries(values) as [name,value]}<tr><td>{name}</td><td>{value === null ? 'UNKNOWN' : value.toFixed(5)}</td></tr>{/each}</tbody></table>{/each}</details><p class="muted">Los valores de features no son explicaciones causales. El modelo no decide NIL.</p></section>{/if}
					<details><summary>Auditoría de ocurrencia</summary><code>{detail.occurrence_id}</code><p>SHA evidencia: <code>{detail.evidence_hash}</code></p></details>
				{/if}
			</section>
		</div>
		{#if institutions}<section class="panel"><h2>Catálogo × vínculo UdeC · anotaciones humanas independientes</h2><p>{institutions.reviewed}/{institutions.total} completadas · {institutions.pending} pendientes · {institutions.post_reveal} posteriores a la revelación</p><table><thead><tr><th>Identidad / catálogo</th><th>UdeC: sí</th><th>UdeC: no</th><th>Desconocido</th></tr></thead><tbody>{#each Object.entries(institutions.catalog_by_udec) as [kind,counts]}<tr><td>{identityLabels[kind]}</td><td>{counts.YES}</td><td>{counts.NO}</td><td>{counts.UNKNOWN}</td></tr>{/each}</tbody></table><p>{institutions.external_research} con investigación externa declarada · {institutions.record_issues.INCOMPLETE_METADATA} con metadatos incompletos · {institutions.record_issues.CORRUPT_RECORD} registros corruptos</p><p class="muted">No es una métrica del ranker ni una atribución automática de producción UdeC. Pendiente es distinto de UNKNOWN. Las métricas de identidad de abajo siguen usando las anotaciones originales.</p></section>{/if}
		{#if metrics}<section class="panel"><h2>Resultado exploratorio · sólo revisiones reveladas</h2><p>{metrics.EXISTING} EXISTING · {metrics.external_descriptive.length} EXTERNAL · {metrics.insufficient.numerator} INSUFFICIENT_EVIDENCE ({percent(metrics.insufficient.value)})</p><table><thead><tr><th>Métrica EXISTING</th><th>Valor</th><th>Numerador / denominador</th></tr></thead><tbody>{#each [['Pool recall',metrics.candidate_pool_recall],['Top1 accuracy / R@1',metrics['R@1']],['R@3',metrics['R@3']],['R@5',metrics['R@5']],['MRR',metrics.MRR]] as entry}<tr><td>{entry[0]}</td><td>{typeof entry[1] !== 'string' ? percent(entry[1].value) : ''}</td><td>{typeof entry[1] !== 'string' ? `${entry[1].numerator.toFixed(3)} / ${entry[1].denominator}` : ''}</td></tr>{/each}</tbody></table><p>Errores retrieval: {metrics.candidate_generation_errors} · Errores ranking: {metrics.ranking_errors}</p><p class="muted">EXTERNAL es descriptivo; no accuracy NIL. Evidencia insuficiente se excluye de accuracy. Sin etiquetas humanas no hay estimación de calidad.</p></section>{/if}
	{/if}
</div>

<style>
	.pilot{max-width:1450px;margin:auto;padding:24px;font-family:system-ui,sans-serif}header,.toolbar{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:20px}h1{font-size:27px;font-weight:700}h2{font-size:21px;font-weight:650;margin:10px 0}h3{font-size:17px;font-weight:650;margin:18px 0 8px}.eyebrow,.muted,small{color:#526070;font-size:13px}small{display:block;margin:4px 0}.notice{background:#edf3fa;border-left:3px solid #5376a7;padding:12px 16px;font-size:14px;margin:14px 0}.error{background:#fee2e2;padding:14px}.panel{background:white;border:1px solid #dce2eb;border-radius:10px;padding:20px;margin:18px 0}.workspace{display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px}.cases{align-self:start;max-height:950px;overflow:auto}.cases button{display:block;width:100%;text-align:left;margin:7px 0}.active{background:#e8edff!important;border-color:#667aca!important}.login{max-width:440px;margin:40px auto}label{display:block;font-size:14px;margin:12px 0}input:not([type=checkbox]),select,textarea{display:block;width:100%;border:1px solid #aab6c5;border-radius:5px;padding:9px;margin:5px 0;background:#fff}button{border:1px solid #aab6c5;border-radius:6px;padding:9px 12px;background:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:#334ca0;color:white;border-color:#334ca0}.tag{font-size:12px;color:#465884;font-weight:700}.choices{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.search{display:flex;gap:10px;align-items:center}.search label{flex:1}.confirm{display:flex;gap:10px;align-items:center}details{border:1px solid #e0e5ed;padding:12px;margin:14px 0;border-radius:6px}summary{cursor:pointer;font-weight:600}ul{padding-left:18px}li{margin:9px 0}dl{display:grid;grid-template-columns:190px 1fr;font-size:14px;gap:7px}dt{color:#526070}dd{overflow-wrap:anywhere}code{font-size:11px;overflow-wrap:anywhere}table{width:100%;font-size:13px;margin:12px 0;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #e3e8ef;padding:8px;overflow-wrap:anywhere}.comparison{border-top:2px solid #677db4;margin-top:22px}.search-results{max-height:250px;overflow:auto}@media(max-width:850px){.workspace{grid-template-columns:1fr}.cases{max-height:230px}.pilot{padding:12px}header,.toolbar{align-items:start;flex-direction:column}dl{grid-template-columns:1fr}table{font-size:11px}}
</style>
