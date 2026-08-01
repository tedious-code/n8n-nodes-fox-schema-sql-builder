import { INodeType } from 'n8n-workflow';
import { FoxSchemaSqlBuilder } from './nodes/FoxSchemaSqlBuilder.node';

export const nodeTypes: INodeType[] = [new FoxSchemaSqlBuilder()];
