// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { format } from 'prettier';
import { normalizeMethodName } from './generate';
import { OpenRpcMethod, OpenRpcSpec } from './open-rpc';
/** @ts-ignore */
import prettierConfig from '../../../prettier.config.js';

const header = `
// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 *  ######################################
 *  ### DO NOT EDIT THIS FILE DIRECTLY ###
 *  ######################################
 *
 * This file is generated from:
 * /crates/sui-open-rpc/spec/openrpc.json
 */
`.trim();

const queryHookTemplate = /* typescript */ `
${header}

import type { $_METHOD_TYPE_NAME_Params } from '@mysten/sui.js/client';
import type { UseSuiClientQueryOptions } from '../useSuiClientQuery.js';
import { useSuiClientQuery } from '../useSuiClientQuery.js';

export function $_HOOK_NAME_(
	$_PARAMS_ARG_,
	options?: UseSuiClientQueryOptions<'$_METHOD_NAME_'>,
) {
	return useSuiClientQuery(
		{
			method: '$_METHOD_NAME_',
			params,
		},
		options,
	);
}
`.trim();

const mutationHookTemplate = /* typescript */ `
${header}

import type { $_METHOD_TYPE_NAME_Params } from '@mysten/sui.js/client';
import type { UseSuiClientMutationOptions } from '../useSuiClientMutation.js';
import { useSuiClientMutation } from '../useSuiClientMutation.js';

export function $_HOOK_NAME_(
	$_PARAMS_ARG_,
	options?: UseSuiClientMutationOptions<'$_METHOD_NAME_'>,
) {
	return useSuiClientMutation(
		{
			method: '$_METHOD_NAME_',
			params,
		},
		options,
	);
}
`.trim();

const dappKitRoot = path.resolve(import.meta.url.slice(5), '../../../dapp-kit');
const openRpcSpec: OpenRpcSpec = JSON.parse(
	await fs.readFile(
		path.resolve(dappKitRoot, '../../crates/sui-open-rpc/spec/openrpc.json'),
		'utf-8',
	),
);

export async function generateHooks() {
	const hooks = await Promise.all(
		openRpcSpec.methods
			.filter((method) => {
				return (
					!method.name.includes('unsafe') &&
					!method.name.includes('subscribe') &&
					method.name !== 'sui_tryMultiGetPastObjects' &&
					method.name !== 'sui_getLoadedChildObjects' &&
					method.name !== 'sui_getEvents'
				);
			})
			.map(generateHook),
	);

	await fs.writeFile(
		path.resolve(dappKitRoot, './src/hooks/rpc/index.ts'),
		await format(`${header}\n\n${hooks.map((hook) => `export * from './${hook}.js'`).join('\n')}`, {
			parser: 'typescript',
			...prettierConfig,
		}),
	);
}

async function generateHook(method: OpenRpcMethod) {
	const methodTypeName = normalizeMethodName(method.name);
	const methodName = methodTypeName[0].toLocaleLowerCase() + methodTypeName.slice(1);
	const hookName = `use${methodTypeName
		.replace(/^get|multiGet|tryGet/i, '')
		.replace(/^query(.*)/i, '$1Query')}`;
	const hasRequiredParams = method.params.some((param) => param.required);
	const isMutation = method.tags?.some((tag) => tag.name === 'Write API');

	const source = (isMutation ? mutationHookTemplate : queryHookTemplate)
		.replace(/\$_METHOD_NAME_/g, methodName)
		.replace(/\$_METHOD_TYPE_NAME_/g, methodTypeName)
		.replace(/\$_HOOK_NAME_/g, hookName)
		.replace(
			/\$_PARAMS_ARG_/g,
			hasRequiredParams
				? `params: ${methodTypeName}Params`
				: `params: ${methodTypeName}Params = {}`,
		);

	await fs.writeFile(
		path.resolve(dappKitRoot, `./src/hooks/rpc/${hookName}.ts`),
		await format(source, {
			parser: 'typescript',
			...prettierConfig,
		}),
	);

	return hookName;
}
