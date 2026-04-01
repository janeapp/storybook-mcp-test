import * as p from '@clack/prompts';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { styleText } from 'node:util';
import { generatePrompt } from './generate-prompt.ts';
import { generateSystemPrompt } from './generate-system-prompt.ts';
import { prepareTrial } from './prepare-trial.ts';
import { teardownTrial } from './teardown-trial.ts';
import { grade } from './graders/grade.ts';
import { save } from './save/save.ts';
import type {
	Context,
	GradingSummary,
	ExecutionSummary,
	TrialArgs,
	SupportedModel,
} from '../types.ts';
import { agents } from '../config.ts';

export type RunTaskParams = {
	taskName: string;
	context: Context;
	agent: keyof typeof agents;
	model: SupportedModel;
	systemPrompts: string[];
	uploadId: string | false;
	verbose?: boolean;
	storybook?: boolean;
	runId?: string;
	variantLabel?: string;
	quiet?: boolean;
	label?: string;
};

export type RunTaskResult = {
	trialArgs: TrialArgs;
	executionSummary: ExecutionSummary;
	gradingSummary: GradingSummary;
	chromaticUrl?: string;
};

export async function runTask({
	taskName,
	context,
	agent: agentKey,
	model,
	systemPrompts,
	uploadId,
	verbose = false,
	runId,
	variantLabel,
	quiet = false,
	label,
}: RunTaskParams): Promise<RunTaskResult> {
	const taskPath = path.resolve(path.join('tasks', taskName));

	const dirExists = await fs
		.access(taskPath)
		.then(() => true)
		.catch(() => false);

	if (!dirExists) {
		throw new Error(`Task directory does not exist: ${taskPath}`);
	}

	const localDateTimestamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 19)
		.replace(/[:.]/g, '-');

	const contextPrefix = buildContextPrefix(context);
	const uniqueSuffix = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
	const trialDirName = `${localDateTimestamp}-${uniqueSuffix}-${contextPrefix}-${agentKey}-${model}`;
	const trialPath = path.join(taskPath, 'trials', trialDirName);
	const projectPath = path.join(trialPath, 'project');
	const resultsPath = path.join(trialPath, 'results');
	const hooks =
		(await import(path.join(taskPath, 'hooks.ts')).then((mod) => mod.default).catch(() => ({}))) ??
		{};

	const trialArgs: TrialArgs = {
		taskPath,
		trialPath,
		projectPath,
		resultsPath,
		verbose,
		uploadId,
		taskName,
		context,
		agent: agentKey,
		model,
		hooks,
		runId,
		label,
	};

	if (!quiet) {
		p.log.info(`Running trial '${taskName}' with agent '${agentKey}' and model '${model}'`);
	}

	const { mcpServerConfig: preparedMcpConfig } = await prepareTrial(trialArgs);

	const prompt = await generatePrompt(taskPath, context);
	await fs.writeFile(path.join(trialPath, 'prompt.md'), prompt);

	if (systemPrompts.length > 0) {
		const systemPrompt = await generateSystemPrompt(taskPath, systemPrompts);
		await fs.writeFile(path.join(projectPath, 'Claude.md'), systemPrompt);
	}

	let mergedMcpConfig = preparedMcpConfig;
	for (const ctx of context) {
		if (ctx.type === 'mcp-server') {
			if (!mergedMcpConfig) {
				mergedMcpConfig = {};
			}
			mergedMcpConfig = { ...mergedMcpConfig, ...ctx.mcpServerConfig };
		}
	}

	const agent = agents[agentKey];
	const executionSummary = await agent.execute(prompt, trialArgs, mergedMcpConfig);

	try {
		await teardownTrial(trialArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!quiet) {
			p.log.error(`Failed to teardown trial: ${message}`);
		}
	}

	const gradingSummary = await grade(trialArgs);

	const quality = hooks.calculateQuality?.({
		trialArgs,
		execution: executionSummary,
		grading: gradingSummary,
	});

	if (quality !== undefined) {
		gradingSummary.quality = {
			score: Math.max(0, Math.min(1, quality.score)),
			description: quality.description,
		};
	}

	await fs.writeFile(
		path.join(resultsPath, 'summary.json'),
		JSON.stringify({ ...executionSummary, ...gradingSummary, runId, variantLabel }, null, 2),
	);

	if (!quiet) {
		logSummary(executionSummary, gradingSummary, verbose);
	}

	const chromaticUrl = await save(trialArgs, gradingSummary, executionSummary);

	if (!quiet && chromaticUrl) {
		p.log.message(
			`🔍 View results at:\n\u001b]8;;${chromaticUrl}\u0007${chromaticUrl}\u001b]8;;\u0007`,
		);
	}

	return {
		trialArgs,
		executionSummary,
		gradingSummary,
		chromaticUrl: chromaticUrl ?? undefined,
	};
}

function buildContextPrefix(context: Context): string {
	if (context.length === 0 || (context.length === 1 && context[0]!.type === false)) {
		return 'no-context';
	}

	const prefixes: string[] = [];
	for (const ctx of context) {
		if (ctx.type === false) {
			continue;
		}
		switch (ctx.type) {
			case 'extra-prompts':
				prefixes.push(
					ctx.prompts
						.map((prompt) => path.parse(prompt).name.toLowerCase().replace(/\s+/g, '-'))
						.join('-'),
				);
				break;
			case 'inline-prompt':
				prefixes.push('inline');
				break;
			case 'mcp-server':
				prefixes.push(
					Object.keys(ctx.mcpServerConfig)
						.map((mcpServerName) => mcpServerName.toLowerCase().replace(/\s+/g, '-'))
						.join('-'),
				);
				break;
			case 'storybook-mcp-dev':
				prefixes.push('storybook-mcp-dev');
				break;
			case 'storybook-mcp-docs':
				prefixes.push('storybook-mcp-docs');
				break;
		}
	}
	return prefixes.join('-');
}

