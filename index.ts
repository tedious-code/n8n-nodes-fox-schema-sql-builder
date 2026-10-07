import { INodeType } from 'n8n-workflow';
import { FoxSchemaSqlBuilder } from './nodes/FoxSchemaSqlBuilder/FoxSchemaSqlBuilder.node';

export const nodeTypes: INodeType[] = [new FoxSchemaSqlBuilder()];
