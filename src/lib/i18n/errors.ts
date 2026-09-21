import * as m from '$lib/paraglide/messages.js';
import type { MessageRef } from '$lib/api/types';

export type MessageParams = Record<string, string | number | boolean | null>;

type MessageFunction = (params?: never) => string;

const errorMessages: Record<string, MessageFunction> = {
	'auth.authentication_required': m.error_authentication_required,
	'auth.invalid_credentials': m.error_invalid_credentials,
	'auth.inactive_user': m.error_inactive_user,
	'project.not_found': m.error_project_not_found,
	'project.access_denied': m.error_project_access_denied,
	'project.limit_reached': m.error_project_limit_reached,
	'workflow.not_started': m.error_workflow_not_started,
	'workflow.not_awaiting_review': m.error_workflow_not_awaiting_review,
	'workflow.review_incomplete': m.error_review_incomplete,
	'validation.no_active_run': m.error_no_active_review,
	'validation.manager_required': m.error_manager_required,
	'import.phase.queued': m.import_phase_queued,
	'import.phase.downloading': m.import_phase_downloading,
	'import.phase.indexing_authors': m.import_phase_indexing_authors,
	'import.phase.saving_authors': m.import_phase_saving_authors,
	'import.phase.saving_works': m.import_phase_saving_works,
	'import.phase.finalizing': m.import_phase_finalizing,
	'import.phase.complete': m.import_phase_complete,
	'import.phase.failed': m.import_phase_failed,
	'import.failed': m.import_failed
};

export class ApiClientError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		public readonly params: MessageParams = {},
		public readonly technicalDetail?: string
	) {
		super(technicalDetail || code);
		this.name = 'ApiClientError';
	}
}

export function translateMessageRef(ref: MessageRef | null | undefined, fallback?: string): string {
	if (!ref?.code) return fallback ?? m.error_unexpected();
	const formatter = errorMessages[ref.code];
	return formatter ? formatter(ref.params as never) : fallback ?? m.error_unexpected();
}

export function userError(value: unknown, fallback: string = m.error_unexpected()): string {
	if (value instanceof ApiClientError) {
		return translateMessageRef({ code: value.code, params: value.params }, fallback);
	}
	return fallback;
}

export function technicalError(value: unknown): string | undefined {
	if (value instanceof ApiClientError) return value.technicalDetail;
	return value instanceof Error ? value.message : undefined;
}