function logSummary(
	executionSummary: ExecutionSummary,
	gradingSummary: GradingSummary,
	verbose = false,
): void {
	p.log.info('Summary:');
	p.log.message(`🏗️  Build: ${gradingSummary.buildSuccess ? '✅' : '❌'}`);
	p.log.message(
		`🔍 Type Check: ${
			gradingSummary.typeCheckErrors === 0
				? '✅'
				: styleText('red', `❌ ${gradingSummary.typeCheckErrors} errors`)
		}`,
	);
	p.log.message(
		`✨ Lint: ${
			gradingSummary.lintErrors === 0
				? '✅'
				: styleText('red', `❌ ${gradingSummary.lintErrors} errors`)
		}`,
	);

	if (gradingSummary.test.failed === 0 && gradingSummary.test.passed === 0) {
		p.log.message(`🧪 Tests: ❌ ${styleText('red', 'Failed to run')}`);
		p.log.message(`🦾 Accessibility: ⚠️  ${styleText('yellow', 'Inconclusive')}`);
	} else if (gradingSummary.test.failed > 0) {
		p.log.message(
			`🧪 Tests: ${
				styleText('red', `❌ ${gradingSummary.test.failed} failed`) +
				' | ' +
				styleText('green', `${gradingSummary.test.passed} passed`)
			}`,
		);
		if (gradingSummary.test.passed > 0) {
			p.log.message(
				`🦾 Accessibility: ${styleText(
					'yellow',
					`${gradingSummary.a11y.violations} violations from ${gradingSummary.test.passed}/${gradingSummary.test.passed + gradingSummary.test.failed} tests`,
				)}`,
			);
		} else {
			p.log.message(`🦾 Accessibility: ⚠️  ${styleText('yellow', 'Inconclusive')}`);
		}
	} else {
		p.log.message('🧪 Tests: ✅');
		p.log.message(
			`🦾 Accessibility: ${
				gradingSummary.a11y.violations === 0
					? '✅'
					: styleText('yellow', `⚠️  ${gradingSummary.a11y.violations} violations`)
			}`,
		);
	}

	const cov = gradingSummary.coverage;
	const COVERAGE_THRESHOLDS = {
		failBelow: 70,
		warnBelow: 90,
	} as const;

	const formatPct = (v: number) => `${Math.round(v)}`;
	const isNumber = (v: unknown): v is number => typeof v === 'number';

	const getCoverageBadge = (v: number) => {
		return v >= COVERAGE_THRESHOLDS.warnBelow
			? '✅'
			: v >= COVERAGE_THRESHOLDS.failBelow
				? '⚠️'
				: '❌';
	};

	if (cov) {
		if (isNumber(cov.lines)) {
			const overall = cov.lines;
			const badge = getCoverageBadge(overall);

			p.log.message(`Coverage: ${badge} ${formatPct(overall)} %`);

			if (verbose) {
				p.log.message(
					`📊 Coverage details: lines ${cov.lines ?? '–'}%, statements ${cov.statements ?? '–'}%, branches ${cov.branches ?? '–'}%, functions ${cov.functions ?? '–'}%`,
				);
			}
		}
	}

	if (gradingSummary.componentUsage) {
		const cu = gradingSummary.componentUsage;
		// Red if 0 matched, green if >0 matched AND 0 missing AND 0 unexpected, yellow otherwise
		const badge = cu.matched === 0 ? '❌' : cu.missing === 0 && cu.unexpected === 0 ? '✅' : '⚠️';
		p.log.message(
			`🧩 Component Usage: ${badge} Score ${cu.score} (matched: ${cu.matched}, missing: ${cu.missing}, unexpected: ${cu.unexpected})`,
		);
	}

	if (gradingSummary.mcpTools) {
		const mcp = gradingSummary.mcpTools;
		const badge =
			mcp.allExpectationsPassed === undefined ? 'ℹ️' : mcp.allExpectationsPassed ? '✅' : '❌';
		const toolNames = mcp.tools.map((t) => t.name).join(', ');
		const tokens =
			mcp.totalOutputTokens >= 1000
				? `${(mcp.totalOutputTokens / 1000).toFixed(1)}K`
				: String(mcp.totalOutputTokens);
		p.log.message(`🔧 MCP Tools: ${badge} ${mcp.totalCalls} calls, ${tokens} output tokens`);
		if (verbose && toolNames) {
			p.log.message(`   Tools: ${toolNames}`);
		}
	}

	if (gradingSummary.judge) {
		const judge = gradingSummary.judge;
		const pct = (judge.score * 100).toFixed(0);
		p.log.message(`🧑‍⚖️ Judge: ℹ️ ${pct}% (${judge.agent}, ${judge.model})`);
	}

	if (gradingSummary.quality !== undefined) {
		const pct = (gradingSummary.quality.score * 100).toFixed(0);
		const badge =
			gradingSummary.quality.score >= 0.9
				? '✅'
				: gradingSummary.quality.score >= 0.7
					? '⚠️'
					: '❌';
		p.log.message(`📊 Quality: ${badge} ${pct}%`);
		if (verbose) {
			p.log.message(`   ${gradingSummary.quality.description}`);
		}
	}

	p.log.message(
		`⏱️  Duration: ${executionSummary.duration}s (API: ${executionSummary.durationApi}s)`,
	);
	p.log.message(`💰 Cost: ${executionSummary.cost ? `$${executionSummary.cost}` : 'unknown'}`);
	p.log.message(`🔄 Turns: ${executionSummary.turns}`);
}
