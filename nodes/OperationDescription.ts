import type { INodeProperties } from 'n8n-workflow';

export const operationFields: INodeProperties[] = [
	{
		displayName:
			'Powered by <a href="https://foxschema.com" target="_blank">FoxSchema</a> — multi-dialect catalog discovery and SQL tooling. Docs & product: <a href="https://foxschema.com" target="_blank">foxschema.com</a>',
		name: 'foxSchemaBacklink',
		type: 'notice',
		default: '',
	},
	{
		displayName: 'Allow Unsafe SQL',
		name: 'allowUnsafeSql',
		type: 'boolean',
		default: false,
		description:
			'Whether to allow raw SQL expressions, EXISTS subqueries, and SQL-typed bind parameters. Keep disabled unless you trust every workflow editor.',
	},
	// ----------------------------------
	//             shared
	// ----------------------------------
	{
		displayName: 'Table / View',
		name: 'tableId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a table or view...',
				typeOptions: {
					searchListMethod: 'searchTables',
					searchFilterRequired: false,
					searchable: true,
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				placeholder: 'table_or_view',
			},
		],
		displayOptions: {
			show: {
				operation: ['delete', 'get', 'update', 'create'],
			},
		},
		description: 'Table or view to read or modify (from FoxSchema catalog)',
	},
	{
		displayName: 'Procedure',
		name: 'routineId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a procedure...',
				typeOptions: {
					searchListMethod: 'searchProcedures',
					searchFilterRequired: false,
					searchable: true,
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				placeholder: 'procedure_name',
			},
		],
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure'],
			},
		},
		description: 'Stored procedure to call (from FoxSchema catalog)',
	},
	{
		displayName: 'Function',
		name: 'routineId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a function...',
				typeOptions: {
					searchListMethod: 'searchFunctions',
					searchFilterRequired: false,
					searchable: true,
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				placeholder: 'function_name',
			},
		],
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callFunction'],
			},
		},
		description: 'Scalar function to call (from FoxSchema catalog)',
	},
	{
		displayName: 'Parameter Mode',
		name: 'parameterMode',
		type: 'options',
		default: 'form',
		noDataExpression: true,
		options: [
			{
				name: 'Form',
				value: 'form',
				description: 'Set each IN / INOUT value from the catalog list',
			},
			{
				name: 'From Item',
				value: 'fromItem',
				description: 'Read values from the incoming item by parameter name',
			},
			{
				name: 'JSON',
				value: 'json',
				description: 'Pass a JSON object of parameter name → value',
			},
		],
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure', 'callFunction'],
			},
		},
	},
	{
		displayName:
			'OUT parameters are not captured yet. Only set IN / INOUT values. For multiple routines, use separate nodes (or Split in Batches).',
		name: 'routineParamNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure', 'callFunction'],
			},
		},
	},
	{
		displayName: 'Parameters',
		name: 'callParameters',
		placeholder: 'Add Parameter',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Parameter',
		},
		default: {},
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure', 'callFunction'],
				parameterMode: ['form'],
			},
		},
		description: 'Bind IN / INOUT values by catalog parameter name',
		options: [
			{
				name: 'values',
				displayName: 'Parameter',
				values: [
					{
						displayName: 'Name or ID',
						name: 'name',
						type: 'options',
						default: '',
						description: 'Catalog IN / INOUT parameter. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						typeOptions: {
							loadOptionsMethod: 'getParameters',
							loadOptionsDependsOn: ['routineId.value'],
						},
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Bound value (expressions supported)',
					},
				],
			},
		],
	},
	{
		displayName: 'Parameter Overrides',
		name: 'parameterMap',
		placeholder: 'Add Override',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Override',
		},
		default: {},
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure', 'callFunction'],
				parameterMode: ['fromItem'],
			},
		},
		description:
			'Optional overrides. Unlisted IN / INOUT params are read from the incoming item by name (case-insensitive, @-tolerant).',
		options: [
			{
				name: 'values',
				displayName: 'Override',
				values: [
					{
						displayName: 'Name or ID',
						name: 'name',
						type: 'options',
						description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
						default: '',
						typeOptions: {
							loadOptionsMethod: 'getParameters',
							loadOptionsDependsOn: ['routineId.value'],
						},
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},
	{
		displayName: 'Strict Mapping',
		name: 'strictParamMapping',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure', 'callFunction'],
				parameterMode: ['fromItem'],
			},
		},
		description:
			'Whether to fail when an IN / INOUT parameter is missing from the item and has no override. When off, missing values bind as null.',
	},
	{
		displayName: 'Parameters JSON',
		name: 'parametersJson',
		type: 'json',
		default: '{}',
		displayOptions: {
			show: {
				resource: ['routine'],
				operation: ['callProcedure', 'callFunction'],
				parameterMode: ['json'],
			},
		},
		description:
			'Object of parameter name → value, e.g. {"p_price": 100, "p_qty": 10}. Keys are matched case-insensitively.',
	},
	{
		displayName:
			'To call a procedure or function with bound parameters, use Resource → Routine.',
		name: 'executeSqlRoutineNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				resource: ['executeSQL'],
			},
		},
	},
	/* ================= SELECT (GET) ================= */
	{
		displayName: 'Select',
		name: 'select',
		placeholder: 'Add Column',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		displayOptions: {
			show: {
				operation: ['get'],
			},
		},
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Alias',
						name: 'alias',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Column',
						name: 'column',
						type: 'options',
						default: '',
					},
					{
						displayName: 'Distinct',
						name: 'distinct',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Expression',
						name: 'expression',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Function',
						name: 'fn',
						type: 'options',
						options: [
							{ name: 'AVG', value: 'AVG' },
							{ name: 'COUNT', value: 'COUNT' },
							{ name: 'MAX', value: 'MAX' },
							{ name: 'MIN', value: 'MIN' },
							{ name: 'SUM', value: 'SUM' },
						],
						default: 'COUNT',
					},
					{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						options: [
							{
								name: 'Column',
								value: 'column',
							},
							{
								name: 'Aggregate',
								value: 'aggregate',
							},
							{
								name: 'Custom SQL',
								value: 'custom',
							},
					],
						default: 'column',
					},
			],
			},
		],
	},
	{
		displayName: 'Data to Send',
		name: 'dataToSend',
		type: 'options',
		options: [		
			{
				name: 'Define Below for Each Column',
				value: 'defineBelow',
				description: 'Set the value for each destination column',
			},
		],
		displayOptions: {
			show: {
				operation: ['create', 'update'],
			},
		},
		default: 'defineBelow',
		description: 'Whether to insert the input data this node receives in the new row',
	},
	{
	displayName: 'Columns to Set',
	name: 'columnUI',
	placeholder: 'Add Row',
	type: 'fixedCollection',
	typeOptions: {
		multipleValues: true,
	},
	displayOptions: {
		show: {
			operation: ['create', 'update'],
		},
	},
	default: {},
	options: [
		{
			name: 'items',
			displayName: 'Row',
			values: [
				{
					displayName: 'Columns',
					name: 'columns',
					type: 'fixedCollection',
					typeOptions: {
						multipleValues: true,
						multipleValueButtonText: 'Add Field',
					},
					default: {},
					options: [
						{
							name: 'fields',
							displayName: 'Field',
							values: [
								{
									displayName: 'Mode',
									name: 'mode',
									type: 'options',
									options: [
										{ name: 'Column', value: 'column' },
										{ name: 'Custom SQL Field', value: 'expression' },
									],
									default: 'column',
								},
								/* COLUMN MODE */
								{
									displayName: 'Column Name of Table Name or ID',
									name: 'columnId',
									type: 'options',
									description: 'Choose DB column. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
									typeOptions: {
										loadOptionsMethod: 'getColumns',
										loadOptionsDependsOn: ['tableId.value'],
									},
									default: '',
									displayOptions: { show: { mode: ['column'] } },
								},
								/* VALUE */
								{
									displayName: 'Type Value',
									name: 'columnValue',
									type: 'string',
									default: '',
									typeOptions: {
										sqlDialect: 'StandardSQL',
										editor: 'sqlEditor',
										rows: 1,
									},
									placeholder: `Value, or CURRENT_TIMESTAMP / CURRENT_DATE / CURRENT_TIME`,
									displayOptions: { show: { mode: ['column'] } },
								},
								/* CUSTOM EXPRESSION */
								{
									displayName: 'SQL Expression',
									name: 'sqlExpression',
									type: 'string',
									typeOptions: {
										sqlDialect: 'StandardSQL',
										editor: 'sqlEditor',
										rows: 2,
									},
									default: '',
									placeholder: `"COL" = CURRENT_TIMESTAMP`,
									displayOptions: {
										show: {
											mode: ['expression'],
											'/allowUnsafeSql': [true],
										},
									},
								},
							],
						},
					],
				},				
			],
		},
	],
	},	
	/* ================= CONDITIONS ================= */
	{
	displayName: 'Where Conditions',
	name: 'additionalConditions',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	displayOptions: {
		show: {
			operation: ['get','update','delete'],
		},
	},
	options: [
		{
			name: 'groups',
			displayName: 'Condition Group',
			values: [
				/* AND / OR between filters inside this group */
				{
					displayName: 'Logical Operators',
					name: 'filterType',
					type: 'options',
					options: [
						{ name: 'AND', value: 'AND' },
						{ name: 'OR', value: 'OR' },
					],
					default: 'AND',
				},
				/* GROUP FILTERS */
				{
					displayName: 'Operators',
					name: 'filters',
					type: 'fixedCollection',
					typeOptions: { multipleValues: true },
					default: {},
					options: [
						{
							name: 'fields',
							displayName: 'Filter',
							values: [
						{
							displayName: 'Column',
							name: 'field',
							type: 'options',
							default: '',
						},
						{
							displayName: 'EXISTS	/	NOT EXISTS SQL Expression',
							name: 'existsQuery',
							type: 'string',
							default: '',
							placeholder: 'SELECT 1 FROM X WHERE X.ID	=	MAIN.ID',
						},
						{
							displayName: 'Mode',
							name: 'mode',
							type: 'options',
							options: [
								{ name: 'Between', value: 'between' },
								{ name: 'Columns From Table', value: 'column' },
								{ name: 'Exists', value: 'exists' },
								{ name: 'IN (Values)', value: 'column_in' },
								{ name: 'Not Between', value: 'not_between' },
								{ name: 'Not Exists', value: 'not_exists' },
								{ name: 'NOT IN (Values)', value: 'column_not_in' },
								{ name: 'SQL Expression', value: 'expression' },
							],
							default: 'column',
						},
						{
							displayName: 'Operator',
							name: 'operator',
							type: 'options',
							options: [
								{ name: '!=', value: 'not_equal' },
								{ name: '<', value: 'less' },
								{ name: '<=', value: 'less_equal' },
								{ name: '=', value: 'equal' },
								{ name: '>', value: 'greater' },
								{ name: '>=', value: 'greater_equal' },
								{ name: 'Contains', value: 'contains' },
								{ name: 'Is Not Null', value: 'is_not_null' },
								{ name: 'Is Null', value: 'is_null' },
								{ name: 'Like', value: 'like' },
								{ name: 'Not Like', value: 'not_like' },
							],
							default: 'equal',
						},
						{
							displayName: 'SQL Expression',
							name: 'expression',
							type: 'string',
							default: '',
							placeholder: '\'AGE\' >	18 AND \'STATUS\' = \'A\'',
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'string',
							default: '',
						},
						{
							displayName: 'Values (Comma-Separated)',
							name: 'values',
							type: 'string',
							placeholder: 'A,B,C',
							default: '',
						},
						],
						},
					],
				},
			],
		},
		],
	},	
	/* ================= GROUP / HAVING / ORDER ================= */
	{
	displayName: 'Group By',
	name: 'groupBy',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	displayOptions: {
		show: {
			operation: ['get'],
		},
	},
	options: [
		{
			name: 'items',
			displayName: 'Group Field',
			values: [
				{
					displayName: 'Mode',
					name: 'mode',
					type: 'options',
					options: [
						{ name: 'Column', value: 'column' },
						{ name: 'SQL Expression', value: 'expression' },
					],
					default: 'column',
				},

				/* COLUMN */
				{
					displayName: 'Column Name or ID',
					name: 'column',
					type: 'options',
					description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					typeOptions: {
						loadOptionsMethod: 'getColumns',
						loadOptionsDependsOn: ['tableId'],
					},
					default: '',
					displayOptions: {
						show: {
							mode: ['column'],
						},
					},
				},

				/* EXPRESSION */
				{
					displayName: 'Expression',
					name: 'expression',
					type: 'string',				
					typeOptions: {
						sqlDialect: 'StandardSQL',
						editor: 'sqlEditor',
						rows: 3,
					},
					default: '',
					placeholder: 'YEAR(order_date) or CAST(col AS INT)',
					displayOptions: {
						show: {
							mode: ['expression'],
							'/allowUnsafeSql': [true],
						},
					},
				},
			],
		},
	],
	},
	{
		displayName: 'Row Limit',
		name: 'rowLimit',
		type: 'number',
		typeOptions: {
			minValue: 1,
			maxValue: 100000,
		},
		default: 1000,
		description: 'Maximum rows to return (FETCH FIRST n ROWS ONLY)',
		displayOptions: {
			show: {
				operation: ['get'],
			},
		},
	},
	// ================= HAVING CONDITIONS ================= */
	{
	displayName: 'Having Conditions',
	name: 'having',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	displayOptions: {
		show: {
			operation: ['get'],
		},
	},
	options: [
		{
			name: 'fields',
			displayName: 'Having Filter',
			values: [
				{
					displayName: 'Field',
					name: 'field',
					type: 'options',
					default: '',
				},
				{
					displayName: 'Function',
					name: 'fn',
					type: 'options',
					options: [
						{ name: 'AVG', value: 'AVG' },
						{ name: 'COUNT', value: 'COUNT' },
						{ name: 'MAX', value: 'MAX' },
						{ name: 'MIN', value: 'MIN' },
						{ name: 'SUM', value: 'SUM' },
					],
					default: 'COUNT',
				},
				{
					displayName: 'Mode',
					name: 'mode',
					type: 'options',
					options: [
						{
							name: 'Aggregate',
							value: 'aggregate',
						},
						{
							name: 'Expression SQL',
							value: 'expression',
						},
						],
					default: 'aggregate',
				},
				{
					displayName: 'Operator',
					name: 'operator',
					type: 'options',
					options: [
						{ name: '!=', value: 'not_equal' },
						{ name: '<', value: 'less' },
						{ name: '<=', value: 'less_equal' },
						{ name: '=', value: 'equal' },
						{ name: '>', value: 'greater' },
						{ name: '>=', value: 'greater_equal' },
					],
					default: 'equal',
				},
				{
					displayName: 'SQL Expression',
					name: 'expression',
					type: 'string',
					default: '',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
				},
			],
		},
	],
	},
	{
	displayName: 'Order By',
	name: 'orderBy',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	displayOptions: {
		show: {
			operation: ['get'],
		},
	},
	options: [
		{
			name: 'fields',
			displayName: 'Order Rule',
			values: [
				{
					displayName: 'Mode',
					name: 'mode',
					type: 'options',
					options: [
						{ name: 'Column', value: 'column' },
						{ name: 'Expression SQL', value: 'expression' },
					],
					default: 'column',
				},
				{
					displayName: 'Column Name or ID',
					name: 'column',
					type: 'options',
					description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					typeOptions: {
						loadOptionsMethod: 'getColumns',
						loadOptionsDependsOn: ['tableId'],
					},
					default: '',
					displayOptions: { show: { mode: ['column'] } },
				},
				{
					displayName: 'SQL Expression',
					name: 'expression',
					type: 'string',
					typeOptions: {
						sqlDialect: 'StandardSQL',
						editor: 'sqlEditor',
						rows: 3,
					},
					default: '',
					displayOptions: {
						show: {
							mode: ['expression'],
							'/allowUnsafeSql': [true],
						},
					},
				},
				{
					displayName: 'Direction',
					name: 'direction',
					type: 'options',
					options: [
						{ name: 'ASC', value: 'ASC' },
						{ name: 'DESC', value: 'DESC' },
					],
					default: 'ASC',
				},
			],
		},
	],
	},
	/* ============================ EXECUTE SQL ============================ */
	{
		displayName: 'Use Transaction',
		name: 'useTransaction',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: { resource: ['executeSQL'] },
		},
	},
	{
		displayName: 'Stop On Error',
		name: 'stopOnError',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: { resource: ['executeSQL'] },
		},
	},
	{
		displayName: 'Preview Query',
		name: 'dryRun',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: { resource: ['executeSQL'] },
		},
	},
	{
		displayName: 'Outputs',
		name: 'returnMode',
		type: 'options',
		default: 'all',
		options: [
			{ name: 'All Queries', value: 'all' },
			{ name: 'Last Query Only', value: 'last' },
			{ name: 'Only Specific Output', value: 'specific' },
		],
		displayOptions: {
			show: { resource: ['executeSQL'] },
		},
	},
	{
		displayName: 'Specific Output Index',
		name: 'returnOutput',
		type: 'number',
		default: 0,
		displayOptions: {
			show: { returnMode: ['specific'] },
		},
	},
	{
		displayName: 'Execute SQL',
		name: 'queries',
		type: 'fixedCollection',
		default: {},
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Query',
		},
		displayOptions: {
			show: { resource: ['executeSQL'] },
		},
		options: [
			{
				displayName: 'Query',
				name: 'query',
				values: [
					{
						displayName: 'SQL',
						name: 'sql',
						type: 'string',
						required: true,
						default: '',
						typeOptions: {
							editor: 'sqlEditor',
							sqlDialect: 'StandardSQL',
							rows: 4,
						},
					},
					/* ========================== PARAMETERS ========================== */
			{
				displayName: 'Parameters',
				name: 'binding',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
					multipleValueButtonText: 'Add Parameter',
				},
				default: {},
				options: [
					{
						displayName: 'Parameter',
						name: 'parameterValues',
						values: [
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								default: 'string',
								options: [
									{ name: 'Boolean', value: 'boolean' },
									{ name: 'Date', value: 'date' },
									{ name: 'Null', value: 'null' },
									{ name: 'Number', value: 'number' },
									{ name: 'SQL Expression', value: 'sql' },
									{ name: 'String', value: 'string' },
								],
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'Parameter value (mapped sequentially to ? placeholders)',
							},
						],
					},
				],
			},
					/* ======================== (transform removed: arbitrary JS was unsafe) ======================== */
				],
			},
		],
	},
];