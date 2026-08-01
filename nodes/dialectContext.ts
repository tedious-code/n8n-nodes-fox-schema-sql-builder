import type { SupportedDialect } from './supportedDialects';

let activeDialect: SupportedDialect = 'postgres';

export function setActiveDialect(dialect: SupportedDialect): void {
	activeDialect = dialect;
}

export function getActiveDialect(): SupportedDialect {
	return activeDialect;
}
